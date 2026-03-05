/**
 * SignalRisk Event Collector — Queue Depth Guard
 *
 * Tracks in-flight requests with a sliding window to enforce
 * max concurrent requests and queue depth limits.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface QueueDepthStatus {
  currentRequests: number;
  maxConcurrent: number;
  requestsPerSecond: number;
  maxQueueDepth: number;
  isOverloaded: boolean;
}

@Injectable()
export class BackpressureService {
  private readonly logger = new Logger(BackpressureService.name);

  /** Currently in-flight requests */
  private inFlightRequests = 0;

  /** Sliding window of request timestamps (epoch ms) */
  private readonly requestTimestamps: number[] = [];

  /** Sliding window size in ms */
  private readonly windowMs: number;

  /** Max concurrent in-flight requests */
  private readonly maxConcurrent: number;

  /** Max requests per second (queue depth threshold) */
  private readonly maxQueueDepth: number;

  constructor(private readonly configService: ConfigService) {
    this.windowMs = this.configService.get<number>('backpressure.windowMs') ?? 10_000;
    this.maxConcurrent = this.configService.get<number>('backpressure.maxConcurrent') ?? 500;
    this.maxQueueDepth = this.configService.get<number>('backpressure.maxQueueDepth') ?? 5000;
  }

  /**
   * Record an incoming request. Returns true if the request is allowed.
   */
  tryAcquire(): boolean {
    this.pruneWindow();

    if (this.inFlightRequests >= this.maxConcurrent) {
      this.logger.warn(
        `Queue depth guard: concurrent requests ${this.inFlightRequests} >= ${this.maxConcurrent}`,
      );
      return false;
    }

    if (this.requestTimestamps.length >= this.maxQueueDepth) {
      this.logger.warn(
        `Queue depth guard: requests in window ${this.requestTimestamps.length} >= ${this.maxQueueDepth}`,
      );
      return false;
    }

    this.inFlightRequests++;
    this.requestTimestamps.push(Date.now());
    return true;
  }

  /**
   * Release an in-flight request slot (call after request completes).
   */
  release(): void {
    this.inFlightRequests = Math.max(0, this.inFlightRequests - 1);
  }

  /**
   * Get current queue depth metrics.
   */
  getStatus(): QueueDepthStatus {
    this.pruneWindow();
    const windowSeconds = this.windowMs / 1000;
    const rps = this.requestTimestamps.length / windowSeconds;

    return {
      currentRequests: this.inFlightRequests,
      maxConcurrent: this.maxConcurrent,
      requestsPerSecond: Math.round(rps * 100) / 100,
      maxQueueDepth: this.maxQueueDepth,
      isOverloaded:
        this.inFlightRequests >= this.maxConcurrent ||
        this.requestTimestamps.length >= this.maxQueueDepth,
    };
  }

  /**
   * Remove timestamps outside the sliding window.
   */
  private pruneWindow(): void {
    const cutoff = Date.now() - this.windowMs;
    while (this.requestTimestamps.length > 0 && this.requestTimestamps[0] < cutoff) {
      this.requestTimestamps.shift();
    }
  }
}
