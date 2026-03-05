import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import { KeyManager } from '../jwt/key-manager';
import { TenantContextService } from './tenant-context.service';

interface JwtHeader {
  alg: string;
  kid?: string;
  typ?: string;
}

interface JwtPayload {
  sub?: string;
  merchant_id?: string;
  role?: string;
  exp?: number;
  iss?: string;
}

/**
 * TenantMiddleware extracts the JWT from the Authorization header,
 * verifies it using the local public key (no network call — <5ms),
 * and stores merchant_id, sub, and role into AsyncLocalStorage via
 * TenantContextService so all downstream code has access without
 * explicit parameter passing.
 *
 * This middleware is intentionally non-blocking for requests without
 * a valid JWT — the JwtAuthGuard remains responsible for enforcing
 * authentication on protected routes.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantMiddleware.name);

  constructor(
    private readonly keyManager: KeyManager,
    private readonly tenantContextService: TenantContextService,
  ) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token — continue without tenant context (JwtAuthGuard enforces auth)
      next();
      return;
    }

    const token = authHeader.slice(7);

    try {
      const payload = this.verifyToken(token);
      if (payload && payload.merchant_id && payload.sub) {
        const context = {
          merchantId: payload.merchant_id,
          userId: payload.sub,
          role: payload.role || 'unknown',
        };

        // Run the rest of the request lifecycle inside the tenant context
        this.tenantContextService.run(context, () => next());
        return;
      }
    } catch (err) {
      // Token verification failed — log at debug level and continue.
      // JwtAuthGuard will reject the request if the route is protected.
      this.logger.debug(
        `TenantMiddleware: JWT verification failed — ${(err as Error).message}`,
      );
    }

    next();
  }

  /**
   * Verify a RS256 JWT using the local KeyManager public keys.
   * Checks signature, expiry, and uses kid header for key selection.
   * All verification is in-process — no network calls.
   */
  private verifyToken(token: string): JwtPayload | null {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT structure');
    }

    const [headerB64, payloadB64, signatureB64] = parts;

    // Decode header to get kid
    const header: JwtHeader = JSON.parse(
      Buffer.from(headerB64, 'base64url').toString('utf8'),
    );

    if (header.alg !== 'RS256') {
      throw new Error(`Unsupported algorithm: ${header.alg}`);
    }

    // Select the appropriate public key
    let managedKey = header.kid
      ? this.keyManager.getKeyByKid(header.kid)
      : undefined;

    if (!managedKey) {
      // Fall back to current signing key if no kid or kid not found
      managedKey = this.keyManager.getCurrentSigningKey();
    }

    // Verify signature
    const signingInput = `${headerB64}.${payloadB64}`;
    const signature = Buffer.from(signatureB64, 'base64url');

    const verify = crypto.createVerify('RSA-SHA256');
    verify.update(signingInput);
    const isValid = verify.verify(managedKey.publicKey, signature);

    if (!isValid) {
      throw new Error('JWT signature verification failed');
    }

    // Decode and check expiry
    const payload: JwtPayload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8'),
    );

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (payload.exp !== undefined && payload.exp < nowSeconds) {
      throw new Error('JWT has expired');
    }

    return payload;
  }
}
