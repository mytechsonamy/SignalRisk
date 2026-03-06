# SignalRisk Architecture

SignalRisk is a distributed fraud detection platform built as a NestJS microservices monorepo. Events flow from client SDKs through an event-collector into Kafka, where multiple signal enrichment services consume and score them in parallel before producing a decision.

## System Diagram

```
                     +--------------------------------------+
                     |           Client SDKs               |
                     |  web-sdk (npm)  mobile-sdk (npm)    |
                     +------------------+-------------------+
                                        |
                                        | HTTPS POST /v1/events
                                        |
                                        v
                     +--------------------------------------+
                     |      event-collector  :3000         |
                     |  Kafka producer | BackpressureGuard  |
                     +------------------+-------------------+
                                        |
                                        | Kafka: events topic
              +--------------------------+--------------------------+
              |                          |                          |
              v                          v                          v
  +--------------------+  +----------------------+  +---------------------+
  | device-intel  :3003|  | velocity-service:3004|  | behavioral     :3005|
  | Fingerprint        |  | Redis sorted sets    |  | Timing CV           |
  | Trust scoring      |  | 6 velocity dims      |  | Nav entropy         |
  +----------+---------+  +-----------+----------+  +----------+----------+
             |                        |                         |
             +------------------------+-------------------------+
                                      |
                                      | HTTP (150ms timeout)
                                      |
                                      v
                     +--------------------------------------+
                     |      decision-service  :3002         |
                     |   Promise.allSettled (5 signals)     |
                     |   Weighted score aggregation         |
                     |   Rule engine evaluation             |
                     +------------------+-------------------+
                                        |
                                        | Kafka: decisions topic
              +--------------------------+--------------------------+
              |                                                     |
              v                                                     v
  +----------------------+                         +----------------------+
  |  case-service  :3010 |                         | webhook-service :3011|
  |  Auto-create REVIEW  |                         | HMAC-SHA256 delivery |
  |  SLA monitoring      |                         | Retry 1s/4s/16s      |
  +----------------------+                         +----------------------+
```

## Service Descriptions

### Client SDKs

| Package | Description |
|---------|-------------|
| `@signalrisk/web-sdk` | Browser SDK — fingerprint collection (WebGL, canvas, screen), behavioral tracking (click timing CV, nav entropy, mouse jitter), event batching with 429 backoff |
| `@signalrisk/mobile-sdk` | React Native SDK — djb2 device fingerprint (platform, screen, locale, timezone, deviceId), batched event delivery, AsyncStorage persistence |

### event-collector (port 3000)

The public-facing event ingestion service. Accepts `POST /v1/events` with `Bearer` or `ApiKey` authentication, validates event schema with `class-validator`, and produces to the Kafka `events` topic via the `BackpressureGuard` which monitors queue depth and applies per-merchant fairness limits.

### decision-service (port 3002)

Orchestrates the fraud decision pipeline. For each decision request it:

1. Checks the Redis idempotency cache by `requestId`
2. Fans out to signal enrichment services using `Promise.allSettled` with a 150ms per-service timeout
3. Aggregates weighted scores into a single `riskScore` (0–100)
4. Evaluates merchant-specific rules via `rule-engine-service`
5. Emits the decision to the Kafka `decisions` topic
6. Returns `action: ALLOW | REVIEW | BLOCK` with `riskFactors[]`

### device-intel (port 3003)

Consumes fingerprint attributes from event payloads and produces a device trust score. Maintains a Neo4j graph of device-to-entity associations for shared device detection.

### velocity-service (port 3004)

Tracks event velocity across 6 dimensions using Redis sorted sets:

- Per-device event count (1min, 5min, 1hr windows)
- Per-merchant event count
- Per-entityId transaction volume
- Burst detection via sliding window counters

Returns a velocity signal with burst flag to the decision-service.

### behavioral (port 3005)

Evaluates behavioral metrics forwarded from the web-sdk:

- `timingCv` — coefficient of variation of inter-click intervals (< 0.1 = bot indicator)
- `navigationEntropy` — Shannon entropy of navigation paths (low = scripted)
- `mouseJitter` — presence of fractional mouse coordinates

