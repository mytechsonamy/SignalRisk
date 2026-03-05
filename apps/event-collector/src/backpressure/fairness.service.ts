/**
 * SignalRisk Event Collector — Per-Merchant Fairness (Token Bucket)
 *
 * Implements a token bucket per merchant to prevent a single merchant
 * from saturating the service. Uses in-memory buckets (Redis-backed
 * in production via configuration).
 *
 * Default: 1000 events/sec per merchant, configurable per merchant.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface TokenBucket {
  tokens: number;
  maxTokens: number;
  refillRate: number; // tokens per second
  lastRefill: number; // epoch ms
}

export interface FairnessStatus {
  merchantId: string;
  tokensRemaining: number;
  maxTokens: number;
  refillRate: number;
  allowed: boolean;
}

@Injectable()
export class FairnessService {
  private readonly logger = new Logger(FairnessService.name);

  /** In-memory token buckets keyed by merchantId */
  private readonly buckets = new Map<string, TokenBucket>();

  /** Default tokens per second per merchant */
  private readonly defaultRate: number;

  /** Default burst size (max tokens) */
  private readonly defaultBurst: number;

  /** Per-merchant overrides: merchantId -> { rate, burst } */
  private readonly merchantOverrides = new Map<string, { rate: number; burst: number }>();

  /** Cleanup interval for stale buckets */
  private readonly staleBucketTtlMs: number;

  constructor(private readonly configService: ConfigService) {
    this.defaultRate = this.configService.get<number>('backpressure.fairness.defaultRate') ?? 1000;
    this.defaultBurst = this.configService.get<number>('backpressure.fairness.defaultBurst') ?? 2000;
    this.staleBucketTtlMs =
      this.configService.get<number>('backpressure.fairness.staleBucketTtlMs') ?? 300_000;

    // Parse merchant overrides from config (JSON string)
    const overridesJson = this.configService.get<string>('backpressure.fairness.merchantOverrides');
    if (overridesJson) {
      try {
        const overrides = JSON.parse(overridesJson) as Record<
          string,
          { rate: number; burst: number }
        >;
        for (const [merchantId, config] of Object.entries(overrides)) {
          this.merchantOverrides.set(merchantId, config);
        }
        this.logger.log(`Loaded ${this.merchantOverrides.size} merchant rate overrides`);
      } catch {
        this.logger.warn('Failed to parse merchant rate overrides, using defaults');
      }
    }

    // Periodically clean up stale buckets
    setInterval(() => this.cleanupStaleBuckets(), this.staleBucketTtlMs);
  }

  /**
   * Check whether a merchant is allowed to send an event.
   * Consumes one token from the merchant's bucket.
   * Returns true if the request is allowed.
   */
  tryConsume(merchantId: string, tokensToConsume = 1): boolean {
    const bucket = this.getOrCreateBucket(merchantId);
    this.refill(bucket);

    if (bucket.tokens >= tokensToConsume) {
      bucket.tokens -= tokensToConsume;
      return true;
    }

    this.logger.warn(
      `Fairness: merchant ${merchantId} rate limited — ` +
        `${bucket.tokens.toFixed(1)} tokens remaining, needs ${tokensToConsume}`,
    );
    return false;
  }

  /**
   * Check status for a merchant without consuming tokens.
   */
  getStatus(merchantId: string): FairnessStatus {
    const bucket = this.getOrCreateBucket(merchantId);
    this.refill(bucket);

    return {
      merchantId,
      tokensRemaining: Math.floor(bucket.tokens),
      maxTokens: bucket.maxTokens,
      refillRate: bucket.refillRate,
      allowed: bucket.tokens >= 1,
    };
  }

  /**
   * Set a per-merchant rate override at runtime.
   */
  setMerchantRate(merchantId: string, rate: number, burst?: number): void {
    this.merchantOverrides.set(merchantId, {
      rate,
      burst: burst ?? rate * 2,
    });

    // Update existing bucket if present
    const bucket = this.buckets.get(merchantId);
    if (bucket) {
      bucket.refillRate = rate;
      bucket.maxTokens = burst ?? rate * 2;
    }
  }

  private getOrCreateBucket(merchantId: string): TokenBucket {
    let bucket = this.buckets.get(merchantId);
    if (!bucket) {
      const override = this.merchantOverrides.get(merchantId);
      const rate = override?.rate ?? this.defaultRate;
      const burst = override?.burst ?? this.defaultBurst;

      bucket = {
        tokens: burst, // Start full
        maxTokens: burst,
        refillRate: rate,
        lastRefill: Date.now(),
      };
      this.buckets.set(merchantId, bucket);
    }
    return bucket;
  }

  private refill(bucket: TokenBucket): void {
    const now = Date.now();
    const elapsed = (now - bucket.lastRefill) / 1000; // seconds
    const tokensToAdd = elapsed * bucket.refillRate;

    bucket.tokens = Math.min(bucket.maxTokens, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
  }

  private cleanupStaleBuckets(): void {
    const cutoff = Date.now() - this.staleBucketTtlMs;
    let cleaned = 0;

    for (const [merchantId, bucket] of this.buckets) {
      if (bucket.lastRefill < cutoff) {
        this.buckets.delete(merchantId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} stale merchant token buckets`);
    }
  }
}
