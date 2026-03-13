# SignalRisk Integration Guide

Version: 1.0.0
Date: 2026-03-13

This guide walks you through integrating your application with the SignalRisk fraud detection platform — from merchant onboarding to receiving real-time fraud decisions via webhooks.

**Audience:** Backend engineers, frontend developers, and technical leads integrating SignalRisk into a merchant application.

---

## Table of Contents

1. [Integration Overview](#1-integration-overview)
2. [Onboarding & Credentials](#2-onboarding--credentials)
3. [Authentication](#3-authentication)
4. [Event Ingestion API](#4-event-ingestion-api)
5. [Decision API](#5-decision-api)
6. [Webhook Consumption](#6-webhook-consumption)
7. [Case Management API](#7-case-management-api)
8. [Client SDKs](#8-client-sdks)
9. [Rate Limiting & Backpressure](#9-rate-limiting--backpressure)
10. [Error Handling](#10-error-handling)
11. [Test Traffic Isolation](#11-test-traffic-isolation)
12. [Security Checklist](#12-security-checklist)
13. [Deployment Checklist](#13-deployment-checklist)

---

## 1. Integration Overview

SignalRisk runs as an asynchronous event-driven pipeline. The typical flow:

```
Your App                  SignalRisk                          Your Backend
  |                          |                                    |
  |-- POST /v1/events ----->|  (API key auth, 202 Accepted)      |
  |   [user actions]        |                                    |
  |                         |-- score event (5 signals)          |
  |                         |-- evaluate 21 DSL rules            |
  |                         |-- check watchlist + memory         |
  |                         |                                    |
  |                         |-- Webhook: decision.block -------->|
  |                         |   (HMAC-SHA256 signed)             |
  |                         |                                    |
  |-- POST /v1/decisions -->|  (JWT auth, returns decision)      |
  |   [optional poll]       |                                    |
```

**Two integration patterns:**

| Pattern | When to Use | Auth |
|---------|-------------|------|
| **Push (Webhook)** | Real-time alerts for BLOCK/REVIEW decisions | HMAC-SHA256 signature |
| **Pull (Decision API)** | On-demand decision lookup before critical actions | JWT Bearer token |

Most integrations use both: webhooks for real-time blocking + decision API for pre-checkout verification.

---

## 2. Onboarding & Credentials

### 2.1 Merchant Registration

Each merchant receives:

| Credential | Format | Purpose |
|-----------|--------|---------|
| Merchant ID | UUID (`00000000-0000-...`) | Tenant identifier for all API calls |
| API Key | `sk_test_<32 lowercase hex>` | Event ingestion authentication |
| Dashboard Credentials | Email + password | Case management, analytics, rule configuration |

### 2.2 Environment URLs

| Environment | Base URL | Purpose |
|-------------|----------|---------|
| Sandbox | `https://sandbox.signalrisk.io` | Integration testing (no real scoring) |
| Production | `https://api.signalrisk.io` | Live fraud detection |

### 2.3 Webhook Setup

Register your webhook endpoint in the merchant settings:

```json
{
  "url": "https://your-app.com/webhooks/signalrisk",
  "secret": "whsec_your_webhook_signing_secret"
}
```

Requirements:
- HTTPS only (TLS 1.2+)
- Must respond within 5 seconds
- Must return 2xx status on success

---

## 3. Authentication

SignalRisk uses **two separate auth mechanisms** — never mix them.

### 3.1 API Key Auth (Event Ingestion)

Used only for `POST /v1/events`.

```http
POST /v1/events HTTP/1.1
Host: api.signalrisk.io
Authorization: Bearer sk_test_00000000000000000000000000000001
Content-Type: application/json
```

Key format: `sk_test_` prefix + 32 lowercase hex characters.

### 3.2 JWT Auth (All Other APIs)

Used for decisions, cases, analytics, and admin endpoints.

**Step 1: Obtain token**

```http
POST /v1/auth/token HTTP/1.1
Content-Type: application/json

{
  "grant_type": "client_credentials",
  "client_id": "your-merchant-id",
  "client_secret": "sk_test_your_api_key"
}
```

**Response:**

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 900,
  "refresh_token": "rt_abc123..."
}
```

**Step 2: Use token**

```http
GET /v1/cases?merchantId=your-merchant-id HTTP/1.1
Authorization: Bearer eyJhbGciOiJSUzI1NiIs...
```

**Step 3: Refresh before expiry**

```http
POST /v1/auth/token/refresh HTTP/1.1
Content-Type: application/json

{
  "refresh_token": "rt_abc123..."
}
```

Token details:
- Algorithm: RS256 (asymmetric RSA)
- Access token TTL: 15 minutes
- JWKS endpoint: `GET /.well-known/jwks.json`

### 3.3 Dashboard Login (Analysts)

```http
POST /v1/auth/login HTTP/1.1
Content-Type: application/json

{
  "email": "analyst@your-company.com",
  "password": "your-password"
}
```

Returns access token + refresh token + user object with role.

---

## 4. Event Ingestion API

### 4.1 Send Events

```http
POST /v1/events HTTP/1.1
Authorization: Bearer sk_test_your_api_key
Content-Type: application/json

{
  "events": [
    {
      "merchantId": "your-merchant-id",
      "deviceId": "device-fingerprint-abc123",
      "sessionId": "session-uuid",
      "type": "PAYMENT",
      "payload": {
        "amount": 149.99,
        "currency": "USD",
        "paymentMethod": "card_not_present",
        "customerId": "cust_12345"
      },
      "ipAddress": "203.0.113.42",
      "userAgent": "Mozilla/5.0 ...",
      "pageUrl": "https://your-shop.com/checkout"
    }
  ]
}
```

### 4.2 Field Reference

**Required fields:**

| Field | Type | Description |
|-------|------|-------------|
| `merchantId` | string | Your merchant UUID |
| `deviceId` | string | Client-side device fingerprint |
| `sessionId` | string | Browser/app session identifier |
| `type` | enum | Event type (see below) |
| `payload` | object | Event-specific data |

**Optional fields:**

| Field | Type | Description |
|-------|------|-------------|
| `eventId` | UUID | Idempotency key (auto-generated if omitted) |
| `timestamp` | ISO 8601 | Event time (defaults to server time) |
| `ipAddress` | string | Client IP address |
| `userAgent` | string | Browser user agent |
| `pageUrl` | URI | Current page URL |
| `referrer` | URI | Referrer URL |

**Event types:**

| Type | When to Send |
|------|-------------|
| `PAGE_VIEW` | User views a page |
| `CLICK` | User clicks an interactive element |
| `FORM_SUBMIT` | User submits a form |
| `LOGIN` | User logs in |
| `SIGNUP` | New user registration |
| `PAYMENT` | Payment/checkout event |
| `CUSTOM` | Any custom business event |

**Payment payload fields:**

| Field | Type | Constraint |
|-------|------|-----------|
| `amount` | number | Transaction amount |
| `currency` | string | ISO 4217 (e.g., `USD`, `EUR`, `TRY`) |
| `paymentMethod` | enum | `card_present`, `card_not_present`, `mobile`, `web`, `api` |
| `customerId` | string | Your internal customer ID |

### 4.3 Batch Events

Send up to 100 events per request. The API processes each event independently:

```json
{
  "events": [
    { "merchantId": "...", "type": "PAGE_VIEW", ... },
    { "merchantId": "...", "type": "CLICK", ... },
    { "merchantId": "...", "type": "PAYMENT", ... }
  ]
}
```

### 4.4 Response

**Success (202 Accepted):**

```json
{
  "status": "accepted",
  "accepted": 3,
  "rejected": 0,
  "results": [
    { "eventId": "uuid-1", "accepted": true },
    { "eventId": "uuid-2", "accepted": true },
    { "eventId": "uuid-3", "accepted": true }
  ]
}
```

**Partial rejection:**

```json
{
  "status": "accepted",
  "accepted": 2,
  "rejected": 1,
  "results": [
    { "eventId": "uuid-1", "accepted": true },
    { "eventId": "uuid-2", "accepted": false, "reason": "validation_error" },
    { "eventId": "uuid-3", "accepted": true }
  ]
}
```

> **Always check `rejected > 0`** — the HTTP status is still 202 even with partial rejections.

---

## 5. Decision API

### 5.1 Request a Decision

```http
POST /v1/decisions HTTP/1.1
Authorization: Bearer eyJhbGciOiJSUzI1NiIs...
Content-Type: application/json

{
  "requestId": "unique-uuid-per-request",
  "merchantId": "your-merchant-id",
  "entityId": "cust_12345",
  "deviceId": "device-fingerprint-abc123",
  "sessionId": "session-uuid",
  "ip": "203.0.113.42",
  "amount": 149.99,
  "billingCountry": "US"
}
```

### 5.2 Response

```json
{
  "requestId": "unique-uuid-per-request",
  "merchantId": "your-merchant-id",
  "entityId": "cust_12345",
  "action": "ALLOW",
  "riskScore": 23.5,
  "riskFactors": [
    {
      "signal": "device.trustScore",
      "value": 82,
      "contribution": 8.5,
      "description": "Device trust score indicates known device"
    },
    {
      "signal": "velocity.txCount1h",
      "value": 2,
      "contribution": 5.0,
      "description": "Transaction velocity within normal range"
    }
  ],
  "appliedRules": ["base.velocity-1h-threshold"],
  "latencyMs": 145,
  "cached": false,
  "createdAt": "2026-03-13T10:30:00.000Z"
}
```

### 5.3 Decision Outcomes

| Action | Risk Score | Recommended Handling |
|--------|-----------|---------------------|
| `ALLOW` | < 40 | Proceed with transaction |
| `REVIEW` | 40 — 69 | Queue for manual review, proceed cautiously |
| `BLOCK` | >= 70 | Reject transaction, notify user |

### 5.4 Retrieve a Decision

```http
GET /v1/decisions/unique-uuid-per-request HTTP/1.1
Authorization: Bearer eyJhbGciOiJSUzI1NiIs...
```

### 5.5 Idempotency

Decisions are idempotent on `requestId + merchantId`:
- Same `requestId` within 5 seconds returns cached result (`"cached": true`)
- After 5 seconds, a new decision is scored
- Use unique UUIDs for each independent decision request

---

## 6. Webhook Consumption

### 6.1 Webhook Payload

SignalRisk sends webhooks for `BLOCK` and `REVIEW` decisions:

```json
{
  "event": "decision.block",
  "requestId": "uuid-of-decision",
  "merchantId": "your-merchant-id",
  "outcome": "BLOCK",
  "riskScore": 85.3,
  "timestamp": "2026-03-13T10:30:00.000Z"
}
```

**Event types:**

| Event | Trigger |
|-------|---------|
| `decision.block` | Risk score >= 70 |
| `decision.review` | Risk score 40-69 |
| `case.sla_breach` | Case SLA deadline exceeded |

### 6.2 Signature Verification

Every webhook includes an HMAC-SHA256 signature in the `X-SignalRisk-Signature` header.

**Always verify signatures before processing webhooks.**

**Node.js:**

```javascript
const crypto = require('crypto');

function verifyWebhook(rawBody, signature, secret) {
  const expected = 'sha256=' +
    crypto.createHmac('sha256', secret)
          .update(rawBody)
          .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}

// Express middleware
app.post('/webhooks/signalrisk', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['x-signalrisk-signature'];
  if (!verifyWebhook(req.body, sig, process.env.WEBHOOK_SECRET)) {
    return res.status(401).send('Invalid signature');
  }
  const payload = JSON.parse(req.body);
  // Process webhook...
  res.status(200).send('OK');
});
```

**Python:**

```python
import hmac
import hashlib

def verify_webhook(raw_body: bytes, signature: str, secret: str) -> bool:
    expected = 'sha256=' + hmac.new(
        secret.encode(), raw_body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature, expected)
```

**Go:**

```go
func verifyWebhook(body []byte, signature, secret string) bool {
    mac := hmac.New(sha256.New, []byte(secret))
    mac.Write(body)
    expected := "sha256=" + hex.EncodeToString(mac.Sum(nil))
    return hmac.Equal([]byte(signature), []byte(expected))
}
```

### 6.3 Retry Policy

| Attempt | Delay | Timeout |
|---------|-------|---------|
| 1 | Immediate | 5s |
| 2 | ~1s | 5s |
| 3 | ~4s | 5s |

After 3 failed attempts, the webhook is sent to an internal DLQ. Contact support to replay failed webhooks.

### 6.4 Best Practices

- **Respond quickly:** Return 200 within 5 seconds, process asynchronously
- **Be idempotent:** Use `requestId` to deduplicate — same webhook may be delivered more than once
- **Use raw body for verification:** Parse JSON *after* verifying the HMAC signature
- **Monitor failures:** Set up alerts for webhook signature failures

---

## 7. Case Management API

Cases are created automatically for `REVIEW` and `BLOCK` decisions.

### 7.1 List Cases

```http
GET /v1/cases?merchantId=your-merchant-id&status=OPEN&page=1&limit=20 HTTP/1.1
Authorization: Bearer eyJhbGciOiJSUzI1NiIs...
```

**Query parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `merchantId` | string | required | Filter by merchant |
| `status` | enum | all | `OPEN`, `IN_REVIEW`, `RESOLVED`, `ESCALATED` |
| `priority` | enum | all | `HIGH`, `MEDIUM`, `LOW` |
| `assignedTo` | string | — | Filter by analyst email |
| `search` | string | — | Search by entity ID |
| `slaBreached` | boolean | — | Filter SLA-breached cases |
| `page` | number | 1 | Page number |
| `limit` | number | 20 | Results per page (max 100) |

**Response:**

```json
{
  "cases": [
    {
      "id": "case-uuid",
      "merchantId": "your-merchant-id",
      "decisionId": "decision-uuid",
      "entityId": "cust_12345",
      "entityType": "customer",
      "action": "REVIEW",
      "riskScore": 55.2,
      "riskFactors": [...],
      "status": "OPEN",
      "priority": "MEDIUM",
      "slaDeadline": "2026-03-14T10:30:00.000Z",
      "slaBreached": false,
      "assignedTo": null,
      "createdAt": "2026-03-13T10:30:00.000Z"
    }
  ],
  "total": 42,
  "page": 1
}
```

### 7.2 Resolve a Case

```http
PATCH /v1/cases/case-uuid?merchantId=your-merchant-id HTTP/1.1
Authorization: Bearer eyJhbGciOiJSUzI1NiIs...
Content-Type: application/json

{
  "status": "RESOLVED",
  "resolution": "FRAUD",
  "resolutionNotes": "Confirmed fraudulent transaction pattern"
}
```

**Resolution values:**

| Resolution | Side Effect |
|-----------|------------|
| `FRAUD` | Entity added to **denylist** → future events auto-BLOCK |
| `LEGITIMATE` | Entity added to **allowlist** (30-day) → suppresses prior BLOCK history |
| `INCONCLUSIVE` | No watchlist change |

### 7.3 SLA Deadlines

| Decision | SLA |
|----------|-----|
| BLOCK | 4 hours |
| REVIEW | 24 hours |

Breached SLAs trigger `case.sla_breach` webhook.

---

## 8. Client SDKs

### 8.1 Web SDK

```bash
npm install @signalrisk/web-sdk
```

```javascript
import { SignalRisk } from '@signalrisk/web-sdk';

const sr = new SignalRisk({
  apiKey: 'sk_test_your_api_key',
  endpoint: 'https://api.signalrisk.io',
  merchantId: 'your-merchant-id',
  autoIdentify: true,
});

await sr.init();

// Track user actions
sr.track('PAGE_VIEW', { page: '/checkout' });
sr.track('PAYMENT', {
  amount: 149.99,
  currency: 'USD',
  paymentMethod: 'card_not_present',
  customerId: 'cust_12345',
});

// Force send buffered events
await sr.flush();

// Cleanup on unmount
sr.destroy();
```

**Batching:** Events are buffered (max 10, auto-flush every 5s). Call `flush()` before critical checkpoints (e.g., before checkout).

### 8.2 Mobile SDK (React Native)

```bash
npm install @signalrisk/mobile-sdk react-native @react-native-async-storage/async-storage
```

```javascript
import { SignalRiskClient } from '@signalrisk/mobile-sdk';

const client = new SignalRiskClient({
  baseUrl: 'https://api.signalrisk.io',
  apiKey: 'sk_test_your_api_key',
});

await client.init();

// Device ID is auto-generated and persisted via AsyncStorage
client.track('LOGIN', { customerId: 'cust_12345' });

await client.flush();
client.destroy();
```

### 8.3 Server-Side Integration (No SDK)

If you prefer direct HTTP calls:

```javascript
// Node.js example with fetch
async function trackEvent(event) {
  const response = await fetch('https://api.signalrisk.io/v1/events', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ events: [event] }),
  });

  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After') || '1';
    // Implement exponential backoff
    await sleep(parseInt(retryAfter) * 1000);
    return trackEvent(event); // retry
  }

  return response.json();
}
```

---

## 9. Rate Limiting & Backpressure

SignalRisk uses a three-layer rate limiting system.

### 9.1 Limits

| Layer | Limit | Scope | 429 Reason | Retry-After |
|-------|-------|-------|-----------|-------------|
| Queue Depth | 500 concurrent / 5,000 per 10s | Global | `queue_depth_exceeded` | 1s |
| Merchant Fairness | 1,000 events/sec (burst: 2,000) | Per merchant | `merchant_rate_limited` | 2s |
| System Health | Dynamic (Kafka lag) | Global | `system_overloaded` | 5s |
| Auth endpoints | 10 requests/60s | Per IP | — | 60s |

### 9.2 Handling 429 Responses

```json
{
  "statusCode": 429,
  "message": "Service under backpressure. Please retry later.",
  "reason": "merchant_rate_limited",
  "retryAfter": 2
}
```

**Recommended retry strategy:**

```javascript
async function sendWithRetry(request, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(url, request);

    if (response.status !== 429) return response;

    const retryAfter = parseInt(response.headers.get('Retry-After') || '1');
    const jitter = Math.random() * 0.5; // 0-500ms jitter
    await sleep((retryAfter + jitter) * 1000);
  }
  throw new Error('Max retries exceeded');
}
```

### 9.3 Custom Rate Limits

Contact support for per-merchant rate limit adjustments. High-volume merchants can get increased burst capacity.

---

## 10. Error Handling

### 10.1 Standard Error Shape

All API errors follow this format:

```json
{
  "statusCode": 400,
  "message": "Human-readable error description",
  "error": "BadRequest"
}
```

### 10.2 HTTP Status Reference

| Status | Meaning | Action |
|--------|---------|--------|
| 200 | Success | Process response |
| 202 | Accepted (async) | Event queued for processing |
| 204 | No Content | Operation successful (DELETE, revoke) |
| 400 | Bad Request | Fix request payload |
| 401 | Unauthorized | Check API key or refresh JWT |
| 404 | Not Found | Resource does not exist |
| 429 | Rate Limited | Retry after `Retry-After` seconds |
| 500 | Server Error | Retry with backoff, contact support if persistent |

### 10.3 Common Errors and Fixes

| Error Message | Cause | Fix |
|---------------|-------|-----|
| `Missing Authorization header` | No auth header sent | Add `Authorization: Bearer <key>` |
| `Invalid API key format` | Key does not match `sk_test_<32hex>` | Check key format |
| `Request body must contain a non-empty "events" array` | Empty or missing `events` field | Send at least one event |
| `Token expired` | JWT access token expired | Call `/v1/auth/token/refresh` |

---

## 11. Test Traffic Isolation

SignalRisk supports a test mode for integration testing without affecting production analytics.

### 11.1 Enable Test Mode

Add the `X-SignalRisk-Test: true` header to event ingestion requests:

```http
POST /v1/events HTTP/1.1
Authorization: Bearer sk_test_your_api_key
X-SignalRisk-Test: true
Content-Type: application/json

{
  "events": [...]
}
```

### 11.2 What Test Mode Does

| Area | Behavior |
|------|----------|
| **Scoring** | Full pipeline — events are scored normally |
| **Decisions** | Marked with `is_test: true` |
| **Cases** | Created normally (analysts can practice) |
| **Analytics** | Excluded from all 6 dashboard queries |
| **Webhooks** | Skipped — no delivery to merchant endpoints |

### 11.3 When to Use

- **Integration testing:** Validate payload formats and response shapes
- **Load testing:** Measure throughput without polluting analytics
- **UAT:** Run acceptance scenarios with realistic data
- **Training:** Let analysts practice case resolution

---

## 12. Security Checklist

Before going live:

- [ ] **API key stored securely** — never in client-side code or version control
- [ ] **Webhook signature verified** — always validate `X-SignalRisk-Signature` with HMAC-SHA256
- [ ] **JWT tokens refreshed** — implement automatic refresh before expiry (15-min TTL)
- [ ] **HTTPS only** — all API calls and webhook endpoints over TLS 1.2+
- [ ] **Rate limit handling** — implement retry with backoff for 429 responses
- [ ] **Idempotency keys** — use unique UUIDs for `requestId` and `eventId`
- [ ] **IP allowlisting** — restrict webhook source IPs if possible
- [ ] **Test mode disabled** — remove `X-SignalRisk-Test` header in production

---

## 13. Deployment Checklist

### Phase 1: Sandbox Integration (Week 1-2)

- [ ] Receive sandbox credentials (Merchant ID + API key)
- [ ] Implement event ingestion with Web/Mobile SDK or server-side
- [ ] Verify 202 responses and check for rejected events
- [ ] Implement decision API calls for pre-checkout verification
- [ ] Set up webhook endpoint with signature verification
- [ ] Run test events with `X-SignalRisk-Test: true`

### Phase 2: Validation (Week 3)

- [ ] Send realistic traffic mix (PAGE_VIEW, LOGIN, PAYMENT)
- [ ] Verify decisions match expected risk levels
- [ ] Test webhook delivery and retry behavior
- [ ] Simulate 429 responses and verify retry logic
- [ ] Review cases in dashboard
- [ ] Resolve test cases and verify feedback loop (FRAUD → denylist → BLOCK)

### Phase 3: Production Go-Live (Week 4)

- [ ] Switch to production credentials
- [ ] Remove `X-SignalRisk-Test` header
- [ ] Configure production webhook URL
- [ ] Monitor initial traffic for false positives
- [ ] Set up alerting for webhook failures
- [ ] Brief analyst team on case management workflow

### Phase 4: Tuning (Ongoing)

- [ ] Review BLOCK/REVIEW rates weekly
- [ ] Adjust merchant-specific rules if needed
- [ ] Provide fraud feedback via case resolution (improves model accuracy)
- [ ] Monitor SLA compliance for BLOCK (4h) and REVIEW (24h) cases

---

## Quick Reference Card

| What | Endpoint | Auth | Method |
|------|----------|------|--------|
| Send events | `/v1/events` | API Key | POST |
| Get decision | `/v1/decisions` | JWT | POST |
| Retrieve decision | `/v1/decisions/:id` | JWT | GET |
| List cases | `/v1/cases` | JWT | GET |
| Get case detail | `/v1/cases/:id` | JWT | GET |
| Resolve case | `/v1/cases/:id` | JWT | PATCH |
| Get token | `/v1/auth/token` | None | POST |
| Refresh token | `/v1/auth/token/refresh` | None | POST |
| Revoke token | `/v1/auth/token/revoke` | None | POST |
| JWKS | `/.well-known/jwks.json` | None | GET |
| Health check | `/health` | None | GET |

**Support:** For integration assistance, contact the SignalRisk engineering team.
