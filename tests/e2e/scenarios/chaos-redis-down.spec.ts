/**
 * Chaos: Redis Down — E2E — Sprint 18 T10
 *
 * Verifies system behaviour when the Redis instance is taken offline:
 *
 *   1. Admin endpoints that depend on the jti denylist → fail-closed (503)
 *   2. Event ingestion → continues (Kafka-backed; Redis is not in the hot path)
 *   3. System recovers within 30 s after Redis is restarted
 *
 * Implementation notes
 * --------------------
 * These tests require:
 *   a) Docker CLI accessible from the test runner (docker compose v2)
 *   b) The full stack started via:
 *        docker compose -f docker-compose.full.yml up --wait
 *   c) The playwright.config.real.ts webServer block handles the above in CI
 *
 * All tests use test.fixme.  To run for real, remove the fixme marker and
 * ensure the test runner has Docker socket access plus the env var
 * CHAOS_ENABLED=true set.
 *
 * Run with:
 *   CHAOS_ENABLED=true npx playwright test --config tests/e2e/playwright.config.real.ts chaos-redis-down
 */

import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import {
  AUTH_URL,
  EVENT_URL,
  TEST_MERCHANT,
  getMerchantToken,
  getAdminToken,
  generateEventId,
  sleep,
} from './helpers';

// ---------------------------------------------------------------------------
// Docker control helpers
// ---------------------------------------------------------------------------

/** Path to the full-stack compose file (relative to the repo root). */
const COMPOSE_FILE = 'docker-compose.full.yml';

/**
 * Stop the Redis container using `docker compose stop redis`.
 * Throws if Docker CLI is not available or the command fails.
 */
function stopRedis(): void {
  execSync(`docker compose -f ${COMPOSE_FILE} stop redis`, {
    cwd: process.cwd(),
    stdio: 'pipe',
  });
}

/**
 * Start the Redis container using `docker compose start redis`.
 */
function startRedis(): void {
  execSync(`docker compose -f ${COMPOSE_FILE} start redis`, {
    cwd: process.cwd(),
    stdio: 'pipe',
  });
}

/**
 * Probe a URL and return its HTTP status code.
 * Returns 0 if the request errors (connection refused, timeout, etc.).
 */
async function probeStatus(
  url: string,
  headers: Record<string, string> = {},
): Promise<number> {
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(3000) });
    return response.status;
  } catch {
    return 0;
  }
}

/**
 * Poll a URL until the expected status is returned, or until timeout.
 *
 * @param url           URL to probe
 * @param expectedStatus HTTP status to wait for
 * @param headers        Optional request headers
 * @param timeoutMs      Maximum wait time in milliseconds (default 30 000)
 * @param intervalMs     Polling interval in milliseconds (default 1 000)
 */
