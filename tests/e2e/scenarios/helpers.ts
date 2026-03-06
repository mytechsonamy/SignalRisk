/**
 * SignalRisk E2E — Shared test helpers
 *
 * Import these into every scenario file instead of duplicating URL constants,
 * credential fixtures, and utility functions.
 */

import { execSync } from 'child_process';
import type { APIRequestContext } from '@playwright/test';

// ---------------------------------------------------------------------------
// Service base URLs — override via environment variables in CI
// ---------------------------------------------------------------------------

export const AUTH_URL     = process.env.AUTH_URL     ?? 'http://localhost:3001';
export const EVENT_URL    = process.env.EVENT_URL    ?? 'http://localhost:3002';
export const DECISION_URL = process.env.DECISION_URL ?? 'http://localhost:3009';
export const CASE_URL     = process.env.CASE_URL     ?? 'http://localhost:3010';

// ---------------------------------------------------------------------------
// Dev fixture credentials (must match docker-compose seed / test DB fixtures)
// ---------------------------------------------------------------------------

/** Standard low-risk merchant used across happy-path and fraud-blast tests. */
export const TEST_MERCHANT = {
  clientId:   'test-merchant-001',
  clientSecret: 'test-secret-001',
  merchantId: 'merchant-001',
  /** Valid sk_test_ API key seeded in the dev environment. */
  apiKey: ('sk_test_' + 'a'.repeat(32)) as string,
} as const;

/** Admin account used for JWT-revoke and chaos tests. */
export const TEST_ADMIN = {
  clientId:   'admin',
  clientSecret: 'admin-secret',
} as const;

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

/**
 * Obtain a JWT access token for the default test merchant via the
 * client_credentials grant.
 *
 * POST /v1/auth/token
 * Body: { grant_type: 'client_credentials', client_id, client_secret }
 * Response: { access_token, token_type, expires_in, refresh_token }
 */
export async function getMerchantToken(request: APIRequestContext): Promise<string> {
  const response = await request.post(`${AUTH_URL}/v1/auth/token`, {
    data: {
      grant_type:    'client_credentials',
      client_id:     TEST_MERCHANT.clientId,
      client_secret: TEST_MERCHANT.clientSecret,
    },
  });

  if (!response.ok()) {
    throw new Error(
      `getMerchantToken failed: HTTP ${response.status()} — ${await response.text()}`,
    );
  }

  const body = (await response.json()) as { access_token: string };
  return body.access_token;
}

/**
 * Obtain a JWT access token for an arbitrary merchant using explicit credentials.
 * Used by multi-tenant isolation tests to authenticate as different merchants.
 *
 * @param request     Playwright APIRequestContext
 * @param credentials Merchant credentials: { clientId, clientSecret }
 */
export async function getMerchantTokenFor(
  request: APIRequestContext,
  credentials: { clientId: string; clientSecret: string },
): Promise<string> {
  const response = await request.post(`${AUTH_URL}/v1/auth/token`, {
    data: {
      grant_type:    'client_credentials',
      client_id:     credentials.clientId,
      client_secret: credentials.clientSecret,
    },
  });

  if (!response.ok()) {
    throw new Error(
      `getMerchantTokenFor(${credentials.clientId}) failed: HTTP ${response.status()} — ${await response.text()}`,
    );
  }

  const body = (await response.json()) as { access_token: string };
  return body.access_token;
}

/**
 * Obtain a JWT access token for the admin account via the client_credentials grant.
 *
 * The resulting token carries role=admin in its claims and passes AdminGuard checks.
 */
export async function getAdminToken(request: APIRequestContext): Promise<string> {
  const response = await request.post(`${AUTH_URL}/v1/auth/token`, {
    data: {
      grant_type:    'client_credentials',
      client_id:     TEST_ADMIN.clientId,
      client_secret: TEST_ADMIN.clientSecret,
    },
  });

  if (!response.ok()) {
    throw new Error(
      `getAdminToken failed: HTTP ${response.status()} — ${await response.text()}`,
    );
  }

  const body = (await response.json()) as { access_token: string };
  return body.access_token;
}

// ---------------------------------------------------------------------------
// Docker CLI helper
// ---------------------------------------------------------------------------

/**
 * Execute a Docker CLI command synchronously from the repository root.
 *
 * Used by chaos tests to stop/start containers (e.g. `docker compose stop redis`).
 * Throws if Docker CLI is unavailable or the command exits with a non-zero code.
 *
 * Container naming convention:
 *   - compose project prefix: `signalrisk`
 *   - Redis container name:   `signalrisk-redis-1`
 *
 * @param cmd Shell command string to execute (e.g. `docker compose -f docker-compose.full.yml stop redis`)
 */
export function execDockerCommand(cmd: string): void {
  execSync(cmd, {
    cwd: process.cwd(),
    stdio: 'pipe',
  });
}

// ---------------------------------------------------------------------------
// Decision polling helper
// ---------------------------------------------------------------------------

/**
 * Poll POST /v1/decisions on the decision-service until the requestId is found
 * in the idempotency cache (202 with a cached: true result) or until
 * maxAttempts is exhausted.
 *
 * Decision service exposes:
 *   POST /v1/decisions  { requestId, merchantId, entityId, ... } → DecisionResult
 *
 * Because the pipeline is async (event-collector → Kafka → decision-service),
 * we re-submit an idempotent request body; the second call returns the cached
 * result once the pipeline has settled.
 *
 * @param request       Playwright APIRequestContext
 * @param requestId     The idempotency key / event ID used when ingesting
 * @param token         Bearer token for the decision-service
 * @param maxAttempts   How many times to retry before throwing (default 20)
 * @param intervalMs    Polling interval in milliseconds (default 200)
 */
export async function pollDecision(
  request: APIRequestContext,
  requestId: string,
  token: string,
  maxAttempts = 20,
  intervalMs = 200,
): Promise<{
  requestId: string;
  merchantId: string;
  action: 'ALLOW' | 'REVIEW' | 'BLOCK';
  riskScore: number;
  riskFactors: unknown[];
  appliedRules: string[];
  latencyMs: number;
  cached: boolean;
  createdAt: string;
}> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await request.post(`${DECISION_URL}/v1/decisions`, {
      headers: {
        Authorization:  `Bearer ${token}`,
        'X-Merchant-ID': TEST_MERCHANT.merchantId,
        'X-Request-ID':  requestId,
      },
      data: {
        requestId,
        merchantId: TEST_MERCHANT.merchantId,
        entityId:   requestId, // echo the event id as entity id for polling
      },
    });

    if (response.status() === 202) {
      return response.json();
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  throw new Error(
    `pollDecision timed out after ${maxAttempts} attempts for requestId=${requestId}`,
  );
}

// ---------------------------------------------------------------------------
// Miscellaneous utilities
// ---------------------------------------------------------------------------

/**
 * Generate a unique event ID safe to use as both the Playwright test event ID
 * and the decision-service requestId (idempotency key).
 */
export function generateEventId(): string {
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Sleep for the given number of milliseconds.
 * Useful for chaos tests that need to wait for Docker container restarts.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
