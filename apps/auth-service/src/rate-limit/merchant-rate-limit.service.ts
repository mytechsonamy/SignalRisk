import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '@signalrisk/redis-module';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // Unix timestamp seconds when the window resets
  limit: number;
}

export interface TokenBucketResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date; // when the bucket refills to full
  retryAfterSeconds: number;
}

// Token bucket Lua script: atomic check-and-consume
const TOKEN_BUCKET_LUA = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refillRate = tonumber(ARGV[2])  -- tokens per second
local now = tonumber(ARGV[3])         -- current time in ms
local requested = tonumber(ARGV[4])   -- tokens to consume (usually 1)

local bucket = redis.call('HMGET', key, 'tokens', 'lastRefill')
local tokens = tonumber(bucket[1]) or capacity
local lastRefill = tonumber(bucket[2]) or now

-- Calculate tokens to add based on elapsed time
local elapsed = math.max(0, now - lastRefill)
local newTokens = math.min(capacity, tokens + (elapsed / 1000) * refillRate)

if newTokens >= requested then
  -- Consume token
  local remaining = newTokens - requested
  redis.call('HMSET', key, 'tokens', remaining, 'lastRefill', now)
  redis.call('EXPIRE', key, 120)
  return {1, math.floor(remaining)}
else
  -- Reject
  redis.call('HMSET', key, 'tokens', newTokens, 'lastRefill', now)
  redis.call('EXPIRE', key, 120)
  local waitSeconds = math.ceil((requested - newTokens) / refillRate)
  return {0, math.floor(newTokens), waitSeconds}
end
`;

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
export class MerchantRateLimitService {
  private readonly logger = new Logger(MerchantRateLimitService.name);

  private readonly windowSeconds = 60;
  private readonly defaultLimit: number;
  private readonly burstMultiplier: number;

  readonly CAPACITY = 1000; // tokens per minute
  readonly REFILL_RATE = 1000 / 60; // tokens per second (~16.67)

  constructor(
    private readonly configService: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    this.defaultLimit = this.configService.get<number>(
      'rateLimit.defaultPerMinute',
      1000,
    );
    this.burstMultiplier = this.configService.get<number>(
      'rateLimit.burstMultiplier',
      2,
    );
  }

  /**
   * Token bucket consume for API key-based rate limiting.
   * Uses a Lua script for atomic check-and-consume.
   *
   * @param merchantId - The merchant identifier
   * @param apiKey     - The API key (first 8 chars used in Redis key)
   */
  async consume(merchantId: string, apiKey: string): Promise<TokenBucketResult> {
    const key = `ratelimit:${merchantId}:${apiKey.substring(0, 8)}`;
    const now = Date.now();

    try {
      const result = await (this.redis as any).eval(
        TOKEN_BUCKET_LUA,
        1,
        key,
        this.CAPACITY,
        this.REFILL_RATE,
        now,
        1,
      ) as [number, number, number?];

      const allowed = result[0] === 1;
      const remaining = result[1];
      const retryAfterSeconds = result[2] ?? 0;
      const resetAt = new Date(now + retryAfterSeconds * 1000);

      return { allowed, remaining, resetAt, retryAfterSeconds };
    } catch {
      // Fail open on Redis error
      return {
        allowed: true,
        remaining: this.CAPACITY,
        resetAt: new Date(now + 60000),
        retryAfterSeconds: 0,
      };
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
