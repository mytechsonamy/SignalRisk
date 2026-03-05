import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DecisionConsumerService } from '../decision-consumer.service';
import { WebhookConfigService } from '../../webhook/webhook-config.service';
import { WebhookDeliveryService } from '../../webhook/webhook-delivery.service';
import { WebhookConfig, WebhookPayload } from '../../webhook/webhook.types';

// ---------------------------------------------------------------------------
// Mock KafkaJS
// ---------------------------------------------------------------------------

const mockConsumerConnect = jest.fn().mockResolvedValue(undefined);
const mockConsumerDisconnect = jest.fn().mockResolvedValue(undefined);
const mockConsumerSubscribe = jest.fn().mockResolvedValue(undefined);
const mockConsumerRun = jest.fn().mockResolvedValue(undefined);

const mockConsumer = {
  connect: mockConsumerConnect,
  disconnect: mockConsumerDisconnect,
  subscribe: mockConsumerSubscribe,
  run: mockConsumerRun,
};

const mockKafka = {
  consumer: jest.fn().mockReturnValue(mockConsumer),
};

jest.mock('kafkajs', () => ({
  Kafka: jest.fn().mockImplementation(() => mockKafka),
  logLevel: { ERROR: 1 },
}));

// ---------------------------------------------------------------------------
// Mock services
// ---------------------------------------------------------------------------

const mockWebhookConfigService = {
  getWebhookConfig: jest.fn(),
};

const mockWebhookDeliveryService = {
  deliver: jest.fn(),
};

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
    outcome: 'BLOCK',
    riskScore: 85,
    timestamp: '2026-03-06T00:00:00.000Z',
    signals: {},
    ...overrides,
  };
}

function buildWebhookConfig(overrides: Partial<WebhookConfig> = {}): WebhookConfig {
  return {
    merchantId: 'merchant-001',
    url: 'https://example.com/webhook',
    secret: 'test-secret',
    ...overrides,
  };
}

async function triggerMessage(
  messageValue: string | null,
): Promise<void> {
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
    mockConsumerRun.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DecisionConsumerService,
        { provide: WebhookConfigService, useValue: mockWebhookConfigService },
        { provide: WebhookDeliveryService, useValue: mockWebhookDeliveryService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<DecisionConsumerService>(DecisionConsumerService);
    await service.onModuleInit();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  // -------------------------------------------------------------------------

  it('should call deliver for BLOCK decision with webhook config', async () => {
    const config = buildWebhookConfig();
    mockWebhookConfigService.getWebhookConfig.mockResolvedValue(config);
    mockWebhookDeliveryService.deliver.mockResolvedValue(undefined);

    const decision = buildDecision({ outcome: 'BLOCK' });
    await triggerMessage(JSON.stringify(decision));

    expect(mockWebhookDeliveryService.deliver).toHaveBeenCalledWith(
      config,
      expect.objectContaining({ event: 'decision.block', outcome: 'BLOCK' }),
    );
  });

  it('should call deliver for REVIEW decision with webhook config', async () => {
    const config = buildWebhookConfig();
    mockWebhookConfigService.getWebhookConfig.mockResolvedValue(config);
    mockWebhookDeliveryService.deliver.mockResolvedValue(undefined);

    const decision = buildDecision({ outcome: 'REVIEW' });
    await triggerMessage(JSON.stringify(decision));

    expect(mockWebhookDeliveryService.deliver).toHaveBeenCalledWith(
      config,
      expect.objectContaining({ event: 'decision.review', outcome: 'REVIEW' }),
    );
  });

  it('should NOT call deliver for ALLOW decision', async () => {
    mockWebhookConfigService.getWebhookConfig.mockResolvedValue(buildWebhookConfig());

    const decision = buildDecision({ outcome: 'ALLOW' });
    await triggerMessage(JSON.stringify(decision));

    expect(mockWebhookDeliveryService.deliver).not.toHaveBeenCalled();
  });

  it('should skip delivery when no webhook config found for merchant', async () => {
    mockWebhookConfigService.getWebhookConfig.mockResolvedValue(null);

    const decision = buildDecision({ outcome: 'BLOCK' });
    await triggerMessage(JSON.stringify(decision));

    expect(mockWebhookDeliveryService.deliver).not.toHaveBeenCalled();
  });

  it('should handle null message value gracefully', async () => {
    await triggerMessage(null);

    expect(mockWebhookConfigService.getWebhookConfig).not.toHaveBeenCalled();
    expect(mockWebhookDeliveryService.deliver).not.toHaveBeenCalled();
  });

  it('should not throw when delivery service throws an error', async () => {
    mockWebhookConfigService.getWebhookConfig.mockResolvedValue(buildWebhookConfig());
    mockWebhookDeliveryService.deliver.mockRejectedValue(new Error('Delivery failed'));

    const decision = buildDecision({ outcome: 'BLOCK' });
    // Should NOT throw
    await expect(triggerMessage(JSON.stringify(decision))).resolves.not.toThrow();
  });

  it('should not throw on invalid JSON in message', async () => {
    await expect(triggerMessage('invalid json {{{')).resolves.not.toThrow();
    expect(mockWebhookDeliveryService.deliver).not.toHaveBeenCalled();
  });

  it('should map BLOCK outcome to decision.block event type', async () => {
    const config = buildWebhookConfig();
    mockWebhookConfigService.getWebhookConfig.mockResolvedValue(config);
    mockWebhookDeliveryService.deliver.mockResolvedValue(undefined);

    const decision = buildDecision({ outcome: 'BLOCK', requestId: 'req-block-test' });
    await triggerMessage(JSON.stringify(decision));

    const deliveredPayload = mockWebhookDeliveryService.deliver.mock.calls[0][1] as WebhookPayload;
    expect(deliveredPayload.event).toBe('decision.block');
    expect(deliveredPayload.requestId).toBe('req-block-test');
  });
});
