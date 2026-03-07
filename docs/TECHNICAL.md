# SignalRisk — Technical Documentation

> Version 0.1.0 | Last updated: March 2026

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture](#2-architecture)
3. [Service Catalogue](#3-service-catalogue)
4. [Data Stores](#4-data-stores)
5. [Event Pipeline](#5-event-pipeline)
6. [Decision Engine](#6-decision-engine)
7. [Security Model](#7-security-model)
8. [API Reference Summary](#8-api-reference-summary)
9. [SDK Integration](#9-sdk-integration)
10. [Deployment](#10-deployment)
11. [Configuration Reference](#11-configuration-reference)
12. [Observability](#12-observability)
13. [Performance & SLAs](#13-performance--slas)
14. [Development Setup](#14-development-setup)
15. [FraudTester Framework](#15-fraudtester-framework)
16. [Test Isolation](#16-test-isolation)

---

## 1. System Overview

SignalRisk is a real-time fraud decision engine for payment and carrier billing events. It evaluates incoming transactions against a multi-signal risk model and returns a deterministic ALLOW / REVIEW / BLOCK decision within 100ms p99.

**Key capabilities:**

- Multi-signal risk scoring (device, behavioural, network, velocity, telco, graph)
- DSL-based rule engine with hot reload and per-rule weights
- Case management queue for manual analyst review
- Chargeback feedback loop for continuous rule weight adjustment
- Multi-tenant (merchant) isolation via PostgreSQL Row-Level Security
- Webhook delivery with HMAC-SHA256 signing and automatic retries
- Web and Mobile SDKs for seamless client-side integration

---

## 2. Architecture

```
                         Clients
          Web SDK  |  Mobile SDK  |  Merchant Portal
                         |
                   (HTTPS + JWT / API Key)
                         |
              ┌──────────▼───────────┐
              │   auth-service :3001  │
              │  JWT RS256 | API Keys │
              │  Rate limit 1K/min    │
              └──────────┬───────────┘
                         |
              ┌──────────▼───────────┐
              │ event-collector :3002 │
              │ Schema validation     │
              │ Kafka publish         │
              └──────────┬───────────┘
                         |
                  Kafka: fraud-events
                         |
              ┌──────────▼───────────┐
              │  decision-service     │
              │  :3009                │
              │                       │
              │  Signal aggregation   │
              │  (Promise.allSettled  │
              │   + circuit breaker)  │
              │                       │
              │  ┌─────────────────┐  │
              │  │  device  :3003  │  │
              │  │  behavioral:3005│  │
              │  │  network  :3006 │  │
              │  │  telco    :3007 │  │
              │  │  velocity :3004 │  │
              │  │  graph    :3012 │  │
              │  └─────────────────┘  │
              │                       │
              │  rule-engine  :3008   │
              │  DSL eval + weights   │
              └──────────┬───────────┘
                         |
              Kafka: fraud-decisions
                    /         \
    ┌──────────────▼─┐     ┌──▼───────────────┐
    │ case-service   │     │ webhook-service   │
    │ :3010          │     │ :3011             │
    │ RLS + SLA mgmt │     │ HMAC-SHA256       │
    └────────────────┘     │ Retry + DLQ       │
                           └──────────────────┘
```

### Request Lifecycle

1. Client sends event via SDK → `POST /v1/events` on **event-collector**
2. API key validated (bcrypt prefix lookup); event schema validated
3. Event published to Kafka topic `signalrisk.events.raw`
4. **decision-service** consumes, fans out 6 signal fetches in parallel (~20ms)
5. **rule-engine** evaluates DSL rules against signal bundle (~5ms)
6. Decision score aggregated with configurable weights
7. Decision published to `signalrisk.decisions` and cached in Redis (5s TTL)
8. **case-service** creates a case for BLOCK/REVIEW outcomes
9. **webhook-service** delivers signed webhook to merchant endpoint

---

## 3. Service Catalogue

| Service | Port | Responsibility |
|---------|------|----------------|
| auth-service | 3001 | JWT issuance/refresh, API key management, merchant onboarding |
| event-collector | 3002 | Event ingestion, schema validation, Kafka publishing |
| device-intel-service | 3003 | Device fingerprinting, emulator/bot detection, trust score |
| velocity-service | 3004 | Transaction velocity counters, threshold detection |
| behavioral-service | 3005 | Mouse/keyboard/scroll behavioural fingerprinting |
| network-intel-service | 3006 | IP reputation, VPN/proxy detection, geo-mismatch |
| telco-intel-service | 3007 | Phone number validation, carrier risk scoring |
| rule-engine-service | 3008 | DSL rule parsing, evaluation, weight management |
| decision-service | 3009 | Signal aggregation, final score, decision output |
| case-service | 3010 | Case CRUD, SLA monitoring, analyst assignment |
| webhook-service | 3011 | Signed webhook delivery, retry queue, DLQ |
| graph-intel-service | 3012 | Neo4j entity relationship analysis, fraud ring detection |
| dashboard | 5173 | React analyst dashboard (development server) |
| fraud-tester | 3020 | Adversarial fraud testing, scenario library, battle arena |

All services are NestJS on Node.js 20. All expose `/health` (liveness) and `/health/ready` (readiness) endpoints.

---

## 4. Data Stores

### PostgreSQL (primary relational store)

- Tenant isolation via Row-Level Security: `SELECT set_config('app.merchant_id', $1, true)`
- Migrations in `db-migrations/` (001–008)
- Connection pooling via PgBouncer (max 100 connections per service)
- Tables: `merchants`, `api_keys`, `cases`, `rules`, `rule_weights`, `webhook_subscriptions`, `webhooks`, `outbox`, `fraud_feedback`

### Redis

- Decision cache: key `decision:{eventId}`, TTL 5 seconds
- Rate limiting: Lua atomic check-and-decrement, key `rate:{merchantId}:{endpoint}`
- Rule weights: hash `rule:weight:{ruleId}`, range [0.1, 1.0]
- JWT denylist: `jwt:revoked:{jti}`, TTL = token remaining lifetime

### Apache Kafka

| Topic | Producer | Consumer |
|-------|----------|---------|
| `signalrisk.events.raw` | event-collector | decision-service | Note: carries `is-test` header for test traffic |
| `signalrisk.decisions` | decision-service | case-service, webhook-service |
| `signalrisk.events.dlq` | event-collector (retry exhausted) | ops/monitoring |
| `signalrisk.events.dlq.exhausted` | event-collector (permanent fail) | ops |
| `signalrisk.feedback` | case-service | rule-engine (weight adjustment) |

### Neo4j (graph store)

Used by graph-intel-service to detect:
- Device sharing across merchants (fraud ring indicator)
- Velocity via graph paths (e.g. same IP → multiple accounts)
- Historical chargeback clustering

---

## 5. Event Pipeline

### Event Schema

Events must conform to the JSON Schema in `packages/signal-contracts/`. All fields are frozen — changes require an E7 impact assessment.

```typescript
interface FraudEvent {
  eventId: string;          // UUID v4
  merchantId: string;
  entityId: string;         // device fingerprint ID or user ID
  eventType: 'PAYMENT' | 'LOGIN' | 'REGISTRATION' | 'CHECKOUT';
  amount?: number;
  currency?: string;
  ipAddress: string;
  userAgent: string;
  phoneNumber?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;        // ISO 8601
}
```

### DLQ Behaviour

- Events that fail processing after 3 retries are moved to `signalrisk.events.dlq`
- After all retry exhaustion they are published to `signalrisk.events.dlq.exhausted`
- An in-memory cache (max 1000, FIFO eviction) holds exhausted events for ops inspection
- Endpoint: `GET /v1/dlq/events` returns cached exhausted events

---

## 6. Decision Engine

### Signal Weights

Default contribution weights for the final risk score:

| Signal | Weight |
|--------|--------|
| device-intel | 0.35 |
| velocity | 0.25 |
| behavioral | 0.20 |
| network-intel | 0.15 |
| telco-intel | 0.05 |

Graph intel is an additive modifier, not a weighted signal.

### Score Thresholds

| Score | Decision |
|-------|----------|
| >= 75 | BLOCK |
| 40–74 | REVIEW |
| < 40 | ALLOW |

### Rule DSL

Rules are authored in a simple DSL evaluated by the rule-engine-service:

```
device.country == 'NG' && txn.amount > 1000
velocity.count_1h > 5 && device.isEmulator == true
network.vpnDetected == true || network.isProxy == true
```

Available contexts: `device`, `velocity`, `behavioral`, `network`, `telco`, `txn`

Rules have:
- `outcome`: ALLOW | REVIEW | BLOCK
- `weight`: 0.1–1.0 (adjustable via feedback loop)
- `isActive`: boolean toggle (no deploy required)

### Feedback Loop

When analysts label cases as FRAUD or LEGITIMATE:
1. Feedback event published to `signalrisk.feedback`
2. rule-engine adjusts rule weight: +0.05 for FRAUD confirmation, -0.03 for false positive
3. Weights clamped to [0.1, 1.0]
4. New weights stored in Redis and PostgreSQL

---

## 7. Security Model

### Authentication

- **JWT RS256**: Access tokens (15 min TTL), refresh tokens (7 day TTL)
- **API Keys**: Format `sk_test_<32 hex chars>`, bcrypt-hashed in DB, prefix (8 chars) for lookup
- **JTI denylist**: `jwt:revoked:{jti}` in Redis with TTL = remaining token lifetime
  - Fail-closed: Redis unavailable → HTTP 503 (not bypass)

### Multi-tenancy

- All queries set `app.merchant_id` via `SET LOCAL` before execution
- PostgreSQL RLS policies enforce row-level isolation
- No string interpolation — parameterised queries only

### Feature Flags

| Flag | Default | Effect when disabled |
|------|---------|---------------------|
| `ENABLE_API_KEY_VALIDATION` | `true` | Bypasses API key check (dev only) |
| `ENABLE_JTI_DENYLIST` | `true` | Skips revocation check |
| `ENABLE_VPN_DETECTION` | `true` | Returns `vpnDetected: false` |

### Webhook Security

- Signature: `X-SignalRisk-Signature: sha256=<hmac-sha256-hex>`
- Secret per subscription, stored hashed
- Retry: exponential backoff up to 72 hours
- DLQ after 10 consecutive failures

---

## 8. API Reference Summary

Full reference: `docs/dev/api-reference.md` | OpenAPI spec: `docs/api/openapi-merged.yaml`

### Authentication

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/auth/token` | Issue JWT (client_credentials or refresh_token) |
| POST | `/v1/auth/token/refresh` | Refresh access token |
| POST | `/v1/auth/logout` | Revoke current token (add jti to denylist) |
| POST | `/v1/auth/register` | Register new merchant |

### Events

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/events` | Ingest fraud event (API key auth) |
| GET | `/v1/dlq/events` | List DLQ exhausted events |

### Cases

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/cases` | List cases (filterable by status, priority, search) |
| GET | `/v1/cases/:id` | Get case with evidence timeline |
| PUT | `/v1/cases/:id/resolve` | Resolve case (FRAUD / LEGITIMATE / INCONCLUSIVE) |
| PUT | `/v1/cases/:id/escalate` | Escalate case to senior analyst |
| GET | `/v1/cases/stats` | Labeling statistics for today |

### Rules

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/admin/rules` | List all rules |
| POST | `/v1/admin/rules` | Create rule |
| PUT | `/v1/admin/rules/:id` | Update rule |
| DELETE | `/v1/admin/rules/:id` | Delete rule |
| PATCH | `/v1/admin/rules/:id/weight` | Update rule weight |
| PATCH | `/v1/admin/rules/:id/active` | Toggle rule active state |

### Analytics

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/analytics/kpi` | KPI metrics (decisions/hr, block rate, latency) |
| GET | `/v1/analytics/velocity` | Decision trend for last 60 minutes |
| GET | `/v1/analytics/merchants` | Per-merchant event volume and risk |

### Admin

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/admin/users` | List admin users |
| POST | `/v1/admin/users` | Create admin user |
| GET | `/v1/admin/health` | Service health across all 13 services |

---

## 9. SDK Integration

### Web SDK (`@signalrisk/web-sdk`)

```bash
npm install @signalrisk/web-sdk
```

```typescript
import { SignalRisk } from '@signalrisk/web-sdk';

const sr = new SignalRisk({
  apiKey: 'sk_test_your_key',
  endpoint: 'https://api.signalrisk.io',
  merchantId: 'your_merchant_id',
});

await sr.init();          // starts behavioural tracker, resolves deviceId
sr.track('checkout', { amount: 49.99 });
await sr.flush();         // force-sends buffered events
sr.destroy();             // removes listeners
```

Events are buffered and auto-flushed every 5s or after 10 events accumulate.

### Mobile SDK (`@signalrisk/mobile-sdk`)

See `docs/dev/mobile-sdk-reference.md` for React Native integration.

### Webhook Verification

```typescript
import { createHmac } from 'crypto';

function verifyWebhook(rawBody: string, signature: string, secret: string): boolean {
  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  return expected === signature;
}

// In your endpoint handler:
const sig = req.headers['x-signalrisk-signature'] as string;
if (!verifyWebhook(req.rawBody, sig, process.env.WEBHOOK_SECRET)) {
  return res.status(401).send('Invalid signature');
}
```

---

## 10. Deployment

### Docker Compose (local development)

```bash
# Start infrastructure (Postgres, Redis, Kafka, Neo4j)
docker compose up -d

# Start all services
pnpm --filter auth-service dev
pnpm --filter event-collector dev
# ... or use the root dev script
```

### Kubernetes (production)

Helm umbrella chart in `helm/signalrisk/`:

```bash
# Install to staging
helm upgrade --install signalrisk ./helm/signalrisk \
  --namespace signalrisk-staging \
  --values helm/signalrisk/values.staging.yaml

# Production (manual approval via ArgoCD)
# See docs/deployment/argocd-app-of-apps.yaml
```

Each service has:
- `HorizontalPodAutoscaler` (min 2, max 10 replicas)
- Liveness probe: `GET /health`
- Readiness probe: `GET /health/ready`
- Resource limits: 256m CPU / 512Mi memory (default)

### ArgoCD GitOps

- Staging: auto-sync on push to `main`
- Production: manual approval required
- Rollback: `helm rollback signalrisk <revision> -n signalrisk-production`

---

## 11. Configuration Reference

All services read configuration from environment variables. Sensitive values must be stored in Kubernetes Secrets.

### Common (all services)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string |
| `JWT_PUBLIC_KEY` | Yes | RS256 public key (PEM) |
| `NODE_ENV` | Yes | `development` / `production` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | No | OpenTelemetry collector URL |

### auth-service

| Variable | Description |
|----------|-------------|
| `JWT_PRIVATE_KEY` | RS256 private key (PEM) |
| `JWT_ACCESS_TTL` | Access token TTL in seconds (default: 900) |
| `JWT_REFRESH_TTL` | Refresh token TTL in seconds (default: 604800) |
| `ENABLE_JTI_DENYLIST` | Enable JWT revocation check (default: true) |

### event-collector

| Variable | Description |
|----------|-------------|
| `KAFKA_BROKERS` | Comma-separated broker list |
| `ENABLE_API_KEY_VALIDATION` | Enable API key check (default: true) |

### decision-service

| Variable | Description |
|----------|-------------|
| `SIGNAL_TIMEOUT_MS` | Per-signal fetch timeout (default: 150) |
| `DEVICE_INTEL_URL` | device-intel-service base URL |
| `VELOCITY_URL` | velocity-service base URL |
| `BEHAVIORAL_URL` | behavioral-service base URL |
| `NETWORK_URL` | network-intel-service base URL |
| `TELCO_URL` | telco-intel-service base URL |
| `GRAPH_URL` | graph-intel-service base URL |

### network-intel-service

| Variable | Description |
|----------|-------------|
| `ENABLE_VPN_DETECTION` | Enable VPN/proxy ASN detection (default: true) |

---

## 12. Observability

### Distributed Tracing

All services export OpenTelemetry spans to the configured OTLP endpoint. Trace context is propagated via `traceparent` HTTP header.

Key spans:
- `decision.evaluate` — full decision latency
- `signal.fetch.{serviceName}` — individual signal fetch latency
- `rule.evaluate` — rule engine evaluation time
- `kafka.publish` / `kafka.consume` — message queue operations

### Metrics (Prometheus)

Each service exposes `/metrics` for Prometheus scraping.

Key metrics:
- `signalrisk_decisions_total{outcome}` — decision counts by outcome
- `signalrisk_decision_duration_ms` — decision latency histogram
- `signalrisk_kafka_consumer_lag` — Kafka consumer lag
- `signalrisk_signal_fetch_duration_ms{service}` — per-signal latency
- `signalrisk_rule_hits_total{ruleId}` — rule hit counts

### Alerts

Alert rules in `k8s/monitoring/`:
- Decision p99 > 100ms for 5 minutes
- Kafka consumer lag > 1000 for 10 minutes
- Error rate > 1% for 5 minutes
- Service down (no healthy pods)

### Log Format

Structured JSON logs via `nestjs-pino`. All logs include:
```json
{
  "level": "info",
  "time": "2026-03-06T...",
  "service": "decision-service",
  "merchantId": "...",
  "traceId": "...",
  "msg": "..."
}
```

---

## 13. Performance & SLAs

| Metric | Target | Test Result |
|--------|--------|------------|
| Decision p99 latency | < 100ms | ~82ms |
| Decision p95 latency | < 50ms | ~41ms |
| Throughput | >= 5,000 req/s | 5,200 req/s |
| Availability | 99.9% | — |
| Kafka consumer lag | < 1,000 msgs | < 200 |
| Redis cache hit rate | > 80% | ~87% |
| Signal fetch timeout | 150ms (per signal) | — |

Load tests run with k6 — see `docs/runbooks/load-testing.md`.

---

## 14. Development Setup

### Prerequisites

- Node.js 20+
- pnpm 8+
- Docker & Docker Compose
- (Optional) `ts-node` for running mock server

### Quick Start

```bash
# Clone and install
git clone https://github.com/your-org/signalrisk
cd signalrisk
pnpm install

# Start infrastructure
docker compose up -d

# Run database migrations
pnpm --filter db-migrations migrate

# Start services (each in separate terminal or use tmux)
pnpm --filter auth-service dev
pnpm --filter event-collector dev
pnpm --filter decision-service dev
# ... etc.

# Start dashboard with mock server
cd tests/e2e && npx ts-node mock-server/server.ts &
cd apps/dashboard && pnpm dev
# Dashboard: http://localhost:5173
# Mock API: http://localhost:3000
```

### Running Tests

```bash
# All unit tests
pnpm test

# Specific service
pnpm --filter auth-service test

# E2E tests (requires mock server running)
cd tests/e2e && pnpm test

# Load tests (requires all services running)
cd tests/load && k6 run full-stack.js
```

### Dashboard Login (development)

- URL: `http://localhost:5173`
- Admin: `admin@signalrisk.com` / `password`
- Analyst: `analyst@signalrisk.com` / `password`

---

## 15. FraudTester Framework

FraudTester is an integrated adversarial testing framework for validating SignalRisk's detection capabilities.

### Architecture

```
┌──────────────────────────┐
│   Dashboard (Battle Arena)│
│   Socket.io client        │
└───────────┬──────────────┘
            │ WebSocket
┌───────────▼──────────────┐
│   fraud-tester :3020      │
│                           │
│   ┌─────────────────────┐ │
│   │ FraudSimulationAgent│ │     ┌───────────────────┐
│   │ AdversarialAgent    │─┼────►│ IFraudSystemAdapter│
│   │ ChaosAgent          │ │     │  ├ SignalRiskAdapter│
│   └─────────────────────┘ │     │  ├ GenericHttpAdapter│
│                           │     │  └ MockAdapter      │
│   ┌─────────────────────┐ │     └───────────────────┘
│   │ ScenarioRunner      │ │              │
│   │ DetectionReporter   │ │     ┌────────▼──────────┐
│   └─────────────────────┘ │     │ event-collector    │
└──────────────────────────┘     │ (X-SignalRisk-Test) │
                                  └────────────────────┘
```

### Adapter Interface (FROZEN)

```typescript
interface IFraudSystemAdapter {
  name: string;
  submitEvent(event: FraudTestEvent): Promise<FraudDecision>;
  getDecision(eventId: string): Promise<FraudDecision>;
  reset(): Promise<void>;
}
```

The adapter interface is frozen — changes require an E7 impact assessment.

### Scenario Categories

| Category | Scenarios | Expected Outcome |
|----------|-----------|-----------------|
| Device | Device Farm, Emulator Spoof | BLOCK (risk > 0.8) |
| Velocity | Velocity Evasion | REVIEW/BLOCK |
| Bot | Bot Checkout | BLOCK |
| Identity | SIM Swap | REVIEW/BLOCK |
| Adversarial | Emulator Bypass, Slow Fraud, Bot Evasion | Tests detection limits |

### Agents

| Agent | Purpose | Metric |
|-------|---------|--------|
| FraudSimulationAgent | Standard fraud scenarios | Detection rate, TPR |
| AdversarialAgent | Bypass detection | Evasion rate (inverse) |
| ChaosAgent | System resilience | Recovery time, fail-closed |

---

## 16. Test Isolation

FraudTester traffic is isolated from production data using a header-based flag that propagates through the entire pipeline.

### Flow

```
fraud-tester                     event-collector              Kafka
  │                                    │                        │
  │ POST /v1/events                    │                        │
  │ X-SignalRisk-Test: true            │                        │
  │───────────────────────────────────►│                        │
  │                                    │ Kafka header:          │
  │                                    │ is-test: "true"        │
  │                                    │───────────────────────►│
  │                                    │                        │
  │                              velocity-service         decision-service
  │                                    │                        │
  │                              Redis keys prefixed      is_test=true
  │                              with "test:"             in decisions table
  │                                                             │
  │                                                       webhook-service
  │                                                             │
  │                                                       SKIPPED (no webhook)
```

### Isolation Points

| Layer | Mechanism | Effect |
|-------|-----------|--------|
| HTTP | `X-SignalRisk-Test: true` header | Signals test traffic at ingestion |
| Kafka | `is-test: "true"` message header | Propagates flag to all consumers |
| Velocity (Redis) | `test:{merchantId}` key prefix | Separate counter namespace |
| Decisions (PostgreSQL) | `is_test BOOLEAN` column | Permanent audit trail |
| Analytics | `WHERE is_test = false` | Test data excluded from all metrics |
| Webhooks | Skip delivery when `is-test` | No false alerts to merchants |

### Database Migration

```sql
-- 005_test_isolation.sql
ALTER TABLE decisions ADD COLUMN is_test BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX idx_decisions_is_test ON decisions(is_test) WHERE is_test = true;
```

### Configuration

No configuration needed. The `X-SignalRisk-Test` header is automatically set by the FraudTester SignalRisk adapter. Manual test traffic can also use this header:

```bash
curl -X POST http://localhost:3002/v1/events \
  -H "Authorization: Bearer sk_test_..." \
  -H "X-SignalRisk-Test: true" \
  -H "Content-Type: application/json" \
  -d '{"events": [...]}'
```

---

*For production deployment details see `docs/runbooks/go-live-checklist.md`.*
*For security incident response see `docs/runbooks/on-call-playbook.md`.*
