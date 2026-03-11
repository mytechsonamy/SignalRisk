/**
 * Tenant guard for case-service.
 *
 * Fetches JWKS from auth-service to verify RS256 JWT signatures,
 * extracts merchantId from claims, and validates that it matches
 * the requested merchantId.
 *
 * Returns:
 *   401 — missing, malformed, or invalid JWT (signature/expiry)
 *   403 — JWT merchantId doesn't match requested merchantId
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';

interface JwkKey {
  kty: string;
  use: string;
  kid: string;
  alg: string;
  n: string;
  e: string;
  [key: string]: unknown;
}

@Injectable()
export class TenantGuard implements CanActivate {
  private readonly logger = new Logger(TenantGuard.name);
  private readonly authServiceUrl: string;
  private jwksCache: Map<string, crypto.KeyObject> = new Map();
  private jwksCacheExpiry = 0;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(private readonly configService: ConfigService) {
    this.authServiceUrl =
      this.configService.get<string>('AUTH_SERVICE_URL') || 'http://auth-service:3001';
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // Extract JWT from Authorization header
    const authHeader = request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    const token = authHeader.slice(7);

    // Decode header to get kid and algorithm
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || typeof decoded === 'string') {
      throw new UnauthorizedException('Invalid JWT token format');
    }

    // Verify signature
    let payload: jwt.JwtPayload;
    try {
      const publicKey = await this.getPublicKey(decoded.header.kid);
      if (!publicKey) {
        throw new jwt.JsonWebTokenError('No matching public key found');
      }

      const verified = jwt.verify(token, publicKey, {
        algorithms: ['RS256'],
      });

      if (typeof verified === 'string') {
        throw new UnauthorizedException('Invalid JWT token format');
      }
      payload = verified;
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedException('JWT token expired');
      }
      if (err instanceof jwt.JsonWebTokenError) {
        throw new UnauthorizedException('Invalid JWT token');
      }
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      throw new UnauthorizedException('JWT verification failed');
    }

    // Extract merchantId from JWT (merchant_id or sub claim)
    const jwtMerchantId = payload.merchant_id || payload.merchantId || payload.sub;
    if (!jwtMerchantId) {
      throw new UnauthorizedException('JWT missing merchant identifier');
    }

    // Check if this is an admin token — admins can access all merchants
    if (payload.role === 'admin') {
      return true;
    }

    // Validate merchantId matches the query parameter or header
    const queryMerchantId = request.query['merchantId'] as string;
    const headerMerchantId = request.headers['x-merchant-id'] as string;
    const requestedMerchantId = queryMerchantId || headerMerchantId;

    if (requestedMerchantId && requestedMerchantId !== jwtMerchantId) {
      throw new ForbiddenException('Cross-tenant access denied');
    }

    return true;
  }

  private async getPublicKey(kid?: string): Promise<crypto.KeyObject | null> {
    // Refresh cache if expired
    if (Date.now() > this.jwksCacheExpiry || this.jwksCache.size === 0) {
      await this.fetchJwks();
    }

    if (!kid) {
      // No kid in header — return the first key
      const firstKey = this.jwksCache.values().next().value;
      return firstKey || null;
    }

    let key = this.jwksCache.get(kid);
    if (!key) {
      // Kid not found — force refresh in case of key rotation
      await this.fetchJwks();
      key = this.jwksCache.get(kid);
    }

    return key || null;
  }

  private async fetchJwks(): Promise<void> {
    try {
      const url = `${this.authServiceUrl}/.well-known/jwks.json`;
      const response = await fetch(url);

      if (!response.ok) {
        this.logger.warn(`JWKS fetch failed: HTTP ${response.status}`);
        return;
      }

      const data = (await response.json()) as { keys: JwkKey[] };
      const newCache = new Map<string, crypto.KeyObject>();

      for (const jwk of data.keys) {
        if (jwk.kty === 'RSA' && jwk.alg === 'RS256') {
          const publicKey = crypto.createPublicKey({
            key: jwk as crypto.JsonWebKey,
            format: 'jwk',
          });
          newCache.set(jwk.kid, publicKey);
        }
      }

      this.jwksCache = newCache;
      this.jwksCacheExpiry = Date.now() + this.CACHE_TTL_MS;
      this.logger.log(`JWKS cache refreshed: ${newCache.size} key(s)`);
    } catch (err) {
      this.logger.warn(`Failed to fetch JWKS from auth-service: ${(err as Error).message}`);
    }
  }
}
