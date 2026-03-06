/**
 * Happy Path E2E — Sprint 18 T9
 *
 * Verifies the end-to-end golden path:
 *   1. A low-risk event is ingested via event-collector (POST /v1/events)
 *   2. The pipeline processes it and the decision-service returns ALLOW
 *   3. Latency stays within acceptable E2E bounds
 *   4. The decision is idempotent for the same requestId
 *   5. Missing required fields are rejected with 400
 *
 * All tests use test.fixme — the real services must be running (docker-compose)
 * for these to execute.  Run with:
 *   npx playwright test --config tests/e2e/playwright.config.real.ts happy-path
 */

import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  AUTH_URL,
  EVENT_URL,
  DECISION_URL,
  TEST_MERCHANT,
  getMerchantToken,
  pollDecision,
  generateEventId,
} from './helpers';

// Re-export for reference — allows reading URLs in test output without helpers
export { AUTH_URL, EVENT_URL, DECISION_URL };

// ---------------------------------------------------------------------------
// Internal helper: ingest a single event via the event-collector bulk wrapper
// ---------------------------------------------------------------------------

async function ingestEvent(
  request: APIRequestContext,
  token: string,
  overrides: Partial<{
    eventId: string;
    deviceId: string;
    sessionId: string;
    merchantId: string;
    type: string;
    payload: Record<string, unknown>;
    ipAddress: string;
  }> = {},
): Promise<{ status: number; body: unknown }> {
  const response = await request.post(`${EVENT_URL}/v1/events`, {
    headers: {
      Authorization:  `Bearer ${token}`,
      'X-Merchant-ID': overrides.merchantId ?? TEST_MERCHANT.merchantId,
    },
    data: {
      events: [
        {
          merchantId: overrides.merchantId ?? TEST_MERCHANT.merchantId,
          deviceId:   overrides.deviceId   ?? 'safe-device-xyz',
          sessionId:  overrides.sessionId  ?? `sess-${Date.now()}`,
          type:       overrides.type       ?? 'PAYMENT',
          payload: overrides.payload ?? {
            amount:   50,
            currency: 'TRY',
          },
          ipAddress: overrides.ipAddress ?? '1.2.3.4',
          eventId:   overrides.eventId,
        },
      ],
    },
  });

  return { status: response.status(), body: await response.json().catch(() => null) };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe('Happy Path E2E', () => {
  /**
   * Core golden path:
   *  - Low-risk PAYMENT event → ALLOW with riskScore < 0.4
   *  - Total wall-clock latency (ingest + poll) must stay under 500 ms
   *    (loose E2E bound; unit SLA is 200 ms p99 within the decision service)
   */
  test.fixme('low-risk event returns ALLOW decision within 500ms wall-clock', async ({ request }) => {
    const token     = await getMerchantToken(request);
    const eventId   = generateEventId();
    const requestId = eventId; // decision-service idempotency key mirrors eventId

    const start = Date.now();

    // 1. Ingest the event
    const { status: ingestStatus } = await ingestEvent(request, token, {
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
  test.fixme('decision is idempotent for the same eventId / requestId', async ({ request }) => {
    const token     = await getMerchantToken(request);
    const eventId   = generateEventId();
    const requestId = eventId;

    // First submission
    const { status: first } = await ingestEvent(request, token, { eventId });
    expect(first).toBe(202);

    const decision1 = await pollDecision(request, requestId, token);

    // Second submission — identical payload, same eventId
    const { status: second } = await ingestEvent(request, token, { eventId });
    // event-collector should accept it (202) or return a cached 200/202
    expect([200, 202]).toContain(second);

    // Decision must be identical (served from idempotency cache)
    const decision2 = await pollDecision(request, requestId, token);
    expect(decision2.requestId).toBe(decision1.requestId);
    expect(decision2.action).toBe(decision1.action);
    expect(decision2.riskScore).toBe(decision1.riskScore);
  });

  /**
   * Validation: a request body missing the required `events` array must be
   * rejected immediately by the event-collector with 400 Bad Request —
   * before the payload reaches Kafka.
   */
  test.fixme('missing required fields (empty events array) returns 400', async ({ request }) => {
    const token = await getMerchantToken(request);

    const response = await request.post(`${EVENT_URL}/v1/events`, {
      headers: {
        Authorization:  `Bearer ${token}`,
        'X-Merchant-ID': TEST_MERCHANT.merchantId,
      },
      data: { events: [] }, // empty array — violates non-empty constraint
    });

    expect(response.status()).toBe(400);
  });

  /**
   * Validation: a request body missing `deviceId` (a required CreateEventDto
   * field) must be rejected with 400.
   */
  test.fixme('missing deviceId field returns 400', async ({ request }) => {
    const token = await getMerchantToken(request);

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
   */
  test.fixme('missing Authorization header returns 401', async ({ request }) => {
    const response = await request.post(`${EVENT_URL}/v1/events`, {
      // no Authorization header
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
});
