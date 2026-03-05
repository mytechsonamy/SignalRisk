import { ThresholdRandomizer } from '../threshold-randomizer';

describe('ThresholdRandomizer', () => {
  let randomizer: ThresholdRandomizer;

  beforeEach(() => {
    randomizer = new ThresholdRandomizer();
  });

  it('should return a number', () => {
    const result = randomizer.jitter(100, 'merchant_1', 'rule_1');
    expect(typeof result).toBe('number');
  });

  it('should be deterministic — same inputs always produce the same output', () => {
    const r1 = randomizer.jitter(100, 'merchant_abc', 'emulator_block');
    const r2 = randomizer.jitter(100, 'merchant_abc', 'emulator_block');
    const r3 = randomizer.jitter(100, 'merchant_abc', 'emulator_block');
    expect(r1).toBe(r2);
    expect(r2).toBe(r3);
  });

  it('should produce different results for different merchantIds', () => {
    const r1 = randomizer.jitter(100, 'merchant_A', 'rule_x');
    const r2 = randomizer.jitter(100, 'merchant_B', 'rule_x');
    // Different merchants should (almost certainly) produce different jitters
    expect(r1).not.toBe(r2);
  });

  it('should produce different results for different ruleIds', () => {
    const r1 = randomizer.jitter(100, 'merchant_A', 'rule_1');
    const r2 = randomizer.jitter(100, 'merchant_A', 'rule_2');
    expect(r1).not.toBe(r2);
  });

  it('should keep jitter within ±11% of original value', () => {
    const threshold = 100;
    const testCases = [
      ['m1', 'r1'],
      ['m2', 'r2'],
      ['merchant_xyz', 'emulator_block'],
      ['merchant_abc', 'velocity_burst'],
      ['my_store', 'tor_exit'],
    ];

    for (const [merchantId, ruleId] of testCases) {
      const result = randomizer.jitter(threshold, merchantId, ruleId);
      const diff = Math.abs(result - threshold) / threshold;
      expect(diff).toBeLessThanOrEqual(0.11);
    }
  });

  it('should scale proportionally with threshold', () => {
    const low = randomizer.jitter(50, 'm1', 'r1');
    const high = randomizer.jitter(100, 'm1', 'r1');
    // The jitter factor should be the same, so high result should be ~2x low result
    expect(high / low).toBeCloseTo(2, 5);
  });

  it('should return close to original value when threshold is 0', () => {
    // 0 * anything = 0
    const result = randomizer.jitter(0, 'm1', 'r1');
    expect(result).toBe(0);
  });

  it('should work with negative threshold', () => {
    const result = randomizer.jitter(-50, 'm1', 'r1');
    expect(Math.abs(result - (-50)) / 50).toBeLessThanOrEqual(0.11);
  });
});
