/**
 * Performance Gate E2E — Sprint 20 T24
 *
 * Validates that the system meets latency and throughput SLAs under load:
 *   1. 100 concurrent event requests — p99 < 500ms
 *   2. Rate limit kicks in after threshold — expect 429
 *   3. Decision API single-request latency < 300ms
 *
 * Run with:
 *   npx playwright test --config tests/e2e/playwright.config.real.ts performance-gate
 * Skip Docker-dependent tests:
 *   SKIP_DOCKER=true npx playwright test ...
 */

import { test, expect } from '@playwright/test';
import { AUTH_URL, EVENT_URL, DECISION_URL, getMerchantToken, pollDecision, generateEventId } from './helpers';

const SKIP = process.env.SKIP_DOCKER === 'true';

test.describe.configure({ mode: 'serial' });

test.describe('Performance Gate', () => {
  /**
   * Send 100 concurrent event ingestion requests and measure the p99 latency.
   * All requests are fired in parallel via Promise.all.
   * p99 must be below 500ms (services may be cold-started, so we allow
   * more headroom than the internal 200ms target).
   */
  test('100 concurrent events — p99 < 500ms', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');

    const token = await getMerchantToken(request);
    const times: number[] = [];

    await Promise.all(Array.from({ length: 100 }, async (_, i) => {
      const start = Date.now();
      await request.post(`${EVENT_URL}/v1/events`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Merchant-ID': 'merchant-001',
        },
        data: {
          eventId: generateEventId(),
          deviceFingerprint: `concurrent-device-${i}`,
          userId: `concurrent-user-${i}`,
          amount: 150,
        },
      });
      times.push(Date.now() - start);
    }));

    times.sort((a, b) => a - b);
    const p99 = times[Math.floor(times.length * 0.99)];
    expect(p99).toBeLessThan(500);
  });

  /**
   * Rapid burst of 200 sequential event requests.
   * At least one must return 429 Too Many Requests, confirming that
   * Redis-backed rate limiting is active.
   */
  test('rate limit kicks in after threshold', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');

    const token = await getMerchantToken(request);
    const responses: number[] = [];

    // Fast burst → some must return 429
    for (let i = 0; i < 200; i++) {
      const res = await request.post(`${EVENT_URL}/v1/events`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Merchant-ID': 'merchant-001',
        },
        data: {
          eventId: generateEventId(),
          deviceFingerprint: 'rate-test',
          userId: 'rate-user',
          amount: 10,
        },
      });
      responses.push(res.status());
    }

    const has429 = responses.some(s => s === 429);
    expect(has429).toBe(true);
  });

  /**
   * Single decision request must complete within 300ms.
   * This is the E2E latency budget for the decision pipeline.
   */
  test('Decision API single request latency < 300ms', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');

    const token = await getMerchantToken(request);
    const eventId = generateEventId();

    const start = Date.now();
    await request.post(`${EVENT_URL}/v1/events`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Merchant-ID': 'merchant-001',
      },
      data: {
        eventId,
        deviceFingerprint: 'latency-device',
        userId: 'latency-user',
        amount: 100,
      },
    });
    await pollDecision(request, eventId, token);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(300);
  });
});
