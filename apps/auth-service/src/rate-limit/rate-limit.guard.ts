import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { MerchantRateLimitService } from './merchant-rate-limit.service';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private readonly rateLimitService: MerchantRateLimitService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const apiKey = req.headers['x-api-key'] as string;

    if (!apiKey) return true; // No API key = let auth handle it

    // Extract merchantId from JWT or use apiKey prefix as identifier
    const merchantId = (req as any).merchantId ?? apiKey.substring(0, 16);

    const result = await this.rateLimitService.consume(merchantId, apiKey);

    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', Math.floor(result.resetAt.getTime() / 1000));

    if (!result.allowed) {
      res.setHeader('Retry-After', result.retryAfterSeconds);
      throw new HttpException(
        { statusCode: 429, message: 'Too Many Requests', retryAfter: result.retryAfterSeconds },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
