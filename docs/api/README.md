# SignalRisk Developer Portal

Complete API reference and integration guide for the SignalRisk fraud detection platform.

## Quick Start

### 1. Create a Merchant and Get Credentials

```bash
curl -X POST http://localhost:3015/merchants \
  -H "Content-Type: application/json" \
  -d '{"name": "Acme Corp", "webhookUrl": "https://acme.com/webhooks/signalrisk"}'
```

Response includes `clientId` and `clientSecret` (shown once).

### 2. Authentication

Exchange your `clientId` and `clientSecret` for a JWT access token:

```bash
curl -X POST https://api.signalrisk.io/v1/auth/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "client_credentials",
    "client_id": "merchant-001",
    "client_secret": "sk_test_your_secret_here"
  }'
```

Response:

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiJ9...",
  "token_type": "Bearer",
  "expires_in": 900,
  "refresh_token": "rt_eyJhbGciOiJSUzI1NiJ9..."
}
```

Include your token in every subsequent request:

```bash
curl -X POST https://api.signalrisk.io/v1/events \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiJ9..." \
  -H "Content-Type: application/json" \
  -d '{"events": [...]}'
```

### 3. Ingest Events

```bash
curl -X POST https://api.signalrisk.io/v1/events \
  -H "Authorization: Bearer sk_test_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [{
      "merchantId": "merchant-001",
      "deviceId": "device-abc123",
      "sessionId": "session-xyz789",
      "type": "PAYMENT",
      "payload": {
        "amount": 99.99,
        "currency": "USD",
        "msisdn": "+905551234567"
      },
      "ipAddress": "192.168.1.1"
    }]
  }'
```

Response `202 Accepted`:

```json
{
  "status": "accepted",
  "accepted": 1,
  "rejected": 0,
  "results": [
    { "eventId": "a1b2c3d4-uuid", "accepted": true }
  ]
}
```

### 4. Get a Fraud Decision

```bash
curl -X POST https://api.signalrisk.io/v1/decisions \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiJ9..." \
  -H "X-Request-ID: req-unique-id-001" \
  -H "Content-Type: application/json" \
  -d '{
    "merchantId": "merchant-001",
    "requestId": "req-unique-id-001",
    "entityId": "user-abc123",
    "deviceId": "device-abc123",
    "sessionId": "session-xyz789",
    "ip": "192.168.1.1",
    "msisdn": "+905551234567",
    "amount": 99.99
  }'
```

Response `202 Accepted`:

```json
{
  "requestId": "req-unique-id-001",
  "merchantId": "merchant-001",
  "action": "ALLOW",
  "riskScore": 23,
  "riskFactors": [
    {
      "signal": "device.trustScore",
      "value": 85,
      "contribution": 30,
      "description": "Device trust score is high — familiar device"
    },
    {
      "signal": "velocity.txCount1h",
      "value": 2,
      "contribution": 10,
      "description": "Transaction velocity is low"
    }
  ],
  "appliedRules": [],
  "latencyMs": 87,
  "cached": false,
  "createdAt": "2026-03-06T12:00:00.000Z"
}
```

### 5. Manage Cases

REVIEW and BLOCK decisions automatically create cases:

```bash
# List open high-priority cases
curl "https://api.signalrisk.io/v1/cases?merchantId=merchant-001&status=OPEN&priority=HIGH" \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiJ9..."

# Resolve a case as fraud
curl -X PATCH "https://api.signalrisk.io/v1/cases/case-abc123?merchantId=merchant-001" \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "status": "RESOLVED",
    "resolution": "FRAUD",
    "resolutionNotes": "Verified fraudulent transaction via manual review"
  }'
```

---

## Authentication Guide

### API Key Format

Access tokens are RS256-signed JWTs. They expire in 15 minutes (900 seconds).
Refresh tokens are prefixed with `rt_` and have a longer lifetime.

Keep your `clientSecret` safe — it is shown only once at merchant creation.
Rotate it immediately if compromised using `POST /merchants/{id}/rotate-secret`.

### Token Lifecycle

```
POST /v1/auth/token (client_credentials)
  → access_token (15 min) + refresh_token

POST /v1/auth/token/refresh
  → new access_token + new refresh_token

POST /v1/auth/token/revoke
  → invalidates refresh_token
```

### Token Introspection

Validate a token programmatically (useful for service-to-service checks):

```bash
curl -X POST https://api.signalrisk.io/v1/auth/token/introspect \
  -H "Content-Type: application/json" \
  -d '{"token": "eyJhbGciOiJSUzI1NiJ9...", "token_type_hint": "access_token"}'
