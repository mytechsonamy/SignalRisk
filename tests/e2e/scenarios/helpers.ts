/**
 * SignalRisk E2E — Shared test helpers
 *
 * Import these into every scenario file instead of duplicating URL constants,
 * credential fixtures, and utility functions.
 */

import { execSync } from 'child_process';
import * as crypto from 'crypto';
import * as path from 'path';
import type { APIRequestContext } from '@playwright/test';

// ---------------------------------------------------------------------------
// Service base URLs — override via environment variables in CI
// ---------------------------------------------------------------------------

export const AUTH_URL     = process.env.AUTH_URL     ?? 'http://localhost:3001';
export const EVENT_URL    = process.env.EVENT_URL    ?? 'http://localhost:3002';
export const DECISION_URL = process.env.DECISION_URL ?? 'http://localhost:3009';
export const CASE_URL     = process.env.CASE_URL     ?? 'http://localhost:3010';
export const VELOCITY_URL = process.env.VELOCITY_URL ?? 'http://localhost:3004';

// ---------------------------------------------------------------------------
// Dev fixture credentials (must match docker-compose seed / test DB fixtures)
// ---------------------------------------------------------------------------

/** Standard low-risk merchant used across happy-path and fraud-blast tests. */
export const TEST_MERCHANT = {
  clientId:   'test-merchant-001',
  clientSecret: 'test-secret-001',
  merchantId: '00000000-0000-0000-0000-000000000001',
  /** Valid sk_test_ API key configured in docker-compose ALLOWED_API_KEYS. */
  apiKey: 'sk_test_00000000000000000000000000000001',
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
    cwd: path.resolve(__dirname, '..', '..', '..'),
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
  /** Override entityId for velocity lookup (default: requestId). Pass deviceId for velocity-based tests. */
  entityId?: string,
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
        entityId:   entityId ?? requestId,
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
// Event ingestion helper (uses API key, not JWT)
// ---------------------------------------------------------------------------

/**
 * Ingest a single event via the event-collector using the API key.
 * The event-collector validates API keys (sk_test_...), not JWTs.
 */
export async function ingestEvent(
  request: APIRequestContext,
  overrides: Partial<{
    eventId: string;
    deviceId: string;
    sessionId: string;
    merchantId: string;
    type: string;
    payload: Record<string, unknown>;
    ipAddress: string;
    apiKey: string;
  }> = {},
): Promise<{ status: number; body: unknown }> {
  const response = await request.post(`${EVENT_URL}/v1/events`, {
    headers: {
      Authorization:  `Bearer ${overrides.apiKey ?? TEST_MERCHANT.apiKey}`,
      'X-Merchant-ID': overrides.merchantId ?? TEST_MERCHANT.merchantId,
    },
    data: {
      events: [
        {
          merchantId: overrides.merchantId ?? TEST_MERCHANT.merchantId,
          deviceId:   overrides.deviceId   ?? 'safe-device-xyz',
          sessionId:  overrides.sessionId  ?? `sess-${Date.now()}`,
          type:       overrides.type       ?? 'PAYMENT',
          payload:    overrides.payload    ?? { amount: 50, currency: 'TRY', paymentMethod: 'credit_card' },
          ipAddress:  overrides.ipAddress  ?? '1.2.3.4',
          eventId:    overrides.eventId,
        },
      ],
    },
  });

  return { status: response.status(), body: await response.json().catch(() => null) };
}

// ---------------------------------------------------------------------------
// Miscellaneous utilities
// ---------------------------------------------------------------------------

/**
 * Generate a unique event ID safe to use as both the Playwright test event ID
 * and the decision-service requestId (idempotency key).
 */
export function generateEventId(): string {
  return crypto.randomUUID();
}

/**
 * Sleep for the given number of milliseconds.
 * Useful for chaos tests that need to wait for Docker container restarts.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Closed-loop test helpers
// ---------------------------------------------------------------------------

/**
 * Poll case-service until at least one case appears for the given search term
 * (typically an entityId or deviceId).
 *
 * GET /v1/cases?merchantId=...&search=<term>
 */
export async function pollForCase(
  request: APIRequestContext,
  token: string,
  searchTerm: string,
  maxAttempts = 15,
  intervalMs = 2000,
): Promise<{
  id: string;
  entityId: string;
  entityType?: string;
  action: string;
  status: string;
  merchantId: string;
  riskScore: number;
  resolution: string | null;
}> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await request.get(`${CASE_URL}/v1/cases`, {
      headers: {
        Authorization:  `Bearer ${token}`,
        'X-Merchant-ID': TEST_MERCHANT.merchantId,
      },
      params: {
        merchantId: TEST_MERCHANT.merchantId,
        search:     searchTerm,
      },
    });

    if (response.ok()) {
      const body = (await response.json()) as {
        cases?: Array<Record<string, unknown>>;
      };
      const cases = body.cases ?? [];
      if (cases.length > 0) return cases[0] as ReturnType<typeof pollForCase> extends Promise<infer T> ? T : never;
    }

    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  throw new Error(`pollForCase timed out after ${maxAttempts} attempts for search=${searchTerm}`);
}

