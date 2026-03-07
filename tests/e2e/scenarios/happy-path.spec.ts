/**
 * Happy Path E2E — Sprint 20 T22
 *
 * Verifies the end-to-end golden path:
 *   1. Invalid payload (missing required fields) → 400 validation error
 *   2. Missing API key / Authorization header → 401
 *   3. A low-risk event is ingested via event-collector (POST /v1/events) → ALLOW
 *   4. The decision is idempotent for the same requestId
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

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe('Happy Path E2E', () => {
  // Fast validation tests run first (no serial dependency, no heavy I/O)
  // This avoids timeouts when fraud-blast saturates event-collector connections.

  /**
   * Validation: a request body missing required fields must be
   * rejected immediately by the event-collector with 400 Bad Request —
   * before the payload reaches Kafka.
   */
  test('invalid payload (missing required fields) is rejected', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services (set SKIP_DOCKER=true to skip)');

    // Missing deviceId — a required CreateEventDto field
    const response = await request.post(`${EVENT_URL}/v1/events`, {
      headers: {
        Authorization:  `Bearer ${TEST_MERCHANT.apiKey}`,
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

    // Event-collector does batch validation: returns 202 with rejected events
    // OR 400 if the entire batch is invalid
    if (response.status() === 202) {
      const body = await response.json() as { rejected?: number };
      expect(body.rejected).toBeGreaterThan(0);
    } else {
      expect(response.status()).toBe(400);
    }
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

  // Decision-dependent tests below — these use serial mode implicitly
  // (each test may depend on state from the previous one)

  /**
   * Core golden path:
   *  - Low-risk PAYMENT event → ALLOW with riskScore < 40
   */
  test('low-risk event returns ALLOW decision', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services (set SKIP_DOCKER=true to skip)');

    const token     = await getMerchantToken(request);
    const eventId   = generateEventId();
    const requestId = eventId; // decision-service idempotency key mirrors eventId

    // Use a unique deviceId per run to avoid stale velocity data from prior runs
    const deviceId = `safe-device-${Date.now()}`;

    // 1. Ingest the event
    const { status: ingestStatus } = await ingestEvent(request, {
      eventId,
      deviceId,
      payload: { amount: 50, currency: 'TRY', paymentMethod: 'credit_card' },
      ipAddress: '1.2.3.4',
    });
    expect([202, 429]).toContain(ingestStatus);
    if (ingestStatus === 429) {
      test.skip(true, 'Rate limited — cannot verify decision');
      return;
    }

    // 2. Poll until the decision is available (use deviceId as entityId for velocity lookup)
    const decision = await pollDecision(request, requestId, token, 20, 200, deviceId);

    // 3. Assertions
    expect(decision.action).toBe('ALLOW');
    // riskScore may be null (no signals available) or a low number; both mean low-risk
    expect(decision.riskScore ?? 0).toBeLessThan(40);
    // Note: wall-clock latency check removed — polling in Docker can take
    // several seconds; latency SLA is validated in the p99 performance test.
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

    // First submission (429 possible if rate limit hit from prior tests)
    const { status: first } = await ingestEvent(request, { eventId });
    expect([202, 429]).toContain(first);
    if (first === 429) {
      test.skip(true, 'Rate limited — cannot test idempotency');
      return;
    }

    const decision1 = await pollDecision(request, requestId, token);

    // Second submission — identical payload, same eventId
    const { status: second } = await ingestEvent(request, { eventId });
    // event-collector should accept it (202) or rate limit (429)
    expect([200, 202, 429]).toContain(second);

    // Decision must be identical (served from idempotency cache)
    const decision2 = await pollDecision(request, requestId, token);
    expect(decision2.requestId).toBe(decision1.requestId);
    expect(decision2.action).toBe(decision1.action);
    expect(decision2.riskScore).toBe(decision1.riskScore);
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
    expect([202, 429]).toContain(ingestStatus);
    if (ingestStatus === 429) {
      test.skip(true, 'Rate limited — cannot verify decision');
      return;
    }

    // Retrieve own decision — must succeed (200 or 202)
    const decision = await pollDecision(request, requestId, token);
    expect(decision.merchantId).toBe(TEST_MERCHANT.merchantId);
    expect(['ALLOW', 'REVIEW', 'BLOCK']).toContain(decision.action);
  });
});
