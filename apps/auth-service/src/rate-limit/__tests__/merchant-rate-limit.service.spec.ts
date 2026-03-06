import { MerchantRateLimitService } from '../merchant-rate-limit.service';
import { ConfigService } from '@nestjs/config';

const mockEval = jest.fn();
const mockGet = jest.fn();
const mockTtl = jest.fn();
const mockRedis = { eval: mockEval, get: mockGet, ttl: mockTtl };

describe('MerchantRateLimitService', () => {
  let service: MerchantRateLimitService;
  let configService: ConfigService;

  beforeEach(async () => {
    jest.clearAllMocks();

    configService = {
      get: jest.fn().mockImplementation((key: string, defaultVal?: unknown) => {
        const config: Record<string, unknown> = {
          'rateLimit.defaultPerMinute': 100,
          'rateLimit.burstMultiplier': 2,
          REDIS_HOST: 'localhost',
          REDIS_PORT: 6379,
          REDIS_DB: 0,
        };
        return config[key] ?? defaultVal;
      }),
    } as unknown as ConfigService;

    service = new MerchantRateLimitService(configService, mockRedis as any);
  });

  describe('checkAndConsume', () => {
    it('should allow request and return remaining tokens when bucket is not empty', async () => {
      // Lua returns [allowed=1, remaining=99, ttl=55]
      mockEval.mockResolvedValue([1, 99, 55]);

      const result = await service.checkAndConsume('merchant-1', 'POST:/v1/events');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(99);
      expect(result.limit).toBe(100);
      expect(result.resetAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it('should deny request when bucket is exhausted', async () => {
      // Lua returns [allowed=0, remaining=0, ttl=30]
      mockEval.mockResolvedValue([0, 0, 30]);

      const result = await service.checkAndConsume('merchant-1', 'POST:/v1/events');

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should use burst limit for burst tier (2x default)', async () => {
      mockEval.mockResolvedValue([1, 199, 60]);

      const result = await service.checkAndConsume('merchant-1', 'POST:/v1/events', 'burst');

      expect(result.limit).toBe(200); // 100 * 2 = 200
      expect(result.allowed).toBe(true);

      // Verify Lua was called with limit=200
      const evalArgs = mockEval.mock.calls[0];
      expect(evalArgs).toContain('200');
    });

    it('should fail open on Redis errors to avoid blocking legitimate traffic', async () => {
      mockEval.mockRejectedValue(new Error('Redis connection refused'));

      const result = await service.checkAndConsume('merchant-1', 'POST:/v1/events');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(100);
      expect(result.limit).toBe(100);
    });

    it('should use correct key pattern: rate:{merchantId}:{endpoint}', async () => {
      mockEval.mockResolvedValue([1, 50, 30]);

      await service.checkAndConsume('merch-xyz', 'GET:/v1/health');

      const evalArgs = mockEval.mock.calls[0];
      // KEYS[1] is the second argument to eval after the script
      expect(evalArgs[2]).toBe('rate:merch-xyz:GET:/v1/health');
    });

    it('should set window TTL to 60 seconds', async () => {
      mockEval.mockResolvedValue([1, 99, 60]);

      await service.checkAndConsume('merchant-1', 'POST:/v1/events');

      const evalArgs = mockEval.mock.calls[0];
      // ARGV[2] is the window in seconds
      expect(evalArgs[4]).toBe('60');
    });
  });

  describe('getStatus', () => {
    it('should return current status without consuming a token', async () => {
      mockGet.mockResolvedValue('75');
      mockTtl.mockResolvedValue(45);

      const result = await service.getStatus('merchant-1', 'GET:/v1/status');

      expect(result.remaining).toBe(75);
      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(100);
      // eval should NOT have been called
      expect(mockEval).not.toHaveBeenCalled();
    });

    it('should return full limit when key does not exist yet', async () => {
      mockGet.mockResolvedValue(null);
      mockTtl.mockResolvedValue(-2); // key does not exist

      const result = await service.getStatus('merchant-2', 'GET:/v1/status');

      expect(result.remaining).toBe(100);
      expect(result.allowed).toBe(true);
    });

    it('should report not allowed when remaining is 0', async () => {
      mockGet.mockResolvedValue('0');
      mockTtl.mockResolvedValue(10);

      const result = await service.getStatus('merchant-1', 'POST:/v1/events');

      expect(result.remaining).toBe(0);
      expect(result.allowed).toBe(false);
    });
  });
});
