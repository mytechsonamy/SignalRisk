/**
 * Multi-Tenant Isolation E2E — Sprint 20 T24
 *
 * Verifies that tenant isolation enforced by TenantMiddleware, AdminGuard,
 * and PostgreSQL RLS prevents cross-tenant data access.
 *
 * Run with:
 *   npx playwright test --config tests/e2e/playwright.config.real.ts multi-tenant-isolation
 * Skip Docker-dependent tests:
 *   SKIP_DOCKER=true npx playwright test ...
 */

import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  AUTH_URL,
  EVENT_URL,
  CASE_URL,
  DECISION_URL,
  getMerchantTokenFor,
  getAdminToken,
} from './helpers';

const SKIP = process.env.SKIP_DOCKER === 'true';

test.describe.configure({ mode: 'serial' });

// ---------------------------------------------------------------------------
// Test fixture credentials (must match docker-compose seed / test DB fixtures)
// ---------------------------------------------------------------------------

const MERCHANT_A = { clientId: 'merchant-a', clientSecret: 'secret-a', merchantId: 'merchant-001' };
const MERCHANT_B = { clientId: 'merchant-b', clientSecret: 'secret-b', merchantId: 'merchant-002' };

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe('Multi-Tenant Isolation', () => {
  /**
   * Merchant A's JWT MUST NOT grant access to Merchant B's case queue.
   * The TenantMiddleware validates that the JWT sub (merchantId) matches
   * the X-Merchant-ID request header. A mismatch → 403 Forbidden.
   */
  test('Merchant A JWT ile Merchant B cases endpoint → 403', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');

    const tokenA = await getMerchantTokenFor(request, MERCHANT_A);

    const response = await request.get(`${CASE_URL}/v1/cases`, {
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'X-Merchant-ID': MERCHANT_B.merchantId,
      },
    });

    expect(response.status()).toBe(403);
  });

  /**
   * Merchant A's API key is bound to merchant-001.
   * Sending it with X-Merchant-ID: merchant-002 must be rejected with 401
   * by the event-collector ApiKeyService (timing-safe comparison of merchantId).
   */
  test('Merchant A API key ile Merchant B event gönderme → 401', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');

    // Obtain a JWT for Merchant A to provision an API key
    const tokenA = await getMerchantTokenFor(request, MERCHANT_A);

    // Issue an API key for Merchant A via the merchant onboarding endpoint
    const keyResp = await request.post(
      `${AUTH_URL}/v1/merchants/${MERCHANT_A.merchantId}/api-keys`,
      {
        headers: { Authorization: `Bearer ${tokenA}` },
        data: { label: 'e2e-isolation-test' },
      },
    );
    expect(keyResp.status()).toBe(201);
    const { apiKey } = await keyResp.json() as { apiKey: string };

    // Attempt to ingest an event for Merchant B using Merchant A's API key
    const eventResp = await request.post(`${EVENT_URL}/v1/events`, {
      headers: {
        'X-API-Key': apiKey,
        'X-Merchant-ID': MERCHANT_B.merchantId, // cross-tenant mismatch
      },
      data: {
        eventType: 'PAYMENT',
        entityId: 'cross-tenant-entity',
        merchantId: MERCHANT_B.merchantId,
        amount: 10.00,
        currency: 'USD',
      },
    });

    // ApiKeyService validates that the key belongs to the requesting merchantId
    expect(eventResp.status()).toBe(401);
  });

  /**
   * Merchant B's token must not be able to read decisions that belong to
   * Merchant A. The decision-service applies RLS so that queries are always
   * scoped to the authenticated merchant. The response must be either
   * 403 Forbidden or an empty decisions array.
   */
  test('Cross-merchant decision query boş array döner', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');

    const tokenA = await getMerchantTokenFor(request, MERCHANT_A);
    const tokenB = await getMerchantTokenFor(request, MERCHANT_B);

    // First, create a known event for Merchant A to ensure there are decisions to query
    const eventResp = await request.post(`${EVENT_URL}/v1/events`, {
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'X-Merchant-ID': MERCHANT_A.merchantId,
      },
      data: {
        eventType: 'PAYMENT',
        entityId: `cross-query-entity-${Date.now()}`,
        merchantId: MERCHANT_A.merchantId,
        amount: 5.00,
        currency: 'USD',
      },
    });
    expect(eventResp.status()).toBe(201);

    // Query Merchant A's decisions using Merchant B's token
    const decisionResp = await request.get(
      `${DECISION_URL}/v1/decisions?merchantId=${MERCHANT_A.merchantId}`,
      {
        headers: {
          Authorization: `Bearer ${tokenB}`,
          'X-Merchant-ID': MERCHANT_B.merchantId,
        },
      },
    );

    if (decisionResp.status() === 403) {
      // Explicit rejection — acceptable
      expect(decisionResp.status()).toBe(403);
    } else {
      // RLS scoping returns Merchant B's own (empty) result set
      expect(decisionResp.status()).toBe(200);
      const body = await decisionResp.json() as { decisions?: Array<{ merchantId: string }> };
      const decisions = body.decisions ?? [];
      // Must not contain any decision belonging to Merchant A
      expect(
        decisions.every((d) => d.merchantId !== MERCHANT_A.merchantId),
      ).toBe(true);
    }
  });

  /**
   * An admin JWT (role=admin) must be able to query both Merchant A and
   * Merchant B endpoints without restriction.
   * POST /v1/auth/token with admin credentials → role=admin in JWT claims.
   */
  test('Admin token tüm merchant verilerine erişir → 200', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');

    const adminToken = await getAdminToken(request);

    // Admin reads Merchant A cases
    const respA = await request.get(`${CASE_URL}/v1/cases`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Merchant-ID': MERCHANT_A.merchantId,
      },
    });
    expect(respA.status()).toBe(200);

    // Admin reads Merchant B cases
    const respB = await request.get(`${CASE_URL}/v1/cases`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Merchant-ID': MERCHANT_B.merchantId,
      },
    });
    expect(respB.status()).toBe(200);
  });

  /**
   * Requests with a missing or malformed X-Merchant-ID header must be
   * rejected at the gateway/middleware level with 400 Bad Request before
   * reaching any business logic.
   */
  test('Invalid tenant header → 400', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');

    const tokenA = await getMerchantTokenFor(request, MERCHANT_A);

    // Missing X-Merchant-ID header entirely
    const missingResp = await request.get(`${CASE_URL}/v1/cases`, {
      headers: { Authorization: `Bearer ${tokenA}` },
      // X-Merchant-ID intentionally omitted
    });
    expect(missingResp.status()).toBe(400);

    // Malformed (non-UUID, non-slug) X-Merchant-ID
    const malformedResp = await request.get(`${CASE_URL}/v1/cases`, {
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'X-Merchant-ID': '../../etc/passwd', // path-traversal probe
      },
    });
    expect(malformedResp.status()).toBe(400);
  });
});
