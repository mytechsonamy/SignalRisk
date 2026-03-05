import { RuleWeightAdjustmentService } from '../rule-weight-adjustment.service';
import { ChargebackEvent } from '../chargeback.types';

const mockGet = jest.fn();
const mockSet = jest.fn();
const mockQuit = jest.fn().mockResolvedValue('OK');
const mockOn = jest.fn();

jest.mock('ioredis', () => ({
  Redis: jest.fn().mockImplementation(() => ({
    get: mockGet,
    set: mockSet,
    quit: mockQuit,
    on: mockOn,
  })),
}));

describe('RuleWeightAdjustmentService', () => {
  let service: RuleWeightAdjustmentService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RuleWeightAdjustmentService();
    service.onModuleInit();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  describe('getWeight', () => {
    it('should return 1.0 when Redis returns null (key not set)', async () => {
      mockGet.mockResolvedValue(null);
      const weight = await service.getWeight('rule_001');
      expect(weight).toBe(1.0);
      expect(mockGet).toHaveBeenCalledWith('rule:weight:rule_001');
    });

    it('should parse and return the float from Redis', async () => {
      mockGet.mockResolvedValue('0.75');
      const weight = await service.getWeight('rule_002');
      expect(weight).toBe(0.75);
    });

    it('should return 1.0 when Redis value is not a valid number', async () => {
      mockGet.mockResolvedValue('not-a-number');
      const weight = await service.getWeight('rule_003');
      expect(weight).toBe(1.0);
    });

    it('should use the correct Redis key prefix', async () => {
      mockGet.mockResolvedValue('0.5');
      await service.getWeight('my_rule');
      expect(mockGet).toHaveBeenCalledWith('rule:weight:my_rule');
    });
  });

  describe('adjustWeight - fraud_confirmed', () => {
    it('should increase weight by 0.05 on fraud_confirmed', async () => {
      mockGet.mockResolvedValue('0.80');
      mockSet.mockResolvedValue('OK');

      const result = await service.adjustWeight('rule_001', 'fraud_confirmed');

      expect(result.oldWeight).toBe(0.80);
      expect(result.newWeight).toBeCloseTo(0.85, 5);
      expect(mockSet).toHaveBeenCalledWith('rule:weight:rule_001', expect.any(String));
    });

    it('should cap weight at 1.0 (no overflow beyond max)', async () => {
      mockGet.mockResolvedValue('0.97');
      mockSet.mockResolvedValue('OK');

      const result = await service.adjustWeight('rule_001', 'fraud_confirmed');

      expect(result.oldWeight).toBe(0.97);
      expect(result.newWeight).toBe(1.0);
    });

    it('should cap weight at 1.0 when already at 1.0', async () => {
      mockGet.mockResolvedValue('1.0');
      mockSet.mockResolvedValue('OK');

      const result = await service.adjustWeight('rule_001', 'fraud_confirmed');

      expect(result.newWeight).toBe(1.0);
    });
  });

  describe('adjustWeight - false_positive', () => {
    it('should decrease weight by 0.03 on false_positive', async () => {
      mockGet.mockResolvedValue('0.80');
      mockSet.mockResolvedValue('OK');

      const result = await service.adjustWeight('rule_001', 'false_positive');

      expect(result.oldWeight).toBe(0.80);
      expect(result.newWeight).toBeCloseTo(0.77, 5);
    });

    it('should floor weight at 0.1 (no underflow below min)', async () => {
      mockGet.mockResolvedValue('0.12');
      mockSet.mockResolvedValue('OK');

      const result = await service.adjustWeight('rule_001', 'false_positive');

      expect(result.oldWeight).toBe(0.12);
      expect(result.newWeight).toBe(0.1);
    });

    it('should floor weight at 0.1 when already at 0.1', async () => {
      mockGet.mockResolvedValue('0.1');
      mockSet.mockResolvedValue('OK');

      const result = await service.adjustWeight('rule_001', 'false_positive');

      expect(result.newWeight).toBe(0.1);
    });
  });

  describe('adjustWeightsForChargeback', () => {
    it('should return array of WeightAdjustment for each firedRuleId', async () => {
      mockGet.mockResolvedValue('0.80');
      mockSet.mockResolvedValue('OK');

      const event: ChargebackEvent = {
        caseId: 'case_abc',
        merchantId: 'merchant_1',
        decisionId: 'decision_xyz',
        firedRuleIds: ['rule_a', 'rule_b', 'rule_c'],
        outcome: 'fraud_confirmed',
        amount: 150.0,
        currency: 'USD',
        timestamp: new Date().toISOString(),
      };

      const adjustments = await service.adjustWeightsForChargeback(event);

      expect(adjustments).toHaveLength(3);
      expect(adjustments[0].ruleId).toBe('rule_a');
      expect(adjustments[1].ruleId).toBe('rule_b');
      expect(adjustments[2].ruleId).toBe('rule_c');
    });

    it('should set correct reason and caseId on each adjustment', async () => {
      mockGet.mockResolvedValue('0.80');
      mockSet.mockResolvedValue('OK');

      const event: ChargebackEvent = {
        caseId: 'case_123',
        merchantId: 'merchant_1',
        decisionId: 'decision_456',
        firedRuleIds: ['rule_x'],
        outcome: 'false_positive',
        amount: 50.0,
        currency: 'EUR',
        timestamp: new Date().toISOString(),
      };

      const adjustments = await service.adjustWeightsForChargeback(event);

      expect(adjustments).toHaveLength(1);
      expect(adjustments[0].reason).toBe('false_positive');
      expect(adjustments[0].caseId).toBe('case_123');
    });

    it('should return empty array when no firedRuleIds', async () => {
      const event: ChargebackEvent = {
        caseId: 'case_empty',
        merchantId: 'merchant_1',
        decisionId: 'decision_999',
        firedRuleIds: [],
        outcome: 'fraud_confirmed',
        amount: 0,
        currency: 'USD',
        timestamp: new Date().toISOString(),
      };

      const adjustments = await service.adjustWeightsForChargeback(event);
      expect(adjustments).toHaveLength(0);
    });

    it('should include timestamps on each adjustment', async () => {
      mockGet.mockResolvedValue('0.70');
      mockSet.mockResolvedValue('OK');

      const event: ChargebackEvent = {
        caseId: 'case_ts',
        merchantId: 'merchant_1',
        decisionId: 'decision_ts',
        firedRuleIds: ['rule_ts'],
        outcome: 'fraud_confirmed',
        amount: 200,
        currency: 'USD',
        timestamp: new Date().toISOString(),
      };

      const adjustments = await service.adjustWeightsForChargeback(event);
      expect(adjustments[0].timestamp).toBeInstanceOf(Date);
    });
  });
});
