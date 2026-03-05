/**
 * SignalRisk Device Intel — Redis Cache Layer
 *
 * Caches device records by fingerprint and by ID with 24h TTL.
 * All keys are prefixed with the merchantId for tenant isolation.
 *
 * Key patterns:
 *   {merchantId}:dev:fp:{fingerprint}  — lookup by fingerprint
 *   {merchantId}:dev:id:{deviceId}     — lookup by device ID
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Device } from '../fingerprint/interfaces/device-attributes.interface';

@Injectable()
export class DeviceCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(DeviceCacheService.name);
  private readonly redis: Redis;
  private readonly ttlSeconds: number;

  constructor(private readonly configService: ConfigService) {
    const redisConfig = this.configService.get('redis');

    this.redis = new Redis({
      host: redisConfig?.host || 'localhost',
      port: redisConfig?.port || 6379,
      password: redisConfig?.password || undefined,
      db: redisConfig?.db || 0,
      keyPrefix: redisConfig?.keyPrefix || '',
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        if (times > 5) return null; // stop retrying
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });

    this.ttlSeconds = this.configService.get<number>('cache.ttlSeconds') ?? 86400;

    this.redis.connect().catch((err) => {
      this.logger.warn(`Redis connection failed (non-fatal): ${err.message}`);
    });

    this.redis.on('error', (err) => {
      this.logger.warn(`Redis error: ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => {});
  }

  /**
   * Get a device by fingerprint from cache.
   */
  async getByFingerprint(merchantId: string, fingerprint: string): Promise<Device | null> {
    try {
      const key = this.fpKey(merchantId, fingerprint);
      const data = await this.redis.get(key);
      if (!data) return null;
      return this.deserialize(data);
    } catch {
      // Cache miss on error — fall through to DB
      return null;
    }
  }

  /**
   * Get a device by ID from cache.
   */
  async getById(merchantId: string, deviceId: string): Promise<Device | null> {
    try {
      const key = this.idKey(merchantId, deviceId);
      const data = await this.redis.get(key);
      if (!data) return null;
      return this.deserialize(data);
    } catch {
      return null;
    }
  }

  /**
   * Cache a device under both fingerprint and ID keys.
   */
  async setDevice(merchantId: string, device: Device): Promise<void> {
    try {
      const serialized = this.serialize(device);
      const pipeline = this.redis.pipeline();

      pipeline.setex(this.fpKey(merchantId, device.fingerprint), this.ttlSeconds, serialized);
      pipeline.setex(this.idKey(merchantId, device.id), this.ttlSeconds, serialized);

      await pipeline.exec();
    } catch (err) {
      this.logger.warn(`Failed to cache device ${device.id}: ${(err as Error).message}`);
    }
  }

  /**
   * Invalidate cache entries for a device (by ID).
   * Also removes the fingerprint key if the device data is still in cache.
   */
  async invalidate(merchantId: string, deviceId: string): Promise<void> {
    try {
      // Try to get the cached device to find the fingerprint key
      const idKey = this.idKey(merchantId, deviceId);
      const data = await this.redis.get(idKey);

      const pipeline = this.redis.pipeline();
      pipeline.del(idKey);

      if (data) {
        const device = this.deserialize(data);
        pipeline.del(this.fpKey(merchantId, device.fingerprint));
      }

      await pipeline.exec();
    } catch (err) {
      this.logger.warn(`Failed to invalidate cache for device ${deviceId}: ${(err as Error).message}`);
    }
  }

  /**
   * Check if Redis is connected (used by health checks).
   */
  isConnected(): boolean {
    return this.redis.status === 'ready';
  }

  /**
   * Get the underlying Redis client (for health check ping).
   */
  getRedis(): Redis {
    return this.redis;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private fpKey(merchantId: string, fingerprint: string): string {
    return `${merchantId}:dev:fp:${fingerprint}`;
  }

  private idKey(merchantId: string, deviceId: string): string {
    return `${merchantId}:dev:id:${deviceId}`;
  }

  private serialize(device: Device): string {
    return JSON.stringify({
      ...device,
      firstSeenAt: device.firstSeenAt.toISOString(),
      lastSeenAt: device.lastSeenAt.toISOString(),
    });
  }

  private deserialize(data: string): Device {
    const parsed = JSON.parse(data);
    return {
      ...parsed,
      firstSeenAt: new Date(parsed.firstSeenAt),
      lastSeenAt: new Date(parsed.lastSeenAt),
    };
  }
}
