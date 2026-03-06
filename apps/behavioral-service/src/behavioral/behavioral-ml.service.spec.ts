import { BehavioralMlService } from './behavioral-ml.service';

describe('BehavioralMlService', () => {
  let service: BehavioralMlService;

  beforeEach(() => {
    service = new BehavioralMlService();
  });

  const merchantId = 'merchant-test-1';
  const normalKeystrokeIntervals = [150, 160, 155, 145, 158, 162];
  const normalSwipeVelocities = [2.0, 2.1, 1.9, 2.05, 2.15];

  function seedBaseline(count: number): void {
    for (let i = 0; i < count; i++) {
      service.updateBaseline(merchantId, {
        keystrokeIntervals: normalKeystrokeIntervals,
        swipeVelocities: normalSwipeVelocities,
      });
    }
  }

  // 1. Cold start: usedMlScoring false when sampleCount < 10
  it('analyze returns usedMlScoring: false when sampleCount < 10 (cold start)', () => {
    seedBaseline(5);
    const result = service.analyze({
      merchantId,
      keystrokeIntervals: normalKeystrokeIntervals,
      swipeVelocities: normalSwipeVelocities,
    });
    expect(result.usedMlScoring).toBe(false);
    expect(result.baselineSampleCount).toBe(5);
  });

  // 2. usedMlScoring true after 10+ baseline updates
  it('analyze returns usedMlScoring: true after 10+ baseline updates', () => {
    seedBaseline(10);
    const result = service.analyze({
      merchantId,
      keystrokeIntervals: normalKeystrokeIntervals,
      swipeVelocities: normalSwipeVelocities,
    });
    expect(result.usedMlScoring).toBe(true);
    expect(result.baselineSampleCount).toBeGreaterThanOrEqual(10);
  });

  // 3. riskScore near 0 for inputs matching baseline exactly (z-score = 0)
  it('analyze returns riskScore: 0 for inputs matching baseline exactly', () => {
    seedBaseline(10);
    // After seeding with uniform values, the baseline mean should equal the input mean
    // Use identical intervals to get z-score ≈ 0
    const baseline = service.getBaseline(merchantId)!;
    const result = service.analyze({
      merchantId,
      keystrokeIntervals: [baseline.meanKeystrokeInterval],
      swipeVelocities: [baseline.meanSwipeVelocity],
    });
    expect(result.riskScore).toBe(0);
    expect(result.anomalyScore).toBe(0);
  });

  // 4. High riskScore for very deviant inputs (z-score >> 3)
  it('analyze returns high riskScore for very deviant inputs', () => {
    seedBaseline(10);
    const result = service.analyze({
      merchantId,
      keystrokeIntervals: [1000, 1100, 1200], // far from ~155ms baseline
      swipeVelocities: [50, 60, 70],           // far from ~2.0 px/ms baseline
    });
    expect(result.riskScore).toBeGreaterThan(50);
    expect(result.anomalyScore).toBeGreaterThan(3);
  });

  // 5. anomalyScore is the z-score magnitude
  it('analyze returns anomalyScore as z-score magnitude', () => {
    seedBaseline(10);
    const result = service.analyze({
      merchantId,
      keystrokeIntervals: [500, 600],
      swipeVelocities: normalSwipeVelocities,
    });
    expect(result.anomalyScore).toBeGreaterThan(0);
    expect(result.usedMlScoring).toBe(true);
  });

  // 6. riskScore capped at 100
  it('riskScore is capped at 100 for extreme anomalies', () => {
    seedBaseline(10);
    const result = service.analyze({
      merchantId,
      keystrokeIntervals: [10000, 20000, 30000], // extreme outlier
      swipeVelocities: [500, 600, 700],           // extreme outlier
    });
    expect(result.riskScore).toBeLessThanOrEqual(100);
  });

  // 7. updateBaseline creates new entry on first call
  it('updateBaseline creates new entry on first call', () => {
    expect(service.getBaseline('new-merchant')).toBeUndefined();
    service.updateBaseline('new-merchant', {
      keystrokeIntervals: [100, 110, 120],
      swipeVelocities: [1.5, 1.6],
    });
    const baseline = service.getBaseline('new-merchant');
    expect(baseline).toBeDefined();
    expect(baseline!.sampleCount).toBe(1);
  });

  // 8. updateBaseline applies EMA (new mean ≈ old with small alpha)
  it('updateBaseline applies EMA so mean stays close to previous', () => {
    service.updateBaseline(merchantId, {
      keystrokeIntervals: [200, 200, 200],
      swipeVelocities: [3.0, 3.0, 3.0],
    });
    const before = service.getBaseline(merchantId)!;
    const originalMean = before.meanKeystrokeInterval;

    // Apply a very different value — EMA should dampen the change
    service.updateBaseline(merchantId, {
      keystrokeIntervals: [1000, 1000, 1000],
      swipeVelocities: [10.0, 10.0, 10.0],
    });
    const after = service.getBaseline(merchantId)!;

    // With EMA_ALPHA=0.1, new mean = 0.1*1000 + 0.9*200 = 280
    expect(after.meanKeystrokeInterval).toBeCloseTo(0.1 * 1000 + 0.9 * originalMean, 5);
  });

  // 9. updateBaseline increments sampleCount
  it('updateBaseline increments sampleCount on each call', () => {
    service.updateBaseline(merchantId, { keystrokeIntervals: [100], swipeVelocities: [1.0] });
    service.updateBaseline(merchantId, { keystrokeIntervals: [110], swipeVelocities: [1.1] });
    service.updateBaseline(merchantId, { keystrokeIntervals: [120], swipeVelocities: [1.2] });
    const baseline = service.getBaseline(merchantId)!;
    expect(baseline.sampleCount).toBe(3);
  });

  // 10. getBaseline returns undefined for unknown merchant
  it('getBaseline returns undefined for unknown merchant', () => {
    expect(service.getBaseline('unknown-merchant-xyz')).toBeUndefined();
  });

  // 11. heuristicScore returns 70 for avg keystroke < 50ms (with > 3 intervals)
  it('heuristic returns 70 for avg keystroke < 50ms with more than 3 intervals', () => {
    const result = service.analyze({
      merchantId: 'cold-start-merchant',
      keystrokeIntervals: [20, 30, 25, 35, 40], // avg = 30ms, length > 3
      swipeVelocities: [1.0],
    });
    expect(result.usedMlScoring).toBe(false);
    expect(result.riskScore).toBe(70);
  });

  // 12. zScore returns 0 when std is 0 (avoids divide-by-zero)
  it('does not produce NaN or Infinity when all input values are identical (std=0 scenario)', () => {
    // Seed with single-value arrays to force stddev = 1 (guarded)
    // Then verify no NaN/Infinity in the result
    seedBaseline(10);
    const baseline = service.getBaseline(merchantId)!;

    // Force a case where the analyzed stddev would be 0 by sending single values
    const result = service.analyze({
      merchantId,
      keystrokeIntervals: [baseline.meanKeystrokeInterval],
      swipeVelocities: [baseline.meanSwipeVelocity],
    });

    expect(isNaN(result.anomalyScore)).toBe(false);
    expect(isFinite(result.anomalyScore)).toBe(true);
    expect(isNaN(result.riskScore)).toBe(false);
  });
});
