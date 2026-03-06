import {
  ExecutionContext,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AdminGuard } from '../admin.guard';
import { JwtTokenService } from '../../../jwt/jwt.service';
import { REDIS_CLIENT } from '@signalrisk/redis-module';

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildContext(authHeader?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: {
          authorization: authHeader,
        },
      }),
    }),
  } as unknown as ExecutionContext;
}

function makePayload(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    sub: 'user-uuid',
    merchant_id: 'merchant-uuid',
    role: 'admin',
    permissions: ['admin'],
    jti: 'test-jti-value',
    iat: now - 60,
    exp: now + 840,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AdminGuard', () => {
  let guard: AdminGuard;
  let jwtTokenService: jest.Mocked<JwtTokenService>;
  let redis: { get: jest.Mock; set: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset env toggle to default (enabled)
    delete process.env.ENABLE_JTI_DENYLIST;

    jwtTokenService = {
      verifyAccessToken: jest.fn(),
    } as unknown as jest.Mocked<JwtTokenService>;

    redis = {
      get: jest.fn(),
      set: jest.fn(),
    };

    guard = new AdminGuard(jwtTokenService, redis as any);
  });

  // ── AC1: expired token → 401 ─────────────────────────────────────────────

  it('AC1: throws 401 for an expired token', async () => {
    jwtTokenService.verifyAccessToken.mockRejectedValue(
      new UnauthorizedException('Token expired'),
    );

    await expect(
      guard.canActivate(buildContext('Bearer expiredtoken')),
    ).rejects.toThrow(UnauthorizedException);

    await expect(
      guard.canActivate(buildContext('Bearer expiredtoken')),
    ).rejects.toThrow('Token expired');
  });

  // ── AC2: non-admin role → 401 ─────────────────────────────────────────────

  it('AC2: throws 401 when token role is not admin', async () => {
    jwtTokenService.verifyAccessToken.mockResolvedValue(
      makePayload({ role: 'merchant' }) as any,
    );

    await expect(
      guard.canActivate(buildContext('Bearer merchanttoken')),
    ).rejects.toThrow(UnauthorizedException);

    await expect(
      guard.canActivate(buildContext('Bearer merchanttoken')),
    ).rejects.toThrow(/Admin role required/);
  });

  // ── AC3: tampered RS256 signature → 401 ───────────────────────────────────

  it('AC3: throws 401 for a tampered RS256 signature', async () => {
    jwtTokenService.verifyAccessToken.mockRejectedValue(
      new UnauthorizedException('Invalid token'),
    );

    await expect(
      guard.canActivate(buildContext('Bearer tampered.token.signature')),
    ).rejects.toThrow(UnauthorizedException);
  });

  // ── AC4: revoked jti in Redis → 401 'Token revoked' ──────────────────────

  it('AC4: throws 401 with "Token revoked" when jti is in Redis denylist', async () => {
    jwtTokenService.verifyAccessToken.mockResolvedValue(
      makePayload({ jti: 'revoked-jti' }) as any,
    );
    // Redis returns non-null → token is revoked
    redis.get.mockResolvedValue('1');

    await expect(
      guard.canActivate(buildContext('Bearer validadmintoken')),
    ).rejects.toThrow(UnauthorizedException);

    await expect(
      guard.canActivate(buildContext('Bearer validadmintoken')),
    ).rejects.toThrow('Token revoked');

    expect(redis.get).toHaveBeenCalledWith('jwt:revoked:revoked-jti');
  });

  // ── AC5: Redis unavailable → 503 ─────────────────────────────────────────

  it('AC5: throws 503 with auth_unavailable body when Redis is unreachable', async () => {
    jwtTokenService.verifyAccessToken.mockResolvedValue(
      makePayload() as any,
    );
    // Redis.get throws a connection error
    redis.get.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      guard.canActivate(buildContext('Bearer validadmintoken')),
    ).rejects.toThrow(ServiceUnavailableException);

    try {
      await guard.canActivate(buildContext('Bearer validadmintoken'));
    } catch (e) {
      expect(e).toBeInstanceOf(ServiceUnavailableException);
      const body = (e as ServiceUnavailableException).getResponse() as Record<string, unknown>;
      expect(body.error).toBe('auth_unavailable');
    }
  });

  // ── AC6: valid admin token, jti not in Redis → canActivate returns true ───

  it('AC6: returns true for a valid admin token with no revoked jti', async () => {
    jwtTokenService.verifyAccessToken.mockResolvedValue(
      makePayload({ jti: 'clean-jti' }) as any,
    );
    // Redis returns null → token is NOT revoked
    redis.get.mockResolvedValue(null);

    const result = await guard.canActivate(buildContext('Bearer validadmintoken'));

    expect(result).toBe(true);
    expect(redis.get).toHaveBeenCalledWith('jwt:revoked:clean-jti');
  });
});
