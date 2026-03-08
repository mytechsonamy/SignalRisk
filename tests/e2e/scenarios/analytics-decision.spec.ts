/**
 * Analytics & Decision Query E2E — Sprint 30
 *
 * Tests decision-service analytics endpoints and decision lookup by ID.
 * Analytics endpoints are unprotected (dashboard consumption).
 * Decision GET requires no auth guard currently.
 *
 * Run with:
 *   npx playwright test --config tests/e2e/playwright.config.real.ts analytics-decision
 */

import { test, expect } from '@playwright/test';
import {
  DECISION_URL,
  TEST_MERCHANT,
  getMerchantToken,
  generateEventId,
  ingestEvent,
  pollDecision,
} from './helpers';

const SKIP = process.env.SKIP_DOCKER === 'true';

test.describe('Analytics & Decision Query', () => {
  test('GET /v1/analytics/trends returns daily trend data', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');

    const resp = await request.get(`${DECISION_URL}/v1/analytics/trends?days=7`);
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(body).toBeDefined();
    expect(Array.isArray(body)).toBe(true);
  });

  test('GET /v1/analytics/risk-buckets returns risk distribution', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');

    const resp = await request.get(`${DECISION_URL}/v1/analytics/risk-buckets`);
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(body).toBeDefined();
    expect(Array.isArray(body)).toBe(true);
  });

  test('GET /v1/analytics/kpi returns KPI summary', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');

    const resp = await request.get(`${DECISION_URL}/v1/analytics/kpi`);
    expect(resp.status()).toBe(200);

    const body = (await resp.json()) as Record<string, unknown>;
    expect(body).toBeDefined();
    // KPI should have some structure (totalDecisions, avgRiskScore, etc.)
    expect(typeof body).toBe('object');
  });

  test('GET /v1/analytics/merchants returns per-merchant stats', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');

    const resp = await request.get(`${DECISION_URL}/v1/analytics/merchants`);
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(body).toBeDefined();
    expect(Array.isArray(body)).toBe(true);
  });

  test('GET /v1/analytics/minute-trend returns minute-level trend', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');

    const resp = await request.get(`${DECISION_URL}/v1/analytics/minute-trend`);
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(body).toBeDefined();
    expect(Array.isArray(body)).toBe(true);
  });

  test('GET /v1/decisions/:requestId returns stored decision', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');

    const token = await getMerchantToken(request);
    const requestId = generateEventId();

    // Create a decision first via POST
    const decisionResp = await request.post(`${DECISION_URL}/v1/decisions`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Merchant-ID': TEST_MERCHANT.merchantId,
        'X-Request-ID': requestId,
      },
      data: {
        requestId,
        merchantId: TEST_MERCHANT.merchantId,
        entityId: `analytics-test-${Date.now()}`,
      },
    });
    expect(decisionResp.status()).toBe(202);

    // Now GET the decision by requestId
    const getResp = await request.get(`${DECISION_URL}/v1/decisions/${requestId}`);
    expect(getResp.status()).toBe(200);

    const decision = (await getResp.json()) as {
      requestId: string;
      action: string;
      riskScore: number;
      merchantId: string;
    };

    expect(decision.requestId).toBe(requestId);
    expect(['ALLOW', 'REVIEW', 'BLOCK']).toContain(decision.action);
    expect(decision.riskScore).toBeGreaterThanOrEqual(0);
    expect(decision.merchantId).toBe(TEST_MERCHANT.merchantId);
  });

  test('GET /v1/decisions/:requestId with unknown ID returns 404', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');

    const resp = await request.get(`${DECISION_URL}/v1/decisions/nonexistent-decision-id`);
    expect(resp.status()).toBe(404);
  });

  test('GET /metrics/decision-latency returns latency stats', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');

    const resp = await request.get(`${DECISION_URL}/metrics/decision-latency`);
    // May return 200 with data (text or JSON) or 404 if no metrics collected yet
    expect([200, 404]).toContain(resp.status());

    if (resp.status() === 200) {
      const body = await resp.text();
      expect(body).toBeTruthy();
    }
  });
});
