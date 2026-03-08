/**
 * Merchant CRUD E2E — Sprint 32
 *
 * Tests admin-only merchant management lifecycle:
 *   1. Create a new merchant (POST /v1/merchants)
 *   2. Get merchant by ID (GET /v1/merchants/:id)
 *   3. Update merchant (PATCH /v1/merchants/:id)
 *   4. Rotate API key (POST /v1/merchants/:id/rotate-key)
 *   5. Delete merchant (DELETE /v1/merchants/:id)
 *   6. Non-admin access denied (403)
 *
 * All endpoints are guarded by AdminGuard (requires admin JWT).
 *
 * Run with:
 *   npx playwright test --config tests/e2e/playwright.config.real.ts merchant-crud
 */

import { test, expect } from '@playwright/test';
import {
  AUTH_URL,
  getAdminToken,
  getMerchantToken,
} from './helpers';

const SKIP = process.env.SKIP_DOCKER === 'true';

test.describe.configure({ mode: 'serial' });

test.describe('Merchant CRUD (Admin)', () => {
  let adminToken: string;
  let merchantId: string;

  test('create merchant with admin token → 201', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');

    adminToken = await getAdminToken(request);

    const resp = await request.post(`${AUTH_URL}/v1/merchants`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        name: `E2E Test Merchant ${Date.now()}`,
        rateLimitPerMinute: 500,
        tier: 'default',
      },
    });

    expect(resp.status()).toBe(201);

    const body = (await resp.json()) as {
      id: string;
      name: string;
      apiKey: string;
      apiKeyPrefix: string;
    };

    expect(body.id).toBeTruthy();
    expect(body.name).toContain('E2E Test Merchant');
    expect(body.apiKey).toBeTruthy();

    merchantId = body.id;
  });

  test('get merchant by ID → 200', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');
    test.skip(!merchantId, 'No merchant created');

    const resp = await request.get(`${AUTH_URL}/v1/merchants/${merchantId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(resp.status()).toBe(200);

    const body = (await resp.json()) as { id: string; name: string; status: string };
    expect(body.id).toBe(merchantId);
    expect(body.name).toContain('E2E Test Merchant');
  });

  test('update merchant name → 200', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');
    test.skip(!merchantId, 'No merchant created');

    const newName = `E2E Updated Merchant ${Date.now()}`;
    const resp = await request.patch(`${AUTH_URL}/v1/merchants/${merchantId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { name: newName },
    });

    expect(resp.status()).toBe(200);

    const body = (await resp.json()) as { name: string };
    expect(body.name).toBe(newName);
  });

  test('rotate API key → 200 with new key', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');
    test.skip(!merchantId, 'No merchant created');

    const resp = await request.post(`${AUTH_URL}/v1/merchants/${merchantId}/rotate-key`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(resp.status()).toBe(200);

    const body = (await resp.json()) as { apiKey: string; previousKeyPrefix: string };
    expect(body.apiKey).toBeTruthy();
  });

  test('delete merchant → 204', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');
    test.skip(!merchantId, 'No merchant created');

    const resp = await request.delete(`${AUTH_URL}/v1/merchants/${merchantId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(resp.status()).toBe(204);
  });

  test('get deleted merchant → 404', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');
    test.skip(!merchantId, 'No merchant created');

    const resp = await request.get(`${AUTH_URL}/v1/merchants/${merchantId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(resp.status()).toBe(404);
  });

  test('non-admin cannot create merchant → 401/403', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');

    const merchantToken = await getMerchantToken(request);

    const resp = await request.post(`${AUTH_URL}/v1/merchants`, {
      headers: { Authorization: `Bearer ${merchantToken}` },
      data: { name: 'Unauthorized Merchant' },
    });

    expect([401, 403]).toContain(resp.status());
  });

  test('no auth header → 401', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');

    const resp = await request.post(`${AUTH_URL}/v1/merchants`, {
      data: { name: 'No Auth Merchant' },
    });

    expect(resp.status()).toBe(401);
  });
});
