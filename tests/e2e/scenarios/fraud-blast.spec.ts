/**
 * Fraud Blast E2E — Sprint 18 T9
 *
 * Verifies that high-velocity traffic from a single device fingerprint is
 * detected and blocked by the velocity-service, and that a REVIEW/BLOCK case
 * is created in the case-service.
 *
 * Scenario:
 *   1. Send 50 events sharing the same deviceId in parallel from a single merchant
 *   2. Assert that the velocity threshold is breached and at least the later
 *      decisions carry action=BLOCK (or REVIEW for borderline scores)
 *   3. Confirm that a case record is created in the case-service for the blasted entity
 *   4. Verify that a separate device with normal traffic still receives ALLOW
 *      (no cross-contamination between device fingerprints)
 *
 * All tests use test.fixme — real services must be running via docker-compose.
 * Run with:
 *   npx playwright test --config tests/e2e/playwright.config.real.ts fraud-blast
 */

import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  EVENT_URL,
  CASE_URL,
  TEST_MERCHANT,
  getMerchantToken,
  pollDecision,
  generateEventId,
  sleep,
} from './helpers';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Build a single-event ingest payload for the given deviceId. */
function buildEventPayload(
  deviceId: string,
  index: number,
  merchantId = TEST_MERCHANT.merchantId,
) {
  return {
    events: [
      {
        merchantId,
        deviceId,
        sessionId: `sess-blast-${deviceId}-${index}`,
        type:      'PAYMENT',
        payload:   { amount: 200, currency: 'TRY' },
        ipAddress: '5.6.7.8',
        eventId:   `${deviceId}-evt-${index}`,
      },
    ],
  };
}

/**
 * Ingest a single event for the blast device and return the HTTP status.
 * Uses the Bearer token approach (JWT issued by auth-service).
 */
