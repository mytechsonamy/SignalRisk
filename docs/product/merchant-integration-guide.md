# Merchant Integration Guide

> Integration and onboarding guide for customer companies integrating SignalRisk | March 13, 2026

## 1. Purpose

This document explains how a company integrates with SignalRisk:

- which credentials exist
- which APIs and SDKs are used
- what the event contract looks like
- how decisions and downstream actions flow
- what must be validated before go-live

This guide assumes the merchant is integrating as an external customer of the platform.

## 2. Integration Models

SignalRisk supports three practical integration channels:

1. `REST + SDK`  
   Recommended default. Merchant app uses Web SDK or Mobile SDK, then sends events to `event-collector`.

2. `REST-only`  
   Merchant already has its own device/session telemetry and only wants server-side fraud scoring.

3. `REST + Webhook + Dashboard`  
   Merchant sends events, receives signed callbacks, and uses the dashboard for analyst review and tuning.

## 3. Credentials and Access

A merchant usually receives four things during onboarding.

### A. OAuth machine credentials

Used for platform-to-platform JWT access.

- `client_id`
- `client_secret`

Used with:

- `POST /v1/auth/token`
- `grant_type=client_credentials`

### B. Event ingestion API key

Used only for `event-collector`.

Format:

- `sk_test_<32 lowercase hex>`

Sent as:

- `Authorization: Bearer <api-key>`
- or `Authorization: ApiKey <api-key>`

### C. Operator accounts

Used for dashboard access.

- operator email
- temporary password
- optional password change after first login

Login endpoint:

- `POST /v1/auth/login`

### D. Webhook secret

Used to verify outbound webhook signatures from SignalRisk.

Header:

- `X-SignalRisk-Signature: sha256=<hex>`

## 4. Merchant Onboarding Sequence

## Step 1: Create the merchant tenant

Platform-side onboarding creates:

- `merchants` row
- `client_id` / `client_secret`
- API key allowlist entry
- optional operator users

Expected outputs to hand to the merchant:

- merchant name
- merchant UUID
- OAuth machine credentials
- event ingestion API key
- dashboard login URL
- webhook verification secret

## Step 2: Provision operator users

If the merchant will use the dashboard:

- invite users via admin flow
- capture temporary password from invite response
- require password change before operational use

Roles today:

- `admin`
- `analyst`
- `viewer`

## Step 3: Configure webhook endpoint

Merchant provides:

- callback URL
- desired secret or approved generated secret

Current implementation note:

- webhook config is stored in Redis per merchant
- callbacks are only sent for `BLOCK` and `REVIEW`
- test traffic is skipped

## Step 4: Integrate SDK or telemetry producer

Merchant chooses one:

- Web SDK
- Mobile SDK
- server-generated event producer

Minimum data to emit:

- merchant ID
- device ID
- session ID
- event type
- event payload

## Step 5: Send events to SignalRisk

Primary ingestion endpoint:

- `POST /v1/events`

Behavior:

- validates the event envelope and payload schema
- accepts a batch `{ "events": [...] }`
- returns `202 Accepted`
- publishes valid events to Kafka
- routes invalid events to DLQ

## Step 6: Consume decisions and actions

Merchant usually uses one or both:

- decision query / polling path
- webhook callbacks

Analyst and platform workflows also consume:

- case creation
- dashboard live feed
- watchlist/feedback cycle

## 5. Request/Response Flow

## 5.1 Event ingestion

Example request:

```http
POST /v1/events
Authorization: Bearer sk_test_00000000000000000000000000000001
Content-Type: application/json

{
  "events": [
    {
      "merchantId": "00000000-0000-0000-0000-000000000001",
      "deviceId": "device-abc123",
      "sessionId": "session-xyz789",
      "eventId": "a1b2c3d4-1234-5678-abcd-ef0123456789",
      "type": "PAYMENT",
      "timestamp": "2026-03-13T12:00:00.000Z",
      "ipAddress": "203.0.113.24",
      "userAgent": "Mozilla/5.0",
      "payload": {
        "amount": 9999,
        "currency": "TRY",
        "paymentMethod": "credit_card",
        "merchantRef": "ord_12345"
      }
    }
  ]
}
```

Example acceptance response:

```json
{
  "status": "accepted",
  "accepted": 1,
  "rejected": 0,
  "results": [
    {
      "eventId": "a1b2c3d4-1234-5678-abcd-ef0123456789",
      "accepted": true
    }
  ]
}
```

## 5.2 Decision retrieval

There are two practical patterns.

### Pattern A: Poll the decision API

- `GET /v1/decisions/:requestId`
- useful for deterministic testing and integrations that want direct lookup

### Pattern B: Receive webhook callback

