import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { MerchantRateLimitService } from './merchant-rate-limit.service';

interface AuthenticatedUser {
  merchantId?: string;
  userId?: string;
  role?: string;
}

/**
 * MerchantRateLimitGuard enforces per-merchant Redis token bucket rate limiting.
 *
 * This guard MUST be applied after JwtAuthGuard so that request.user is populated
 * with merchantId before the check runs.
 *
 * On every request:
 *   1. Reads merchantId from request.user.merchantId (set by JwtAuthGuard/Passport)
 *   2. Builds the endpoint key from HTTP method + path
 *   3. Calls MerchantRateLimitService.checkAndConsume()
 *   4. Sets X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset headers
 *   5. Returns HTTP 429 with Retry-After header when limit is exceeded
 *
 * Falls through (allows) if no merchantId is present — JWT guard handles auth.
 */
@Injectable()
export class MerchantRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(MerchantRateLimitGuard.name);

  constructor(
    private readonly merchantRateLimitService: MerchantRateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request & { user?: AuthenticatedUser }>();
    const res = http.getResponse<Response>();

    const merchantId = req.user?.merchantId;
    if (!merchantId) {
      // No merchantId available — JwtAuthGuard will handle rejection for protected routes
      return true;
    }

    const endpoint = this.buildEndpointKey(req);
    const tier = this.resolveTier(req.user?.role);

    const result = await this.merchantRateLimitService.checkAndConsume(
      merchantId,
      endpoint,
      tier,
    );

    // Always set rate limit headers so clients can track their usage
    res.setHeader('X-RateLimit-Limit', result.limit);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', result.resetAt);

    if (!result.allowed) {
      const retryAfter = Math.max(0, result.resetAt - Math.floor(Date.now() / 1000));
      res.setHeader('Retry-After', retryAfter);

      this.logger.warn(
        `Rate limit exceeded: merchant=${merchantId} endpoint=${endpoint} resetAt=${result.resetAt}`,
      );

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private buildEndpointKey(req: Request): string {
    const method = req.method.toUpperCase();
    // Normalize path: strip query string and trailing slash
    const path = req.path.replace(/\/$/, '') || '/';
    return `${method}:${path}`;
  }

  /**
   * Resolve rate limit tier from user role.
   * 'admin' and 'internal' roles get burst tier (2x limit).
   */
  private resolveTier(role?: string): 'default' | 'burst' {
    if (role === 'admin' || role === 'internal') {
      return 'burst';
    }
    return 'default';
  }
}
