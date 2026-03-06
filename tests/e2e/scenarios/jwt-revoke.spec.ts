/**
 * JWT Revoke (jti Denylist) E2E — Sprint 18 T10
 *
 * Verifies that the jti denylist implemented in auth-service works correctly:
 *   1. POST /v1/auth/token  → issues a valid JWT (access_token)
 *   2. The token passes AdminGuard on a protected endpoint (200)
 *   3. POST /v1/auth/logout → writes jwt:revoked:{jti} to Redis with TTL
 *   4. The same token is now rejected (401 or 503 — fail-closed)
 *   5. A fresh login after logout issues a new, valid token (different jti)
 *   6. A synthetically expired token returns 401, not 503
 *
 * Endpoint references from apps/auth-service/src/auth/auth.controller.ts:
 *   POST /v1/auth/token        — client_credentials grant
 *   POST /v1/auth/logout       — revokes the Bearer token in the Authorization header
 *
 * Run with:
 *   npx playwright test --config tests/e2e/playwright.config.real.ts jwt-revoke
 * Skip Docker-dependent tests:
 *   SKIP_DOCKER=true npx playwright test ...
 */

import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  AUTH_URL,
  TEST_MERCHANT,
  TEST_ADMIN,
  getMerchantToken,
  getAdminToken,
  EVENT_URL,
} from './helpers';

const SKIP = process.env.SKIP_DOCKER === 'true';

test.describe.configure({ mode: 'serial' });

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Perform the client_credentials grant and return the full token response.
 * We need both access_token and the raw response to inspect token_type etc.
 */
async function loginAs(
  request: APIRequestContext,
  clientId: string,
  clientSecret: string,
): Promise<{ access_token: string; refresh_token?: string; expires_in: number }> {
  const response = await request.post(`${AUTH_URL}/v1/auth/token`, {
    data: {
      grant_type:    'client_credentials',
      client_id:     clientId,
      client_secret: clientSecret,
    },
  });

  if (!response.ok()) {
    throw new Error(
      `loginAs(${clientId}) failed: HTTP ${response.status()} — ${await response.text()}`,
    );
  }

  return response.json();
}

/**
 * Logout by calling POST /v1/auth/logout with the given access token.
 * Returns the HTTP status code.
 */
