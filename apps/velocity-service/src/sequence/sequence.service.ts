/**
 * Sprint 7: Sequence Detection Service
 *
 * Detects temporal event sequences that indicate fraud patterns.
 * Uses Redis lists to maintain a rolling buffer of recent events per entity.
 *
 * Supported sequences (ADR-009 stateful namespace):
 * 1. login_then_payment_15m — login event followed by payment within 15 minutes
 * 2. failed_payment_x3_then_success_10m — 3+ failed payments then success within 10 min
 * 3. device_change_then_payment_30m — device change followed by payment within 30 min
 *
 * Redis structure:
 *   {merchantId}:vel:seq:{entityType}:{entityId} → LPUSH list of {type}:{timestamp}
 *   TTL: 1800s (30 minutes — longest sequence window)
 *   Max 10 entries via LTRIM
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import Redis from 'ioredis';

const SEQ_TTL = 1800; // 30 minutes
const SEQ_MAX_ENTRIES = 10;

export interface SequenceEvent {
  merchantId: string;
  entityType: 'customer' | 'device' | 'ip';
  entityId: string;
  eventType: string; // 'login', 'payment', 'payment_failed', 'device_change'
  timestampSeconds: number;
}

export interface SequenceResult {
  loginThenPayment15m: boolean;
  failedPaymentX3ThenSuccess10m: boolean;
  deviceChangeThenPayment30m: boolean;
}

@Injectable()
export class SequenceService {
  private readonly logger = new Logger(SequenceService.name);

  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  private seqKey(merchantId: string, entityType: string, entityId: string): string {
    return `${merchantId}:vel:seq:${entityType}:${entityId}`;
  }

  /**
   * Record an event in the sequence buffer and check for sequence matches.
   */
  async recordAndDetect(event: SequenceEvent): Promise<SequenceResult> {
    const key = this.seqKey(event.merchantId, event.entityType, event.entityId);
    const entry = `${event.eventType}:${event.timestampSeconds}`;

    // Atomically: push event, trim to max size, set TTL
    const pipeline = this.redis.pipeline();
    pipeline.lpush(key, entry);
    pipeline.ltrim(key, 0, SEQ_MAX_ENTRIES - 1);
    pipeline.expire(key, SEQ_TTL);
    pipeline.lrange(key, 0, SEQ_MAX_ENTRIES - 1);
    const results = await pipeline.exec();

    // Parse the buffer (most recent first)
    const rangeResult = results?.[3]?.[1] as string[] | undefined;
    const buffer = (rangeResult || []).map((item) => {
      const lastColon = item.lastIndexOf(':');
      return {
        type: item.substring(0, lastColon),
        ts: parseInt(item.substring(lastColon + 1), 10),
      };
    });

    return {
      loginThenPayment15m: this.detectLoginThenPayment(buffer, event.timestampSeconds),
      failedPaymentX3ThenSuccess10m: this.detectFailedX3ThenSuccess(buffer, event.timestampSeconds),
      deviceChangeThenPayment30m: this.detectDeviceChangeThenPayment(buffer, event.timestampSeconds),
    };
  }

  /**
   * Sequence 1: login event followed by payment within 15 minutes.
   * Current event must be 'payment', and a 'login' must exist within 15m before it.
   */
  private detectLoginThenPayment(
    buffer: Array<{ type: string; ts: number }>,
    now: number,
  ): boolean {
    if (buffer.length === 0 || buffer[0].type !== 'payment') return false;

    const window = 15 * 60; // 15 minutes
    return buffer.some(
      (e) => e.type === 'login' && now - e.ts <= window && now - e.ts > 0,
    );
  }

  /**
   * Sequence 2: 3+ failed payments then a successful payment within 10 minutes.
   * Current event must be 'payment', and 3+ 'payment_failed' entries within 10m window.
   */
  private detectFailedX3ThenSuccess(
    buffer: Array<{ type: string; ts: number }>,
    now: number,
  ): boolean {
    if (buffer.length === 0 || buffer[0].type !== 'payment') return false;

    const window = 10 * 60; // 10 minutes
    const recentFails = buffer.filter(
      (e) => e.type === 'payment_failed' && now - e.ts <= window,
    );
    return recentFails.length >= 3;
  }

  /**
   * Sequence 3: device change followed by payment within 30 minutes.
   * Current event must be 'payment', and 'device_change' must exist within 30m.
   */
  private detectDeviceChangeThenPayment(
    buffer: Array<{ type: string; ts: number }>,
    now: number,
  ): boolean {
    if (buffer.length === 0 || buffer[0].type !== 'payment') return false;

    const window = 30 * 60; // 30 minutes
    return buffer.some(
      (e) => e.type === 'device_change' && now - e.ts <= window && now - e.ts > 0,
    );
  }

  /**
   * Get sequence detection results without recording a new event (read-only).
   */
  async detect(
    merchantId: string,
    entityType: 'customer' | 'device' | 'ip',
    entityId: string,
    currentEventType: string,
    timestampSeconds: number,
  ): Promise<SequenceResult> {
    const key = this.seqKey(merchantId, entityType, entityId);
    const raw = await this.redis.lrange(key, 0, SEQ_MAX_ENTRIES - 1);

    const buffer = [
      { type: currentEventType, ts: timestampSeconds },
      ...raw.map((item) => {
        const lastColon = item.lastIndexOf(':');
        return {
          type: item.substring(0, lastColon),
          ts: parseInt(item.substring(lastColon + 1), 10),
        };
      }),
    ];

    return {
      loginThenPayment15m: this.detectLoginThenPayment(buffer, timestampSeconds),
      failedPaymentX3ThenSuccess10m: this.detectFailedX3ThenSuccess(buffer, timestampSeconds),
      deviceChangeThenPayment30m: this.detectDeviceChangeThenPayment(buffer, timestampSeconds),
    };
  }
}
