import { Injectable } from '@nestjs/common';

export interface BehavioralBaseline {
  meanKeystrokeInterval: number;
  stddevKeystrokeInterval: number;
  meanSwipeVelocity: number;
  stddevSwipeVelocity: number;
  sampleCount: number;
  updatedAt: Date;
}

export interface BehavioralMlResult {
  anomalyScore: number;   // z-score magnitude (0 = normal, >3 = highly anomalous)
  riskScore: number;      // 0-100
  baselineSampleCount: number;
  usedMlScoring: boolean; // false = fell back to heuristics (cold start)
}

@Injectable()
export class BehavioralMlService {
  // In-memory baseline store (keyed by merchantId)
  private baselines = new Map<string, BehavioralBaseline>();
  private readonly MIN_SAMPLES_FOR_ML = 10;
  private readonly EMA_ALPHA = 0.1;

  analyze(input: {
    merchantId: string;
    keystrokeIntervals: number[];   // ms between keystrokes
    swipeVelocities: number[];      // px/ms
  }): BehavioralMlResult {
    const baseline = this.baselines.get(input.merchantId);

    if (!baseline || baseline.sampleCount < this.MIN_SAMPLES_FOR_ML) {
      // Cold start: use heuristic
      return {
        anomalyScore: 0,
        riskScore: this.heuristicScore(input),
        baselineSampleCount: baseline?.sampleCount ?? 0,
        usedMlScoring: false,
      };
    }

    // Z-score calculation
    const keystrokeAnomaly = this.zScore(
      this.mean(input.keystrokeIntervals),
      baseline.meanKeystrokeInterval,
      baseline.stddevKeystrokeInterval
    );
    const swipeAnomaly = this.zScore(
      this.mean(input.swipeVelocities),
      baseline.meanSwipeVelocity,
      baseline.stddevSwipeVelocity
    );

    const anomalyScore = Math.max(Math.abs(keystrokeAnomaly), Math.abs(swipeAnomaly));
    // Map z-score to 0-100: z=0→0, z=2→50, z=4→100
    const riskScore = Math.min(100, Math.round((anomalyScore / 4) * 100));

    return { anomalyScore, riskScore, baselineSampleCount: baseline.sampleCount, usedMlScoring: true };
  }

  updateBaseline(merchantId: string, input: {
    keystrokeIntervals: number[];
    swipeVelocities: number[];
  }): void {
    const existing = this.baselines.get(merchantId);
    const keystrokeMean = this.mean(input.keystrokeIntervals);
    const swipeMean = this.mean(input.swipeVelocities);
    const keystrokeStd = this.stddev(input.keystrokeIntervals);
    const swipeStd = this.stddev(input.swipeVelocities);

    if (!existing) {
      this.baselines.set(merchantId, {
        meanKeystrokeInterval: keystrokeMean,
        stddevKeystrokeInterval: keystrokeStd,
        meanSwipeVelocity: swipeMean,
        stddevSwipeVelocity: swipeStd,
        sampleCount: 1,
        updatedAt: new Date(),
      });
    } else {
      // Exponential moving average update
      this.baselines.set(merchantId, {
        meanKeystrokeInterval: this.ema(existing.meanKeystrokeInterval, keystrokeMean),
        stddevKeystrokeInterval: this.ema(existing.stddevKeystrokeInterval, keystrokeStd),
        meanSwipeVelocity: this.ema(existing.meanSwipeVelocity, swipeMean),
        stddevSwipeVelocity: this.ema(existing.stddevSwipeVelocity, swipeStd),
        sampleCount: existing.sampleCount + 1,
        updatedAt: new Date(),
      });
    }
  }

  getBaseline(merchantId: string): BehavioralBaseline | undefined {
    return this.baselines.get(merchantId);
  }

  private mean(values: number[]): number {
    if (!values.length) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private stddev(values: number[]): number {
    if (values.length < 2) return 1; // avoid division by zero
    const m = this.mean(values);
    const variance = values.reduce((a, b) => a + Math.pow(b - m, 2), 0) / values.length;
    return Math.sqrt(variance) || 1;
  }

  private zScore(value: number, mean: number, std: number): number {
    if (std === 0) return 0;
    return (value - mean) / std;
  }

  private ema(previous: number, current: number): number {
    return this.EMA_ALPHA * current + (1 - this.EMA_ALPHA) * previous;
  }

  private heuristicScore(input: { keystrokeIntervals: number[]; swipeVelocities: number[] }): number {
    // Simple heuristic: very fast keystrokes (< 50ms avg) = bot-like
    const avgKeystroke = this.mean(input.keystrokeIntervals);
    if (avgKeystroke < 50 && input.keystrokeIntervals.length > 3) return 70;
    if (avgKeystroke < 30) return 90;
    return 10;
  }
}
