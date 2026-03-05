import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // Unix timestamp seconds when the window resets
  limit: number;
}

/**
 * MerchantRateLimitService implements a Redis-based token bucket per merchant.
 *
 * Key pattern: rate:{merchantId}:{endpoint}
 *
 * Algorithm (sliding window counter using MULTI/EXEC):
 *   1. GET the current token count for (merchantId, endpoint)
 *   2. If key does not exist → initialize with (limit - 1) tokens, TTL = 60s → ALLOWED
 *   3. If count > 0 → DECR atomically → ALLOWED
 *   4. If count == 0 → DENIED, return TTL as resetAt
 *
 * Limits are configurable per tier via rateLimit.tierLimits config key.
 * Default: 1000 req/min per merchant. Burst multiplier applies to burst tier.
 */
@Injectable()
export class MerchantRateLimitService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MerchantRateLimitService.name);
  private redis!: Redis;

  private readonly windowSeconds = 60;
  private readonly defaultLimit: number;
  private readonly burstMultiplier: number;

  constructor(private readonly configService: ConfigService) {
    this.defaultLimit = this.configService.get<number>(
      'rateLimit.defaultPerMinute',
      1000,
    );
    this.burstMultiplier = this.configService.get<number>(
      'rateLimit.burstMultiplier',
      2,
    );
  }

  async onModuleInit(): Promise<void> {
    this.redis = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get<string>('REDIS_PASSWORD') || undefined,
      db: this.configService.get<number>('REDIS_DB', 0),
      connectTimeout: 5000,
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });

    this.redis.on('error', (err) => {
      this.logger.error(`Redis connection error: ${err.message}`);
    });

    this.logger.log('MerchantRateLimitService: Redis client connected');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.logger.log('MerchantRateLimitService: Redis client disconnected');
    }
  }

  /**
   * Check the rate limit for a merchant + endpoint pair and consume one token if allowed.
   *
   * Uses a Lua script executed atomically on Redis to avoid race conditions
   * (replaces MULTI/EXEC which cannot conditionally branch server-side).
   *
   * @param merchantId - The merchant identifier from JWT claims
   * @param endpoint   - Normalized endpoint string e.g. "POST:/v1/events"
   * @param tier       - Optional tier override: 'default' | 'burst'
   */
  async checkAndConsume(
    merchantId: string,
    endpoint: string,
    tier: 'default' | 'burst' = 'default',
  ): Promise<RateLimitResult> {
    const limit = this.getLimitForTier(tier);
    const key = this.buildKey(merchantId, endpoint);
    const now = Math.floor(Date.now() / 1000);

    try {
      // Lua script for atomic check-and-decrement token bucket
      // Returns: [allowed (0|1), remaining, ttl_seconds]
      const luaScript = `
        local key = KEYS[1]
        local limit = tonumber(ARGV[1])
        local window = tonumber(ARGV[2])

        local current = redis.call('GET', key)

        if current == false then
          -- Key does not exist: initialize bucket with (limit - 1) tokens
          redis.call('SET', key, limit - 1, 'EX', window)
          return {1, limit - 1, window}
        end

        local count = tonumber(current)
        if count > 0 then
          -- Tokens available: decrement and get remaining TTL
          local remaining = redis.call('DECR', key)
          local ttl = redis.call('TTL', key)
          return {1, remaining, ttl}
        else
          -- No tokens left
          local ttl = redis.call('TTL', key)
          return {0, 0, ttl}
        end
      `;

      const result = await this.redis.eval(
        luaScript,
        1,
        key,
        String(limit),
        String(this.windowSeconds),
      ) as [number, number, number];

      const [allowedInt, remaining, ttlSeconds] = result;
      const resetAt = now + (ttlSeconds > 0 ? ttlSeconds : this.windowSeconds);

      return {
        allowed: allowedInt === 1,
        remaining,
        resetAt,
        limit,
      };
    } catch (err) {
      // Redis errors should fail open to avoid blocking legitimate traffic
      this.logger.error(
        `Rate limit check failed for merchant=${merchantId}: ${(err as Error).message}`,
      );
      return {
        allowed: true,
        remaining: limit,
        resetAt: now + this.windowSeconds,
        limit,
      };
    }
  }

  /**
   * Get the current token count without consuming (for monitoring).
   */
  async getStatus(
    merchantId: string,
    endpoint: string,
    tier: 'default' | 'burst' = 'default',
  ): Promise<RateLimitResult> {
    const limit = this.getLimitForTier(tier);
    const key = this.buildKey(merchantId, endpoint);
    const now = Math.floor(Date.now() / 1000);

    const [current, ttl] = await Promise.all([
      this.redis.get(key),
      this.redis.ttl(key),
    ]);

    const remaining = current !== null ? parseInt(current, 10) : limit;
    const resetAt = now + (ttl > 0 ? ttl : this.windowSeconds);

    return {
      allowed: remaining > 0,
      remaining,
      resetAt,
      limit,
    };
  }

  private buildKey(merchantId: string, endpoint: string): string {
    // Sanitize endpoint for use as Redis key component
    const safeEndpoint = endpoint.replace(/[^a-zA-Z0-9/_:-]/g, '_');
    return `rate:${merchantId}:${safeEndpoint}`;
  }

  private getLimitForTier(tier: 'default' | 'burst'): number {
    if (tier === 'burst') {
      return this.defaultLimit * this.burstMultiplier;
    }
    return this.defaultLimit;
  }

  /** Expose Redis instance for health checks. */
  getRedis(): Redis {
    return this.redis;
  }
}
