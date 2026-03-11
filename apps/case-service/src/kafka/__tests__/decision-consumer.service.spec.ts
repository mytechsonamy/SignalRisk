import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DecisionConsumerService } from '../decision-consumer.service';
import { CaseService } from '../../cases/case.service';

// ---------------------------------------------------------------------------
// Mock KafkaJS entirely
// ---------------------------------------------------------------------------

const mockConsumerConnect = jest.fn().mockResolvedValue(undefined);
const mockConsumerDisconnect = jest.fn().mockResolvedValue(undefined);
const mockConsumerSubscribe = jest.fn().mockResolvedValue(undefined);
const mockConsumerRun = jest.fn().mockResolvedValue(undefined);

const mockProducerConnect = jest.fn().mockResolvedValue(undefined);
const mockProducerDisconnect = jest.fn().mockResolvedValue(undefined);
const mockProducerSend = jest.fn().mockResolvedValue(undefined);

const mockConsumer = {
  connect: mockConsumerConnect,
  disconnect: mockConsumerDisconnect,
  subscribe: mockConsumerSubscribe,
  run: mockConsumerRun,
};

const mockProducer = {
  connect: mockProducerConnect,
  disconnect: mockProducerDisconnect,
  send: mockProducerSend,
};

const mockKafka = {
  consumer: jest.fn().mockReturnValue(mockConsumer),
  producer: jest.fn().mockReturnValue(mockProducer),
};

jest.mock('kafkajs', () => ({
  Kafka: jest.fn().mockImplementation(() => mockKafka),
  logLevel: { ERROR: 1 },
}));

// ---------------------------------------------------------------------------
// Mock CaseService
// ---------------------------------------------------------------------------

const mockCaseService = {
  createFromDecision: jest.fn(),
};

// Mock ConfigService
const mockConfigService = {
  get: jest.fn().mockReturnValue(null),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildDecision(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    requestId: 'req-001',
    merchantId: 'merchant-001',
    entityId: 'entity-001',
    action: 'REVIEW',
    riskScore: 60,
    riskFactors: [],
    ...overrides,
  };
}

async function triggerMessage(
  service: DecisionConsumerService,
  messageValue: string | null,
): Promise<void> {
  // Grab the eachMessage handler registered via consumer.run()
  const runCall = mockConsumerRun.mock.calls[0];
  const { eachMessage } = runCall[0] as {
    eachMessage: (payload: { message: { value: Buffer | null } }) => Promise<void>;
  };

  await eachMessage({
    message: {
      value: messageValue !== null ? Buffer.from(messageValue) : null,
    },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DecisionConsumerService', () => {
  let service: DecisionConsumerService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Reset run mock so each test gets a fresh handler
    mockConsumerRun.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DecisionConsumerService,
        { provide: CaseService, useValue: mockCaseService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<DecisionConsumerService>(DecisionConsumerService);

    // Connect the consumer (registers eachMessage handler)
    await service.onModuleInit();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  // -------------------------------------------------------------------------

  it('should call createFromDecision for REVIEW action', async () => {
    const decision = buildDecision({ action: 'REVIEW' });
    mockCaseService.createFromDecision.mockResolvedValue({ id: 'case-001' });

    await triggerMessage(service, JSON.stringify(decision));

    expect(mockCaseService.createFromDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req-001',
        action: 'REVIEW',
      }),
    );
  });

  it('should call createFromDecision for BLOCK action', async () => {
    const decision = buildDecision({ action: 'BLOCK', riskScore: 90 });
    mockCaseService.createFromDecision.mockResolvedValue({ id: 'case-002' });

    await triggerMessage(service, JSON.stringify(decision));

    expect(mockCaseService.createFromDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'BLOCK',
        riskScore: 90,
      }),
    );
  });

  it('should NOT call createFromDecision for ALLOW action', async () => {
    const decision = buildDecision({ action: 'ALLOW' });

    await triggerMessage(service, JSON.stringify(decision));

    expect(mockCaseService.createFromDecision).not.toHaveBeenCalled();
  });

  it('should route to DLQ on JSON parse error', async () => {
    await triggerMessage(service, 'this is not valid json {{{{');

    expect(mockCaseService.createFromDecision).not.toHaveBeenCalled();
    expect(mockProducerSend).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: 'signalrisk.decisions.dlq',
        messages: expect.arrayContaining([
          expect.objectContaining({
            value: expect.stringContaining('PARSE_ERROR'),
          }),
        ]),
      }),
    );
  });

  it('should route to DLQ when required fields are missing', async () => {
    const incomplete = { riskScore: 50 }; // missing requestId, merchantId, action, entityId

    await triggerMessage(service, JSON.stringify(incomplete));

    expect(mockCaseService.createFromDecision).not.toHaveBeenCalled();
    expect(mockProducerSend).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: 'signalrisk.decisions.dlq',
      }),
    );
  });

  it('should skip null message values', async () => {
    await triggerMessage(service, null);

    expect(mockCaseService.createFromDecision).not.toHaveBeenCalled();
    expect(mockProducerSend).not.toHaveBeenCalled();
  });
});
