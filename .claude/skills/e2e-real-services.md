# Skill: e2e-real-services

## Metadata
| Key | Value |
|-----|-------|
| **Agent Types** | QA |
| **Category** | testing |
| **Dependencies** | docker-compose-e2e |

## Description
Writing Playwright E2E tests that run against real SignalRisk microservices (not mocks). These tests exercise the full request path — auth-service → event-collector → decision-service → case-service — using actual HTTP calls over the service ports. Tests are marked `test.fixme` until all dependent services are seeded and available in CI.

## Patterns

### webServer configuration
Use `playwright.config.real.ts` (separate from the mock-backed `playwright.config.ts`) to point `testDir` at `tests/e2e/scenarios/`. The `webServer` block starts Docker Compose and waits for `http://localhost:3001/health` before running tests. Set `SKIP_DOCKER=1` to bypass Docker startup when services are already running locally.

```typescript
webServer: process.env.SKIP_DOCKER ? undefined : {
  command: 'docker compose -f ../../docker-compose.full.yml up --wait',
  url: 'http://localhost:3001/health',
  timeout: 120_000,
  reuseExistingServer: !process.env.CI,
},
```

### Auth helper (JWT acquisition)
Obtain a JWT via the `client_credentials` grant against `/v1/auth/token`. Keep this as a standalone async function (not a fixture) so it can be called inside `test.fixme` bodies and re-used across describe blocks.

```typescript
async function getToken(
  request: APIRequestContext,
  credentials: { clientId: string; clientSecret: string },
): Promise<string> {
  const response = await request.post(`${AUTH_URL}/v1/auth/token`, {
    data: {
      grant_type: 'client_credentials',
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
    },
  });
  if (!response.ok()) {
    throw new Error(`getToken failed: HTTP ${response.status()} — ${await response.text()}`);
  }
  const body = await response.json();
  return body.access_token as string;
}
```

The auth-service endpoint is `POST /v1/auth/token` (not `/login`). It returns `{ access_token, token_type, expires_in, refresh_token }`.

### test.fixme vs test.skip
- `test.fixme` — test is intentionally broken because real services are not yet seeded/available. The test body is compiled and visible in the Playwright HTML report as "fixme". Use this for tests that are correctly implemented but depend on running infrastructure.
- `test.skip` — test is skipped unconditionally and its body is not reported. Use for tests that are not yet implemented at all.
- `test.todo` — test has no body; used for pure placeholder skeletons in sprint planning files.

Rule: skeleton files in `scenarios/` use `test.todo`. Files with real assertion logic that depend on live services use `test.fixme`.

### Request interception / poll-wait pattern
Real services process events asynchronously via Kafka. Use `expect.poll` to retry assertions until the downstream service catches up, rather than fixed `setTimeout` sleeps.

```typescript
// Poll until a BLOCK decision appears, max 15 s
const blockDecisions = await expect.poll(
  async () => {
    const resp = await request.get(
      `${DECISION_URL}/v1/decisions?fingerprint=${fingerprint}&merchantId=${merchantId}`,
      { headers: { Authorization: `Bearer ${jwt}` } },
    );
    const body = await resp.json();
    return (body.decisions ?? []).filter((d: { action: string }) => d.action === 'BLOCK');
  },
  { timeout: 15_000, intervals: [500, 1000, 2000, 3000] },
).toSatisfy((blocks: unknown[]) => blocks.length > 0);
```

### CI vs local differences
| Concern | Local | CI |
|---------|-------|----|
| `retries` | 0 | 2 |
| `workers` | 4 | 2 |
| `reuseExistingServer` | `true` | `false` |
| `SKIP_DOCKER` | set to `1` when stack already running | unset (Docker starts fresh) |
| `webServer` | optional (skip with `SKIP_DOCKER`) | always starts Docker Compose |

Environment variables consumed by scenarios:
- `AUTH_URL` — defaults to `http://localhost:3001`
- `CASES_URL` — defaults to `http://localhost:3010`
- `EVENT_URL` — defaults to `http://localhost:3002`
- `DECISION_URL` — defaults to `http://localhost:3009`
- `E2E_BASE_URL` — overrides `baseURL` in `use` config

## Code Examples

### getToken helper
```typescript
import type { APIRequestContext } from '@playwright/test';

const AUTH_URL = process.env.AUTH_URL ?? 'http://localhost:3001';

async function getToken(
  request: APIRequestContext,
  credentials: { clientId: string; clientSecret: string },
): Promise<string> {
  const response = await request.post(`${AUTH_URL}/v1/auth/token`, {
    data: {
      grant_type: 'client_credentials',
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
    },
  });
  if (!response.ok()) {
    throw new Error(`getToken failed: HTTP ${response.status()}`);
  }
  return ((await response.json()) as { access_token: string }).access_token;
}
```

### request fixture pattern
Playwright's built-in `request` fixture provides an `APIRequestContext` scoped to the test. No extra setup needed — just destructure it from the test callback:

```typescript
test.fixme('my api test', async ({ request }) => {
  const token = await getToken(request, MERCHANT_A);
  const resp = await request.get(`${CASES_URL}/v1/cases`, {
    headers: { Authorization: `Bearer ${token}`, 'X-Merchant-ID': MERCHANT_A.merchantId },
  });
  expect(resp.status()).toBe(200);
});
```

### waitForResponse pattern (page-based tests)
When testing dashboard UI flows that trigger API calls, intercept the network response:

```typescript
test('dashboard loads KPI data', async ({ page }) => {
  const kpiPromise = page.waitForResponse(
    (resp) => resp.url().includes('/v1/analytics/kpi') && resp.status() === 200,
  );
  await page.goto('/');
  const kpiResp = await kpiPromise;
  const body = await kpiResp.json();
  expect(body).toHaveProperty('blockRate');
});
```

### Multi-tenant isolation pattern
Always pair the JWT with the matching `X-Merchant-ID` header. A JWT for merchant-001 with `X-Merchant-ID: merchant-002` triggers a 403 from TenantMiddleware.

```typescript
// Correct — headers match JWT sub
await request.get(`${CASES_URL}/v1/cases`, {
  headers: {
    Authorization: `Bearer ${tokenA}`,   // JWT sub = merchant-001
    'X-Merchant-ID': 'merchant-001',     // matches
  },
});

// Wrong — triggers 403
await request.get(`${CASES_URL}/v1/cases`, {
  headers: {
    Authorization: `Bearer ${tokenA}`,   // JWT sub = merchant-001
    'X-Merchant-ID': 'merchant-002',     // mismatch → 403
  },
});
```
