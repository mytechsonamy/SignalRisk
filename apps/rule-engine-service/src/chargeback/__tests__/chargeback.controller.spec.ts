import { ChargebackController } from '../chargeback.controller';
import { ChargebackConsumerService } from '../chargeback-consumer.service';
import { CreateChargebackDto } from '../dto/create-chargeback.dto';
import { ChargebackEvent } from '../chargeback.types';

describe('ChargebackController', () => {
  let controller: ChargebackController;
  let mockChargebackConsumerService: jest.Mocked<Pick<ChargebackConsumerService, 'processEvent'>>;

  beforeEach(() => {
    mockChargebackConsumerService = {
      processEvent: jest.fn().mockResolvedValue(undefined),
    };

    controller = new ChargebackController(
      mockChargebackConsumerService as unknown as ChargebackConsumerService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns { processed: true } with HTTP 202', async () => {
    const dto: CreateChargebackDto = {
      caseId: 'case-001',
      merchantId: 'merchant-001',
      firedRuleIds: ['rule-a', 'rule-b'],
      outcome: 'fraud_confirmed',
      amount: 250.0,
    };

    const result = await controller.submitChargeback(dto);
    expect(result).toEqual({ processed: true });
  });

  it('calls processEvent with a correct ChargebackEvent for outcome=fraud_confirmed', async () => {
    const dto: CreateChargebackDto = {
      caseId: 'case-fraud-001',
      merchantId: 'merchant-fraud',
      decisionId: 'decision-001',
      firedRuleIds: ['rule-1', 'rule-2'],
      outcome: 'fraud_confirmed',
      amount: 500.0,
      currency: 'EUR',
    };

    await controller.submitChargeback(dto);

    expect(mockChargebackConsumerService.processEvent).toHaveBeenCalledTimes(1);

    const calledWith: ChargebackEvent =
      mockChargebackConsumerService.processEvent.mock.calls[0][0];
    expect(calledWith.caseId).toBe('case-fraud-001');
    expect(calledWith.merchantId).toBe('merchant-fraud');
    expect(calledWith.decisionId).toBe('decision-001');
    expect(calledWith.firedRuleIds).toEqual(['rule-1', 'rule-2']);
    expect(calledWith.outcome).toBe('fraud_confirmed');
    expect(calledWith.amount).toBe(500.0);
    expect(calledWith.currency).toBe('EUR');
    expect(typeof calledWith.timestamp).toBe('string');
  });

  it('calls processEvent with a correct ChargebackEvent for outcome=false_positive', async () => {
    const dto: CreateChargebackDto = {
      caseId: 'case-fp-001',
      merchantId: 'merchant-fp',
      firedRuleIds: ['rule-fp'],
      outcome: 'false_positive',
      amount: 100.0,
    };

    await controller.submitChargeback(dto);

    expect(mockChargebackConsumerService.processEvent).toHaveBeenCalledTimes(1);

    const calledWith: ChargebackEvent =
      mockChargebackConsumerService.processEvent.mock.calls[0][0];
    expect(calledWith.outcome).toBe('false_positive');
    expect(calledWith.caseId).toBe('case-fp-001');
  });

  it('defaults decisionId to empty string when not provided', async () => {
    const dto: CreateChargebackDto = {
      caseId: 'case-no-decision',
      merchantId: 'merchant-x',
      firedRuleIds: [],
      outcome: 'fraud_confirmed',
      amount: 0,
    };

    await controller.submitChargeback(dto);

    const calledWith: ChargebackEvent =
      mockChargebackConsumerService.processEvent.mock.calls[0][0];
    expect(calledWith.decisionId).toBe('');
  });

  it('defaults currency to USD when not provided', async () => {
    const dto: CreateChargebackDto = {
      caseId: 'case-no-currency',
      merchantId: 'merchant-y',
      firedRuleIds: [],
      outcome: 'fraud_confirmed',
      amount: 75,
    };

    await controller.submitChargeback(dto);

    const calledWith: ChargebackEvent =
      mockChargebackConsumerService.processEvent.mock.calls[0][0];
    expect(calledWith.currency).toBe('USD');
  });

  it('passes through firedRuleIds array correctly', async () => {
    const dto: CreateChargebackDto = {
      caseId: 'case-rules',
      merchantId: 'merchant-z',
      firedRuleIds: ['rule-alpha', 'rule-beta', 'rule-gamma'],
      outcome: 'fraud_confirmed',
      amount: 999,
    };

    await controller.submitChargeback(dto);

    const calledWith: ChargebackEvent =
      mockChargebackConsumerService.processEvent.mock.calls[0][0];
    expect(calledWith.firedRuleIds).toEqual(['rule-alpha', 'rule-beta', 'rule-gamma']);
  });
});
