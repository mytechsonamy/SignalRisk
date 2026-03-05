import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { DecisionController } from '../decision.controller';
import { DecisionOrchestratorService } from '../decision-orchestrator.service';
import { IdempotencyService } from '../../idempotency/idempotency.service';
import { DecisionStoreService } from '../decision-store.service';
import { DecisionRequest, DecisionResult } from '../decision.types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockOrchestrator = {
  decide: jest.fn(),
};

const mockIdempotency = {
  get: jest.fn(),
  set: jest.fn().mockResolvedValue(undefined),
};

const mockStore = {
  save: jest.fn().mockResolvedValue(undefined),
};

function makeMockResponse() {
  const headers: Record<string, string> = {};
  return {
    setHeader: jest.fn((key: string, value: string) => {
      headers[key] = value;
    }),
    _headers: headers,
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRequest(overrides: Partial<DecisionRequest> = {}): DecisionRequest {
  return {
    requestId:  'req-001',
    merchantId: 'merchant-001',
    entityId:   'user-001',
    deviceId:   'device-001',
    ...overrides,
  };
}

function makeResult(overrides: Partial<DecisionResult> = {}): DecisionResult {
  return {
    requestId:    'req-001',
    merchantId:   'merchant-001',
    action:       'ALLOW',
    riskScore:    25,
    riskFactors:  [],
    appliedRules: [],
    latencyMs:    42,
    cached:       false,
    createdAt:    new Date('2026-03-06T10:00:00Z'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DecisionController', () => {
  let controller: DecisionController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DecisionController],
      providers: [
        { provide: DecisionOrchestratorService, useValue: mockOrchestrator },
        { provide: IdempotencyService,           useValue: mockIdempotency },
        { provide: DecisionStoreService,         useValue: mockStore },
      ],
    }).compile();

    controller = module.get<DecisionController>(DecisionController);
  });

  // -------------------------------------------------------------------------
  // POST /v1/decisions — first call
  // -------------------------------------------------------------------------

  describe('decide — fresh request', () => {
    it('returns 202 with decision result (orchestrator is called)', async () => {
      const freshResult = makeResult();
      mockIdempotency.get.mockResolvedValue(null);
      mockOrchestrator.decide.mockResolvedValue(freshResult);

      const mockRes = makeMockResponse();
      const result = await controller.decide(makeRequest(), mockRes as any);

      expect(result).toEqual(freshResult);
      expect(mockOrchestrator.decide).toHaveBeenCalledWith(makeRequest());
    });

    it('sets X-Latency-Ms header from result.latencyMs', async () => {
      const freshResult = makeResult({ latencyMs: 88 });
      mockIdempotency.get.mockResolvedValue(null);
      mockOrchestrator.decide.mockResolvedValue(freshResult);

      const mockRes = makeMockResponse();
      await controller.decide(makeRequest(), mockRes as any);

      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Latency-Ms', '88');
    });

    it('persists result to idempotency cache after fresh decision', async () => {
      const freshResult = makeResult();
      mockIdempotency.get.mockResolvedValue(null);
      mockOrchestrator.decide.mockResolvedValue(freshResult);

      const mockRes = makeMockResponse();
      await controller.decide(makeRequest(), mockRes as any);

      expect(mockIdempotency.set).toHaveBeenCalledWith(freshResult);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/decisions — idempotency hit (second call)
  // -------------------------------------------------------------------------

  describe('decide — idempotency hit', () => {
    it('returns cached result without calling orchestrator', async () => {
      const cachedResult = makeResult({ cached: true });
      mockIdempotency.get.mockResolvedValue(cachedResult);

      const mockRes = makeMockResponse();
      const result = await controller.decide(makeRequest(), mockRes as any);

      expect(result).toEqual(cachedResult);
      expect(result.cached).toBe(true);
      expect(mockOrchestrator.decide).not.toHaveBeenCalled();
    });

    it('does not call idempotency.set on cache hit', async () => {
      const cachedResult = makeResult({ cached: true });
      mockIdempotency.get.mockResolvedValue(cachedResult);

      const mockRes = makeMockResponse();
      await controller.decide(makeRequest(), mockRes as any);

      expect(mockIdempotency.set).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // X-Request-ID header
  // -------------------------------------------------------------------------

  describe('X-Request-ID header', () => {
    it('echoes X-Request-ID from incoming header when provided', async () => {
      mockIdempotency.get.mockResolvedValue(null);
      mockOrchestrator.decide.mockResolvedValue(makeResult());

      const mockRes = makeMockResponse();
      await controller.decide(makeRequest(), mockRes as any, 'external-req-id');

      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Request-ID', 'external-req-id');
    });

    it('falls back to requestId from body when X-Request-ID header is absent', async () => {
      mockIdempotency.get.mockResolvedValue(null);
      mockOrchestrator.decide.mockResolvedValue(makeResult());

      const mockRes = makeMockResponse();
      await controller.decide(makeRequest({ requestId: 'body-req-id' }), mockRes as any);

      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Request-ID', 'body-req-id');
    });
  });

  // -------------------------------------------------------------------------
  // Store (fire-and-forget)
  // -------------------------------------------------------------------------

  describe('decision store', () => {
    it('calls store.save after fresh decision', async () => {
      const freshResult = makeResult();
      mockIdempotency.get.mockResolvedValue(null);
      mockOrchestrator.decide.mockResolvedValue(freshResult);

      const mockRes = makeMockResponse();
      await controller.decide(makeRequest(), mockRes as any);

      // Give the fire-and-forget promise a tick to execute
      await Promise.resolve();

      expect(mockStore.save).toHaveBeenCalledWith(freshResult);
    });

    it('does not fail if store.save rejects', async () => {
      mockIdempotency.get.mockResolvedValue(null);
      mockOrchestrator.decide.mockResolvedValue(makeResult());
      mockStore.save.mockRejectedValue(new Error('DB down'));

      const mockRes = makeMockResponse();
      await expect(controller.decide(makeRequest(), mockRes as any)).resolves.toBeDefined();
    });
  });
});
