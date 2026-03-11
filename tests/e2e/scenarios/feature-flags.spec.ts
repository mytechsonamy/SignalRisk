/**
 * Feature Flags E2E — Sprint 33
 *
 * Tests the feature-flag-service CRUD lifecycle:
 *   1. List flags
 *   2. Create a flag
 *   3. Get flag by name
 *   4. Check flag for a merchant
 *   5. Update flag
 *   6. Delete flag
 *
 * Run with:
 *   npx playwright test --config tests/e2e/playwright.config.real.ts feature-flags
 */

import { test, expect } from '@playwright/test';

const SKIP = process.env.SKIP_DOCKER === 'true';
const FLAGS_URL = process.env.FLAGS_URL ?? 'http://localhost:3013';

test.describe.configure({ mode: 'serial' });

test.describe('Feature Flags', () => {
  const flagName = `e2e-test-flag-${Date.now()}`;

  test('list flags returns array', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');

    const resp = await request.get(`${FLAGS_URL}/v1/flags`);
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('create a new feature flag', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');

    const resp = await request.post(`${FLAGS_URL}/v1/flags`, {
      data: {
        name: flagName,
        description: 'E2E test flag',
        enabled: false,
      },
    });

    expect(resp.status()).toBe(201);

    const body = (await resp.json()) as { name: string; enabled: boolean };
    expect(body.name).toBe(flagName);
    expect(body.enabled).toBe(false);
  });

  test('get flag by name', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');

    const resp = await request.get(`${FLAGS_URL}/v1/flags/${flagName}`);
    expect(resp.status()).toBe(200);

    const body = (await resp.json()) as { name: string; enabled: boolean };
    expect(body.name).toBe(flagName);
  });

  test('check flag for merchant (disabled)', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');

    const resp = await request.get(
      `${FLAGS_URL}/v1/flags/${flagName}/check?merchantId=00000000-0000-0000-0000-000000000001`,
    );
    expect(resp.status()).toBe(200);

    const body = (await resp.json()) as { enabled: boolean };
    expect(body.enabled).toBe(false);
  });

  test('update flag to enabled', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');

    const resp = await request.patch(`${FLAGS_URL}/v1/flags/${flagName}`, {
      data: { enabled: true },
    });
    expect(resp.status()).toBe(200);

    const body = (await resp.json()) as { enabled: boolean };
    expect(body.enabled).toBe(true);
  });

  test('check flag for merchant (enabled)', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');

    const resp = await request.get(
      `${FLAGS_URL}/v1/flags/${flagName}/check?merchantId=00000000-0000-0000-0000-000000000001`,
    );
    expect(resp.status()).toBe(200);

    const body = (await resp.json()) as { enabled: boolean };
    expect(body.enabled).toBe(true);
  });

  test('delete flag', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');

    const resp = await request.delete(`${FLAGS_URL}/v1/flags/${flagName}`);
    expect(resp.status()).toBe(204);
  });

  test('get deleted flag returns 404', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');

    const resp = await request.get(`${FLAGS_URL}/v1/flags/${flagName}`);
    expect(resp.status()).toBe(404);
  });
});
