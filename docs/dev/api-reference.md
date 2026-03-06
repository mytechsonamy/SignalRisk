# API Reference

Base URL: `https://api.signalrisk.io`

All endpoints accept and return `application/json` unless noted otherwise. Timestamps are ISO 8601. Error responses follow the NestJS standard format: `{ statusCode, message, error }`.

---

## Authentication

Most endpoints require a JWT access token or an API key in the `Authorization` header.

- **JWT**: `Authorization: Bearer <access_token>`
- **API Key**: `Authorization: ApiKey <sk_test_...>` or `Authorization: Bearer <sk_test_...>`

---

## Auth Endpoints

### POST /v1/auth/token

Issue a JWT access token using OAuth2 grant types.

**Request body:**

```typescript
interface TokenRequest {
  grant_type: 'client_credentials' | 'refresh_token';
  // For client_credentials:
  client_id?: string;
  client_secret?: string;
  // For refresh_token:
  refresh_token?: string;
  // For password (not yet enabled):
  username?: string;
  password?: string;
  merchant_id?: string;
}
```

**Response:**

```typescript
interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;        // seconds
  refresh_token?: string;
}
```

**Error codes:**

| Code | Reason |
|------|--------|
| 400 | Missing required fields for the requested grant type |
| 401 | Invalid `client_id` / `client_secret` |

**Rate limit:** 10 requests per 60 seconds.

---

### POST /v1/auth/token/refresh

Refresh an access token using a refresh token.

**Request body:**

```typescript
interface RefreshTokenRequest {
  refresh_token: string;
}
```

**Response:** Same as `POST /v1/auth/token`.

**Error codes:**

| Code | Reason |
|------|--------|
| 401 | Invalid or expired refresh token |

---

### POST /v1/auth/token/revoke

Revoke a refresh token (RFC 7009).

**Request body:**

```typescript
interface RevokeTokenRequest {
  token: string;
  token_type_hint?: 'refresh_token' | 'access_token';
}
```

**Response:** `200 OK` with no body.

---

### POST /v1/auth/token/introspect

Introspect a token to check validity and claims (RFC 7662).

**Request body:**

```typescript
interface IntrospectRequest {
  token: string;
  token_type_hint?: 'refresh_token' | 'access_token';
}
```

**Response:**

```typescript
interface IntrospectResponse {
  active: boolean;
  sub?: string;       // merchant ID
  exp?: number;       // Unix timestamp
  iat?: number;
  scope?: string;
}
```

---

### GET /.well-known/jwks.json

Returns the JWKS (JSON Web Key Set) for RS256 signature verification. Keys are rotated on demand.

**Auth:** None required.

---

## Events Endpoint

### POST /v1/events

Ingest one or more events for fraud signal processing.

**Auth:** `Authorization: Bearer <sk_test_...>` or `Authorization: ApiKey <sk_test_...>`

**Request body:**

```typescript
interface IngestEventsRequest {
  events: CreateEventDto[];
}

interface CreateEventDto {
  merchantId: string;
  deviceId?: string;
  sessionId?: string;
  type: string;          // EventType string e.g. 'PAGE_VIEW', 'CHECKOUT'
  payload: Record<string, unknown>;
}
```

**Response (202 Accepted):**

```typescript
interface IngestEventsResponse {
  status: 'accepted';
  accepted: number;
  rejected: number;
  results: Array<{ id: string; status: string }>;
}
```

**Error codes:**

| Code | Reason |
|------|--------|
| 400 | Empty events array or schema validation failure |
| 401 | Missing or invalid `Authorization` header |
| 429 | Rate limit exceeded — see `Retry-After` header |

**Rate limit:** 100 requests per minute per merchant. Backpressure is enforced by the `BackpressureGuard` which monitors Kafka queue depth.

---

## Decisions Endpoint

### POST /v1/decisions

Request a fraud decision for a transaction or entity. Results are idempotent within the cache TTL when the same `requestId` is submitted.

**Auth:** `Authorization: Bearer <access_token>`

**Headers:**

| Header | Description |
|--------|-------------|
| `X-Request-ID` | Optional idempotency key. Identical `requestId` values return the cached result. |

**Request body:**

```typescript
interface DecisionRequest {
  requestId: string;      // idempotency key (UUID)
  merchantId: string;
  deviceId?: string;
  sessionId?: string;
  entityId: string;       // userId or transactionId
  ip?: string;
  msisdn?: string;
  billingCountry?: string;
  amount?: number;
}
```

**Response (202 Accepted):**

```typescript
interface DecisionResult {
  requestId: string;
  merchantId: string;
  action: 'ALLOW' | 'REVIEW' | 'BLOCK';
  riskScore: number;          // 0–100, higher = riskier
  riskFactors: RiskFactor[];
  appliedRules: string[];     // rule IDs that matched
  latencyMs: number;
  cached: boolean;
  createdAt: string;          // ISO 8601
}

interface RiskFactor {
  signal: string;             // e.g. 'device.trustScore'
  value: number | boolean | string;
  contribution: number;       // 0–100
  description: string;
}
```