- recommended for asynchronous business workflows
- only REVIEW and BLOCK currently trigger webhook delivery

## 6. Event Contract Expectations

## Required envelope fields

- `merchantId`
- `deviceId`
- `sessionId`
- `type`
- `payload`

## Recommended optional fields

- `eventId` as UUID
- `timestamp` as ISO-8601
- `ipAddress`
- `userAgent`
- `pageUrl`
- `referrer`

## Event types

- `PAGE_VIEW`
- `CLICK`
- `FORM_SUBMIT`
- `LOGIN`
- `SIGNUP`
- `PAYMENT`
- `CUSTOM`

## Example payload rules

For `PAYMENT`, the payload requires:

- `amount`
- `currency`
- `paymentMethod`

Useful optional payment fields include:

- `merchantRef`
- `cardBin`
- `cardLast4`
- `billingCountry`
- `recurring`

## 7. Fraud Decision Semantics

SignalRisk returns one of:

- `ALLOW`
- `REVIEW`
- `BLOCK`

Meaning:

- `ALLOW`: no analyst workflow required
- `REVIEW`: suspicious; case may be created
- `BLOCK`: high-confidence fraud; merchant should reject or challenge the action

Each decision also carries:

- `riskScore`
- `riskFactors`
- `appliedRules`
- `latencyMs`

## 8. Closed-Loop Merchant Workflow

The full merchant value chain is:

1. merchant sends event
2. SignalRisk scores it
3. SignalRisk emits `ALLOW / REVIEW / BLOCK`
4. BLOCK/REVIEW may create case and webhook
5. analyst resolves case as `FRAUD`, `LEGITIMATE`, or `INCONCLUSIVE`
6. label is published to `signalrisk.state.labels`
7. watchlist state is updated
8. next event for same typed entity gets feedback-aware treatment

This is what the merchant should validate during onboarding and UAT.

## 9. Webhook Integration

Webhook payloads currently include:

- `event`
- `requestId`
- `merchantId`
- `outcome`
- `riskScore`
- `timestamp`

Delivery behavior:

- only `decision.block` and `decision.review`
- HMAC-SHA256 signature
- 5s request timeout
- 3 attempts with backoff
- failed deliveries go to Redis-backed DLQ

Merchant verification steps:

1. read raw request body
2. recompute HMAC with shared secret
3. compare against `X-SignalRisk-Signature`
4. reject mismatched or replayed requests

## 10. Dashboard Integration

The merchant may also use the dashboard for:

- live decision monitoring
- case queue review
- rule tuning
- admin user management

Current operator auth model:

- DB-backed email/password login
- RS256 JWT
- refresh token rotation
- WebSocket live feed with tenant-scoped rooms

## 11. Go-Live Checklist for a New Merchant

Before enabling production traffic, confirm:

1. merchant credentials are provisioned
2. API key validation is enabled for the target environment
3. webhook URL and signature verification are tested
4. at least one operator user can log in and change password
5. event payloads validate against the expected schemas
6. a REVIEW and a BLOCK test event produce the expected downstream side effects
7. dashboard visibility and case creation are verified
8. test traffic is isolated from production analytics

## 12. Recommended UAT for Merchant Onboarding

Run at least these scenarios:

### Legitimate path

- normal login
- normal signup
- normal payment
- expected result: `ALLOW`

### Suspicious path

- repeated same-entity burst within 10 minutes
- expected result: `REVIEW` or `BLOCK`

### Confirmed fraud path

- analyst marks case as `FRAUD`
- next event for same entity should be denylist-blocked

### Legitimate recovery path

- analyst marks later case as `LEGITIMATE`
- denylist deactivates
- allowlist suppression applies without full bypass

### Webhook path

- merchant receives signed callback for REVIEW/BLOCK
- merchant verifies HMAC successfully

## 13. Integration Caveats

- event ingestion is asynchronous; `POST /v1/events` does not itself return the fraud decision
- webhook configuration is Redis-backed in the current implementation
- non-production environments may still contain seed merchants and seed operator fallbacks
- password OAuth grant is intentionally unsupported; dashboard login uses `/v1/auth/login`

## 14. Recommended Deliverables for Each Merchant

Hand over these artifacts:

- credential sheet
- event contract examples
- webhook verification example
- UAT scenario list
- go-live contact and escalation path

## 15. Related Documents

- [Product Overview](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/docs/product/product-overview.md)
- [Technical Documentation](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/docs/TECHNICAL.md)
- [System Overview](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/docs/architecture/system-overview.md)
- [Data Model](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/docs/architecture/data-model.md)
- [Synthetic UAT Strategy](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/docs/uat-tests/synthetic-uat-strategy.md)
