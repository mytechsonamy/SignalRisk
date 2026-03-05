/**
 * SignalRisk Decision Service — Idempotency Service
 *
 * Redis hot cache for decision results. Prevents duplicate processing
 * for requests with the same requestId within a 24-hour window.
 *
 * Key pattern: idempotency:{merchantId}:{requestId}
 * TTL:         86400 seconds (24h)
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { DecisionResult } from '../decision/decision.types';

const IDEMPOTENCY_TTL = 86400; // 24 hours

@Injectable()
export class IdempotencyService implements OnModuleDestroy {
  private readonly logger = new Logger(IdempotencyService.name);
  private readonly redis: Redis;

  constructor(private readonly configService: ConfigService) {
    const redisConfig = this.configService.get('redis');

    this.redis = new Redis({
      host:     redisConfig?.host     || 'localhost',
      port:     redisConfig?.port     || 6379,
      password: redisConfig?.password || undefined,
      db:       redisConfig?.db       || 0,
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        if (times > 5) return null;
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });

    this.redis.connect().catch((err: Error) => {
      this.logger.warn(`Redis connection failed (non-fatal): ${err.message}`);
    });

    this.redis.on('error', (err: Error) => {
      this.logger.warn(`Redis error: ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => {});
  }

  /**
   * Look up a cached decision result by requestId + merchantId.
   * Returns null on cache miss or error.
   * On hit, marks the result as cached=true.
   */
  async get(requestId: string, merchantId: string): Promise<DecisionResult | null> {
    try {
      const key  = this.buildKey(merchantId, requestId);
      const data = await this.redis.get(key);
      if (!data) return null;

      const result = this.deserialize(data);
      // Mark as served from cache
      return { ...result, cached: true };
    } catch (err) {
      this.logger.warn(`Idempotency get error for ${requestId}: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Cache a decision result with 24h TTL.
   */
  async set(result: DecisionResult): Promise<void> {
    try {
      const key = this.buildKey(result.merchantId, result.requestId);
      await this.redis.setex(key, IDEMPOTENCY_TTL, this.serialize(result));
    } catch (err) {
      this.logger.warn(
        `Idempotency set error for ${result.requestId}: ${(err as Error).message}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private buildKey(merchantId: string, requestId: string): string {
    return `idempotency:${merchantId}:${requestId}`;
  }

  private serialize(result: DecisionResult): string {
    return JSON.stringify({
      ...result,
      createdAt: result.createdAt.toISOString(),
    });
  }

  private deserialize(data: string): DecisionResult {
    const parsed = JSON.parse(data) as Record<string, unknown>;
    return {
      ...parsed,
      createdAt: new Date(parsed.createdAt as string),
    } as DecisionResult;
  }
}
