/**
 * SignalRisk Event Collector — Dynamic Rate Adjuster
 *
 * Monitors Kafka producer latency and consumer lag to dynamically
 * adjust the accept rate. Uses exponential backoff on sustained
 * pressure and gradual restoration when conditions normalize.
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KafkaService } from '../kafka/kafka.service';

export type AdjustmentReason =
  | 'nominal'
  | 'high_consumer_lag'
  | 'increasing_latency'
  | 'sustained_pressure'
  | 'recovery';

export interface RateAdjustmentStatus {
  currentRateMultiplier: number;
  adjustmentReason: AdjustmentReason;
  consumerLag: number;
  lagThreshold: number;
  pressureDurationMs: number;
  isAccepting: boolean;
}

@Injectable()
export class RateAdjusterService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RateAdjusterService.name);

  /** Current rate multiplier: 1.0 = full capacity, 0 = rejecting all */
  private rateMultiplier = 1.0;

  /** Minimum rate multiplier before fully rejecting */
  private readonly minRateMultiplier: number;

  /** Consumer lag threshold to start reducing rate */
  private readonly lagWarningThreshold: number;

  /** Consumer lag threshold to aggressively reduce rate */
  private readonly lagCriticalThreshold: number;

  /** How fast to reduce rate under pressure (0-1) */
  private readonly reductionFactor: number;

  /** How fast to restore rate when healthy (0-1) */
  private readonly recoveryFactor: number;

  /** Monitoring interval in ms */
  private readonly checkIntervalMs: number;

  /** Timestamp when pressure started */
  private pressureStartedAt: number | null = null;

  /** Current adjustment reason */
  private adjustmentReason: AdjustmentReason = 'nominal';

  /** Track recent latency samples for trend detection */
  private readonly latencySamples: number[] = [];
  private readonly maxLatencySamples = 20;

  /** Polling interval handle */
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly kafkaService: KafkaService,
  ) {
    this.minRateMultiplier =
      this.configService.get<number>('backpressure.rateAdjuster.minMultiplier') ?? 0.1;
    this.lagWarningThreshold =
      this.configService.get<number>('backpressure.rateAdjuster.lagWarningThreshold') ?? 50_000;
    this.lagCriticalThreshold =
      this.configService.get<number>('backpressure.rateAdjuster.lagCriticalThreshold') ?? 100_000;
    this.reductionFactor =
      this.configService.get<number>('backpressure.rateAdjuster.reductionFactor') ?? 0.8;
    this.recoveryFactor =
      this.configService.get<number>('backpressure.rateAdjuster.recoveryFactor') ?? 1.1;
    this.checkIntervalMs =
      this.configService.get<number>('backpressure.rateAdjuster.checkIntervalMs') ?? 5_000;
  }

  onModuleInit(): void {
    this.intervalHandle = setInterval(() => this.evaluate(), this.checkIntervalMs);
    this.logger.log(
      `Rate adjuster started (check every ${this.checkIntervalMs}ms, ` +
        `warning lag=${this.lagWarningThreshold}, critical lag=${this.lagCriticalThreshold})`,
    );
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  /**
   * Returns current rate multiplier (0.0 - 1.0).
   * Used by the backpressure guard to decide whether to accept requests.
   */
  getRateMultiplier(): number {
    return this.rateMultiplier;
  }

  /**
   * Whether the system is currently accepting requests based on rate adjustment.
   */
  isAccepting(): boolean {
    return this.rateMultiplier > this.minRateMultiplier;
  }

  /**
   * Get full status for metrics / health reporting.
   */
  getStatus(): RateAdjustmentStatus {
    return {
      currentRateMultiplier: Math.round(this.rateMultiplier * 1000) / 1000,
      adjustmentReason: this.adjustmentReason,
      consumerLag: this.kafkaService.getConsumerLag(),
      lagThreshold: this.lagCriticalThreshold,
      pressureDurationMs: this.pressureStartedAt ? Date.now() - this.pressureStartedAt : 0,
      isAccepting: this.isAccepting(),
    };
  }

  /**
   * Record a producer send latency sample (ms).
   * Called by the events service after each Kafka send.
   */
  recordLatency(latencyMs: number): void {
    this.latencySamples.push(latencyMs);
    if (this.latencySamples.length > this.maxLatencySamples) {
      this.latencySamples.shift();
    }
  }

  /**
   * Core evaluation loop — called periodically to adjust rate.
   */
  evaluate(): void {
    const lag = this.kafkaService.getConsumerLag();
    const latencyTrend = this.detectLatencyTrend();

    if (lag >= this.lagCriticalThreshold) {
      this.applyPressure('high_consumer_lag');
    } else if (lag >= this.lagWarningThreshold) {
      // Moderate pressure — reduce gradually
      if (latencyTrend === 'increasing') {
        this.applyPressure('increasing_latency');
      } else {
        // Hold current rate
        this.adjustmentReason = 'high_consumer_lag';
        this.rateMultiplier = Math.max(this.minRateMultiplier, this.rateMultiplier * 0.95);
      }
    } else if (latencyTrend === 'increasing') {
      this.applyPressure('increasing_latency');
    } else {
      this.applyRecovery();
    }
  }

  private applyPressure(reason: AdjustmentReason): void {
    if (!this.pressureStartedAt) {
      this.pressureStartedAt = Date.now();
    }

    const pressureDuration = Date.now() - this.pressureStartedAt;

    // Exponential backoff on sustained pressure (> 30s)
    let factor = this.reductionFactor;
    if (pressureDuration > 30_000) {
      this.adjustmentReason = 'sustained_pressure';
      factor = this.reductionFactor * 0.8; // More aggressive reduction
    } else {
      this.adjustmentReason = reason;
    }

    const previousMultiplier = this.rateMultiplier;
    this.rateMultiplier = Math.max(this.minRateMultiplier, this.rateMultiplier * factor);

    if (Math.abs(previousMultiplier - this.rateMultiplier) > 0.01) {
      this.logger.warn(
        `Rate reduced: ${previousMultiplier.toFixed(3)} -> ${this.rateMultiplier.toFixed(3)} ` +
          `(reason=${this.adjustmentReason}, pressure=${pressureDuration}ms)`,
      );
    }
  }

  private applyRecovery(): void {
    if (this.rateMultiplier < 1.0) {
      const previousMultiplier = this.rateMultiplier;
      this.rateMultiplier = Math.min(1.0, this.rateMultiplier * this.recoveryFactor);
      this.adjustmentReason = 'recovery';

      if (Math.abs(previousMultiplier - this.rateMultiplier) > 0.01) {
        this.logger.log(
          `Rate recovering: ${previousMultiplier.toFixed(3)} -> ${this.rateMultiplier.toFixed(3)}`,
        );
      }

      if (this.rateMultiplier >= 1.0) {
        this.rateMultiplier = 1.0;
        this.adjustmentReason = 'nominal';
        this.pressureStartedAt = null;
        this.logger.log('Rate fully restored to nominal');
      }
    } else {
      this.adjustmentReason = 'nominal';
      this.pressureStartedAt = null;
    }
  }

  /**
   * Detect whether latency is trending upward by comparing
   * the average of the first half vs second half of recent samples.
   */
  private detectLatencyTrend(): 'increasing' | 'decreasing' | 'stable' {
    if (this.latencySamples.length < 6) {
      return 'stable';
    }

    const mid = Math.floor(this.latencySamples.length / 2);
    const firstHalf = this.latencySamples.slice(0, mid);
    const secondHalf = this.latencySamples.slice(mid);

    const avgFirst = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;

    // 20% increase threshold
    if (avgSecond > avgFirst * 1.2) {
      return 'increasing';
    }
    if (avgSecond < avgFirst * 0.8) {
      return 'decreasing';
    }
    return 'stable';
  }
}
