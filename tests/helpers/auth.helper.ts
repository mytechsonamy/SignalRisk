import * as jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

/**
 * JWT secret used by test environment. Must match the auth-service test config.
 */
const TEST_JWT_SECRET = process.env.TEST_JWT_SECRET ?? 'signalrisk-test-secret-key';

export interface TokenPayload {
  sub: string;        // user ID
  merchantId: string; // tenant ID for RLS
  role: string;       // user role
  scopes?: string[];  // optional permission scopes
  iat?: number;
  exp?: number;
}

export type MerchantRole = 'admin' | 'analyst' | 'viewer' | 'api_client';

/**
 * Generate a signed JWT for E2E testing.
 *
 * Each call generates a unique user ID unless explicitly provided.
 * The merchantId is the tenant identifier used by RLS policies.
 */
export function generateToken(opts: {
  merchantId: string;
  role?: MerchantRole;
  userId?: string;
  scopes?: string[];
  expiresInSeconds?: number;
}): string {
  const payload: TokenPayload = {
    sub: opts.userId ?? uuidv4(),
    merchantId: opts.merchantId,
    role: opts.role ?? 'analyst',
    scopes: opts.scopes ?? [],
  };

  return jwt.sign(payload, TEST_JWT_SECRET, {
    expiresIn: opts.expiresInSeconds ?? 3600,
    issuer: 'signalrisk-test',
  });
}

/**
 * Generate a token for a specific merchant with admin privileges.
 */
export function adminToken(merchantId: string): string {
  return generateToken({ merchantId, role: 'admin' });
}

/**
 * Generate a token for a specific merchant with read-only (viewer) privileges.
 */
export function viewerToken(merchantId: string): string {
  return generateToken({ merchantId, role: 'viewer' });
}

/**
 * Generate a token for an API client (machine-to-machine).
 */
export function apiClientToken(merchantId: string, scopes: string[] = ['read', 'write']): string {
  return generateToken({ merchantId, role: 'api_client', scopes });
}

/**
 * Decode a token without verification (useful for test assertions).
 */
export function decodeToken(token: string): TokenPayload {
  return jwt.decode(token) as TokenPayload;
}

/**
 * Generate an expired token (for negative testing).
 */
export function expiredToken(merchantId: string): string {
  return generateToken({ merchantId, expiresInSeconds: -10 });
}

/**
 * Generate a token signed with the wrong secret (for negative testing).
 */
export function invalidSignatureToken(merchantId: string): string {
  const payload: TokenPayload = {
    sub: uuidv4(),
    merchantId,
    role: 'admin',
  };
  return jwt.sign(payload, 'wrong-secret-key', { expiresIn: 3600 });
}
