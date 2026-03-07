/**
 * Chaos: Kafka Down — E2E — Sprint 29
 *
 * Verifies system behaviour when the Kafka broker is taken offline:
 *
 *   1. Event ingestion degrades gracefully (500 or queue error, NOT crash)
 *   2. Decision-service direct API still works (synchronous path)
 *   3. Auth endpoints remain unaffected (no Kafka dependency)
 *   4. System recovers after Kafka restart
 *
 * Run with:
 *   npx playwright test --config tests/e2e/playwright.config.real.ts chaos-kafka-down
 */

import { test, expect } from '@playwright/test';
import {
  AUTH_URL,
  EVENT_URL,
  DECISION_URL,
  TEST_MERCHANT,
  getMerchantToken,
  generateEventId,
  sleep,
  execDockerCommand,
} from './helpers';

const SKIP = process.env.SKIP_DOCKER === 'true';

test.describe.configure({ mode: 'serial' });

const COMPOSE_FILE = 'docker-compose.full.yml';

function stopKafka(): void {
  execDockerCommand(`docker compose -f ${COMPOSE_FILE} stop kafka`);
}

function startKafka(): void {
  execDockerCommand(`docker compose -f ${COMPOSE_FILE} start kafka`);
}

async function probeStatus(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<number> {
  try {
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: options.headers,
      body: options.body,
      signal: AbortSignal.timeout(5000),
    });
    return response.status;
  } catch {
    return 0;
  }
}

test.describe('Chaos — Kafka Down', () => {
  // Always restart Kafka after each test to prevent cascading failures
  test.afterEach(async () => {
    try { startKafka(); } catch { /* best effort */ }
    await sleep(3000); // wait for Kafka to be ready
  });

  test('event ingestion fails gracefully when Kafka is down (no 5xx crash)', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');

    // Verify baseline: event ingestion works
    const baselineResp = await request.post(`${EVENT_URL}/v1/events`, {
      headers: {
        Authorization: `Bearer ${TEST_MERCHANT.apiKey}`,
        'X-Merchant-ID': TEST_MERCHANT.merchantId,
      },
      data: {
        events: [{
          eventId: generateEventId(),
          merchantId: TEST_MERCHANT.merchantId,
          deviceId: 'chaos-kafka-baseline',
          sessionId: `sess-kafka-${Date.now()}`,
          type: 'PAYMENT',
          payload: { amount: 10, currency: 'TRY', paymentMethod: 'credit_card' },
        }],
      },
    });
    expect([202, 429]).toContain(baselineResp.status());

    // Stop Kafka
    stopKafka();
    await sleep(2000);

    // Attempt event ingestion with Kafka down
    const resp = await request.post(`${EVENT_URL}/v1/events`, {
      headers: {
        Authorization: `Bearer ${TEST_MERCHANT.apiKey}`,
        'X-Merchant-ID': TEST_MERCHANT.merchantId,
      },
      data: {
        events: [{
          eventId: generateEventId(),
          merchantId: TEST_MERCHANT.merchantId,
          deviceId: 'chaos-kafka-down',
          sessionId: `sess-kafka-down-${Date.now()}`,
          type: 'PAYMENT',
          payload: { amount: 10, currency: 'TRY', paymentMethod: 'credit_card' },
        }],
      },
    });

    // Event-collector should return an error (500 Kafka unavailable, 429 backpressure,
    // or 503 service degraded) — but NOT crash (0 = connection refused)
    expect(resp.status()).toBeGreaterThan(0);
    // The server process must stay alive
    const healthStatus = await probeStatus(`${EVENT_URL}/health`);
    expect(healthStatus).toBeGreaterThan(0);
  });

  test('auth-service remains healthy when Kafka is down', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');

    stopKafka();
    await sleep(2000);

    // Auth-service has no Kafka dependency — should work normally
    const tokenResp = await request.post(`${AUTH_URL}/v1/auth/token`, {
      data: {
        grant_type: 'client_credentials',
        client_id: TEST_MERCHANT.clientId,
        client_secret: TEST_MERCHANT.clientSecret,
      },
    });

    expect(tokenResp.status()).toBe(200);
    const body = (await tokenResp.json()) as { access_token: string };
    expect(body.access_token).toBeTruthy();
  });

  test('decision-service direct API works when Kafka is down', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');

    const token = await getMerchantToken(request);

    stopKafka();
    await sleep(2000);

    // Direct POST /v1/decisions uses synchronous signal fetch — no Kafka needed
    const resp = await request.post(`${DECISION_URL}/v1/decisions`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Merchant-ID': TEST_MERCHANT.merchantId,
        'X-Request-ID': `chaos-kafka-decision-${Date.now()}`,
      },
      data: {
        requestId: `chaos-kafka-decision-${Date.now()}`,
        merchantId: TEST_MERCHANT.merchantId,
        entityId: `chaos-kafka-entity-${Date.now()}`,
      },
    });

    // Decision-service should still return a decision (202)
    // Kafka publish failure is async and non-blocking (fire-and-forget with catch)
    expect(resp.status()).toBe(202);

    const decision = (await resp.json()) as { action: string; riskScore: number };
    expect(['ALLOW', 'REVIEW', 'BLOCK']).toContain(decision.action);
  });

  test('system recovers after Kafka restart', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');

    stopKafka();
    await sleep(2000);

    // Start Kafka back up
    startKafka();

    // Wait for Kafka to be fully healthy (broker registration + topic recovery)
    await sleep(10000);

    // Verify event ingestion recovers
    let recovered = false;
    for (let attempt = 0; attempt < 10; attempt++) {
      const resp = await request.post(`${EVENT_URL}/v1/events`, {
        headers: {
          Authorization: `Bearer ${TEST_MERCHANT.apiKey}`,
          'X-Merchant-ID': TEST_MERCHANT.merchantId,
        },
        data: {
          events: [{
            eventId: generateEventId(),
            merchantId: TEST_MERCHANT.merchantId,
            deviceId: 'chaos-kafka-recovery',
            sessionId: `sess-recovery-${Date.now()}`,
            type: 'PAYMENT',
            payload: { amount: 10, currency: 'TRY', paymentMethod: 'credit_card' },
          }],
        },
      });

      if (resp.status() === 202) {
        recovered = true;
        break;
      }
      await sleep(3000);
    }

    expect(recovered).toBe(true);
  });
});
