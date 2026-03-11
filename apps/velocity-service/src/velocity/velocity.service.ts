/**
 * SignalRisk Velocity Engine — Velocity Counter Service
 *
 * Uses Redis sorted sets for windowed transaction/amount counters
 * and HyperLogLog for high-cardinality unique counters (devices, IPs, sessions).
 *
 * Sprint 1 (Stateful Fraud): entityType dimension added to all keys (ADR-009).
 *
 * Redis key scheme (all prefixed with merchantId for tenant isolation):
 *   {merchantId}:vel:tx:{entityType}:{entityId}       — Transaction sorted set (score=timestamp)
 *   {merchantId}:vel:amt:{entityType}:{entityId}      — Amount sorted set (score=timestamp, member=amount:eventId)
 *   {merchantId}:vel:udev:{entityType}:{entityId}     — Unique devices HyperLogLog
 *   {merchantId}:vel:uip:{entityType}:{entityId}      — Unique IPs HyperLogLog
 *   {merchantId}:vel:usess:{entityType}:{entityId}    — Unique sessions HyperLogLog
 *   {merchantId}:vel:baseline:{entityType}:{entityId} — 7-day baseline sorted set
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { EntityType, VelocityEvent, VelocitySignals } from './velocity.types';

@Injectable()
export class VelocityService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VelocityService.name);
  private redis!: Redis;

  private keyTtlSeconds: number;
  private window10m: number;
  private window1h: number;
  private window24h: number;
  private baselineWindowSeconds: number;

  constructor(private readonly configService: ConfigService) {
    this.keyTtlSeconds = this.configService.get<number>('velocity.keyTtlSeconds') || 90000;
    this.window10m = this.configService.get<number>('velocity.window10m') || 600;
    this.window1h = this.configService.get<number>('velocity.window1h') || 3600;
    this.window24h = this.configService.get<number>('velocity.window24h') || 86400;
    this.baselineWindowSeconds = this.configService.get<number>('velocity.baselineWindowSeconds') || 604800;
  }

  async onModuleInit(): Promise<void> {
    this.redis = new Redis({
      host: this.configService.get<string>('redis.host') || 'localhost',
      port: this.configService.get<number>('redis.port') || 6379,
      password: this.configService.get<string>('redis.password') || undefined,
      db: this.configService.get<number>('redis.db') || 0,
      connectTimeout: this.configService.get<number>('redis.connectTimeout') || 5000,
      maxRetriesPerRequest: this.configService.get<number>('redis.maxRetriesPerRequest') || 3,
      lazyConnect: false,
    });

    this.redis.on('error', (err) => {
      this.logger.error(`Redis connection error: ${err.message}`);
    });

    this.logger.log('Redis client connected for velocity counters');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.logger.log('Redis client disconnected');
    }
  }

  /** Expose Redis instance for health checks. */
  getRedis(): Redis {
    return this.redis;
  }

  // ---------------------------------------------------------------------------
  // Key builders — entityType added per ADR-009
  // ---------------------------------------------------------------------------

  private txKey(merchantId: string, entityType: EntityType, entityId: string): string {
    return `${merchantId}:vel:tx:${entityType}:${entityId}`;
  }

  private amtKey(merchantId: string, entityType: EntityType, entityId: string): string {
    return `${merchantId}:vel:amt:${entityType}:${entityId}`;
  }

  private udevKey(merchantId: string, entityType: EntityType, entityId: string): string {
    return `${merchantId}:vel:udev:${entityType}:${entityId}`;
  }

  private uipKey(merchantId: string, entityType: EntityType, entityId: string): string {
    return `${merchantId}:vel:uip:${entityType}:${entityId}`;
  }

  private usessKey(merchantId: string, entityType: EntityType, entityId: string): string {
    return `${merchantId}:vel:usess:${entityType}:${entityId}`;
  }

  private baselineKey(merchantId: string, entityType: EntityType, entityId: string): string {
    return `${merchantId}:vel:baseline:${entityType}:${entityId}`;
  }

  // ---------------------------------------------------------------------------
  // Write path — increment all velocity counters for an event
  // ---------------------------------------------------------------------------

  /**
   * Update all relevant velocity counters for a single event.
   * Uses Redis pipeline for atomic batch execution.
   */
  async incrementVelocity(event: VelocityEvent): Promise<void> {
    const { merchantId, entityId, entityType, eventId, amountMinor, timestampSeconds } = event;
    const pipeline = this.redis.pipeline();

    // 1. Transaction count sorted set: ZADD score=timestamp, member=eventId
    const txk = this.txKey(merchantId, entityType, entityId);
    pipeline.zadd(txk, timestampSeconds, eventId);
    pipeline.expire(txk, this.keyTtlSeconds);

    // 2. Amount sorted set: ZADD score=timestamp, member=amount:eventId (encode amount in member)
    const amtk = this.amtKey(merchantId, entityType, entityId);
    pipeline.zadd(amtk, timestampSeconds, `${amountMinor}:${eventId}`);
    pipeline.expire(amtk, this.keyTtlSeconds);

    // 3. Baseline sorted set (7-day window for burst detection)
    const bk = this.baselineKey(merchantId, entityType, entityId);
    pipeline.zadd(bk, timestampSeconds, eventId);
    pipeline.expire(bk, this.baselineWindowSeconds + 3600); // 7d + 1h safety margin

    // 4. Unique devices HyperLogLog
    if (event.deviceFingerprint) {
      const udevk = this.udevKey(merchantId, entityType, entityId);
      pipeline.pfadd(udevk, event.deviceFingerprint);
      pipeline.expire(udevk, this.keyTtlSeconds);
    }

    // 5. Unique IPs HyperLogLog
    if (event.ipAddress) {
      const uipk = this.uipKey(merchantId, entityType, entityId);
      pipeline.pfadd(uipk, event.ipAddress);
      pipeline.expire(uipk, this.keyTtlSeconds);
    }

    // 6. Unique sessions HyperLogLog
    if (event.sessionId) {
      const usk = this.usessKey(merchantId, entityType, entityId);
      pipeline.pfadd(usk, event.sessionId);
      pipeline.expire(usk, this.keyTtlSeconds);
    }

    await pipeline.exec();
  }

  // ---------------------------------------------------------------------------
  // Read path — get all velocity dimensions
  // ---------------------------------------------------------------------------

  /**
   * Retrieve all velocity signal dimensions for a given entity.
   * Prunes expired entries from sorted sets on read for accuracy.
   */
  async getVelocitySignals(
    merchantId: string,
    entityId: string,
    entityType: EntityType = 'customer',
  ): Promise<VelocitySignals> {
    const now = Math.floor(Date.now() / 1000);
    const cutoff10m = now - this.window10m;
    const cutoff1h = now - this.window1h;
    const cutoff24h = now - this.window24h;

    const txk = this.txKey(merchantId, entityType, entityId);
    const amtk = this.amtKey(merchantId, entityType, entityId);
    const udevk = this.udevKey(merchantId, entityType, entityId);
    const uipk = this.uipKey(merchantId, entityType, entityId);
    const usk = this.usessKey(merchantId, entityType, entityId);

    // Pipeline: prune old entries then query
    const pipeline = this.redis.pipeline();

    // Prune entries older than 24h window from sorted sets
    pipeline.zremrangebyscore(txk, '-inf', cutoff24h);
    pipeline.zremrangebyscore(amtk, '-inf', cutoff24h);

    // Count transactions in 10m window
    pipeline.zcount(txk, cutoff10m, '+inf');               // index 2
    // Count transactions in 1h window
    pipeline.zcount(txk, cutoff1h, '+inf');                 // index 3
    // Count transactions in 24h window
    pipeline.zcount(txk, cutoff24h, '+inf');                // index 4
    // Get amount entries in 1h window
    pipeline.zrangebyscore(amtk, cutoff1h, '+inf');         // index 5
    // Get amount entries in 24h window
    pipeline.zrangebyscore(amtk, cutoff24h, '+inf');        // index 6

    // HyperLogLog counts
    pipeline.pfcount(udevk);                                // index 7
    pipeline.pfcount(uipk);                                 // index 8
    pipeline.pfcount(usk);                                   // index 9

    const results = await pipeline.exec();
    if (!results) {
      return this.emptySignals();
    }

    const txCount10m = (results[2]?.[1] as number) || 0;
    const txCount1h = (results[3]?.[1] as number) || 0;
    const txCount24h = (results[4]?.[1] as number) || 0;

    // Sum amounts from the 1h window entries
    const amountEntries1h = (results[5]?.[1] as string[]) || [];
    const amountSum1h = this.sumAmounts(amountEntries1h);

    // Sum amounts from the 24h window entries
    const amountEntries24h = (results[6]?.[1] as string[]) || [];
    const amountSum24h = this.sumAmounts(amountEntries24h);

    const uniqueDevices24h = (results[7]?.[1] as number) || 0;
    const uniqueIps24h = (results[8]?.[1] as number) || 0;
    const uniqueSessions1h = (results[9]?.[1] as number) || 0;

    return {
      tx_count_10m: txCount10m,
      tx_count_1h: txCount1h,
      tx_count_24h: txCount24h,
      amount_sum_1h: amountSum1h,
      amount_sum_24h: amountSum24h,
      unique_devices_24h: uniqueDevices24h,
      unique_ips_24h: uniqueIps24h,
      unique_sessions_1h: uniqueSessions1h,
      burst_detected: false, // Caller should use BurstService separately
    };
  }

  // ---------------------------------------------------------------------------
  // Baseline — rolling 7-day average for burst detection
  // ---------------------------------------------------------------------------

  /**
   * Get the rolling 7-day average hourly transaction count for an entity.
   * This is used as the baseline for burst detection.
   */
  async getBaseline(
    merchantId: string,
    entityId: string,
    entityType: EntityType = 'customer',
  ): Promise<number> {
    const now = Math.floor(Date.now() / 1000);
    const cutoff7d = now - this.baselineWindowSeconds;

    const bk = this.baselineKey(merchantId, entityType, entityId);

    // Prune entries older than 7 days
    await this.redis.zremrangebyscore(bk, '-inf', cutoff7d);

    // Total events in the 7-day window
    const totalEvents = await this.redis.zcount(bk, cutoff7d, '+inf');

    // Average per hour: totalEvents / (7 * 24)
    const hoursInWindow = this.baselineWindowSeconds / 3600;
    return totalEvents / hoursInWindow;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private sumAmounts(entries: string[]): number {
    return entries.reduce((sum, entry) => {
      const colonIndex = entry.indexOf(':');
      const amount = parseInt(entry.substring(0, colonIndex), 10);
      return sum + (isNaN(amount) ? 0 : amount);
    }, 0);
  }

  private emptySignals(): VelocitySignals {
    return {
      tx_count_10m: 0,
      tx_count_1h: 0,
      tx_count_24h: 0,
      amount_sum_1h: 0,
      amount_sum_24h: 0,
      unique_devices_24h: 0,
      unique_ips_24h: 0,
      unique_sessions_1h: 0,
      burst_detected: false,
    };
  }
}
