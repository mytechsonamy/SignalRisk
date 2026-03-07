/**
 * Happy Path E2E — Sprint 20 T22
 *
 * Verifies the end-to-end golden path:
 *   1. A low-risk event is ingested via event-collector (POST /v1/events) → ALLOW
 *   2. The decision is idempotent for the same requestId
 *   3. Invalid payload (missing required fields) → 400 validation error
 *   4. Missing API key / Authorization header → 401
 *   5. A merchant can query its own decision with its own token → 200
 *
 * Tests are skipped when SKIP_DOCKER=true (no running services required).
 * Run with:
 *   npx playwright test --config tests/e2e/playwright.config.real.ts happy-path
 */

import { test, expect } from '@playwright/test';
import {
  AUTH_URL,
  EVENT_URL,
  DECISION_URL,
  TEST_MERCHANT,
  getMerchantToken,
  pollDecision,
  generateEventId,
  ingestEvent,
} from './helpers';

// Re-export for reference — allows reading URLs in test output without helpers
export { AUTH_URL, EVENT_URL, DECISION_URL };

const SKIP = process.env.SKIP_DOCKER === 'true';
test.describe.configure({ mode: 'serial' });

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe('Happy Path E2E', () => {
  /**
   * Core golden path:
   *  - Low-risk PAYMENT event → ALLOW with riskScore < 40
   *  - Total wall-clock latency (ingest + poll) must stay under 500 ms
   *    (loose E2E bound; unit SLA is 200 ms p99 within the decision service)
   */
  test('low-risk event returns ALLOW decision within 500ms wall-clock', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services (set SKIP_DOCKER=true to skip)');

    const token     = await getMerchantToken(request);
    const eventId   = generateEventId();
    const requestId = eventId; // decision-service idempotency key mirrors eventId

    const start = Date.now();

    // 1. Ingest the event
    const { status: ingestStatus } = await ingestEvent(request, {
      eventId,
      deviceId: 'safe-device-xyz',
      payload: { amount: 50, currency: 'TRY' },
      ipAddress: '1.2.3.4',
    });
    expect(ingestStatus).toBe(202);

    // 2. Poll until the decision is available
    const decision = await pollDecision(request, requestId, token);
    const latencyMs = Date.now() - start;

    // 3. Assertions
    expect(decision.action).toBe('ALLOW');
    // riskScore is 0-100 in DecisionResult; low-risk threshold is < 40
    expect(decision.riskScore).toBeLessThan(40);
    // Loose E2E wall-clock bound
    expect(latencyMs).toBeLessThan(500);
  });

  /**
   * Idempotency: sending the same eventId twice must not produce a second
   * decision record; the second response must match the first.
   */
  test('decision is idempotent for the same eventId / requestId', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services (set SKIP_DOCKER=true to skip)');

    const token     = await getMerchantToken(request);
    const eventId   = generateEventId();
    const requestId = eventId;

    // First submission
    const { status: first } = await ingestEvent(request, { eventId });
    expect(first).toBe(202);

    const decision1 = await pollDecision(request, requestId, token);

    // Second submission — identical payload, same eventId
    const { status: second } = await ingestEvent(request, { eventId });
    // event-collector should accept it (202) or return a cached 200/202
    expect([200, 202]).toContain(second);

    // Decision must be identical (served from idempotency cache)
    const decision2 = await pollDecision(request, requestId, token);
    expect(decision2.requestId).toBe(decision1.requestId);
    expect(decision2.action).toBe(decision1.action);
    expect(decision2.riskScore).toBe(decision1.riskScore);
  });

  /**
   * Validation: a request body missing required fields must be
   * rejected immediately by the event-collector with 400 Bad Request —
   * before the payload reaches Kafka.
   */
  test('invalid payload (missing required fields) returns 400', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services (set SKIP_DOCKER=true to skip)');

    const token = await getMerchantToken(request);

    // Missing deviceId — a required CreateEventDto field
    const response = await request.post(`${EVENT_URL}/v1/events`, {
      headers: {
        Authorization:  `Bearer ${token}`,
        'X-Merchant-ID': TEST_MERCHANT.merchantId,
      },
      data: {
        events: [
          {
            merchantId: TEST_MERCHANT.merchantId,
            // deviceId intentionally omitted
            sessionId: `sess-${Date.now()}`,
            type:      'PAYMENT',
            payload:   { amount: 50, currency: 'TRY' },
          },
        ],
      },
    });

    expect(response.status()).toBe(400);
  });

  /**
   * Auth: requests without an Authorization header must be rejected with 401.
   * This simulates a missing or invalid API key.
   */
  test('missing Authorization header (no API key) returns 401', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services (set SKIP_DOCKER=true to skip)');

    const response = await request.post(`${EVENT_URL}/v1/events`, {
      // no Authorization header — simulates missing API key
      data: {
        events: [
          {
            merchantId: TEST_MERCHANT.merchantId,
            deviceId:   'some-device',
            sessionId:  `sess-${Date.now()}`,
            type:       'PAYMENT',
            payload:    { amount: 10 },
          },
        ],
      },
    });

    expect(response.status()).toBe(401);
  });

  /**
   * Cross-merchant query: a merchant can retrieve its own decision using its
   * own token.  The decision-service must return 200/202 for its own events.
   */
  test('merchant can query own decision with own token', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services (set SKIP_DOCKER=true to skip)');

    const token     = await getMerchantToken(request);
    const eventId   = generateEventId();
    const requestId = eventId;

    // Ingest event
    const { status: ingestStatus } = await ingestEvent(request, {
      eventId,
      deviceId: 'own-merchant-device',
    });
    expect(ingestStatus).toBe(202);

    // Retrieve own decision — must succeed (200 or 202)
    const decision = await pollDecision(request, requestId, token);
    expect(decision.merchantId).toBe(TEST_MERCHANT.merchantId);
    expect(['ALLOW', 'REVIEW', 'BLOCK']).toContain(decision.action);
  });
});
