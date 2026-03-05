/**
 * SignalRisk Velocity Engine — Velocity Counter Service
 *
 * Uses Redis sorted sets for windowed transaction/amount counters
 * and HyperLogLog for high-cardinality unique counters (devices, IPs, sessions).
 *
 * Redis key scheme (all prefixed with merchantId for tenant isolation):
 *   {merchantId}:vel:tx:{entityId}       — Transaction sorted set (score=timestamp)
 *   {merchantId}:vel:amt:{entityId}      — Amount sorted set (score=timestamp, member=amount:eventId)
 *   {merchantId}:vel:udev:{entityId}     — Unique devices HyperLogLog
 *   {merchantId}:vel:uip:{entityId}      — Unique IPs HyperLogLog
 *   {merchantId}:vel:usess:{entityId}    — Unique sessions HyperLogLog
 *   {merchantId}:vel:baseline:{entityId} — 7-day baseline sorted set
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { VelocityEvent, VelocitySignals } from './velocity.types';

@Injectable()
export class VelocityService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VelocityService.name);
  private redis!: Redis;

  private keyTtlSeconds: number;
  private window1h: number;
  private window24h: number;
  private baselineWindowSeconds: number;

  constructor(private readonly configService: ConfigService) {
    this.keyTtlSeconds = this.configService.get<number>('velocity.keyTtlSeconds') || 90000;
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
  // Key builders
  // ---------------------------------------------------------------------------

  private txKey(merchantId: string, entityId: string): string {
    return `${merchantId}:vel:tx:${entityId}`;
  }

  private amtKey(merchantId: string, entityId: string): string {
    return `${merchantId}:vel:amt:${entityId}`;
  }

  private udevKey(merchantId: string, entityId: string): string {
    return `${merchantId}:vel:udev:${entityId}`;
  }

  private uipKey(merchantId: string, entityId: string): string {
    return `${merchantId}:vel:uip:${entityId}`;
  }

  private usessKey(merchantId: string, entityId: string): string {
    return `${merchantId}:vel:usess:${entityId}`;
  }

  private baselineKey(merchantId: string, entityId: string): string {
    return `${merchantId}:vel:baseline:${entityId}`;
  }

  // ---------------------------------------------------------------------------
  // Write path — increment all velocity counters for an event
  // ---------------------------------------------------------------------------

  /**
   * Update all relevant velocity counters for a single event.
   * Uses Redis pipeline for atomic batch execution.
   */
  async incrementVelocity(event: VelocityEvent): Promise<void> {
    const { merchantId, entityId, eventId, amountMinor, timestampSeconds } = event;
    const pipeline = this.redis.pipeline();

    // 1. Transaction count sorted set: ZADD score=timestamp, member=eventId
    const txk = this.txKey(merchantId, entityId);
    pipeline.zadd(txk, timestampSeconds, eventId);
    pipeline.expire(txk, this.keyTtlSeconds);

    // 2. Amount sorted set: ZADD score=timestamp, member=amount:eventId (encode amount in member)
    const amtk = this.amtKey(merchantId, entityId);
    pipeline.zadd(amtk, timestampSeconds, `${amountMinor}:${eventId}`);
    pipeline.expire(amtk, this.keyTtlSeconds);

    // 3. Baseline sorted set (7-day window for burst detection)
    const bk = this.baselineKey(merchantId, entityId);
    pipeline.zadd(bk, timestampSeconds, eventId);
    pipeline.expire(bk, this.baselineWindowSeconds + 3600); // 7d + 1h safety margin

    // 4. Unique devices HyperLogLog
    if (event.deviceFingerprint) {
      const udevk = this.udevKey(merchantId, entityId);
      pipeline.pfadd(udevk, event.deviceFingerprint);
      pipeline.expire(udevk, this.keyTtlSeconds);
    }

    // 5. Unique IPs HyperLogLog
    if (event.ipAddress) {
      const uipk = this.uipKey(merchantId, entityId);
      pipeline.pfadd(uipk, event.ipAddress);
      pipeline.expire(uipk, this.keyTtlSeconds);
    }

    // 6. Unique sessions HyperLogLog
    if (event.sessionId) {
      const usk = this.usessKey(merchantId, entityId);
      pipeline.pfadd(usk, event.sessionId);
      pipeline.expire(usk, this.keyTtlSeconds);
    }

    await pipeline.exec();
  }

  // ---------------------------------------------------------------------------
  // Read path — get all 6 velocity dimensions
  // ---------------------------------------------------------------------------

  /**
   * Retrieve all 6 velocity signal dimensions for a given entity.
   * Prunes expired entries from sorted sets on read for accuracy.
   */
  async getVelocitySignals(merchantId: string, entityId: string): Promise<VelocitySignals> {
    const now = Math.floor(Date.now() / 1000);
    const cutoff1h = now - this.window1h;
    const cutoff24h = now - this.window24h;

    const txk = this.txKey(merchantId, entityId);
    const amtk = this.amtKey(merchantId, entityId);
    const udevk = this.udevKey(merchantId, entityId);
    const uipk = this.uipKey(merchantId, entityId);
    const usk = this.usessKey(merchantId, entityId);

    // Pipeline: prune old entries then query
    const pipeline = this.redis.pipeline();

    // Prune entries older than 24h window from sorted sets
    pipeline.zremrangebyscore(txk, '-inf', cutoff24h);
    pipeline.zremrangebyscore(amtk, '-inf', cutoff24h);

    // Count transactions in 1h window
    pipeline.zcount(txk, cutoff1h, '+inf');           // index 2
    // Count transactions in 24h window
    pipeline.zcount(txk, cutoff24h, '+inf');           // index 3
    // Get amount entries in 1h window
    pipeline.zrangebyscore(amtk, cutoff1h, '+inf');    // index 4

    // HyperLogLog counts
    pipeline.pfcount(udevk);                            // index 5
    pipeline.pfcount(uipk);                             // index 6
    pipeline.pfcount(usk);                              // index 7

    const results = await pipeline.exec();
    if (!results) {
      return this.emptySignals();
    }

    const txCount1h = (results[2]?.[1] as number) || 0;
    const txCount24h = (results[3]?.[1] as number) || 0;

    // Sum amounts from the 1h window entries
    const amountEntries = (results[4]?.[1] as string[]) || [];
    const amountSum1h = amountEntries.reduce((sum, entry) => {
      const colonIndex = entry.indexOf(':');
      const amount = parseInt(entry.substring(0, colonIndex), 10);
      return sum + (isNaN(amount) ? 0 : amount);
    }, 0);

    const uniqueDevices24h = (results[5]?.[1] as number) || 0;
    const uniqueIps24h = (results[6]?.[1] as number) || 0;
    const uniqueSessions1h = (results[7]?.[1] as number) || 0;

    return {
      tx_count_1h: txCount1h,
      tx_count_24h: txCount24h,
      amount_sum_1h: amountSum1h,
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
  async getBaseline(merchantId: string, entityId: string): Promise<number> {
    const now = Math.floor(Date.now() / 1000);
    const cutoff7d = now - this.baselineWindowSeconds;

    const bk = this.baselineKey(merchantId, entityId);

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

  private emptySignals(): VelocitySignals {
    return {
      tx_count_1h: 0,
      tx_count_24h: 0,
      amount_sum_1h: 0,
      unique_devices_24h: 0,
      unique_ips_24h: 0,
      unique_sessions_1h: 0,
      burst_detected: false,
    };
  }
}
