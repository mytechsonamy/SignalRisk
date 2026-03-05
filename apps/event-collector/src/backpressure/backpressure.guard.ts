/**
 * SignalRisk Event Collector — Backpressure Guard (NestJS)
 *
 * NestJS guard that checks all backpressure conditions in priority order:
 *   1. Queue depth (in-memory concurrent request limit)
 *   2. Per-merchant fairness (token bucket)
 *   3. Dynamic rate adjustment (Kafka health)
 *
 * Returns 429 with Retry-After header and descriptive reason on rejection.
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { BackpressureService } from './backpressure.service';
import { FairnessService } from './fairness.service';
import { RateAdjusterService } from './rate-adjuster.service';

export type RejectionReason =
  | 'queue_depth_exceeded'
  | 'merchant_rate_limited'
  | 'system_overloaded';

@Injectable()
export class BackpressureGuard implements CanActivate {
  private readonly logger = new Logger(BackpressureGuard.name);

  constructor(
    private readonly backpressureService: BackpressureService,
    private readonly fairnessService: FairnessService,
    private readonly rateAdjusterService: RateAdjusterService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    // --- 1. Queue Depth Check ---
    if (!this.backpressureService.tryAcquire()) {
      const status = this.backpressureService.getStatus();
      this.reject(response, 'queue_depth_exceeded', {
        currentRequests: status.currentRequests,
        maxConcurrent: status.maxConcurrent,
        requestsPerSecond: status.requestsPerSecond,
      });
    }

    // --- 2. Per-Merchant Fairness Check ---
    const merchantId = this.extractMerchantId(request);
    if (merchantId) {
      const eventCount = this.extractEventCount(request);
      if (!this.fairnessService.tryConsume(merchantId, eventCount)) {
        // Release the queue slot since we're rejecting
        this.backpressureService.release();

        const fairnessStatus = this.fairnessService.getStatus(merchantId);
        this.reject(response, 'merchant_rate_limited', {
          merchantId,
          tokensRemaining: fairnessStatus.tokensRemaining,
          maxRate: fairnessStatus.refillRate,
        });
      }
    }

    // --- 3. Dynamic Rate Adjustment Check ---
    if (!this.rateAdjusterService.isAccepting()) {
      // Release the queue slot since we're rejecting
      this.backpressureService.release();

      const rateStatus = this.rateAdjusterService.getStatus();
      this.reject(response, 'system_overloaded', {
        rateMultiplier: rateStatus.currentRateMultiplier,
        reason: rateStatus.adjustmentReason,
        consumerLag: rateStatus.consumerLag,
      });
    }

    // Probabilistic rejection based on rate multiplier
    const multiplier = this.rateAdjusterService.getRateMultiplier();
    if (multiplier < 1.0 && Math.random() > multiplier) {
      // Release the queue slot since we're rejecting
      this.backpressureService.release();

      const rateStatus = this.rateAdjusterService.getStatus();
      this.reject(response, 'system_overloaded', {
        rateMultiplier: rateStatus.currentRateMultiplier,
        reason: rateStatus.adjustmentReason,
        consumerLag: rateStatus.consumerLag,
      });
    }

    // Request is allowed — register cleanup for when the request finishes
    response.on('finish', () => {
      this.backpressureService.release();
    });

    return true;
  }

  /**
   * Reject the request with 429 and Retry-After header.
   */
  private reject(
    response: Response,
    reason: RejectionReason,
    details: Record<string, unknown>,
  ): never {
    const retryAfter = this.calculateRetryAfter(reason);
    response.setHeader('Retry-After', String(retryAfter));

    this.logger.warn(`Backpressure rejection: ${reason}`, details);

    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Service under backpressure. Please retry later.',
        reason,
        retryAfter,
        ...details,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  /**
   * Calculate appropriate Retry-After value (in seconds) based on rejection reason.
   */
  private calculateRetryAfter(reason: RejectionReason): number {
    switch (reason) {
      case 'queue_depth_exceeded':
        return 1; // Very short — transient overload
      case 'merchant_rate_limited':
        return 2; // Wait for token refill
      case 'system_overloaded':
        return 5; // Longer — system needs time to recover
      default:
        return 3;
    }
  }

  /**
   * Extract merchantId from the request body for fairness checks.
   * Looks at the first event in the batch.
   */
  private extractMerchantId(request: Request): string | undefined {
    const body = request.body;
    if (body?.events && Array.isArray(body.events) && body.events.length > 0) {
      return body.events[0].merchantId;
    }
    return undefined;
  }

  /**
   * Extract the number of events in the batch for token consumption.
   */
  private extractEventCount(request: Request): number {
    const body = request.body;
    if (body?.events && Array.isArray(body.events)) {
      return body.events.length;
    }
    return 1;
  }
}
