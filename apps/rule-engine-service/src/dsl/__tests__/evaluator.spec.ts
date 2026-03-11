import { RuleEvaluator, SignalContext } from '../evaluator';
import { parse } from '../parser';
import { RuleNode } from '../ast';

describe('RuleEvaluator', () => {
  let evaluator: RuleEvaluator;

  beforeEach(() => {
    evaluator = new RuleEvaluator();
  });

  function makeRule(dsl: string): RuleNode {
    return parse(dsl);
  }

  describe('evaluate() — basic comparisons', () => {
    it('should match emulator == true → BLOCK', () => {
      const rule = makeRule('RULE emulator_block WHEN device.isEmulator == true THEN BLOCK WEIGHT 1.0');
      const ctx: SignalContext = { device: { isEmulator: true } };
      const result = evaluator.evaluate(rule, ctx);
      expect(result.matched).toBe(true);
      expect(result.action).toBe('BLOCK');
      expect(result.skipped).toBe(false);
    });

    it('should not match emulator == true when isEmulator is false', () => {
      const rule = makeRule('RULE emulator_block WHEN device.isEmulator == true THEN BLOCK WEIGHT 1.0');
      const ctx: SignalContext = { device: { isEmulator: false } };
      const result = evaluator.evaluate(rule, ctx);
      expect(result.matched).toBe(false);
      expect(result.skipped).toBe(false);
    });

    it('should match trustScore < 30 → REVIEW', () => {
      const rule = makeRule('RULE low_trust WHEN device.trustScore < 30 THEN REVIEW WEIGHT 0.8');
      const ctx: SignalContext = { device: { trustScore: 15 } };
      const result = evaluator.evaluate(rule, ctx);
      expect(result.matched).toBe(true);
      expect(result.action).toBe('REVIEW');
    });

    it('should not match trustScore < 30 when score is 45', () => {
      const rule = makeRule('RULE low_trust WHEN device.trustScore < 30 THEN REVIEW WEIGHT 0.8');
      const ctx: SignalContext = { device: { trustScore: 45 } };
      expect(evaluator.evaluate(rule, ctx).matched).toBe(false);
    });

    it('should match >= operator', () => {
      const rule = makeRule('RULE r1 WHEN device.trustScore >= 50 THEN ALLOW');
      expect(evaluator.evaluate(rule, { device: { trustScore: 50 } }).matched).toBe(true);
      expect(evaluator.evaluate(rule, { device: { trustScore: 51 } }).matched).toBe(true);
      expect(evaluator.evaluate(rule, { device: { trustScore: 49 } }).matched).toBe(false);
    });

    it('should match <= operator', () => {
      const rule = makeRule('RULE r1 WHEN device.trustScore <= 50 THEN ALLOW');
      expect(evaluator.evaluate(rule, { device: { trustScore: 50 } }).matched).toBe(true);
      expect(evaluator.evaluate(rule, { device: { trustScore: 51 } }).matched).toBe(false);
    });

    it('should match != operator', () => {
      const rule = makeRule('RULE r1 WHEN device.platform != "ios" THEN REVIEW');
      expect(evaluator.evaluate(rule, { device: { platform: 'android' } }).matched).toBe(true);
      expect(evaluator.evaluate(rule, { device: { platform: 'ios' } }).matched).toBe(false);
    });

    it('should match == for string value', () => {
      const rule = makeRule('RULE r1 WHEN device.platform == "android" THEN REVIEW');
      expect(evaluator.evaluate(rule, { device: { platform: 'android' } }).matched).toBe(true);
      expect(evaluator.evaluate(rule, { device: { platform: 'ios' } }).matched).toBe(false);
    });

    it('should return correct ruleId and weight', () => {
      const rule = makeRule('RULE my_rule WHEN device.isEmulator == true THEN BLOCK WEIGHT 0.7');
      const result = evaluator.evaluate(rule, { device: { isEmulator: true } });
      expect(result.ruleId).toBe('my_rule');
      expect(result.weight).toBe(0.7);
    });
  });

  describe('evaluate() — AND condition', () => {
    it('should match only when both conditions are true', () => {
      const rule = makeRule(
        'RULE r1 WHEN device.isEmulator == true AND device.trustScore < 20 THEN BLOCK',
      );
      // Both true → match
      expect(evaluator.evaluate(rule, { device: { isEmulator: true, trustScore: 10 } }).matched).toBe(true);
      // Only first true → no match
      expect(evaluator.evaluate(rule, { device: { isEmulator: true, trustScore: 50 } }).matched).toBe(false);
      // Only second true → no match
      expect(evaluator.evaluate(rule, { device: { isEmulator: false, trustScore: 10 } }).matched).toBe(false);
      // Neither → no match
      expect(evaluator.evaluate(rule, { device: { isEmulator: false, trustScore: 50 } }).matched).toBe(false);
    });
  });

  describe('evaluate() — OR condition', () => {
    it('should match when either condition is true', () => {
      const rule = makeRule(
        'RULE r1 WHEN device.isEmulator == true OR network.isTor == true THEN BLOCK',
      );
      expect(evaluator.evaluate(rule, { device: { isEmulator: true } }).matched).toBe(true);
      expect(evaluator.evaluate(rule, { network: { isTor: true } as any }).matched).toBe(true);
      expect(
        evaluator.evaluate(rule, {
          device: { isEmulator: false },
          network: { isTor: false } as any,
        }).matched,
      ).toBe(false);
    });
  });

  describe('evaluate() — NOT condition', () => {
    it('should invert a condition', () => {
      const rule = makeRule(
        'RULE r1 WHEN NOT device.isEmulator == true THEN ALLOW',
      );
      expect(evaluator.evaluate(rule, { device: { isEmulator: false } }).matched).toBe(true);
      expect(evaluator.evaluate(rule, { device: { isEmulator: true } }).matched).toBe(false);
    });
  });

  describe('evaluate() — IN / NOT_IN', () => {
    it('should match IN list check', () => {
      const rule = makeRule('RULE r1 WHEN device.platform IN ["android", "ios"] THEN REVIEW');
      expect(evaluator.evaluate(rule, { device: { platform: 'android' } }).matched).toBe(true);
      expect(evaluator.evaluate(rule, { device: { platform: 'ios' } }).matched).toBe(true);
      expect(evaluator.evaluate(rule, { device: { platform: 'web' } }).matched).toBe(false);
    });

    it('should match NOT_IN list check', () => {
      const rule = makeRule('RULE r1 WHEN device.platform NOT_IN ["web"] THEN REVIEW');
      expect(evaluator.evaluate(rule, { device: { platform: 'android' } }).matched).toBe(true);
      expect(evaluator.evaluate(rule, { device: { platform: 'web' } }).matched).toBe(false);
    });
  });

  describe('evaluate() — SKIP missing policy', () => {
    it('should skip rule when field is absent (SKIP policy)', () => {
      const rule = makeRule(
        'RULE low_trust WHEN device.trustScore < 30 THEN REVIEW WEIGHT 0.8 MISSING SKIP',
      );
      // Empty context — device not present
      const result = evaluator.evaluate(rule, {});
      expect(result.matched).toBe(false);
      expect(result.skipped).toBe(true);
    });

    it('should skip when signal group is absent', () => {
      const rule = makeRule('RULE tor_exit WHEN network.isTor == true THEN BLOCK MISSING SKIP');
      const result = evaluator.evaluate(rule, { device: { trustScore: 50 } });
      expect(result.skipped).toBe(true);
    });

    it('should skip when specific field is undefined', () => {
      const rule = makeRule('RULE r1 WHEN device.trustScore < 30 THEN REVIEW MISSING SKIP');
      // device is present but trustScore is not
      const result = evaluator.evaluate(rule, { device: {} });
      expect(result.skipped).toBe(true);
    });
  });

  describe('evaluate() — DEFAULT_HIGH missing policy', () => {
    it('should treat missing numeric field as 999999 → matches > 0', () => {
      const rule = makeRule(
        'RULE r1 WHEN device.trustScore > 0 THEN BLOCK MISSING DEFAULT_HIGH',
      );
      const result = evaluator.evaluate(rule, {});
      expect(result.matched).toBe(true);
      expect(result.skipped).toBe(false);
    });

    it('should treat missing boolean field as true → matches == true', () => {
      const rule = makeRule(
        'RULE r1 WHEN device.isEmulator == true THEN BLOCK MISSING DEFAULT_HIGH',
      );
      const result = evaluator.evaluate(rule, {});
      expect(result.matched).toBe(true);
    });
  });

  describe('evaluate() — DEFAULT_LOW missing policy', () => {
    it('should treat missing numeric field as 0 → fails > 50', () => {
      const rule = makeRule(
        'RULE r1 WHEN device.trustScore > 50 THEN REVIEW MISSING DEFAULT_LOW',
      );
      const result = evaluator.evaluate(rule, {});
      expect(result.matched).toBe(false);
      expect(result.skipped).toBe(false);
    });

    it('should treat missing boolean field as false → fails == true', () => {
      const rule = makeRule(
        'RULE r1 WHEN device.isEmulator == true THEN BLOCK MISSING DEFAULT_LOW',
      );
      const result = evaluator.evaluate(rule, {});
      expect(result.matched).toBe(false);
    });

    it('should treat missing numeric as 0 → matches < 30', () => {
      const rule = makeRule(
        'RULE r1 WHEN device.trustScore < 30 THEN REVIEW MISSING DEFAULT_LOW',
      );
      const result = evaluator.evaluate(rule, {});
      expect(result.matched).toBe(true);
    });
  });

  describe('evaluate() — stateful context rules (Sprint 4)', () => {
    it('should match stateful.customer.previousBlockCount30d > 0', () => {
      const rule = makeRule(
        'RULE stateful_repeat WHEN stateful.customer.previousBlockCount30d > 0 THEN BLOCK WEIGHT 0.9 MISSING SKIP',
      );
      const ctx: SignalContext = {
        stateful: { customer: { previousBlockCount30d: 3 } },
      };
      const result = evaluator.evaluate(rule, ctx);
      expect(result.matched).toBe(true);
      expect(result.action).toBe('BLOCK');
    });

    it('should not match stateful.customer.previousBlockCount30d > 0 when count is 0', () => {
      const rule = makeRule(
        'RULE stateful_repeat WHEN stateful.customer.previousBlockCount30d > 0 THEN BLOCK WEIGHT 0.9 MISSING SKIP',
      );
      const ctx: SignalContext = {
        stateful: { customer: { previousBlockCount30d: 0 } },
      };
      expect(evaluator.evaluate(rule, ctx).matched).toBe(false);
    });

    it('should match compound stateful rule with AND', () => {
      const rule = makeRule(
        'RULE stateful_repeat_blocker WHEN stateful.customer.previousBlockCount30d > 0 AND stateful.customer.txCount1h > 3 THEN BLOCK WEIGHT 0.9 MISSING SKIP',
      );
      const ctx: SignalContext = {
        stateful: { customer: { previousBlockCount30d: 2, txCount1h: 5 } },
      };
      expect(evaluator.evaluate(rule, ctx).matched).toBe(true);
    });

    it('should not match compound stateful rule when one condition fails', () => {
      const rule = makeRule(
        'RULE stateful_repeat_blocker WHEN stateful.customer.previousBlockCount30d > 0 AND stateful.customer.txCount1h > 3 THEN BLOCK WEIGHT 0.9 MISSING SKIP',
      );
      const ctx: SignalContext = {
        stateful: { customer: { previousBlockCount30d: 2, txCount1h: 1 } },
      };
      expect(evaluator.evaluate(rule, ctx).matched).toBe(false);
    });

    it('should match stateful.customer.txCount10m > 5 for high 10m velocity', () => {
      const rule = makeRule(
        'RULE stateful_high_10m WHEN stateful.customer.txCount10m > 5 THEN REVIEW WEIGHT 0.7 MISSING SKIP',
      );
      const ctx: SignalContext = {
        stateful: { customer: { txCount10m: 8 } },
      };
      expect(evaluator.evaluate(rule, ctx).matched).toBe(true);
      expect(evaluator.evaluate(rule, ctx).action).toBe('REVIEW');
    });

    it('should match stateful.device.uniqueIps24h for device-level rule', () => {
      const rule = makeRule(
        'RULE stateful_device_spread WHEN stateful.device.uniqueIps24h > 10 THEN REVIEW WEIGHT 0.6 MISSING SKIP',
      );
      const ctx: SignalContext = {
        stateful: { device: { uniqueIps24h: 15 } },
      };
      expect(evaluator.evaluate(rule, ctx).matched).toBe(true);
    });

    it('should match stateful.ip.txCount1h for IP-level rule', () => {
      const rule = makeRule(
        'RULE stateful_ip_burst WHEN stateful.ip.txCount1h > 50 THEN BLOCK WEIGHT 0.8 MISSING SKIP',
      );
      const ctx: SignalContext = {
        stateful: { ip: { txCount1h: 75 } },
      };
      expect(evaluator.evaluate(rule, ctx).matched).toBe(true);
      expect(evaluator.evaluate(rule, ctx).action).toBe('BLOCK');
    });

    it('should skip stateful rule when stateful context is absent', () => {
      const rule = makeRule(
        'RULE stateful_repeat WHEN stateful.customer.previousBlockCount30d > 0 THEN BLOCK WEIGHT 0.9 MISSING SKIP',
      );
      const result = evaluator.evaluate(rule, {});
      expect(result.matched).toBe(false);
      expect(result.skipped).toBe(true);
    });

    it('should skip stateful rule when entity type is absent', () => {
      const rule = makeRule(
        'RULE stateful_device WHEN stateful.device.txCount1h > 10 THEN REVIEW MISSING SKIP',
      );
      const ctx: SignalContext = {
        stateful: { customer: { txCount1h: 100 } },
        // device not present in stateful
      };
      const result = evaluator.evaluate(rule, ctx);
      expect(result.skipped).toBe(true);
    });
  });

  describe('evaluate() — graph context rules (Sprint 8)', () => {
    it('should match stateful.graph.fraudRingDetected == true', () => {
      const rule = makeRule(
        'RULE graph_ring WHEN stateful.graph.fraudRingDetected == true THEN BLOCK WEIGHT 1.0 MISSING SKIP',
      );
      const ctx: SignalContext = {
        stateful: { graph: { fraudRingDetected: true } },
      };
      expect(evaluator.evaluate(rule, ctx).matched).toBe(true);
      expect(evaluator.evaluate(rule, ctx).action).toBe('BLOCK');
    });

    it('should not match graph ring when not detected', () => {
      const rule = makeRule(
        'RULE graph_ring WHEN stateful.graph.fraudRingDetected == true THEN BLOCK WEIGHT 1.0 MISSING SKIP',
      );
      const ctx: SignalContext = {
        stateful: { graph: { fraudRingDetected: false } },
      };
      expect(evaluator.evaluate(rule, ctx).matched).toBe(false);
    });

    it('should match stateful.graph.sharedDeviceCount > 5', () => {
      const rule = makeRule(
        'RULE graph_device WHEN stateful.graph.sharedDeviceCount > 5 THEN REVIEW WEIGHT 0.7 MISSING SKIP',
      );
      const ctx: SignalContext = {
        stateful: { graph: { sharedDeviceCount: 8 } },
      };
      expect(evaluator.evaluate(rule, ctx).matched).toBe(true);
    });

    it('should skip graph rule when graph context absent', () => {
      const rule = makeRule(
        'RULE graph_ring WHEN stateful.graph.fraudRingDetected == true THEN BLOCK MISSING SKIP',
      );
      const result = evaluator.evaluate(rule, { stateful: {} });
      expect(result.skipped).toBe(true);
    });
  });

  describe('evaluateAll()', () => {
    it('should evaluate multiple rules and return all results', () => {
      const rules = [
        makeRule('RULE r1 WHEN device.isEmulator == true THEN BLOCK WEIGHT 1.0'),
        makeRule('RULE r2 WHEN device.trustScore < 30 THEN REVIEW WEIGHT 0.8'),
      ];
      const ctx: SignalContext = { device: { isEmulator: true, trustScore: 10 } };
      const results = evaluator.evaluateAll(rules, ctx);
      expect(results).toHaveLength(2);
      expect(results[0].matched).toBe(true);
      expect(results[1].matched).toBe(true);
    });

    it('should return ruleId in results', () => {
      const rules = [makeRule('RULE my_rule WHEN device.isEmulator == true THEN BLOCK')];
      const results = evaluator.evaluateAll(rules, { device: { isEmulator: true } });
      expect(results[0].ruleId).toBe('my_rule');
    });

    it('should return empty array for empty rules list', () => {
      expect(evaluator.evaluateAll([], {})).toEqual([]);
    });
  });
});
