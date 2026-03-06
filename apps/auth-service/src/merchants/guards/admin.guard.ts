import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { Request } from 'express';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '@signalrisk/redis-module';
import { JwtTokenService } from '../../jwt/jwt.service';

/**
 * AdminGuard — verifies the request carries a valid admin JWT.
 *
 * Verifies the RS256 signature using the current signing key via
 * JwtTokenService.verifyAccessToken(), then asserts role === "admin".
 * Throws UnauthorizedException for missing, expired, or non-admin tokens.
 *
 * jti Denylist: After role check, if ENABLE_JTI_DENYLIST !== 'false',
 * checks Redis for a revoked jti. Redis failure → 503 (fail-closed).
 */
@Injectable()
export class AdminGuard implements CanActivate {
  private readonly logger = new Logger(AdminGuard.name);

  constructor(
    private readonly jwtTokenService: JwtTokenService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Admin JWT required');
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      throw new UnauthorizedException('Admin JWT required');
    }

    // Verify RS256 signature and expiry; throws UnauthorizedException on failure
    const payload = await this.jwtTokenService.verifyAccessToken(token);

    if (payload.role !== 'admin') {
      throw new UnauthorizedException(
        `Admin role required, got: ${payload.role}`,
      );
    }

    // Check ENABLE_JTI_DENYLIST feature toggle (default: enabled if env var not set to 'false')
    if (process.env.ENABLE_JTI_DENYLIST !== 'false') {
      const jtiKey = `jwt:revoked:${payload.jti}`;
      try {
        const revoked = await this.redis.get(jtiKey);
        if (revoked) throw new UnauthorizedException('Token revoked');
      } catch (e) {
        if (e instanceof UnauthorizedException) throw e;
        this.logger.error('jti denylist unreachable — blocking admin access');
        throw new ServiceUnavailableException({
          error: 'auth_unavailable',
          message:
            'Authentication service temporarily unavailable. Retry shortly.',
        });
      }
    }

    return true;
  }
}
