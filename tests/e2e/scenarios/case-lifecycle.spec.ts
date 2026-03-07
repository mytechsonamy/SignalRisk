/**
 * Case Lifecycle E2E — Sprint 28
 *
 * Tests the full case management lifecycle:
 *   1. List existing cases (from previous blast tests)
 *   2. Get a single case by ID
 *   3. Assign an analyst
 *   4. Update status to IN_REVIEW
 *   5. Resolve the case with a resolution
 *   6. Verify the resolved state
 *   7. GDPR export endpoint
 *
 * Run with:
 *   npx playwright test --config tests/e2e/playwright.config.real.ts case-lifecycle
 */

import { test, expect } from '@playwright/test';
import {
  CASE_URL,
  TEST_MERCHANT,
  getMerchantToken,
  getAdminToken,
} from './helpers';

const SKIP = process.env.SKIP_DOCKER === 'true';

test.describe.configure({ mode: 'serial' });

test.describe('Case Lifecycle', () => {
  let token: string;
  let caseId: string;

  test('list cases returns paginated response', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');

    token = await getMerchantToken(request);

    const resp = await request.get(`${CASE_URL}/v1/cases`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Merchant-ID': TEST_MERCHANT.merchantId,
      },
      params: { merchantId: TEST_MERCHANT.merchantId },
    });

    expect(resp.status()).toBe(200);

    const body = (await resp.json()) as {
      cases: Array<{ id: string; status: string; merchantId: string }>;
      total: number;
      page: number;
      limit: number;
    };

    expect(body.cases).toBeDefined();
    expect(Array.isArray(body.cases)).toBe(true);
    expect(body.total).toBeGreaterThanOrEqual(0);
    expect(body.page).toBe(1);

    // Pick the first OPEN case for lifecycle tests (blast tests create these)
    const openCase = body.cases.find((c) => c.status === 'OPEN');
    if (openCase) {
      caseId = openCase.id;
    }
  });

  test('get single case by ID', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');
    test.skip(!caseId, 'No OPEN case found from previous blast tests');

    const resp = await request.get(`${CASE_URL}/v1/cases/${caseId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Merchant-ID': TEST_MERCHANT.merchantId,
      },
      params: { merchantId: TEST_MERCHANT.merchantId },
    });

    expect(resp.status()).toBe(200);

    const c = (await resp.json()) as {
      id: string;
      merchantId: string;
      status: string;
      action: string;
      riskScore: number;
      entityId: string;
      createdAt: string;
    };

    expect(c.id).toBe(caseId);
    expect(c.merchantId).toBe(TEST_MERCHANT.merchantId);
    expect(c.status).toBe('OPEN');
    expect(['REVIEW', 'BLOCK']).toContain(c.action);
    expect(c.riskScore).toBeGreaterThanOrEqual(0);
    expect(c.createdAt).toBeTruthy();
  });

  test('assign analyst to case', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');
    test.skip(!caseId, 'No OPEN case found');

    const resp = await request.patch(`${CASE_URL}/v1/cases/${caseId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Merchant-ID': TEST_MERCHANT.merchantId,
      },
      params: { merchantId: TEST_MERCHANT.merchantId },
      data: { assignedTo: 'analyst@signalrisk.io' },
    });

    expect(resp.status()).toBe(200);

    const c = (await resp.json()) as { assignedTo: string };
    expect(c.assignedTo).toBe('analyst@signalrisk.io');
  });

  test('update case status to IN_REVIEW', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');
    test.skip(!caseId, 'No OPEN case found');

    const resp = await request.patch(`${CASE_URL}/v1/cases/${caseId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Merchant-ID': TEST_MERCHANT.merchantId,
      },
      params: { merchantId: TEST_MERCHANT.merchantId },
      data: { status: 'IN_REVIEW' },
    });

    expect(resp.status()).toBe(200);

    const c = (await resp.json()) as { status: string };
    expect(c.status).toBe('IN_REVIEW');
  });

  test('resolve case as FRAUD with notes', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');
    test.skip(!caseId, 'No OPEN case found');

    const resp = await request.patch(`${CASE_URL}/v1/cases/${caseId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Merchant-ID': TEST_MERCHANT.merchantId,
      },
      params: { merchantId: TEST_MERCHANT.merchantId },
      data: {
        status: 'RESOLVED',
        resolution: 'FRAUD',
        resolutionNotes: 'E2E test — confirmed fraudulent via velocity blast pattern',
      },
    });

    expect(resp.status()).toBe(200);

    const c = (await resp.json()) as {
      status: string;
      resolution: string;
      resolutionNotes: string;
      resolvedAt: string;
    };

    expect(c.status).toBe('RESOLVED');
    expect(c.resolution).toBe('FRAUD');
    expect(c.resolutionNotes).toContain('E2E test');
  });

  test('resolved case persists on re-fetch', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');
    test.skip(!caseId, 'No OPEN case found');

    const resp = await request.get(`${CASE_URL}/v1/cases/${caseId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Merchant-ID': TEST_MERCHANT.merchantId,
      },
      params: { merchantId: TEST_MERCHANT.merchantId },
    });

    expect(resp.status()).toBe(200);

    const c = (await resp.json()) as {
      status: string;
      resolution: string;
      assignedTo: string;
    };

    expect(c.status).toBe('RESOLVED');
    expect(c.resolution).toBe('FRAUD');
    expect(c.assignedTo).toBe('analyst@signalrisk.io');
  });

  test('GDPR export returns cases for entity', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');

    // Use admin token for export (admin can access any merchant)
    const adminToken = await getAdminToken(request);

    const resp = await request.get(`${CASE_URL}/v1/cases/export`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Merchant-ID': TEST_MERCHANT.merchantId,
      },
      params: {
        merchantId: TEST_MERCHANT.merchantId,
        entityId: 'nonexistent-entity-gdpr-test',
      },
    });

    // 200 with empty array (no cases for this entity) or actual cases
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body).toBeDefined();
  });

  test('get nonexistent case returns 404', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');

    const resp = await request.get(`${CASE_URL}/v1/cases/nonexistent-case-id`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Merchant-ID': TEST_MERCHANT.merchantId,
      },
      params: { merchantId: TEST_MERCHANT.merchantId },
    });

    expect(resp.status()).toBe(404);
  });
});
