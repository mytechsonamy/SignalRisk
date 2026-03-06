import { Injectable } from '@nestjs/common';

export interface PhaseTimings {
  signalFetchMs: number;
  ruleEvalMs: number;
  cacheWriteMs: number;
  dbWriteMs: number;
  totalMs: number;
}

@Injectable()
export class DecisionProfiler {
  private readonly timings: PhaseTimings[] = [];
  private readonly MAX_SAMPLES = 1000; // circular buffer

  record(timings: PhaseTimings): void {
    if (this.timings.length >= this.MAX_SAMPLES) {
      this.timings.shift();
    }
    this.timings.push(timings);
  }

  getPrometheusMetrics(): string {
    if (!this.timings.length) {
      return '# No samples yet\n';
    }

    const phases: (keyof Omit<PhaseTimings, 'totalMs'>)[] = ['signalFetchMs', 'ruleEvalMs', 'cacheWriteMs', 'dbWriteMs'];
    const lines: string[] = [
      '# HELP decision_phase_duration_ms Decision engine phase durations in milliseconds',
      '# TYPE decision_phase_duration_ms gauge',
    ];

    for (const phase of phases) {
      const values = this.timings.map(t => t[phase]).sort((a, b) => a - b);
      const p50 = this.percentile(values, 50);
      const p95 = this.percentile(values, 95);
      const p99 = this.percentile(values, 99);
      lines.push(`decision_phase_duration_ms{phase="${phase}",quantile="0.5"} ${p50}`);
      lines.push(`decision_phase_duration_ms{phase="${phase}",quantile="0.95"} ${p95}`);
      lines.push(`decision_phase_duration_ms{phase="${phase}",quantile="0.99"} ${p99}`);
    }

    // Total
    const totals = this.timings.map(t => t.totalMs).sort((a, b) => a - b);
    lines.push(`decision_phase_duration_ms{phase="total",quantile="0.99"} ${this.percentile(totals, 99)}`);
    lines.push(`decision_engine_sample_count ${this.timings.length}`);

    return lines.join('\n') + '\n';
  }

  private percentile(sorted: number[], p: number): number {
    if (!sorted.length) return 0;
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return Math.round(sorted[Math.max(0, idx)] * 100) / 100;
  }

  getSampleCount(): number {
    return this.timings.length;
  }
}