async function blastEvent(
  request: APIRequestContext,
  token: string,
  deviceId: string,
  index: number,
): Promise<number> {
  const response = await request.post(`${EVENT_URL}/v1/events`, {
    headers: {
      Authorization:  `Bearer ${token}`,
      'X-Merchant-ID': TEST_MERCHANT.merchantId,
    },
    data: buildEventPayload(deviceId, index),
  });
  return response.status();
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe('Fraud Blast E2E', () => {
  /**
   * Send 50 events from the same deviceId in parallel.
   * The velocity-service tracks per-device event counts in a sliding window;
   * breaching the threshold causes downstream decisions to return BLOCK.
   *
   * We poll the decision for the last event's requestId and assert action=BLOCK
   * or action=REVIEW (both signal the rule fired).
   */
  test.fixme('50 events from same device triggers BLOCK via velocity', async ({ request }) => {
    const token          = await getMerchantToken(request);
    const sharedDeviceId = `blast-device-${Date.now()}`;
    const BLAST_COUNT    = 50;

    // Fire all 50 events in parallel
    const promises = Array.from({ length: BLAST_COUNT }, (_, i) =>
      blastEvent(request, token, sharedDeviceId, i),
    );
    const statuses = await Promise.all(promises);

    // All events must be accepted (202) or rate-limited (429)
    // 429 is also valid — it means backpressure fired, which is expected
    statuses.forEach((s) => {
      expect([202, 429]).toContain(s);
    });

    // Allow the async pipeline to settle before polling
    await sleep(500);

    // Poll the decision for the final event (highest index seen)
    // The decision for the last batch item should reflect the velocity breach
    const lastRequestId = `${sharedDeviceId}-evt-${BLAST_COUNT - 1}`;
    const decision = await pollDecision(request, lastRequestId, token, 30, 300);

    // Velocity breach → BLOCK or REVIEW
    expect(['BLOCK', 'REVIEW']).toContain(decision.action);
    // Risk score should be elevated above the low-risk threshold
    expect(decision.riskScore).toBeGreaterThan(40);
  });

  /**
   * After the blast, at least one case record should exist in the case-service
   * for the blasted device / entity.
   * GET /v1/cases?merchantId=...&search=<deviceId>
   */
  test.fixme('blast creates a REVIEW or BLOCK case in case-service', async ({ request }) => {
    const token          = await getMerchantToken(request);
    const sharedDeviceId = `blast-case-device-${Date.now()}`;
    const BLAST_COUNT    = 50;

    // Send the blast
    await Promise.all(
      Array.from({ length: BLAST_COUNT }, (_, i) =>
        blastEvent(request, token, sharedDeviceId, i),
      ),
    );

    // Wait for case creation — case-service consumes from Kafka asynchronously
    await sleep(2000);

    // Query case-service for cases related to the blasted device
    const caseResponse = await request.get(`${CASE_URL}/v1/cases`, {
      headers: {
        Authorization:  `Bearer ${token}`,
        'X-Merchant-ID': TEST_MERCHANT.merchantId,
      },
      params: {
        merchantId: TEST_MERCHANT.merchantId,
        search:     sharedDeviceId,
      },
    });

    expect(caseResponse.status()).toBe(200);

    const body = (await caseResponse.json()) as {
      cases?: Array<{ status: string; merchantId: string }>;
      total?: number;
    };
    const cases = body.cases ?? [];

    // At least one case must have been opened for the blasted device
    expect(cases.length).toBeGreaterThanOrEqual(1);

    // All returned cases must belong to the correct merchant
    cases.forEach((c) => {
      expect(c.merchantId).toBe(TEST_MERCHANT.merchantId);
    });

    // The case status should be OPEN or IN_REVIEW (not already RESOLVED)
    const activeStatuses = ['OPEN', 'IN_REVIEW'];
    expect(cases.some((c) => activeStatuses.includes(c.status))).toBe(true);
  });

  /**
   * Cross-contamination guard: a different device sending normal-volume traffic
   * after the blast should still receive ALLOW decisions.
   * The velocity window must be scoped per-device, not per-merchant.
   */
  test.fixme('normal traffic after blast is not affected for a different device', async ({ request }) => {
    const token          = await getMerchantToken(request);
    const blastDeviceId  = `blast-contamination-src-${Date.now()}`;
    const cleanDeviceId  = `clean-device-${Date.now()}`;

    // Perform the blast on the source device
    await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        blastEvent(request, token, blastDeviceId, i),
      ),
    );

    await sleep(500);

    // Send a single event from the clean device
    const cleanEventId = generateEventId();
    const ingestResponse = await request.post(`${EVENT_URL}/v1/events`, {
      headers: {
        Authorization:  `Bearer ${token}`,
        'X-Merchant-ID': TEST_MERCHANT.merchantId,
      },
      data: {
        events: [
          {
            merchantId: TEST_MERCHANT.merchantId,
            deviceId:   cleanDeviceId,
            sessionId:  `sess-clean-${Date.now()}`,
            type:       'PAYMENT',
            payload:    { amount: 30, currency: 'TRY' },
            ipAddress:  '9.10.11.12',
            eventId:    cleanEventId,
          },
        ],
      },
    });
    expect(ingestResponse.status()).toBe(202);

    // Poll the decision for the clean device — must be ALLOW
    const cleanDecision = await pollDecision(request, cleanEventId, token, 30, 300);
    expect(cleanDecision.action).toBe('ALLOW');
    // Risk score must stay in low-risk territory
    expect(cleanDecision.riskScore).toBeLessThan(40);
  });

  /**
   * Rate-limit boundary: a single event from a fresh device must be accepted
   * with 202 (sanity check to confirm the blast tests are not poisoning the
   * event-collector's global rate limiter).
   */
  test.fixme('single event from fresh device is accepted with 202', async ({ request }) => {
    const token    = await getMerchantToken(request);
    const deviceId = `fresh-device-${Date.now()}`;
    const eventId  = generateEventId();

    const response = await request.post(`${EVENT_URL}/v1/events`, {
      headers: {
        Authorization:  `Bearer ${token}`,
        'X-Merchant-ID': TEST_MERCHANT.merchantId,
      },
      data: {
        events: [
          {
            merchantId: TEST_MERCHANT.merchantId,
            deviceId,
            sessionId:  `sess-fresh-${Date.now()}`,
            type:       'PAYMENT',
            payload:    { amount: 15, currency: 'TRY' },
            eventId,
          },
        ],
      },
    });

    expect(response.status()).toBe(202);
  });
});