/**
 * Resolve a case via PATCH /v1/cases/{id}?merchantId=...
 *
 * Used by closed-loop tests to trigger label publishing → watchlist updates.
 */
export async function resolveCase(
  request: APIRequestContext,
  token: string,
  caseId: string,
  resolution: 'FRAUD' | 'LEGITIMATE' | 'INCONCLUSIVE',
  notes = 'E2E closed-loop test resolution',
): Promise<Record<string, unknown>> {
  const response = await request.patch(
    `${CASE_URL}/v1/cases/${caseId}`,
    {
      headers: {
        Authorization:  `Bearer ${token}`,
        'X-Merchant-ID': TEST_MERCHANT.merchantId,
      },
      params: { merchantId: TEST_MERCHANT.merchantId },
      data: {
        status:          'RESOLVED',
        resolution,
        resolutionNotes: notes,
      },
    },
  );

  if (!response.ok()) {
    throw new Error(
      `resolveCase(${caseId}, ${resolution}) failed: HTTP ${response.status()} — ${await response.text()}`,
    );
  }

  return response.json();
}

/**
 * Run a SQL query against the signalrisk PostgreSQL container.
 * Returns the raw stdout (tab-aligned, no headers).
 *
 * Used by closed-loop tests to verify side-effect state that isn't exposed via HTTP
 * (watchlist_entries, entity_profiles, decision_feature_snapshots).
 */
export function queryPostgres(sql: string): string {
  return execSync(
    `docker exec signalrisk-postgres psql -U signalrisk -d signalrisk -tAc "${sql.replace(/"/g, '\\"')}"`,
    {
      cwd:      path.resolve(__dirname, '..', '..', '..'),
      encoding: 'utf8',
      timeout:  10_000,
    },
  ).trim();
}

/**
 * Send a burst of events from the same device to trigger velocity rules.
 * Returns after all events are ingested (does not wait for decisions).
 *
 * Events are sent in batches of 5 with 200ms gaps and individual 429 retries
 * to handle backpressure from the rate adjuster after heavy test projects.
 */
export async function blastEventsFromDevice(
  request: APIRequestContext,
  deviceId: string,
  count: number,
  overrides: Partial<{ ipAddress: string; customerId: string; type: string }> = {},
): Promise<number[]> {
  const statuses: number[] = [];
  const BATCH_SIZE = 5;
  const BATCH_GAP_MS = 200;
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 1000;

  for (let batchStart = 0; batchStart < count; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, count);
    const batchPromises = Array.from(
      { length: batchEnd - batchStart },
      async (_, j) => {
        const i = batchStart + j;
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          const response = await request.post(`${EVENT_URL}/v1/events`, {
            headers: {
              Authorization:  `Bearer ${TEST_MERCHANT.apiKey}`,
              'X-Merchant-ID': TEST_MERCHANT.merchantId,
            },
            data: {
              events: [
                {
                  merchantId: TEST_MERCHANT.merchantId,
                  deviceId,
                  sessionId:  `sess-blast-${deviceId}-${i}`,
                  type:       overrides.type ?? 'PAYMENT',
                  payload:    { amount: 100 + i, currency: 'TRY', paymentMethod: 'credit_card' },
                  ipAddress:  overrides.ipAddress ?? '5.6.7.8',
                  eventId:    crypto.randomUUID(),
                  ...(overrides.customerId ? { customerId: overrides.customerId } : {}),
                },
              ],
            },
          });
          const status = response.status();
          if (status !== 429 || attempt === MAX_RETRIES) return status;
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
        }
        return 429; // fallback
      },
    );
    const batchStatuses = await Promise.all(batchPromises);
    statuses.push(...batchStatuses);
    if (batchStart + BATCH_SIZE < count) {
      await new Promise((r) => setTimeout(r, BATCH_GAP_MS));
    }
  }
  return statuses;
}

/**
 * Wait until velocity-service reports tx_count_1h above the given threshold
 * for the specified entity.
 */
export async function waitForVelocity(
  request: APIRequestContext,
  entityId: string,
  threshold = 10,
  maxAttempts = 30,
  intervalMs = 1000,
): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(intervalMs);
    const resp = await request.get(
      `${VELOCITY_URL}/v1/velocity/${encodeURIComponent(entityId)}`,
      { headers: { 'X-Merchant-ID': TEST_MERCHANT.merchantId } },
    );
    if (resp.ok()) {
      const body = (await resp.json()) as { signals?: { tx_count_1h?: number } };
      if ((body.signals?.tx_count_1h ?? 0) > threshold) return true;
    }
  }
  return false;
}
