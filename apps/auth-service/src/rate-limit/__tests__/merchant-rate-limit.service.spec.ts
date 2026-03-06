import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { MerchantRateLimitService } from '../merchant-rate-limit.service';
import { RateLimitGuard } from '../rate-limit.guard';
import { ConfigService } from '@nestjs/config';

const mockEval = jest.fn();
const mockGet = jest.fn();
const mockTtl = jest.fn();
const mockRedis = { eval: mockEval, get: mockGet, ttl: mockTtl };

function buildService(): MerchantRateLimitService {
  const configService = {
    get: jest.fn().mockImplementation((key: string, defaultVal?: unknown) => {
      const config: Record<string, unknown> = {
        'rateLimit.defaultPerMinute': 100,
        'rateLimit.burstMultiplier': 2,
      };
      return config[key] ?? defaultVal;
    }),
  } as unknown as ConfigService;

  return new MerchantRateLimitService(configService, mockRedis as any);
}

describe('MerchantRateLimitService – consume (token bucket)', () => {
  let service: MerchantRateLimitService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = buildService();
  });

  it('returns allowed: true with remaining = CAPACITY - 1 on first call', async () => {
    // Lua returns [1, CAPACITY - 1] on first successful consume
    mockEval.mockResolvedValue([1, 999]);

    const result = await service.consume('merchant-1', 'apikey-abcdef');

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(999);
  });

  it('returns allowed: false when bucket is empty (eval returns [0, 0, 5])', async () => {
    mockEval.mockResolvedValue([0, 0, 5]);

    const result = await service.consume('merchant-1', 'apikey-abcdef');

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('sets correct retryAfterSeconds when rejected', async () => {
    mockEval.mockResolvedValue([0, 0, 5]);

    const result = await service.consume('merchant-1', 'apikey-abcdef');

    expect(result.retryAfterSeconds).toBe(5);
  });

  it('uses correct Redis key pattern ratelimit:{merchantId}:{prefix}', async () => {
    mockEval.mockResolvedValue([1, 999]);

    await service.consume('merch-xyz', 'abcdefghijklmn');

    // The key is the 3rd argument (index 2) to eval: script, numkeys, key, ...args
    const evalArgs = mockEval.mock.calls[0];
    expect(evalArgs[2]).toBe('ratelimit:merch-xyz:abcdefgh');
  });

  it('fails open (allowed: true) when Redis throws', async () => {
    mockEval.mockRejectedValue(new Error('Redis connection refused'));

    const result = await service.consume('merchant-1', 'apikey-abcdef');

    expect(result.allowed).toBe(true);
  });

  it('returns remaining: CAPACITY on fail-open', async () => {
    mockEval.mockRejectedValue(new Error('Redis timeout'));

    const result = await service.consume('merchant-1', 'apikey-abcdef');

    expect(result.remaining).toBe(service.CAPACITY);
  });

  it('sets resetAt as a future Date', async () => {
    mockEval.mockResolvedValue([1, 500]);
    const before = new Date();

    const result = await service.consume('merchant-1', 'apikey-abcdef');

    expect(result.resetAt).toBeInstanceOf(Date);
    expect(result.resetAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it('CAPACITY constant equals 1000', () => {
    expect(service.CAPACITY).toBe(1000);
  });

  it('REFILL_RATE constant is approximately 16.67 (1000/60)', () => {
    expect(service.REFILL_RATE).toBeCloseTo(1000 / 60, 5);
  });
});

describe('RateLimitGuard', () => {
  let guard: RateLimitGuard;
  let rateLimitService: jest.Mocked<MerchantRateLimitService>;

  const mockSetHeader = jest.fn();

  function buildContext(options: {
    apiKey?: string;
    merchantId?: string;
    allowed?: boolean;
    remaining?: number;
    retryAfterSeconds?: number;
  }): ExecutionContext {
    const req: Record<string, unknown> = {
      headers: options.apiKey ? { 'x-api-key': options.apiKey } : {},
      merchantId: options.merchantId,
    };
    const res = { setHeader: mockSetHeader };
    return {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
      }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    jest.clearAllMocks();

    rateLimitService = {
      consume: jest.fn(),
    } as unknown as jest.Mocked<MerchantRateLimitService>;

    guard = new RateLimitGuard(rateLimitService);
  });

  it('canActivate returns true when consume returns allowed: true', async () => {
    rateLimitService.consume.mockResolvedValue({
      allowed: true,
      remaining: 999,
      resetAt: new Date(Date.now() + 60000),
      retryAfterSeconds: 0,
    });

    const result = await guard.canActivate(
      buildContext({ apiKey: 'my-api-key-here' }),
    );

    expect(result).toBe(true);
  });

  it('canActivate throws 429 when consume returns allowed: false', async () => {
    rateLimitService.consume.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 5000),
      retryAfterSeconds: 5,
    });

    await expect(
      guard.canActivate(buildContext({ apiKey: 'my-api-key-here' })),
    ).rejects.toThrow(HttpException);

    try {
      await guard.canActivate(buildContext({ apiKey: 'my-api-key-here' }));
    } catch (e) {
      const err = e as HttpException;
      expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    }
  });

  it('canActivate returns true when no X-API-Key header is present', async () => {
    const result = await guard.canActivate(buildContext({}));

    expect(result).toBe(true);
    expect(rateLimitService.consume).not.toHaveBeenCalled();
  });
});

// Keep existing tests to avoid regression
describe('MerchantRateLimitService – checkAndConsume (existing)', () => {
  let service: MerchantRateLimitService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = buildService();
  });

  it('should allow request and return remaining tokens when bucket is not empty', async () => {
    mockEval.mockResolvedValue([1, 99, 55]);

    const result = await service.checkAndConsume('merchant-1', 'POST:/v1/events');

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(99);
    expect(result.limit).toBe(100);
    expect(result.resetAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('should deny request when bucket is exhausted', async () => {
    mockEval.mockResolvedValue([0, 0, 30]);

    const result = await service.checkAndConsume('merchant-1', 'POST:/v1/events');

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('should fail open on Redis errors to avoid blocking legitimate traffic', async () => {
    mockEval.mockRejectedValue(new Error('Redis connection refused'));

    const result = await service.checkAndConsume('merchant-1', 'POST:/v1/events');

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(100);
    expect(result.limit).toBe(100);
  });
});