```

Response:

```json
{
  "active": true,
  "sub": "merchant-001",
  "merchant_id": "merchant-001",
  "role": "merchant",
  "permissions": ["events:write", "decisions:read"],
  "exp": 1741276800
}
```

---

## Webhook Guide

### Registering a Webhook

Configure your webhook URL at merchant creation or update time:

```bash
curl -X POST https://api.signalrisk.io/merchants \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme Corp",
    "webhookUrl": "https://your-server.com/webhooks/signalrisk"
  }'
```

### Webhook Payload

SignalRisk delivers REVIEW and BLOCK decisions to your webhook URL:

```json
{
  "event": "decision.created",
  "merchantId": "merchant-001",
  "requestId": "req-unique-id-001",
  "action": "BLOCK",
  "riskScore": 88,
  "entityId": "user-abc123",
  "timestamp": "2026-03-06T12:00:00.000Z"
}
```

### Verifying Webhook Signatures (JavaScript)

```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const expected = 'sha256=' +
    crypto.createHmac('sha256', secret)
          .update(JSON.stringify(payload))
          .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}

// Express.js example
app.post('/webhooks/signalrisk', (req, res) => {
  const signature = req.headers['x-signalrisk-signature'];
  if (!verifyWebhook(req.body, signature, process.env.WEBHOOK_SECRET)) {
    return res.status(401).send('Invalid signature');
  }
  console.log('Decision received:', req.body.action);
  res.sendStatus(200);
});
```

### Verifying Webhook Signatures (Python)

```python
import hmac
import hashlib
import json

def verify_webhook(payload: dict, signature: str, secret: str) -> bool:
    body = json.dumps(payload, separators=(',', ':'))
    expected = 'sha256=' + hmac.new(
        secret.encode(), body.encode(), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature, expected)
```

### Retry Policy

SignalRisk retries failed webhook deliveries with exponential backoff:

| Attempt | Delay |
|---------|-------|
| 1 | immediate |
| 2 | 30 seconds |
| 3 | 5 minutes |
| 4 | 30 minutes |
| 5 | 2 hours |

Return a `2xx` status code to acknowledge delivery. Any other status triggers a retry.

---

## Web SDK

### Installation

```bash
npm install @signalrisk/web-sdk
```

### Initialize

```javascript
import { SignalRisk } from '@signalrisk/web-sdk';

const sdk = new SignalRisk({
  apiKey: 'sk_test_your_api_key',
  merchantId: 'merchant-001',
  endpoint: 'https://api.signalrisk.io/v1/events',
});

await sdk.initialize();
```

### Track Events

```javascript
// Track a payment event
sdk.track('PAYMENT', {
  amount: 99.99,
  currency: 'USD',
  msisdn: '+905551234567',
});

// Track a login event
sdk.track('LOGIN', {
  userId: 'user-abc123',
  method: 'password',
});
```

The SDK automatically includes `deviceId`, `sessionId`, `ipAddress`, and `userAgent` on every event.

---

## Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| POST /v1/events | 1,000 req | per minute |
| POST /v1/events (burst tier) | 2,000 req | per minute |
| POST /v1/decisions | 500 req | per minute |
| POST /v1/auth/token | 10 req | per minute |

When rate limited, the API returns `429 Too Many Requests` with a `Retry-After` header indicating seconds until the limit resets.

```
HTTP/1.1 429 Too Many Requests
Retry-After: 47
Content-Type: application/json

{"statusCode": 429, "message": "Too Many Requests"}
```

---

## Error Reference

| Code | Meaning |
|------|---------|
| 400 | Bad Request — invalid or missing fields |
| 401 | Unauthorized — missing or invalid token |
| 404 | Not Found — resource does not exist |
| 429 | Too Many Requests — rate limit exceeded |
| 500 | Internal Server Error — contact support |

All error responses follow this shape:

```json
{
  "statusCode": 400,
  "message": "Descriptive error message",
  "error": "Bad Request"
}
```

---

## API Reference

Individual service specs (OpenAPI 3.0 YAML):

- [Auth Service](specs/auth-service.yaml) — token issuance, merchant management
- [Event Collector](specs/event-collector.yaml) — event ingestion
- [Decision Service](specs/decision-service.yaml) — fraud decisions
- [Case Service](specs/case-service.yaml) — case management

[Merged Spec](openapi-merged.yaml) — all services under one document

---

## Interactive Docs

Each service exposes a Swagger UI at `/api/docs` when running:

| Service | URL |
|---------|-----|
| Auth | http://localhost:3015/api/docs |
| Event Collector | http://localhost:3001/api/docs |
| Decision Service | http://localhost:3009/api/docs |
| Case Service | http://localhost:3010/api/docs |
| Webhook Service | http://localhost:3011/api/docs |
