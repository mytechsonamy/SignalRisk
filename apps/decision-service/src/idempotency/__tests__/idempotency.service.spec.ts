import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { IdempotencyService } from '../idempotency.service';
import { DecisionResult } from '../../decision/decision.types';

// ---------------------------------------------------------------------------
// Mock ioredis
// ---------------------------------------------------------------------------

const mockRedis = {
  connect:   jest.fn().mockResolvedValue(undefined),
  quit:      jest.fn().mockResolvedValue(undefined),
  get:       jest.fn(),
  setex:     jest.fn().mockResolvedValue('OK'),
  on:        jest.fn(),
};

jest.mock('ioredis', () => ({
  Redis: jest.fn().mockImplementation(() => mockRedis),
}));

// ---------------------------------------------------------------------------
// Mock ConfigService
// ---------------------------------------------------------------------------

const mockConfigService = {
  get: jest.fn((key: string) => {
    const config: Record<string, unknown> = {
      redis: {
        host:     'localhost',
        port:     6379,
        password: undefined,
        db:       0,
      },
    };
    return config[key];
  }),
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeDecisionResult(overrides: Partial<DecisionResult> = {}): DecisionResult {
  return {
    requestId:    'req-001',
    merchantId:   'merchant-001',
    action:       'ALLOW',
    riskScore:    20,
    riskFactors:  [],
    appliedRules: [],
    latencyMs:    45,
    cached:       false,
    createdAt:    new Date('2026-03-06T10:00:00Z'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IdempotencyService', () => {
  let service: IdempotencyService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdempotencyService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<IdempotencyService>(IdempotencyService);
  });

  // -------------------------------------------------------------------------
  // get
  // -------------------------------------------------------------------------

  describe('get', () => {
    it('returns null on cache miss', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await service.get('req-001', 'merchant-001');
      expect(result).toBeNull();
    });

    it('returns cached result with cached=true on hit', async () => {
      const decision = makeDecisionResult();
      mockRedis.get.mockResolvedValue(
        JSON.stringify({ ...decision, createdAt: decision.createdAt.toISOString() }),
      );

      const result = await service.get('req-001', 'merchant-001');

      expect(result).not.toBeNull();
      expect(result!.requestId).toBe('req-001');
      expect(result!.cached).toBe(true);
      expect(result!.action).toBe('ALLOW');
      expect(result!.createdAt).toBeInstanceOf(Date);
    });

    it('returns null on Redis error', async () => {
      mockRedis.get.mockRejectedValue(new Error('Connection refused'));

      const result = await service.get('req-001', 'merchant-001');
      expect(result).toBeNull();
    });

    it('uses correct cache key format', async () => {
      mockRedis.get.mockResolvedValue(null);

      await service.get('req-abc', 'merchant-xyz');

      expect(mockRedis.get).toHaveBeenCalledWith('idempotency:merchant-xyz:req-abc');
    });
  });

  // -------------------------------------------------------------------------
  // set
  // -------------------------------------------------------------------------

  describe('set', () => {
    it('calls Redis SETEX with correct key, TTL=86400, and serialized value', async () => {
      const decision = makeDecisionResult();

      await service.set(decision);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'idempotency:merchant-001:req-001',
        86400,
        expect.stringContaining('"requestId":"req-001"'),
      );
    });

    it('serializes createdAt as ISO string', async () => {
      const decision = makeDecisionResult();

      await service.set(decision);

      const [, , serialized] = mockRedis.setex.mock.calls[0] as [string, number, string];
      const parsed = JSON.parse(serialized) as Record<string, unknown>;
      expect(typeof parsed.createdAt).toBe('string');
      expect(parsed.createdAt).toBe('2026-03-06T10:00:00.000Z');
    });

    it('does not throw on Redis error', async () => {
      mockRedis.setex.mockRejectedValue(new Error('READONLY'));

      await expect(service.set(makeDecisionResult())).resolves.not.toThrow();
    });
  });
});
