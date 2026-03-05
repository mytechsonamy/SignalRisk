import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SlaAlertService } from '../sla-alert.service';
import { SlaBreachEvent } from '../sla.types';

// ---------------------------------------------------------------------------
// Mock fetch globally
// ---------------------------------------------------------------------------

const mockFetch = jest.fn();
global.fetch = mockFetch;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBreachEvent(overrides: Partial<SlaBreachEvent> = {}): SlaBreachEvent {
  return {
    caseId: 'case-001',
    merchantId: 'merchant-001',
    priority: 'HIGH',
    slaDeadline: new Date(Date.now() - 60_000),
    breachedAt: new Date(),
    outcome: 'BLOCK',
    riskScore: 85,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SlaAlertService', () => {
  let service: SlaAlertService;

  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string, defaultValue?: unknown) => {
      if (key === 'WEBHOOK_SERVICE_URL') return 'http://webhook-service:3011';
      return defaultValue;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockFetch.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlaAlertService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<SlaAlertService>(SlaAlertService);
  });

  // -------------------------------------------------------------------------

  describe('sendAlert', () => {
    it('should POST to the correct internal SLA breach URL', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 } as Response);

      await service.sendAlert(makeBreachEvent());

      expect(mockFetch).toHaveBeenCalledWith(
        'http://webhook-service:3011/internal/sla-breach',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('should send breach event as JSON body', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 } as Response);

      const breach = makeBreachEvent({ caseId: 'case-abc', riskScore: 92 });
      await service.sendAlert(breach);

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as SlaBreachEvent;
      expect(body.caseId).toBe('case-abc');
      expect(body.riskScore).toBe(92);
    });

    it('should include Content-Type application/json header', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 } as Response);

      await service.sendAlert(makeBreachEvent());

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect((options.headers as Record<string, string>)['Content-Type']).toBe(
        'application/json',
      );
    });

    it('should catch network error and not throw', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

      // Must not throw
      await expect(service.sendAlert(makeBreachEvent())).resolves.toBeUndefined();
    });

    it('should catch 5xx response and not throw', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 503 } as Response);

      // Must not throw
      await expect(service.sendAlert(makeBreachEvent())).resolves.toBeUndefined();
    });

    it('should use WEBHOOK_SERVICE_URL from config', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 } as Response);

      await service.sendAlert(makeBreachEvent());

      expect(mockConfigService.get).toHaveBeenCalledWith(
        'WEBHOOK_SERVICE_URL',
        expect.any(String),
      );
    });
  });
});
