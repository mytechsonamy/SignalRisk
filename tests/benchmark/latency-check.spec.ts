// These tests validate the latency benchmark tooling and profiler logic
import { DecisionProfiler, PhaseTimings } from '../../apps/decision-service/src/decision/decision-profiler';

describe('DecisionProfiler', () => {
  let profiler: DecisionProfiler;

  beforeEach(() => { profiler = new DecisionProfiler(); });

  it('returns no-samples message when empty', () => {
    expect(profiler.getPrometheusMetrics()).toContain('No samples');
  });

  it('records timings and returns prometheus metrics', () => {
    profiler.record({ signalFetchMs: 10, ruleEvalMs: 5, cacheWriteMs: 2, dbWriteMs: 3, totalMs: 20 });
    const metrics = profiler.getPrometheusMetrics();
    expect(metrics).toContain('decision_phase_duration_ms');
    expect(metrics).toContain('phase="signalFetchMs"');
  });

  it('p99 calculated correctly for single sample', () => {
    profiler.record({ signalFetchMs: 15, ruleEvalMs: 8, cacheWriteMs: 1, dbWriteMs: 2, totalMs: 26 });
    const metrics = profiler.getPrometheusMetrics();
    expect(metrics).toContain('quantile="0.99"');
  });

  it('circular buffer caps at 1000 samples', () => {
    for (let i = 0; i < 1005; i++) {
      profiler.record({ signalFetchMs: i, ruleEvalMs: 1, cacheWriteMs: 1, dbWriteMs: 1, totalMs: i + 3 });
    }
    expect(profiler.getSampleCount()).toBe(1000);
  });

  it('includes all 4 phases in metrics output', () => {
    profiler.record({ signalFetchMs: 5, ruleEvalMs: 3, cacheWriteMs: 1, dbWriteMs: 2, totalMs: 11 });
    const metrics = profiler.getPrometheusMetrics();
    expect(metrics).toContain('signalFetchMs');
    expect(metrics).toContain('ruleEvalMs');
    expect(metrics).toContain('cacheWriteMs');
    expect(metrics).toContain('dbWriteMs');
  });

  it('includes total phase', () => {
    profiler.record({ signalFetchMs: 5, ruleEvalMs: 3, cacheWriteMs: 1, dbWriteMs: 2, totalMs: 11 });
    expect(profiler.getPrometheusMetrics()).toContain('phase="total"');
  });

  it('includes sample count metric', () => {
    profiler.record({ signalFetchMs: 1, ruleEvalMs: 1, cacheWriteMs: 1, dbWriteMs: 1, totalMs: 4 });
    expect(profiler.getPrometheusMetrics()).toContain('decision_engine_sample_count 1');
  });

  it('p95 is at or below p99', () => {
    for (let i = 1; i <= 100; i++) {
      profiler.record({ signalFetchMs: i, ruleEvalMs: 1, cacheWriteMs: 1, dbWriteMs: 1, totalMs: i + 3 });
    }
    const metrics = profiler.getPrometheusMetrics();
    const p95Match = metrics.match(/phase="signalFetchMs",quantile="0\.95"} (\d+\.?\d*)/);
    const p99Match = metrics.match(/phase="signalFetchMs",quantile="0\.99"} (\d+\.?\d*)/);
    expect(parseFloat(p95Match![1])).toBeLessThanOrEqual(parseFloat(p99Match![1]));
  });

  it('getSampleCount returns 0 initially', () => {
    expect(profiler.getSampleCount()).toBe(0);
  });

  it('percentile handles single-element sorted array', () => {
    profiler.record({ signalFetchMs: 42, ruleEvalMs: 1, cacheWriteMs: 1, dbWriteMs: 1, totalMs: 45 });
    const metrics = profiler.getPrometheusMetrics();
    expect(metrics).toContain('42');
  });
});
