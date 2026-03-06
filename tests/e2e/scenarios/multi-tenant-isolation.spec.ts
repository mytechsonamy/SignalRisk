import { test, expect, type APIRequestContext } from '@playwright/test';

const AUTH_URL = process.env.AUTH_URL ?? 'http://localhost:3001';
const CASES_URL = process.env.CASES_URL ?? 'http://localhost:3010';
const EVENT_URL = process.env.EVENT_URL ?? 'http://localhost:3002';
const DECISION_URL = process.env.DECISION_URL ?? 'http://localhost:3009';

// Test merchant credentials (dev fixtures)
const MERCHANT_A = { clientId: 'merchant-a', clientSecret: 'secret-a', merchantId: 'merchant-001' };
const MERCHANT_B = { clientId: 'merchant-b', clientSecret: 'secret-b', merchantId: 'merchant-002' };
const ADMIN = { clientId: 'admin', clientSecret: 'admin-secret' };

/**
 * Obtain a JWT access token via the client_credentials grant.
 * POST /v1/auth/token
 * Body: { grant_type: 'client_credentials', client_id, client_secret }
 *
 * Returns the raw access_token string.
 */
async function getToken(
  request: APIRequestContext,
  credentials: { clientId: string; clientSecret: string },
): Promise<string> {
  const response = await request.post(`${AUTH_URL}/v1/auth/token`, {
    data: {
      grant_type: 'client_credentials',
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
    },
  });

  if (!response.ok()) {
    throw new Error(
      `getToken failed for clientId=${credentials.clientId}: HTTP ${response.status()} — ${await response.text()}`,
    );
  }

  const body = await response.json() as { access_token: string };
  // auth-service TokenResponseDto: { access_token, token_type, expires_in, ... }
  return body.access_token;
}

test.describe('Multi-Tenant Isolation', () => {
  /**
   * Merchant A's JWT MUST NOT grant access to Merchant B's case queue.
   * The TenantMiddleware validates that the JWT sub (merchantId) matches
   * the X-Merchant-ID request header. A mismatch → 403 Forbidden.
   */
  test.fixme('Merchant A JWT ile Merchant B cases endpoint → 403', async ({ request }) => {
    const tokenA = await getToken(request, MERCHANT_A);

    const response = await request.get(`${CASES_URL}/v1/cases`, {
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
  test.fixme('Merchant A API key ile Merchant B event gönderme → 401', async ({ request }) => {
    // Obtain a JWT for Merchant A to provision an API key
    const tokenA = await getToken(request, MERCHANT_A);

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
  test.fixme('Cross-merchant decision query boş array döner', async ({ request }) => {
    const tokenA = await getToken(request, MERCHANT_A);
    const tokenB = await getToken(request, MERCHANT_B);

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
  test.fixme('Admin token tüm merchant verilerine erişir → 200', async ({ request }) => {
    const adminToken = await getToken(request, ADMIN);

    // Admin reads Merchant A cases
    const respA = await request.get(`${CASES_URL}/v1/cases`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Merchant-ID': MERCHANT_A.merchantId,
      },
    });
    expect(respA.status()).toBe(200);

    // Admin reads Merchant B cases
    const respB = await request.get(`${CASES_URL}/v1/cases`, {
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
  test.fixme('Invalid tenant header → 400', async ({ request }) => {
    const tokenA = await getToken(request, MERCHANT_A);

    // Missing X-Merchant-ID header entirely
    const missingResp = await request.get(`${CASES_URL}/v1/cases`, {
      headers: { Authorization: `Bearer ${tokenA}` },
      // X-Merchant-ID intentionally omitted
    });
    expect(missingResp.status()).toBe(400);

    // Malformed (non-UUID, non-slug) X-Merchant-ID
    const malformedResp = await request.get(`${CASES_URL}/v1/cases`, {
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'X-Merchant-ID': '../../etc/passwd', // path-traversal probe
      },
    });
    expect(malformedResp.status()).toBe(400);
  });
});
