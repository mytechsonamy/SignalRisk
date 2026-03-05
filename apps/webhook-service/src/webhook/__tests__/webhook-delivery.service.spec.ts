import { Test, TestingModule } from '@nestjs/testing';
import * as crypto from 'crypto';
import { WebhookDeliveryService } from '../webhook-delivery.service';
import { WebhookConfigService } from '../webhook-config.service';
import { WebhookConfig, WebhookPayload } from '../webhook.types';

// ---------------------------------------------------------------------------
// Mock fetch globally
// ---------------------------------------------------------------------------

const mockFetch = jest.fn();
global.fetch = mockFetch;

// ---------------------------------------------------------------------------
// Mock sleep (setTimeout) to speed up tests
// ---------------------------------------------------------------------------

jest.useFakeTimers();

// ---------------------------------------------------------------------------
// Mock WebhookConfigService
// ---------------------------------------------------------------------------

const mockRpush = jest.fn().mockResolvedValue(1);
const mockWebhookConfigService = {
  getRedis: jest.fn().mockReturnValue({
    rpush: mockRpush,
  }),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildConfig(overrides: Partial<WebhookConfig> = {}): WebhookConfig {
  return {
    merchantId: 'merchant-001',
    url: 'https://example.com/webhook',
    secret: 'test-secret',
    ...overrides,
  };
}

function buildPayload(overrides: Partial<WebhookPayload> = {}): WebhookPayload {
  return {
    event: 'decision.block',
    requestId: 'req-001',
    merchantId: 'merchant-001',
    outcome: 'BLOCK',
    riskScore: 85,
    timestamp: '2026-03-06T00:00:00.000Z',
    ...overrides,
  };
}

function mockOkResponse() {
  return Promise.resolve({
    ok: true,
    status: 200,
  } as Response);
}

function mockFailResponse(status: number) {
  return Promise.resolve({
    ok: false,
    status,
  } as Response);
}

// Helper to run delivery and drain all timers
async function runDelivery(
  service: WebhookDeliveryService,
  config: WebhookConfig,
  payload: WebhookPayload,
): Promise<void> {
  const deliveryPromise = service.deliver(config, payload);
  // Drain pending timers/promises iteratively
  for (let i = 0; i < 10; i++) {
    await jest.runAllTimersAsync();
  }
  await deliveryPromise;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebhookDeliveryService', () => {
  let service: WebhookDeliveryService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockFetch.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookDeliveryService,
        { provide: WebhookConfigService, useValue: mockWebhookConfigService },
      ],
    }).compile();

    service = module.get<WebhookDeliveryService>(WebhookDeliveryService);
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  // -------------------------------------------------------------------------

  describe('successful delivery', () => {
    it('should return on the first successful attempt', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 } as Response);

      await service.deliver(buildConfig(), buildPayload());

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should POST to the configured URL', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 } as Response);

      await service.deliver(buildConfig({ url: 'https://custom.com/hook' }), buildPayload());

      expect(mockFetch).toHaveBeenCalledWith(
        'https://custom.com/hook',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('should include Content-Type application/json header', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 } as Response);

      await service.deliver(buildConfig(), buildPayload());

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect((options.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    });

    it('should include X-SignalRisk-Signature header in sha256={hmac} format', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 } as Response);

      const config = buildConfig({ secret: 'my-secret' });
      const payload = buildPayload();
      await service.deliver(config, payload);

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const sigHeader = (options.headers as Record<string, string>)['X-SignalRisk-Signature'];
      expect(sigHeader).toMatch(/^sha256=[a-f0-9]{64}$/);
    });

    it('should compute HMAC correctly', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 } as Response);

      const config = buildConfig({ secret: 'my-secret' });
      const payload = buildPayload();
      await service.deliver(config, payload);

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = options.body as string;
      const expectedHmac = crypto
        .createHmac('sha256', 'my-secret')
        .update(body)
        .digest('hex');
      const sigHeader = (options.headers as Record<string, string>)['X-SignalRisk-Signature'];
      expect(sigHeader).toBe(`sha256=${expectedHmac}`);
    });

    it('should send JSON-serialized payload as body', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 } as Response);

      const payload = buildPayload({ riskScore: 99 });
      await service.deliver(buildConfig(), payload);

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const parsed = JSON.parse(options.body as string) as WebhookPayload;
      expect(parsed.riskScore).toBe(99);
    });
  });

  describe('retry logic', () => {
    it('should retry on 5xx response and succeed on second attempt', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 500 } as Response)
        .mockResolvedValueOnce({ ok: true, status: 200 } as Response);

      const deliveryPromise = service.deliver(buildConfig(), buildPayload());
      await jest.runAllTimersAsync();
      await deliveryPromise;

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should retry on network error and succeed on second attempt', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network failure'))
        .mockResolvedValueOnce({ ok: true, status: 200 } as Response);

      const deliveryPromise = service.deliver(buildConfig(), buildPayload());
      await jest.runAllTimersAsync();
      await deliveryPromise;

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should attempt delivery 3 times total on consistent failure', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 } as Response);

      const deliveryPromise = service.deliver(buildConfig(), buildPayload());
      await jest.runAllTimersAsync();
      await deliveryPromise;

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should send to DLQ after all 3 attempts fail', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 503 } as Response);

      const deliveryPromise = service.deliver(buildConfig(), buildPayload());
      await jest.runAllTimersAsync();
      await deliveryPromise;

      expect(mockRpush).toHaveBeenCalledWith(
        'webhook:dlq',
        expect.stringContaining('merchant-001'),
      );
    });

    it('should NOT send to DLQ when delivery succeeds on first attempt', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 } as Response);

      await service.deliver(buildConfig(), buildPayload());

      expect(mockRpush).not.toHaveBeenCalled();
    });

    it('should NOT send to DLQ when delivery succeeds after retries', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 500 } as Response)
        .mockResolvedValueOnce({ ok: false, status: 500 } as Response)
        .mockResolvedValueOnce({ ok: true, status: 200 } as Response);

      const deliveryPromise = service.deliver(buildConfig(), buildPayload());
      await jest.runAllTimersAsync();
      await deliveryPromise;

      expect(mockRpush).not.toHaveBeenCalled();
    });

    it('should store payload info in DLQ entry', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 } as Response);

      const payload = buildPayload({ requestId: 'req-dlq-test' });
      const deliveryPromise = service.deliver(buildConfig(), payload);
      await jest.runAllTimersAsync();
      await deliveryPromise;

      const dlqEntry = mockRpush.mock.calls[0][1] as string;
      const parsed = JSON.parse(dlqEntry) as { payload: WebhookPayload };
      expect(parsed.payload.requestId).toBe('req-dlq-test');
    });
  });
});