async function logout(request: APIRequestContext, accessToken: string): Promise<number> {
  const response = await request.post(`${AUTH_URL}/v1/auth/logout`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return response.status();
}

/**
 * Call a protected admin endpoint using the given token and return the status.
 * GET /v1/admin/merchants is protected by AdminGuard which checks jti in Redis.
 */
async function callProtectedEndpoint(
  request: APIRequestContext,
  accessToken: string,
): Promise<number> {
  const response = await request.get(`${AUTH_URL}/v1/admin/merchants`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return response.status();
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe('JWT Revoke (jti Denylist)', () => {
  /**
   * Core revocation flow:
   *  1. Obtain admin token (role=admin required for /v1/admin/... endpoints)
   *  2. Call a protected endpoint → expect 200
   *  3. Logout → expect 200 (jti written to Redis)
   *  4. Call the same protected endpoint again → expect 401 or 503
   *
   * 503 = fail-closed (AdminGuard caught a Redis error or found the jti key)
   * 401 = token expired between logout and re-use (also acceptable)
   */
  test('revoked token is rejected on admin endpoints (401 or 503)', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');

    // Step 1: Login
    const { access_token: accessToken } = await loginAs(
      request,
      TEST_ADMIN.clientId,
      TEST_ADMIN.clientSecret,
    );
    expect(typeof accessToken).toBe('string');
    expect(accessToken.length).toBeGreaterThan(0);

    // Step 2: Verify the token works before logout
    const beforeStatus = await callProtectedEndpoint(request, accessToken);
    expect(beforeStatus).toBe(200);

    // Step 3: Logout — writes jwt:revoked:{jti} to Redis
    const logoutStatus = await logout(request, accessToken);
    expect(logoutStatus).toBe(200);

    // Step 4: Verify the same token is now rejected
    const afterStatus = await callProtectedEndpoint(request, accessToken);
    // jti found in denylist → 503 (fail-closed) OR token expired → 401
    expect([401, 503]).toContain(afterStatus);
  });

  /**
   * After logout, a fresh login with the same credentials should issue a new
   * token with a different jti — and that new token must work on protected
   * endpoints.
   */
  test('fresh token obtained after logout is valid and accepted', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');

    // First login and logout cycle
    const { access_token: firstToken } = await loginAs(
      request,
      TEST_ADMIN.clientId,
      TEST_ADMIN.clientSecret,
    );
    await logout(request, firstToken);

    // Second login — different jti
    const { access_token: secondToken } = await loginAs(
      request,
      TEST_ADMIN.clientId,
      TEST_ADMIN.clientSecret,
    );
    expect(secondToken).not.toBe(firstToken);

    // New token must pass AdminGuard
    const status = await callProtectedEndpoint(request, secondToken);
    expect(status).toBe(200);
  });

  /**
   * A token with a synthetically invalid signature must return 401 (JWT
   * verification fails before the Redis denylist is even consulted).
   * This ensures 401 and 503 are semantically distinct.
   */
  test('tampered token returns 401 not 503', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');

    // Build a plausibly structured but invalid JWT by modifying the signature
    const fakeToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9'
      + '.eyJzdWIiOiJub3QtYS1yZWFsLXVzZXIiLCJqdGkiOiJmYWtlLWp0aSIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjo5OTk5OTk5OTk5fQ'
      + '.INVALIDSIGNATURE';

    const response = await request.get(`${AUTH_URL}/v1/admin/merchants`, {
      headers: { Authorization: `Bearer ${fakeToken}` },
    });

    // Must be 401 (bad signature) — not 503 (Redis denylist)
    expect(response.status()).toBe(401);
  });

  /**
   * Logging out without providing an Authorization header must return 401
   * (the logout endpoint itself validates the presence of a bearer token).
   */
  test('logout without Authorization header returns 401', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');

    const response = await request.post(`${AUTH_URL}/v1/auth/logout`, {
      // no Authorization header
    });

    expect(response.status()).toBe(401);
  });

  /**
   * Merchant token revocation: the jti denylist applies to merchant tokens too,
   * not only admin tokens.  After logout, the merchant token must be rejected
   * when attempting to ingest events.
   */
  test('revoked merchant token is rejected on event-collector (401 or 503)', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');

    const merchantToken = await getMerchantToken(request);
    expect(typeof merchantToken).toBe('string');

    // Logout the merchant token
    const logoutStatus = await logout(request, merchantToken);
    expect(logoutStatus).toBe(200);

    // Attempt to use the revoked token on event-collector
    const response = await request.post(`${EVENT_URL}/v1/events`, {
      headers: {
        Authorization:  `Bearer ${merchantToken}`,
        'X-Merchant-ID': TEST_MERCHANT.merchantId,
      },
      data: {
        events: [
          {
            merchantId: TEST_MERCHANT.merchantId,
            deviceId:   'post-logout-device',
            sessionId:  `sess-revoked-${Date.now()}`,
            type:       'PAYMENT',
            payload:    { amount: 5 },
          },
        ],
      },
    });

    expect([401, 503]).toContain(response.status());
  });

  /**
   * Admin token obtained via getAdminToken() helper (shared with other test
   * files) must work for protected admin routes before any logout is issued.
   * This serves as a smoke-test for the helper itself.
   */
  test('getAdminToken helper returns a valid working token', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');

    const adminToken = await getAdminToken(request);
    expect(typeof adminToken).toBe('string');
    expect(adminToken.split('.').length).toBe(3); // header.payload.sig

    const status = await callProtectedEndpoint(request, adminToken);
    expect(status).toBe(200);
  });
});