### case-service (port 3010)

Consumes from the `decisions` topic. Automatically creates a case when `action = REVIEW`. Supports:

- Paginated case listing with status/priority/SLA filters
- Bulk actions: `RESOLVE`, `ESCALATE`, `ASSIGN`
- SLA monitoring with breach detection
- GDPR Art. 15 data export per entity

### webhook-service (port 3011)

Delivers decision payloads to merchant-configured webhook URLs. Signs each request with HMAC-SHA256 (`X-SignalRisk-Signature: sha256={digest}`). Retries on non-2xx: 1s, 4s, 16s backoff.

### auth-service (port 3001)

Issues and validates RS256 JWTs. Key features:

- OAuth2 token endpoint (`client_credentials` and `refresh_token` grant types)
- JWKS endpoint at `/.well-known/jwks.json` for RS256 verification
- Key rotation via `POST /v1/auth/rotate-keys`
- Per-merchant API key management
- Token introspection (RFC 7662) and revocation (RFC 7009)
- Tenant context middleware for multi-tenancy

### rule-engine-service (port 3008)

Evaluates a DSL-based rule set against decision signals. Supports:

- Merchant-defined threshold rules
- Chargeback feedback loop (rules tighten after chargeback events)
- Rule versioning and A/B testing via feature flags

### graph-intel-service (port 3012)

Neo4j-backed device sharing detection. Identifies when a single device ID is associated with multiple merchant entities (mule account indicator) or when a group of devices shares an IP subnet.

### feature-flag-service (port 3013)

Evaluates feature flags for gradual rollouts. Uses djb2 hashing of `merchantId` for deterministic bucketing. Flags are cached in Redis to minimize latency.

---

## Infrastructure

### PostgreSQL (RDS Multi-AZ)

Primary relational store. Row-level security (`app.merchant_id`) is applied on all tables to enforce tenant isolation. Used by:

- `auth-service` — merchant credentials, refresh tokens
- `case-service` — cases, evidence timelines
- `decision-service` — persisted decision records

### Redis (ElastiCache Global Datastore)

Used for:

- **Rate limiting** — sliding window counters per merchant (event-collector, auth-service)
- **Idempotency cache** — decision results keyed by `requestId` + `merchantId`
- **Velocity counters** — sorted sets in velocity-service
- **Feature flags** — flag evaluation cache in feature-flag-service

### Kafka (MSK)

Three primary topics:

| Topic | Producers | Consumers |
|-------|-----------|-----------|
| `events` | event-collector | device-intel, velocity-service, behavioral |
| `decisions` | decision-service | case-service, webhook-service |
| `decisions-dlq` | decision-service (on failure) | ops monitoring |

### Neo4j

Used exclusively by `graph-intel-service` for device-entity relationship graphs. Enables multi-hop queries to detect device sharing rings and mule account networks.

---

## Request Flow: End-to-End

```
1. Browser/app calls sdk.track('checkout', { amount: 99 })
2. SDK batches events → POST /v1/events (event-collector :3000)
3. event-collector validates schema, produces to Kafka 'events' topic
4. device-intel, velocity-service, behavioral consume from 'events'
   and update their respective signal stores
5. Merchant backend calls POST /v1/decisions (decision-service :3002)
6. decision-service fans out HTTP to signal services (150ms timeout)
7. Weighted score aggregated; rules evaluated; action determined
8. Decision produced to Kafka 'decisions' topic
9. case-service creates a case if action = REVIEW
10. webhook-service delivers signed payload to merchant webhook URL
11. Merchant webhook handler reads action: ALLOW|REVIEW|BLOCK
```

---

## Ports Summary

| Service | Port |
|---------|------|
| auth-service | 3001 |
| decision-service | 3002 |
| device-intel | 3003 |
| velocity-service | 3004 |
| behavioral | 3005 |
| rule-engine | 3008 |
| case-service | 3010 |
| webhook-service | 3011 |
| graph-intel | 3012 |
| feature-flag | 3013 |
| event-collector | 3000 |