async function waitForStatus(
  url: string,
  expectedStatus: number,
  headers: Record<string, string> = {},
  timeoutMs = 30_000,
  intervalMs = 1_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await probeStatus(url, headers);
    if (status === expectedStatus) return;
    await sleep(intervalMs);
  }
  throw new Error(
    `waitForStatus(${url}, ${expectedStatus}) timed out after ${timeoutMs} ms`,
  );
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe('Chaos — Redis Down', () => {
  /**
   * When Redis is unavailable the AdminGuard must fail-closed: the jti denylist
   * check cannot succeed so the service returns 503 Service Unavailable rather
   * than 200 (which would silently bypass the revocation check).
   *
   * Flow:
   *  1. Obtain an admin token (Redis still up at this point)
   *  2. Verify it works → 200
   *  3. Stop Redis container
   *  4. Repeat the request → 503
   *  5. Start Redis container (cleanup)
   */
  test.fixme('admin endpoint returns 503 when Redis is unavailable (fail-closed)', async ({ request }) => {
    // Pre-condition: Redis must be running
    const adminToken = await getAdminToken(request);

    const beforeStatus = await probeStatus(
      `${AUTH_URL}/v1/admin/merchants`,
      { Authorization: `Bearer ${adminToken}` },
    );
    expect(beforeStatus).toBe(200);

    // --- Take Redis offline ---
    stopRedis();
    // Give NestJS a moment to detect the disconnection
    await sleep(2000);

    try {
      const afterStatus = await probeStatus(
        `${AUTH_URL}/v1/admin/merchants`,
        { Authorization: `Bearer ${adminToken}` },
      );
      // fail-closed: Redis unavailable → 503
      expect(afterStatus).toBe(503);
    } finally {
      // Always restore Redis even if the assertion fails
      startRedis();
    }
  });

  /**
   * Event ingestion must continue when Redis is unavailable.
   * The event-collector uses Redis only for rate-limiting; the core ingest
   * path writes to Kafka which is independent of Redis.
   *
   * If rate-limiting is Redis-backed and fails open, we expect 202.
   * If rate-limiting fails closed we accept 429 but NOT 500/503.
   *
   * Flow:
   *  1. Stop Redis
   *  2. POST /v1/events → expect 202 or 429 (not 500/503)
   *  3. Start Redis
   */
  test.fixme('event ingestion continues (202 or 429) when Redis is down', async ({ request }) => {
    // Obtain token while Redis is still up
    const merchantToken = await getMerchantToken(request);

    stopRedis();
    await sleep(2000);

    try {
      const eventId  = generateEventId();
      const response = await request.post(`${EVENT_URL}/v1/events`, {
        headers: {
          Authorization:  `Bearer ${merchantToken}`,
          'X-Merchant-ID': TEST_MERCHANT.merchantId,
        },
        data: {
          events: [
            {
              merchantId: TEST_MERCHANT.merchantId,
              deviceId:   `chaos-device-${Date.now()}`,
              sessionId:  `sess-chaos-${Date.now()}`,
              type:       'PAYMENT',
              payload:    { amount: 10, currency: 'TRY' },
              eventId,
            },
          ],
        },
      });

      // Must not return 500 or 503 — those indicate a hard service crash
      expect([202, 429]).toContain(response.status());
    } finally {
      startRedis();
    }
  });

  /**
   * After Redis is restarted the system must recover within 30 seconds.
   * Recovery means admin endpoints return 200 again for a valid token.
   *
   * Flow:
   *  1. Obtain admin token (Redis up)
   *  2. Stop Redis
   *  3. Start Redis
   *  4. Poll GET /v1/admin/merchants until 200 (max 30 s)
   */
  test.fixme('system recovers within 30s after Redis restart', async ({ request }) => {
    const adminToken = await getAdminToken(request);

    // Disrupt and immediately restore
    stopRedis();
    await sleep(1000);
    startRedis();

    // Wait for the service to reconnect and return 200
    await waitForStatus(
      `${AUTH_URL}/v1/admin/merchants`,
      200,
      { Authorization: `Bearer ${adminToken}` },
      30_000,
      1_000,
    );

    // Final assertion — should already pass due to waitForStatus
    const status = await probeStatus(
      `${AUTH_URL}/v1/admin/merchants`,
      { Authorization: `Bearer ${adminToken}` },
    );
    expect(status).toBe(200);
  });

  /**
   * Health endpoint must remain responsive even when Redis is down.
   * GET /health on the auth-service should return 200 (or 503 with a body
   * indicating degraded mode) — it must not time out or crash.
   *
   * This verifies the health check doesn't hard-depend on Redis.
   */
  test.fixme('health endpoint responds during Redis outage', async () => {
    stopRedis();
    await sleep(2000);

    try {
      const status = await probeStatus(`${AUTH_URL}/health`);
      // 200 = healthy, 503 = degraded — both indicate the process is alive
      expect([200, 503]).toContain(status);
    } finally {
      startRedis();
    }
  });

  /**
   * Edge case: multiple rapid stop/start cycles must not leave the auth-service
   * in a permanently broken state.  After 3 flap cycles the service must
   * recover and serve 200 within 30 s.
   */
  test.fixme('service survives rapid Redis flapping (3 cycles) and recovers', async ({ request }) => {
    const adminToken = await getAdminToken(request);

    for (let cycle = 0; cycle < 3; cycle++) {
      stopRedis();
      await sleep(500);
      startRedis();
      await sleep(500);
    }

    // Final recovery check
    await waitForStatus(
      `${AUTH_URL}/v1/admin/merchants`,
      200,
      { Authorization: `Bearer ${adminToken}` },
      30_000,
      1_000,
    );

    const status = await probeStatus(
      `${AUTH_URL}/v1/admin/merchants`,
      { Authorization: `Bearer ${adminToken}` },
    );
    expect(status).toBe(200);
  });
});
