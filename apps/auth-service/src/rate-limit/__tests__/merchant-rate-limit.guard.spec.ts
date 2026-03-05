import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { MerchantRateLimitGuard } from '../merchant-rate-limit.guard';
import { MerchantRateLimitService, RateLimitResult } from '../merchant-rate-limit.service';

describe('MerchantRateLimitGuard', () => {
  let guard: MerchantRateLimitGuard;
  let rateLimitService: jest.Mocked<MerchantRateLimitService>;

  const mockSetHeader = jest.fn();
  const now = Math.floor(Date.now() / 1000);

  function buildContext(options: {
    merchantId?: string;
    role?: string;
    method?: string;
    path?: string;
  }): ExecutionContext {
    const req = {
      user: options.merchantId
        ? { merchantId: options.merchantId, role: options.role || 'merchant' }
        : undefined,
      method: options.method || 'POST',
      path: options.path || '/v1/events',
    };
    const res = { setHeader: mockSetHeader };

    return {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
      }),
    } as unknown as ExecutionContext;
  }

  function makeRateLimitResult(overrides: Partial<RateLimitResult> = {}): RateLimitResult {
    return {
      allowed: true,
      remaining: 500,
      resetAt: now + 60,
      limit: 1000,
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();

    rateLimitService = {
      checkAndConsume: jest.fn(),
    } as unknown as jest.Mocked<MerchantRateLimitService>;

    guard = new MerchantRateLimitGuard(rateLimitService);
  });

  it('should allow request and set rate limit headers when not exceeded', async () => {
    rateLimitService.checkAndConsume.mockResolvedValue(
      makeRateLimitResult({ remaining: 499, limit: 1000 }),
    );

    const result = await guard.canActivate(
      buildContext({ merchantId: 'merchant-1', role: 'merchant' }),
    );

    expect(result).toBe(true);
    expect(mockSetHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 1000);
    expect(mockSetHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 499);
    expect(mockSetHeader).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(Number));
  });

  it('should throw HTTP 429 when rate limit is exceeded', async () => {
    rateLimitService.checkAndConsume.mockResolvedValue(
      makeRateLimitResult({ allowed: false, remaining: 0, resetAt: now + 30 }),
    );

    await expect(
      guard.canActivate(buildContext({ merchantId: 'merchant-1' })),
    ).rejects.toThrow(HttpException);

    try {
      await guard.canActivate(buildContext({ merchantId: 'merchant-1' }));
    } catch (e) {
      const err = e as HttpException;
      expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      const body = err.getResponse() as Record<string, unknown>;
      expect(body.error).toBe('Too Many Requests');
    }
  });

  it('should set Retry-After header when rate limit is exceeded', async () => {
    const resetAt = now + 45;
    rateLimitService.checkAndConsume.mockResolvedValue(
      makeRateLimitResult({ allowed: false, remaining: 0, resetAt }),
    );

    try {
      await guard.canActivate(buildContext({ merchantId: 'merchant-1' }));
    } catch {
      // expected
    }

    expect(mockSetHeader).toHaveBeenCalledWith('Retry-After', expect.any(Number));
  });

  it('should return true without calling rate limit service when no merchantId', async () => {
    const result = await guard.canActivate(buildContext({ merchantId: undefined }));

    expect(result).toBe(true);
    expect(rateLimitService.checkAndConsume).not.toHaveBeenCalled();
  });

  it('should use burst tier for admin role', async () => {
    rateLimitService.checkAndConsume.mockResolvedValue(makeRateLimitResult());

    await guard.canActivate(buildContext({ merchantId: 'merchant-1', role: 'admin' }));

    expect(rateLimitService.checkAndConsume).toHaveBeenCalledWith(
      'merchant-1',
      'POST:/v1/events',
      'burst',
    );
  });

  it('should use burst tier for internal role', async () => {
    rateLimitService.checkAndConsume.mockResolvedValue(makeRateLimitResult());

    await guard.canActivate(buildContext({ merchantId: 'merchant-1', role: 'internal' }));

    expect(rateLimitService.checkAndConsume).toHaveBeenCalledWith(
      'merchant-1',
      expect.any(String),
      'burst',
    );
  });

  it('should use default tier for merchant role', async () => {
    rateLimitService.checkAndConsume.mockResolvedValue(makeRateLimitResult());

    await guard.canActivate(buildContext({ merchantId: 'merchant-1', role: 'merchant' }));

    expect(rateLimitService.checkAndConsume).toHaveBeenCalledWith(
      'merchant-1',
      expect.any(String),
      'default',
    );
  });

  it('should build endpoint key from method and path', async () => {
    rateLimitService.checkAndConsume.mockResolvedValue(makeRateLimitResult());

    await guard.canActivate(
      buildContext({ merchantId: 'merchant-1', method: 'GET', path: '/v1/health' }),
    );

    expect(rateLimitService.checkAndConsume).toHaveBeenCalledWith(
      'merchant-1',
      'GET:/v1/health',
      'default',
    );
  });

  it('should strip trailing slash from path', async () => {
    rateLimitService.checkAndConsume.mockResolvedValue(makeRateLimitResult());

    const ctx = buildContext({ merchantId: 'merchant-1', method: 'POST', path: '/v1/events/' });
    await guard.canActivate(ctx);

    expect(rateLimitService.checkAndConsume).toHaveBeenCalledWith(
      'merchant-1',
      'POST:/v1/events',
      'default',
    );
  });
});
