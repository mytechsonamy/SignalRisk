import { RuleEvaluationService } from '../rule-evaluation.service';
import { RuleRegistryService } from '../../registry/rule-registry.service';
import { SignalContext } from '../../dsl/evaluator';

describe('RuleEvaluationService', () => {
  let service: RuleEvaluationService;
  let registry: RuleRegistryService;

  beforeEach(() => {
    registry = new RuleRegistryService();
    service = new RuleEvaluationService(registry);
  });

  const loadRules = (dsl: string) => registry.load(dsl);

  describe('finalAction priority: BLOCK > REVIEW > ALLOW', () => {
    it('should return BLOCK when any BLOCK rule matches', () => {
      loadRules(`
RULE r_block WHEN device.isEmulator == true THEN BLOCK WEIGHT 1.0
RULE r_review WHEN device.trustScore < 50 THEN REVIEW WEIGHT 0.8
      `);
      const ctx: SignalContext = { device: { isEmulator: true, trustScore: 20 } };
      const result = service.evaluate(ctx, 'merchant_1');
      expect(result.finalAction).toBe('BLOCK');
      expect(result.matchedRules).toHaveLength(2);
    });

    it('should return BLOCK even when REVIEW rules also match', () => {
      loadRules(`
RULE block_rule WHEN device.isEmulator == true THEN BLOCK WEIGHT 1.0
RULE review_rule_1 WHEN device.trustScore < 50 THEN REVIEW WEIGHT 0.5
RULE review_rule_2 WHEN network.isVpn == true THEN REVIEW WEIGHT 0.3
      `);
      const ctx: SignalContext = {
        device: { isEmulator: true, trustScore: 10 },
        network: { isVpn: true } as any,
      };
      const result = service.evaluate(ctx, 'merchant_1');
      expect(result.finalAction).toBe('BLOCK');
    });

    it('should return REVIEW when only REVIEW rules match (no BLOCK)', () => {
      loadRules(`
RULE r_review1 WHEN device.trustScore < 50 THEN REVIEW WEIGHT 0.8
RULE r_review2 WHEN network.isVpn == true THEN REVIEW WEIGHT 0.5
      `);
      const ctx: SignalContext = {
        device: { trustScore: 20 },
        network: { isVpn: true } as any,
      };
      const result = service.evaluate(ctx, 'merchant_1');
      expect(result.finalAction).toBe('REVIEW');
    });

    it('should return ALLOW when no rules match', () => {
      loadRules(`
RULE r1 WHEN device.isEmulator == true THEN BLOCK WEIGHT 1.0
RULE r2 WHEN device.trustScore < 20 THEN BLOCK WEIGHT 0.9
      `);
      const ctx: SignalContext = { device: { isEmulator: false, trustScore: 80 } };
      const result = service.evaluate(ctx, 'merchant_1');
      expect(result.finalAction).toBe('ALLOW');
      expect(result.matchedRules).toHaveLength(0);
    });

    it('should return ALLOW when registry is empty', () => {
      const result = service.evaluate({ device: { isEmulator: true } }, 'merchant_1');
      expect(result.finalAction).toBe('ALLOW');
      expect(result.matchedRules).toHaveLength(0);
      expect(result.totalWeight).toBe(0);
    });
  });

  describe('multiple REVIEW rules', () => {
    it('should return REVIEW when multiple REVIEW rules match', () => {
      loadRules(`
RULE r1 WHEN device.trustScore < 50 THEN REVIEW WEIGHT 0.8
RULE r2 WHEN device.trustScore < 80 THEN REVIEW WEIGHT 0.6
      `);
      const result = service.evaluate({ device: { trustScore: 30 } }, 'merchant_1');
      expect(result.finalAction).toBe('REVIEW');
      expect(result.matchedRules).toHaveLength(2);
    });
  });

  describe('skipped rules', () => {
    it('should not count skipped rules in matchedRules', () => {
      loadRules(`
RULE r1 WHEN device.isEmulator == true THEN BLOCK WEIGHT 1.0
RULE r2 WHEN network.isTor == true THEN BLOCK WEIGHT 1.0 MISSING SKIP
RULE r3 WHEN behavioral.isBot == true THEN REVIEW WEIGHT 0.9 MISSING SKIP
      `);
      // Only device context provided; network and behavioral are missing
      const ctx: SignalContext = { device: { isEmulator: true } };
      const result = service.evaluate(ctx, 'merchant_1');
      expect(result.matchedRules).toHaveLength(1);
      expect(result.skippedRules).toBe(2);
      expect(result.finalAction).toBe('BLOCK');
    });

    it('should count skipped rules correctly', () => {
      loadRules(`
RULE r1 WHEN network.isTor == true THEN BLOCK MISSING SKIP
RULE r2 WHEN behavioral.isBot == true THEN REVIEW MISSING SKIP
RULE r3 WHEN device.isEmulator == true THEN BLOCK
      `);
      const ctx: SignalContext = { device: { isEmulator: false } };
      const result = service.evaluate(ctx, 'merchant_1');
      expect(result.skippedRules).toBe(2);
      expect(result.matchedRules).toHaveLength(0);
    });
  });

  describe('weight calculation', () => {
    it('should sum weights of all matched rules', () => {
      loadRules(`
RULE r1 WHEN device.isEmulator == true THEN BLOCK WEIGHT 1.0
RULE r2 WHEN device.trustScore < 50 THEN REVIEW WEIGHT 0.8
RULE r3 WHEN device.trustScore < 80 THEN REVIEW WEIGHT 0.6
      `);
      const ctx: SignalContext = { device: { isEmulator: true, trustScore: 20 } };
      const result = service.evaluate(ctx, 'merchant_1');
      // All three rules match
      expect(result.totalWeight).toBeCloseTo(1.0 + 0.8 + 0.6, 5);
    });

    it('should return totalWeight 0 when no rules match', () => {
      loadRules('RULE r1 WHEN device.isEmulator == true THEN BLOCK WEIGHT 1.0');
      const result = service.evaluate({ device: { isEmulator: false } }, 'merchant_1');
      expect(result.totalWeight).toBe(0);
    });

    it('should not include skipped rules in totalWeight', () => {
      loadRules(`
RULE r1 WHEN device.isEmulator == true THEN BLOCK WEIGHT 1.0
RULE r2 WHEN network.isTor == true THEN BLOCK WEIGHT 0.5 MISSING SKIP
      `);
      const ctx: SignalContext = { device: { isEmulator: true } };
      const result = service.evaluate(ctx, 'merchant_1');
      expect(result.totalWeight).toBeCloseTo(1.0, 5);
    });
  });
});