**Response headers:**

| Header | Description |
|--------|-------------|
| `X-Request-ID` | Echoed from request header or body `requestId` |
| `X-Latency-Ms` | Total decision latency in milliseconds |

**Error codes:**

| Code | Reason |
|------|--------|
| 400 | Missing required fields |
| 401 | Unauthorized |

---

## Cases Endpoints

### GET /v1/cases

List fraud cases for a merchant with optional filtering.

**Auth:** `Authorization: Bearer <access_token>`

**Query parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `merchantId` | string | Yes | Filter by merchant |
| `status` | string | No | `OPEN`, `IN_REVIEW`, `RESOLVED`, `ESCALATED` |
| `priority` | string | No | `HIGH`, `MEDIUM`, `LOW` |
| `assignedTo` | string | No | Analyst email |
| `search` | string | No | Search by `entityId` |
| `slaBreached` | boolean | No | Filter by SLA breach status |
| `page` | number | No | Page number (default: 1) |
| `limit` | number | No | Page size (default: 20, max: 100) |

**Response (200 OK):**

```typescript
interface ListCasesResponse {
  cases: Case[];
  total: number;
  page: number;
}
```

---

### GET /v1/cases/:id

Retrieve a single fraud case by ID.

**Auth:** `Authorization: Bearer <access_token>`

**Query parameters:** `merchantId` (required)

**Response (200 OK):** Full case object including `evidenceTimeline`.

**Error codes:** `404` if the case is not found or does not belong to the merchant.

---

### PATCH /v1/cases/:id

Update a case's status, assignment, or resolution.

**Auth:** `Authorization: Bearer <access_token>`

**Query parameters:** `merchantId` (required)

**Request body:**

```typescript
interface UpdateCaseDto {
  status?: 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'ESCALATED';
  resolution?: string;
  assignedTo?: string;
}
```

**Response (200 OK):** Updated case record.

---

### POST /v1/cases/bulk

Perform a bulk action on multiple cases.

**Auth:** `Authorization: Bearer <access_token>`

**Query parameters:** `merchantId` (required)

**Request body:**

```typescript
interface BulkActionDto {
  ids: string[];
  action: 'RESOLVE' | 'ESCALATE' | 'ASSIGN';
  assignedTo?: string;   // required when action is 'ASSIGN'
}
```

**Response (200 OK):**

```typescript
interface BulkActionResult {
  updated: string[];     // case IDs that were modified
}
```

---

### GET /v1/cases/export

Export all cases for a specific entity (GDPR Article 15 data subject access).

**Query parameters:** `merchantId` (required), `entityId` (required)

**Response (200 OK):** Array of case objects.

---

## Merchants Endpoints

### POST /merchants

Create a new merchant account. Returns the generated `client_id` and `client_secret` — store the secret securely as it is not retrievable after this call.

**Auth:** Admin credentials required.

**Request body:**

```typescript
interface CreateMerchantDto {
  name: string;
  roles?: string[];
}
```

**Response (201 Created):**

```typescript
interface MerchantCreatedResponse {
  id: string;
  name: string;
  client_id: string;
  client_secret: string;   // only returned at creation
  roles: string[];
  active: boolean;
  createdAt: string;
}
```

---

### GET /merchants/:id

Retrieve a merchant by ID. The `client_secret` hash is never returned.

**Response (200 OK):** Merchant record (without `clientSecretHash`).

---

### POST /merchants/:id/rotate-secret

Rotate the client secret for a merchant. Returns the new `client_id` and `client_secret`.

**Response (200 OK):** New credentials.

---

### POST /merchants/:id/deactivate

Deactivate a merchant account.

**Response (200 OK):** `{ status: 'deactivated' }`

---

### POST /merchants/:id/activate

Reactivate a merchant account.

**Response (200 OK):** `{ status: 'activated' }`

---

## Webhook Payload

SignalRisk delivers POST requests to your configured webhook URL after each decision.

### Payload format

```typescript
interface WebhookPayload {
  decisionId: string;
  merchantId: string;
  entityId: string;
  action: 'ALLOW' | 'REVIEW' | 'BLOCK';
  riskScore: number;        // 0–100
  firedRuleIds: string[];
  timestamp: string;        // ISO 8601
}
```

### Signature verification

Every webhook request includes an `X-SignalRisk-Signature` header containing an HMAC-SHA256 signature:

```
X-SignalRisk-Signature: sha256={hex_digest}
```

Verify the signature before processing the payload:

```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  return `sha256=${expected}` === signature;
}
```

### Retry policy

Webhooks are retried on non-2xx responses with exponential backoff: 1s, 4s, 16s.

---

## Common Error Codes

| HTTP Code | Meaning |
|-----------|---------|
| 400 | Bad Request — invalid body or missing required fields |
| 401 | Unauthorized — missing or invalid credentials |
| 404 | Not Found — resource does not exist or is not accessible |
| 429 | Too Many Requests — rate limit exceeded; check `Retry-After` header |
| 500 | Internal Server Error — contact support with `X-Request-ID` |
