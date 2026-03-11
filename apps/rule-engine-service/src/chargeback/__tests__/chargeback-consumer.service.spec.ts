import { ChargebackConsumerService } from '../chargeback-consumer.service';
import { RuleWeightAdjustmentService } from '../rule-weight-adjustment.service';
import { WeightAuditService } from '../weight-audit.service';
import { ChargebackEvent, WeightAdjustment } from '../chargeback.types';
import { EachMessagePayload } from 'kafkajs';

// Mock kafkajs
const mockConnect = jest.fn().mockResolvedValue(undefined);
const mockSubscribe = jest.fn().mockResolvedValue(undefined);
const mockRun = jest.fn().mockResolvedValue(undefined);
const mockConsumer = {
  connect: mockConnect,
  subscribe: mockSubscribe,
  run: mockRun,
};
const mockKafka = {
  consumer: jest.fn().mockReturnValue(mockConsumer),
};

jest.mock('kafkajs', () => ({
  Kafka: jest.fn().mockImplementation(() => mockKafka),
}));

describe('ChargebackConsumerService', () => {
  let service: ChargebackConsumerService;
  let mockWeightAdjustmentService: jest.Mocked<RuleWeightAdjustmentService>;
  let mockWeightAuditService: jest.Mocked<WeightAuditService>;

  const makeAdjustment = (ruleId: string, oldWeight: number, newWeight: number, outcome: 'fraud_confirmed' | 'false_positive', caseId: string): WeightAdjustment => ({
    ruleId,
    oldWeight,
    newWeight,
    reason: outcome,
    caseId,
    timestamp: new Date(),
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockWeightAdjustmentService = {
      adjustWeightsForChargeback: jest.fn(),
      adjustWeight: jest.fn(),
      getWeight: jest.fn(),
      onModuleInit: jest.fn(),
      onModuleDestroy: jest.fn(),
    } as unknown as jest.Mocked<RuleWeightAdjustmentService>;

    mockWeightAuditService = {
      logAdjustment: jest.fn().mockResolvedValue(undefined),
      getAuditLog: jest.fn(),
    } as unknown as jest.Mocked<WeightAuditService>;

    service = new ChargebackConsumerService(mockWeightAdjustmentService, mockWeightAuditService);
  });

  const makeMessagePayload = (event: ChargebackEvent): EachMessagePayload => ({
    topic: 'chargebacks',
    partition: 0,
    message: {
      key: Buffer.from(event.caseId),
      value: Buffer.from(JSON.stringify(event)),
      timestamp: String(Date.now()),
      attributes: 0,
      offset: '0',
      headers: {},
    },
    heartbeat: jest.fn(),
    pause: jest.fn(),
  });

  describe('onModuleInit', () => {
    it('should connect consumer, subscribe to chargebacks topic, and run', async () => {
      await service.onModuleInit();
      // onModuleInit fires connectConsumer() without awaiting; flush the microtask queue
      await new Promise(process.nextTick);

      expect(mockConnect).toHaveBeenCalledTimes(1);
      expect(mockSubscribe).toHaveBeenCalledWith({ topic: 'chargebacks', fromBeginning: false });
      expect(mockRun).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleMessage - fraud_confirmed', () => {
    it('should adjust weights for all fired rules on fraud_confirmed', async () => {
      const event: ChargebackEvent = {
        caseId: 'case_fraud_1',
        merchantId: 'merchant_1',
        decisionId: 'decision_block_1',
        firedRuleIds: ['rule_a', 'rule_b'],
        outcome: 'fraud_confirmed',
        amount: 300.0,
        currency: 'USD',
        timestamp: new Date().toISOString(),
      };

      const adjustments = [
        makeAdjustment('rule_a', 0.80, 0.85, 'fraud_confirmed', 'case_fraud_1'),
        makeAdjustment('rule_b', 0.70, 0.75, 'fraud_confirmed', 'case_fraud_1'),
      ];

      mockWeightAdjustmentService.adjustWeightsForChargeback.mockResolvedValue(adjustments);

      await service.handleMessage(makeMessagePayload(event));

      expect(mockWeightAdjustmentService.adjustWeightsForChargeback).toHaveBeenCalledWith(event);
      expect(mockWeightAuditService.logAdjustment).toHaveBeenCalledTimes(2);
    });

    it('should call logAdjustment for each adjusted rule', async () => {
      const event: ChargebackEvent = {
        caseId: 'case_audit_1',
        merchantId: 'merchant_2',
        decisionId: 'decision_2',
        firedRuleIds: ['rule_x', 'rule_y', 'rule_z'],
        outcome: 'fraud_confirmed',
        amount: 500.0,
        currency: 'EUR',
        timestamp: new Date().toISOString(),
      };

      const adjustments = [
        makeAdjustment('rule_x', 0.90, 0.95, 'fraud_confirmed', 'case_audit_1'),
        makeAdjustment('rule_y', 0.60, 0.65, 'fraud_confirmed', 'case_audit_1'),
        makeAdjustment('rule_z', 0.55, 0.60, 'fraud_confirmed', 'case_audit_1'),
      ];

      mockWeightAdjustmentService.adjustWeightsForChargeback.mockResolvedValue(adjustments);

      await service.handleMessage(makeMessagePayload(event));

      expect(mockWeightAuditService.logAdjustment).toHaveBeenCalledTimes(3);
      expect(mockWeightAuditService.logAdjustment).toHaveBeenCalledWith(adjustments[0]);
      expect(mockWeightAuditService.logAdjustment).toHaveBeenCalledWith(adjustments[1]);
      expect(mockWeightAuditService.logAdjustment).toHaveBeenCalledWith(adjustments[2]);
    });
  });

  describe('handleMessage - false_positive', () => {
    it('should decrease weights for all fired rules on false_positive', async () => {
      const event: ChargebackEvent = {
        caseId: 'case_fp_1',
        merchantId: 'merchant_3',
        decisionId: 'decision_review_1',
        firedRuleIds: ['rule_fp_1'],
        outcome: 'false_positive',
        amount: 75.0,
        currency: 'GBP',
        timestamp: new Date().toISOString(),
      };

      const adjustments = [
        makeAdjustment('rule_fp_1', 0.80, 0.77, 'false_positive', 'case_fp_1'),
      ];

      mockWeightAdjustmentService.adjustWeightsForChargeback.mockResolvedValue(adjustments);

      await service.handleMessage(makeMessagePayload(event));

      expect(mockWeightAdjustmentService.adjustWeightsForChargeback).toHaveBeenCalledWith(event);
      expect(mockWeightAuditService.logAdjustment).toHaveBeenCalledWith(adjustments[0]);
    });
  });

  describe('error handling', () => {
    it('should log error and not throw when weight adjustment fails', async () => {
      const event: ChargebackEvent = {
        caseId: 'case_err_1',
        merchantId: 'merchant_4',
        decisionId: 'decision_err_1',
        firedRuleIds: ['rule_err'],
        outcome: 'fraud_confirmed',
        amount: 100.0,
        currency: 'USD',
        timestamp: new Date().toISOString(),
      };

      mockWeightAdjustmentService.adjustWeightsForChargeback.mockRejectedValue(
        new Error('Redis connection failed'),
      );

      // Should not throw
      await expect(service.handleMessage(makeMessagePayload(event))).resolves.toBeUndefined();
    });

    it('should continue processing even if one audit log fails', async () => {
      const event: ChargebackEvent = {
        caseId: 'case_audit_err',
        merchantId: 'merchant_5',
        decisionId: 'decision_5',
        firedRuleIds: ['rule_1', 'rule_2'],
        outcome: 'fraud_confirmed',
        amount: 200.0,
        currency: 'USD',
        timestamp: new Date().toISOString(),
      };

      const adjustments = [
        makeAdjustment('rule_1', 0.80, 0.85, 'fraud_confirmed', 'case_audit_err'),
        makeAdjustment('rule_2', 0.70, 0.75, 'fraud_confirmed', 'case_audit_err'),
      ];

      mockWeightAdjustmentService.adjustWeightsForChargeback.mockResolvedValue(adjustments);
      // First call fails, second succeeds
      mockWeightAuditService.logAdjustment
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce(undefined);

      // Should not throw, and second logAdjustment should still be called
      await expect(service.handleMessage(makeMessagePayload(event))).resolves.toBeUndefined();
      expect(mockWeightAuditService.logAdjustment).toHaveBeenCalledTimes(2);
    });

    it('should handle empty message value gracefully', async () => {
      const payload: EachMessagePayload = {
        topic: 'chargebacks',
        partition: 0,
        message: {
          key: null,
          value: null,
          timestamp: String(Date.now()),
          attributes: 0,
          offset: '0',
          headers: {},
        },
        heartbeat: jest.fn(),
        pause: jest.fn(),
      };

      await expect(service.handleMessage(payload)).resolves.toBeUndefined();
      expect(mockWeightAdjustmentService.adjustWeightsForChargeback).not.toHaveBeenCalled();
    });
  });
});
