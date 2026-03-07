/**
 * Lightweight tenant guard for case-service.
 *
 * Extracts merchantId from the JWT payload (decode only — signature was
 * already verified at the API gateway / auth-service level) and validates
 * that it matches the merchantId query parameter.
 *
 * Returns:
 *   401 — missing or malformed Authorization header
 *   403 — JWT merchantId doesn't match requested merchantId
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    // Extract JWT from Authorization header
    const authHeader = request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    const token = authHeader.slice(7);
    const payload = this.decodeJwtPayload(token);
    if (!payload) {
      throw new UnauthorizedException('Invalid JWT token');
    }

    // Extract merchantId from JWT (sub or merchant_id claim)
    const jwtMerchantId = payload.merchant_id || payload.merchantId || payload.sub;
    if (!jwtMerchantId) {
      throw new UnauthorizedException('JWT missing merchant identifier');
    }

    // Check if this is an admin token — admins can access all merchants
    if (payload.role === 'admin') {
      return true;
    }

    // Validate merchantId matches the query parameter
    const queryMerchantId = request.query['merchantId'] as string;
    const headerMerchantId = request.headers['x-merchant-id'] as string;
    const requestedMerchantId = queryMerchantId || headerMerchantId;

    if (requestedMerchantId && requestedMerchantId !== jwtMerchantId) {
      throw new ForbiddenException('Cross-tenant access denied');
    }

    return true;
  }

  private decodeJwtPayload(token: string): Record<string, any> | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
      return JSON.parse(payload);
    } catch {
      return null;
    }
  }
}
