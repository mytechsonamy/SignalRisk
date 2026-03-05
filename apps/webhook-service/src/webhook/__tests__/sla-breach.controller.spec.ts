import { Test, TestingModule } from '@nestjs/testing';
import { SlaBreachController } from '../sla-breach.controller';
import { WebhookConfigService } from '../webhook-config.service';
import { WebhookDeliveryService } from '../webhook-delivery.service';
import { WebhookConfig } from '../webhook.types';
import { SlaBreachDto } from '../dto/sla-breach.dto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBreachDto(overrides: Partial<SlaBreachDto> = {}): SlaBreachDto {
  const dto = new SlaBreachDto();
  dto.caseId = 'case-001';
  dto.merchantId = 'merchant-001';
  dto.priority = 'HIGH';
  dto.slaDeadline = new Date(Date.now() - 60_000).toISOString();
  dto.breachedAt = new Date().toISOString();
  dto.outcome = 'BLOCK';
  dto.riskScore = 85;
  return Object.assign(dto, overrides);
}

function makeConfig(overrides: Partial<WebhookConfig> = {}): WebhookConfig {
  return {
    merchantId: 'merchant-001',
    url: 'https://example.com/webhook',
    secret: 'test-secret',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockWebhookConfigService = {
  getWebhookConfig: jest.fn(),
};

const mockWebhookDeliveryService = {
  deliver: jest.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SlaBreachController', () => {
  let controller: SlaBreachController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SlaBreachController],
      providers: [
        { provide: WebhookConfigService, useValue: mockWebhookConfigService },
        { provide: WebhookDeliveryService, useValue: mockWebhookDeliveryService },
      ],
    }).compile();

    controller = module.get<SlaBreachController>(SlaBreachController);
  });

  // -------------------------------------------------------------------------

  describe('handleSlaBreachAlert', () => {
    it('should return { delivered: true } when webhook config exists and delivery succeeds', async () => {
      mockWebhookConfigService.getWebhookConfig.mockResolvedValue(makeConfig());
      mockWebhookDeliveryService.deliver.mockResolvedValue(undefined);

      const result = await controller.handleSlaBreachAlert(makeBreachDto());

      expect(result).toEqual({ delivered: true });
      expect(mockWebhookConfigService.getWebhookConfig).toHaveBeenCalledWith('merchant-001');
      expect(mockWebhookDeliveryService.deliver).toHaveBeenCalledWith(
        expect.objectContaining({ merchantId: 'merchant-001' }),
        expect.objectContaining({
          event: 'case.sla_breach',
          requestId: 'case-001',
          merchantId: 'merchant-001',
          riskScore: 85,
        }),
      );
    });

    it('should return { delivered: false } and not call deliver when no webhook config exists', async () => {
      mockWebhookConfigService.getWebhookConfig.mockResolvedValue(null);

      const result = await controller.handleSlaBreachAlert(makeBreachDto());

      expect(result).toEqual({ delivered: false });
      expect(mockWebhookDeliveryService.deliver).not.toHaveBeenCalled();
    });

    it('should propagate error thrown by deliver', async () => {
      mockWebhookConfigService.getWebhookConfig.mockResolvedValue(makeConfig());
      mockWebhookDeliveryService.deliver.mockRejectedValue(new Error('Delivery failed'));

      await expect(
        controller.handleSlaBreachAlert(makeBreachDto()),
      ).rejects.toThrow('Delivery failed');
    });

    it('should call getWebhookConfig with the merchantId from the breach DTO', async () => {
      mockWebhookConfigService.getWebhookConfig.mockResolvedValue(null);

      await controller.handleSlaBreachAlert(
        makeBreachDto({ merchantId: 'merchant-xyz' }),
      );

      expect(mockWebhookConfigService.getWebhookConfig).toHaveBeenCalledWith('merchant-xyz');
    });

    it('should set priority as the outcome in the webhook payload', async () => {
      mockWebhookConfigService.getWebhookConfig.mockResolvedValue(makeConfig());
      mockWebhookDeliveryService.deliver.mockResolvedValue(undefined);

      await controller.handleSlaBreachAlert(
        makeBreachDto({ priority: 'MEDIUM' }),
      );

      expect(mockWebhookDeliveryService.deliver).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ outcome: 'MEDIUM' }),
      );
    });
  });
});
