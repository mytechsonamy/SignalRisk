import { DecisionCacheService } from '../decision-cache.service';
import { ConfigService } from '@nestjs/config';

// Mock ioredis
const mockGet = jest.fn();
const mockSet = jest.fn();
const mockDel = jest.fn();
const mockQuit = jest.fn().mockResolvedValue('OK');

jest.mock('ioredis', () => {
  const mockConstructor = jest.fn().mockImplementation(() => ({
    get: mockGet,
    set: mockSet,
    del: mockDel,
    quit: mockQuit,
  }));
  return { Redis: mockConstructor, default: mockConstructor };
});

describe('DecisionCacheService', () => {
  let service: DecisionCacheService;
  let configService: ConfigService;

  beforeEach(async () => {
    jest.clearAllMocks();

    configService = {
      get: jest.fn().mockImplementation((key: string, defaultVal?: unknown) => {
        const config: Record<string, unknown> = {
          REDIS_HOST: 'localhost',
          REDIS_PORT: 6379,
        };
        return config[key] ?? defaultVal;
      }),
    } as unknown as ConfigService;

    service = new DecisionCacheService(configService);
    service.onModuleInit();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  // -------------------------------------------------------------------------
  // cacheKey
  // -------------------------------------------------------------------------

  describe('cacheKey', () => {
    it('returns correct key format: decision:cache:{merchantId}:{entityId}', () => {
      const key = service.cacheKey('merchant-123', 'entity-456');
      expect(key).toBe('decision:cache:merchant-123:entity-456');
    });

    it('includes both merchantId and entityId in the key', () => {
      const key = service.cacheKey('m1', 'e1');
      expect(key).toContain('m1');
      expect(key).toContain('e1');
      expect(key).toMatch(/^decision:cache:/);
    });
  });

  // -------------------------------------------------------------------------
  // get
  // -------------------------------------------------------------------------

  describe('get', () => {
    it('returns null on cache miss (Redis returns null)', async () => {
      mockGet.mockResolvedValue(null);

      const result = await service.get('merchant-1', 'entity-1');

      expect(result).toBeNull();
      expect(mockGet).toHaveBeenCalledWith('decision:cache:merchant-1:entity-1');
    });

    it('returns parsed object on cache hit', async () => {
      const cached = { action: 'ALLOW', riskScore: 20 };
      mockGet.mockResolvedValue(JSON.stringify(cached));

      const result = await service.get('merchant-1', 'entity-1');

      expect(result).toEqual(cached);
    });

    it('returns null when Redis throws an error (fail open)', async () => {
      mockGet.mockRejectedValue(new Error('Redis connection refused'));

      const result = await service.get('merchant-1', 'entity-1');

      expect(result).toBeNull();
    });

    it('calls redis.get with correct cache key', async () => {
      mockGet.mockResolvedValue(null);

      await service.get('merch-abc', 'ent-xyz');

      expect(mockGet).toHaveBeenCalledWith('decision:cache:merch-abc:ent-xyz');
    });
  });

  // -------------------------------------------------------------------------
  // set
  // -------------------------------------------------------------------------

  describe('set', () => {
    it('stores JSON with correct key and 5s TTL', async () => {
      mockSet.mockResolvedValue('OK');
      const result = { action: 'BLOCK', riskScore: 80 };

      await service.set('merchant-1', 'entity-1', result);

      expect(mockSet).toHaveBeenCalledWith(
        'decision:cache:merchant-1:entity-1',
        JSON.stringify(result),
        'EX',
        5,
      );
    });

    it('serializes complex objects to JSON', async () => {
      mockSet.mockResolvedValue('OK');
      const complex = { action: 'REVIEW', riskScore: 55, riskFactors: [{ signal: 'device', value: 0.8 }] };

      await service.set('m1', 'e1', complex);

      const setArg = mockSet.mock.calls[0][1];
      expect(JSON.parse(setArg)).toEqual(complex);
    });
  });

  // -------------------------------------------------------------------------
  // invalidate
  // -------------------------------------------------------------------------

  describe('invalidate', () => {
    it('calls DEL with correct key', async () => {
      mockDel.mockResolvedValue(1);

      await service.invalidate('merchant-1', 'entity-1');

      expect(mockDel).toHaveBeenCalledWith('decision:cache:merchant-1:entity-1');
    });

    it('calls DEL exactly once per invalidate call', async () => {
      mockDel.mockResolvedValue(1);

      await service.invalidate('m1', 'e1');

      expect(mockDel).toHaveBeenCalledTimes(1);
    });
  });
});
