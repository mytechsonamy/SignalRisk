# SignalRisk -- Comprehensive Architecture Document

> Consolidated architecture reference | March 2026 | Sprint 41 baseline
>
> This document is the single authoritative architecture reference for SignalRisk.
> It consolidates information from across the codebase. Where details are extensive,
> pointers to canonical source files are provided.

---

## Table of Contents

1.  [Executive Summary](#1-executive-summary)
2.  [System Architecture Overview](#2-system-architecture-overview)
3.  [Data Flow & Event Pipeline](#3-data-flow--event-pipeline)
4.  [Decision Engine Pipeline](#4-decision-engine-pipeline)
5.  [Stateful Fraud Detection](#5-stateful-fraud-detection)
6.  [Closed-Loop Fraud Cycle](#6-closed-loop-fraud-cycle)
7.  [Multi-Tenancy Model](#7-multi-tenancy-model)
8.  [Security Model](#8-security-model)
9.  [Database Schema](#9-database-schema)
10. [Service Catalogue](#10-service-catalogue)
11. [Shared Packages](#11-shared-packages)
12. [Dashboard](#12-dashboard)
13. [Observability](#13-observability)
14. [Quality Gates & Testing](#14-quality-gates--testing)
15. [Production Readiness](#15-production-readiness)
16. [Architecture Decision Records](#16-architecture-decision-records)
17. [Configuration Reference](#17-configuration-reference)

---

## 1. Executive Summary

SignalRisk is a real-time fraud decision engine for payment and carrier billing
events. It evaluates incoming transactions against multiple intelligence signals
and returns an ALLOW / REVIEW / BLOCK decision within a p99 latency budget of
under 200ms.

**Platform at a glance:**

| Dimension              | Value                                                       |
|------------------------|-------------------------------------------------------------|
| Backend services       | 15 NestJS microservices (Node.js 20)                        |
| Frontend               | React 18 + Vite + Zustand + TailwindCSS dashboard           |
| Docker containers      | 19 total (4 infrastructure + 15 application)                |
| Data stores            | PostgreSQL 16, Redis 7, Kafka (KRaft), Neo4j 5              |
| Unit tests             | 934+ across 71 test suites                                  |
| E2E tests              | 78 tests across 12 spec files, 3 Playwright projects        |
| DSL rules              | 21 live rules (10 base + 5 stateful + 3 sequence + 3 graph) |
| Kafka topics           | 12 canonical topics                                         |
| DB migrations          | 15 (001-015)                                                |
| ADRs                   | 16 (ADR-001 through ADR-016)                                |
| Production maturity    | Level 4/5 -- all 8 execution steps complete                 |

**Key capabilities:**

- Multi-signal risk scoring (device, behavioural, network, velocity, telco, graph)
- DSL-based rule engine with hot reload and per-rule weights
- Stateful fraud detection: typed entity memory, sequence detection, graph enrichment
- Closed-loop fraud cycle: event -> decision -> case -> analyst label -> watchlist -> next decision
- Case management queue with SLA monitoring
- Multi-tenant isolation via 5 defense layers (JWT, RLS, Redis namespace, Kafka, WebSocket rooms)
- Webhook delivery with HMAC-SHA256 signing
- Feature flag service with rollout percentages
- Adversarial fraud testing framework (FraudTester) with 5 AI agents
- Real-time dashboard with RS256 JWKS-authenticated WebSocket live feed

> See also: `docs/TECHNICAL.md` for full API reference, `docs/stateful-fraud-architecture.md` for state layer design.
> Additional references: `docs/architecture/data-model.md`, `docs/product/merchant-integration-guide.md`

---

## 2. System Architecture Overview

### Service Map

```
                    +--------------------------------------------------+
                    |                   Clients                        |
                    |  Web SDK  |  Mobile SDK  |  Dashboard :5173      |
                    +--------------------------------------------------+
                                         |
                             (HTTPS + JWT / API Key)
                                         |
                    +--------------------v-----------------------------+
                    |              auth-service :3001                  |
                    |   JWT RS256 | API Keys | DB-backed operator     |
                    |   login + password flows                        |
                    +--------------------+-----------------------------+
                                         |
                    +--------------------v-----------------------------+
                    |           event-collector :3002                  |
                    |   Validation | Backpressure | Kafka Publish     |
                    +--------------------+-----------------------------+
                                         |
                           Kafka: signalrisk.events.raw
                                         |
                    +--------------------v-----------------------------+
                    |           decision-service :3009                 |
                    |                                                  |
                    |  +------------------------------------------+   |
                    |  |         Signal Aggregation               |   |
                    |  |   (fetchAllSignals + circuit breaker)    |   |
                    |  +--+------+------+------+------+-----------+   |
                    |     |      |      |      |      |               |
                    |  dev   beh   net  telco  vel  graph             |
                    |  :3003 :3005 :3006 :3007 :3004 :3012           |
                    |                                                  |
                    |  +------------------------------------------+   |
                    |  |         Rule Engine :3008                |   |
                    |  |   DSL eval + stateful overrides          |   |
                    |  +------------------------------------------+   |
                    |                                                  |
                    |  Watchlist enforcement + feature snapshots      |
                    |  Output: ALLOW / BLOCK / REVIEW                 |
                    +--------------------+-----------------------------+
                                         |
                    +--------------------v-----------------------------+
                    |           Kafka: signalrisk.decisions           |
                    +------+---------------------+--------------------+
                           |                     |
              +------------v----------+   +-----------v--------------+
              |  case-service :3010   |   |  webhook-service :3011   |
              |  Case mgmt + RLS      |   |  HMAC-SHA256 delivery    |
              +-----------------------+   +--------------------------+
                           |
              +------------v-----------------------------------------+
              |         Kafka: signalrisk.state.labels               |
              |  analyst labels -> decision feedback consumers       |
              +------------------------------------------------------+

    +-------------------+    +-------------------+    +-------------------+
    | feature-flag      |    | outbox-relay      |    | fraud-tester      |
    | :3013             |    | :3014             |    | :3020             |
    | Rollout % +       |    | Transactional     |    | 5 agents, 9+     |
    | allowlist          |    | outbox pattern    |    | scenarios          |
    +-------------------+    +-------------------+    +-------------------+
```

### Container Topology

**Infrastructure (4 containers):**

| Container  | Image                        | Host Port | Internal Port | Purpose                    |
|------------|------------------------------|-----------|---------------|----------------------------|
| postgres   | postgres:16-alpine           | 15432     | 5432          | Multi-tenant DB, RLS       |
| redis      | redis:7-alpine               | 16379     | 6379          | Cache, rate limit, velocity|
| kafka      | confluentinc/cp-kafka:7.6.0  | 9094      | 9092          | KRaft mode, gzip           |
| neo4j      | neo4j:5-community            | 7474/7687 | 7474/7687     | Graph intelligence         |

**Application (15 containers):**

| Service                | Docker PORT | Purpose                              |
|------------------------|-------------|--------------------------------------|
| auth-service           | 3001        | JWT RS256, API keys, DB-backed login |
| event-collector        | 3002        | Event ingestion, Kafka publish       |
| device-intel-service   | 3003        | Device fingerprinting, trust score   |
| velocity-service       | 3004        | Velocity counters, sliding windows   |
| behavioral-service     | 3005        | Behavioural fingerprinting, z-score  |
| network-intel-service  | 3006        | IP reputation, VPN/proxy detection   |
| telco-intel-service    | 3007        | Phone validation, SIM swap detection |
| rule-engine-service    | 3008        | DSL rule parsing and evaluation      |
| decision-service       | 3009        | Signal aggregation, final scoring    |
| case-service           | 3010        | Case CRUD, SLA, analyst assignment   |
| webhook-service        | 3011        | Signed webhook delivery, retries     |
| graph-intel-service    | 3012        | Neo4j graph analysis, fraud rings    |
| feature-flag-service   | 3013        | Feature flag CRUD, rollout %         |
| outbox-relay           | 3014        | Transactional outbox publishing      |
| dashboard              | 5173        | React analyst dashboard (Vite dev)   |
| fraud-tester           | 3020        | Adversarial testing framework        |

All backend services are NestJS on Node.js 20. All expose `GET /health` (liveness)
and `GET /health/ready` (readiness) endpoints.

### Docker Startup Order

```
postgres, redis, kafka, neo4j          (infra -- parallel)
  -> auth-service
  -> event-collector
  -> device-intel, velocity, behavioral, network-intel, telco-intel  (parallel)
  -> rule-engine-service, graph-intel-service
  -> decision-service  (depends on all signal services)
  -> case-service, webhook-service
  -> feature-flag-service, outbox-relay
  -> dashboard
```

### Dockerfile Build Strategy

4-stage multi-stage build (~28s per service):

1. `deps` -- install production dependencies
2. `pkg-builder` -- build shared packages
3. `builder` -- compile TypeScript
4. `runner` -- minimal production image

> See also: `docs/claude/service-map.md` for detailed port map, `docker-compose.full.yml` for full config.

---

## 3. Data Flow & Event Pipeline

### Request Lifecycle (12 Steps)

1. Client sends event via SDK -> `POST /v1/events` on **event-collector**
2. API key validated (`sk_test_` prefix lookup); event schema validated via `@signalrisk/event-schemas`
3. Valid events published to Kafka topic `signalrisk.events.raw` (gzip compression)
4. Invalid events routed to DLQ with 5s timeout (fire-and-forget, does not block HTTP response)
5. **decision-service** Kafka consumer picks up event, calls `fetchAllSignals()` for 6 parallel signal fetches + stateful context enrichment
6. Signal fetches use configurable timeout (default 2000ms in Docker) with circuit breaker (3 fails -> 30s open)
7. Weighted risk score computed from available signals; DSL rules (21 total) evaluated as override layer
8. Decision-time watchlist lookup applies closed-loop state: denylist short-circuits to BLOCK, watchlist boosts score, allowlist suppresses score
9. Decision published to `signalrisk.decisions`, cached in Redis (5s TTL), persisted with typed `entity_id`/`entity_type`
10. **case-service** creates a case for BLOCK/REVIEW outcomes, publishing analyst labels to `signalrisk.state.labels`
11. **webhook-service** delivers signed webhook to merchant endpoint (skipped for test traffic)
12. **decision-service** updates durable entity profile state and writes feature snapshots (fire-and-forget)

### Kafka Topics

Canonical topic names are defined in `packages/kafka-config/src/index.ts`. All services
must import from `@signalrisk/kafka-config` -- hardcoded topic strings are prohibited (R4).

| Topic                               | Producer           | Consumer(s)                       | Purpose                                    |
|--------------------------------------|--------------------|------------------------------------|--------------------------------------------|
| `signalrisk.events.raw`             | event-collector    | decision-service, velocity-service | Main event stream                          |
| `signalrisk.events.dlq`             | event-collector    | ops/monitoring                     | Failed events after retry                  |
| `signalrisk.events.dlq.exhausted`   | event-collector    | ops                                | Permanent failures                         |
| `signalrisk.decisions`              | decision-service   | case-service, webhook-service      | Decision outcomes                          |
| `signalrisk.rules.changes`          | rule-engine        | rules-sync consumers               | Rule update notifications                  |
| `signalrisk.enrichment.telco`       | event-collector    | telco-intel-service                | Async telco enrichment                     |
| `signalrisk.cases`                  | case-service       | notification consumers             | Case creation events                       |
| `signalrisk.webhooks`               | webhook-service    | webhook dispatcher                 | Outbound merchant notifications            |
| `signalrisk.consent`                | consent flows      | consent-enforcer                   | GDPR/KVKK consent events                  |
| `signalrisk.merchants`              | outbox-relay       | merchant lifecycle consumers       | Merchant onboarding/updates                |
| `signalrisk.events.unrouted`        | outbox-relay       | ops                                | Unmappable events                          |
| `signalrisk.state.labels`           | case-service       | decision-service feedback consumer | Analyst label propagation                  |

### Consumer Groups

| Group ID                            | Service            |
|-------------------------------------|--------------------|
| `signalrisk.cg.decision-engine`     | decision-service   |
| `signalrisk.cg.enrichment-telco`    | telco-intel        |
| `signalrisk.cg.case-manager`        | case-service       |
| `signalrisk.cg.webhook-dispatcher`  | webhook-service    |
| `signalrisk.cg.rules-sync`          | rule-engine        |
| `signalrisk.cg.analytics`           | analytics pipeline |
| `signalrisk.cg.dlq-processor`       | DLQ reprocessing   |
| `signalrisk.cg.consent-enforcer`    | consent service    |
| `signalrisk.cg.notifications`       | notification       |
| `signalrisk.cg.state-labels`        | feedback consumer  |

### Partition Key Strategy

Events are partitioned by `{merchantId}:{sessionId}` to ensure ordering within a
session while distributing load across partitions.

### Kafka Resilience (ADR-001, Sprint 33-34)

- **Producer send timeout:** 10s `Promise.race` wrapper prevents indefinite hangs
- **DLQ send timeout:** 5s `Promise.race` prevents HTTP response hanging
- **Lag poll timeout:** 10s timeout on consumer group offset polling
- **Deferred initial poll:** First lag poll delayed 2s after startup
- **Compression:** gzip (LZ4 not supported by KafkaJS, snappy untested -- ADR-005)
- **Idempotent producer:** `idempotent: true`, `maxInFlightRequests: 5`

### DLQ Behaviour

- Events failing validation are routed to `signalrisk.events.dlq` with error context
- DLQ send failure is logged but does not fail the HTTP request (fire-and-forget)
- In-memory cache (max 1000, FIFO eviction) holds exhausted events for ops inspection
- Endpoint: `GET /v1/dlq/events` returns cached exhausted events

### Backpressure

The event-collector monitors Kafka consumer lag via periodic admin client polling.
When lag exceeds threshold, it returns HTTP 429 with `Retry-After` header. Lag poll
interval defaults to 5000ms with a 10s timeout.

> See also: `docs/TECHNICAL.md` section 5 for event schema details.

---

## 4. Decision Engine Pipeline

### Signal Aggregation

The decision-service fetches all signals via `fetchAllSignals()` which runs
6 signal fetches in parallel plus stateful context enrichment:

```
fetchAllSignals()
  |
  +-- device-intel-service  :3003   (fingerprint, emulator, trust score)
  +-- velocity-service      :3004   (tx counts, sliding windows)
  +-- behavioral-service    :3005   (mouse/keyboard/scroll anomaly)
  +-- network-intel-service :3006   (IP reputation, VPN/proxy, geo)
  +-- telco-intel-service   :3007   (phone validation, SIM swap)
  +-- graph-intel-service   :3012   (fraud ring, device/IP sharing)
  |
  +-- Stateful context enrichment:
      +-- Prior-decision memory (PostgreSQL, 50ms timeout)
      +-- Sequence detection (Redis sequence buffers)
      +-- Graph features (Neo4j)
```

**Circuit breaker:** If a signal service fails 3 consecutive times, the circuit
opens for 30s. Available signals are renormalized to maintain consistent scoring.

**Timeout:** Configurable via `SIGNAL_TIMEOUT_MS` (default 150ms, 2000ms in Docker
per ADR-002). Timeout or error yields null signal -- decision continues with
reduced signal set (graceful degradation).

### Signal Weights

| Signal          | Default Weight | Notes                        |
|-----------------|:--------------:|------------------------------|
| device-intel    | 0.35           | Primary signal               |
| velocity        | 0.25           | Temporal patterns            |
| behavioral      | 0.20           | Human vs bot detection       |
| network-intel   | 0.15           | IP and geo reputation        |
| telco-intel     | 0.05           | Telecom risk signals         |
| graph-intel     | additive       | Modifier, not weighted blend |

**Score renormalization:** When signals time out or fail, available signal weights
are renormalized to sum to 1.0. Example: if only velocity (0.25) and device (0.35)
respond, velocity contributes 0.25/0.60 = 41.7% and device 0.35/0.60 = 58.3%.

### Score Thresholds

| Score Range | Decision |
|-------------|----------|
| >= 70       | BLOCK    |
| 40 -- 69    | REVIEW   |
| < 40        | ALLOW    |

### DSL Override Layer

After the weighted score produces a threshold-based action, all 21 DSL rules are
evaluated against the full signal context. Rule categories:

| Category  | Count | Example Rule                                                       |
|-----------|:-----:|--------------------------------------------------------------------|
| Base      | 10    | `emulator_block: device.isEmulator == true -> BLOCK W=1.0`        |
| Stateful  | 5     | `repeat_blocker: stateful.customer.previousBlockCount30d > 2 -> BLOCK W=0.9` |
| Sequence  | 3     | `rapid_sequence: stateful.sequence.loginToPaymentUnder30s == true -> REVIEW W=0.8` |
| Graph     | 3     | `fraud_ring: stateful.graph.fraudRingScore > 0.8 -> BLOCK W=1.0`  |

Override semantics: BLOCK rules override any action; REVIEW rules upgrade ALLOW to
REVIEW. Rules have weights in range [0.1, 1.0] adjustable via the feedback loop.

Available DSL contexts: `device`, `velocity`, `behavioral`, `network`, `telco`,
`txn`, `stateful` (including `stateful.customer.*`, `stateful.device.*`,
`stateful.ip.*`, `stateful.graph.*`, `stateful.sequence.*`).

### Feedback Loop (Rule Weight Adjustment)

1. Analyst labels case as FRAUD or LEGITIMATE
2. Feedback event published to `signalrisk.feedback`
3. rule-engine adjusts rule weight: +0.05 for FRAUD confirmation, -0.03 for false positive
4. Weights clamped to [0.1, 1.0]
5. New weights stored in Redis and PostgreSQL

### Analytics Endpoints

| Endpoint                           | Description                       |
|------------------------------------|-----------------------------------|
| `GET /v1/analytics/trends?days=N`  | Daily decision trend data         |
| `GET /v1/analytics/risk-buckets`   | Risk score distribution           |
| `GET /v1/analytics/kpi`            | KPI summary                       |
| `GET /v1/analytics/merchants`      | Per-merchant volume and risk      |
| `GET /v1/analytics/minute-trend`   | Minute-level trend (last 60 min)  |
| `GET /metrics/decision-latency`    | Latency percentile stats          |

> See also: `docs/TECHNICAL.md` section 6 for rule DSL syntax.

---

## 5. Stateful Fraud Detection

SignalRisk implements a layered stateful fraud detection architecture built across
Sprints 0-8 of the stateful fraud roadmap. All 9 sprints are complete.

### Entity Identity Standard (ADR-009)

Three typed entity classes are tracked independently:

| Entity Type | Source                                     | Redis Key Pattern                               |
|-------------|--------------------------------------------|-------------------------------------------------|
| `customer`  | `payload.customerId \|\| entityId`         | `{merchantId}:vel:{dim}:customer:{id}`          |
| `device`    | `deviceId` (authoritative: device-intel)   | `{merchantId}:vel:{dim}:device:{id}`            |
| `ip`        | `ipAddress` (normalized lowercase)         | `{merchantId}:vel:{dim}:ip:{id}`                |

Entity type enum: `'customer' | 'device' | 'ip'`. A single event updates counters
for all three entity types.

### State Classes

| Class                      | Store      | Examples                                              | Latency |
|----------------------------|------------|-------------------------------------------------------|---------|
| Hot online state           | Redis      | tx_count_10m, distinct_accounts_24h, sequence markers | < 5ms   |
| Durable operational state  | PostgreSQL | 30-day decision summary, watchlist, case outcomes     | < 50ms  |
| Event propagation state    | Kafka      | Analyst labels, feature updates, graph edge additions | async   |
| Connected-entity state     | Neo4j      | Fraud ring scores, device/IP sharing across accounts  | < 60ms  |

### Prior-Decision Memory (ADR-011)

Decision-service queries the `decisions` table for prior BLOCK/REVIEW counts
per entity, with the following guardrails:

- **Lookback:** Maximum 30 days
- **Index:** Composite `(merchant_id, entity_id, entity_type, created_at DESC)`
- **Timeout:** 50ms circuit breaker
- **Fallback:** Timeout yields `{previousBlockCount: 0, previousReviewCount: 0}`
- **Migration 013:** Added `entity_id` and `entity_type` columns with backfill

### Entity Profiles

Auto-updated on each decision (fire-and-forget UPSERT). Stored in `entity_profiles`
table (migration 008) with columns for first/last seen, risk memory score,
fraud confirmation status, and watchlist status. RLS enforced.

### Feature Snapshots (ADR-016)

`decision_feature_snapshots` table (migration 009) stores the exact feature vector
used during each decision. `DecisionStoreService.saveFeatureSnapshot()` maps
SignalBundle fields to `f_*` structured columns plus a `signals_raw` JSON column
for ML pipeline consumption.

### Sequence Detection

Three patterns detected via Redis sequence buffers:

| Pattern                        | Detection Window | DSL Rule                    |
|--------------------------------|------------------|-----------------------------|
| Login then payment             | < 30 seconds     | `rapid_sequence`            |
| 3 failed payments then success | < 10 minutes     | `failed_then_success`       |
| Device change then payment     | < 30 minutes     | `device_change_payment`     |

### Graph Enrichment

`fetchGraphContext()` retrieves graph-derived features from Neo4j via
graph-intel-service:

- `stateful.graph.deviceSharedAccounts7d`
- `stateful.graph.ipSharedAccounts24h`
- `stateful.graph.linkedFraudCount2hop`
- `stateful.graph.fraudRingScore`
- `stateful.graph.clusterRiskScore`

### Stateful Feature Namespace Convention (ADR-010)

All stateful features follow the path `stateful.{entityType}.{featureName}` with
camelCase feature names. All features must be registered in
`docs/claude/source-of-truth.md#stateful-namespace` before use in rules.

> See also: `docs/stateful-fraud-architecture.md` for full state layer design,
> `docs/stateful-fraud-roadmap.md` for implementation timeline.

---

## 6. Closed-Loop Fraud Cycle

The full closed-loop fraud cycle operates as follows:

```
  +----------+     +-----------+     +----------+     +----------+
  |  Event   | --> | Decision  | --> |   Case   | --> | Analyst  |
  | Ingest   |     | Engine    |     | Created  |     | Review   |
  +----------+     +-----------+     +----------+     +----------+
                        ^                                   |
                        |                                   v
                   +-----------+     +-----------+    +----------+
                   | Next      | <-- | Watchlist | <--| Label    |
                   | Decision  |     | Updated   |    | Applied  |
                   | BLOCK     |     |           |    | (FRAUD)  |
                   +-----------+     +-----------+    +----------+
```

### Analyst Feedback Policy (ADR-012)

| Resolution      | Effect                                                                  |
|-----------------|-------------------------------------------------------------------------|
| `FRAUD`         | Entity added to denylist + `previousFraudCount` incremented + linked device/IP risk bonus (+20) |
| `LEGITIMATE`    | Risk suppression: 7-day cooldown preventing same rule from generating REVIEW |
| `INCONCLUSIVE`  | No state change. Case closed only.                                      |

### Watchlist Enforcement (ADR-015)

Decision-time watchlist check with precedence: **denylist > watchlist > allowlist**

| List Type   | Decision-Time Effect                                        |
|-------------|-------------------------------------------------------------|
| `denylist`  | Deterministic BLOCK (short-circuit, scoring skipped)        |
| `watchlist` | Score boost +20 (additive)                                  |
| `allowlist` | Score suppression -15 (reductive, thresholds still active)  |

Timeout: 50ms with fallback `{isDenylisted: false, isWatchlisted: false}`.

### Feedback Consumer

The decision-service feedback consumer subscribes to `signalrisk.state.labels`:

- `FRAUD` label -> denylist UPSERT for entity
- `LEGITIMATE` label -> denylist deactivate + allowlist 30-day cooldown
- Entity profiles updated on each decision (UPSERT, fire-and-forget)

### Label Publishing

Case resolution in case-service publishes typed labels to `signalrisk.state.labels`
with `entity_type`, `entity_id`, `merchant_id`, `label`, `reason`, and
`source_case_id`.

> See also: `docs/claude/decision-log.md` ADR-012, ADR-015 for policy details.

---

## 7. Multi-Tenancy Model

SignalRisk enforces tenant isolation across 5 defense layers:

```
+---------------------------------------------------------------+
| Layer 1: JWT Tenant Context                                    |
|   JWT contains merchant_id, validated on every request         |
|   AsyncLocalStorage propagates tenant context                  |
+---------------------------------------------------------------+
| Layer 2: PostgreSQL Row-Level Security                         |
|   SET app.merchant_id per connection                           |
|   RESTRICTIVE RLS policy -- no WHERE clause bypass possible    |
|   11+ tables protected                                         |
+---------------------------------------------------------------+
| Layer 3: Redis Key Namespace Isolation                         |
|   All keys prefixed with merchantId                            |
|   Pattern: {merchantId}:vel:{dim}:{entityType}:{entityId}      |
|   No cross-prefix access                                       |
+---------------------------------------------------------------+
| Layer 4: Kafka Partitioning                                    |
|   Partition key: {merchantId}:{sessionId}                      |
|   Consumer groups per service, not per tenant                  |
|   Payloads include merchantId                                  |
+---------------------------------------------------------------+
| Layer 5: WebSocket Room Isolation (ADR-014)                    |
|   RS256 JWKS authentication on connection                      |
|   Admin role -> 'admin' room (sees all decisions)              |
|   Other roles -> 'merchant:{merchantId}' room                  |
|   Broadcast scoped to room only                                |
+---------------------------------------------------------------+
```

**Mandatory negative tests:** Every sprint includes cross-tenant access attempt
tests that must fail. Cross-tenant data leakage is a stop-the-line condition.

**PostgreSQL RLS details:**

- All queries set `app.merchant_id` via `SET LOCAL` before execution
- Single RESTRICTIVE policy prevents permissive OR bypass
- Parameterised queries only -- no string interpolation
- RLS isolation verified: 12/12 tests pass

> See also: `docs/cto-cio-presentation.md` Slide 4 for isolation architecture.

---

## 8. Security Model

### Two Authentication Systems (R1)

SignalRisk uses two distinct auth mechanisms -- they must never be mixed:

| System       | Used By           | Format                        | Verification               |
|--------------|-------------------|-------------------------------|-----------------------------|
| API Key      | event-collector   | `Bearer sk_test_<32 hex>`     | Lookup against `ALLOWED_API_KEYS` |
| JWT RS256    | All other services| `Bearer <jwt>`                | RS256 public key via JWKS   |

### Auth Store (R2)

- `MerchantsService` is PostgreSQL-backed (`merchants` table, `@Inject(PG_POOL)`)
- `RefreshTokenStore` is PostgreSQL-backed (`refresh_tokens` table)
- Dev seed merchants created in `onModuleInit()` with `NODE_ENV !== production` guard
- Seed merchant UUIDs: `00000000-0000-0000-0000-00000000000{1-4}`

### TenantGuard RS256 JWKS (R3, ADR-008)

The TenantGuard (case-service) fetches public keys from auth-service's
`/.well-known/jwks.json` endpoint and verifies JWT signatures with RS256:

- JWKS cached for 5 minutes
- Key rotation: kid mismatch triggers automatic refresh
- `AUTH_SERVICE_URL` env var (default: `http://auth-service:3001`)
- Admin role bypass: `payload.role === 'admin'` grants access to all merchants

### DB-Backed Dashboard Login (ADR-013)

- `POST /v1/auth/login` first tries `UsersService.findByEmail()` + `bcrypt.compare()`
- Fallback to seed users only when `NODE_ENV !== production`
- `users.email` has global unique constraint
- `invite()` generates temp password (single-use, not logged)
- Password change via `PATCH /v1/admin/users/:id/password`

### JWT Details

- Access tokens: RS256, 15 min TTL
- Refresh tokens: 7 day TTL
- JTI denylist: `jwt:revoked:{jti}` in Redis, TTL = remaining token lifetime
- Fail-closed: Redis unavailable -> HTTP 503 (not bypass)

### Authorization Guards

| Guard           | Used By           | Purpose                              |
|-----------------|-------------------|--------------------------------------|
| `JwtAuthGuard`  | Most services     | Validates JWT access token           |
| `ApiKeyGuard`   | event-collector   | Validates `sk_test_` API keys        |
| `AdminGuard`    | Admin endpoints   | Requires `role: admin` in JWT        |
| `TenantGuard`   | case-service      | Enforces merchant isolation via JWKS |

### Webhook Security

- Signature: `X-SignalRisk-Signature: sha256=<hmac-sha256-hex>`
- Secret per subscription, stored hashed
- Retry: exponential backoff up to 72 hours
- DLQ after 10 consecutive failures
- Test traffic (`is-test: true`) skips webhook delivery

> See also: `docs/TECHNICAL.md` section 7 for full security model.

---

## 9. Database Schema

### Migration History (001-015)

| Migration | Purpose                                                          |
|-----------|------------------------------------------------------------------|
| 001-005   | Core schema: merchants, users, devices, events, decisions, cases, refresh_tokens, outbox, idempotency |
| 006       | Cases TEXT to UUID migration                                     |
| 007       | Prior-decision memory: `getPriorDecisionMemory()` support        |
| 008       | Entity profiles table (`entity_profiles`) with RLS              |
| 009       | Decision feature snapshots (`decision_feature_snapshots`) with `f_*` columns |
| 010       | Analyst labels table (`analyst_labels`)                          |
| 011       | Watchlist entries table (`watchlist_entries`)                     |
| 012       | Feature definitions table (`feature_definitions`)                |
| 013       | `entity_id` + `entity_type` columns on `decisions` + backfill + composite index |
| 014       | Feature definitions registry parity (adds missing features, marks inactive ones) |
| 015       | `entity_type` on `cases` + `users.email` unique constraint      |

### Key Tables with RLS Status

| Table                        | RLS | ID Type | Tenant Scoped | Purpose                           |
|------------------------------|-----|---------|---------------|-----------------------------------|
| `merchants`                  | -   | UUID    | No (IS tenant)| Merchant definitions              |
| `users`                      | Yes | UUID    | Yes           | Dashboard operators               |
| `devices`                    | Yes | UUID    | Yes           | Device fingerprints               |
| `events`                     | Yes | UUID    | Yes           | Raw events (monthly partition)    |
| `decisions`                  | Yes | UUID    | Yes           | Decision outcomes                 |
| `cases`                      | Yes | UUID    | Yes           | Analyst review cases              |
| `refresh_tokens`             | Yes | UUID    | Yes           | JWT refresh tokens                |
| `idempotency_requests`       | Yes | UUID    | Yes           | Request dedup                     |
| `entity_profiles`            | Yes | UUID    | Yes           | Durable entity state              |
| `decision_feature_snapshots` | Yes | UUID    | Yes           | Feature vectors per decision      |
| `analyst_labels`             | Yes | UUID    | Yes           | Human fraud labels                |
| `watchlist_entries`          | Yes | UUID    | Yes           | Allow/deny/watch state            |
| `feature_definitions`        | -   | UUID    | No            | Feature registry                  |
| `outbox_events`              | -   | UUID    | No            | Transactional outbox              |
| `schema_migrations`          | -   | -       | No            | Migration version tracking        |

### Stateful Fraud Tables Detail

**`entity_profiles`**: Current durable profile per entity -- first/last seen,
risk memory score, analyst fraud confirmation, false positive count, watchlist status.

**`decision_feature_snapshots`**: Exact feature vector used during a decision --
structured `f_*` columns for ML export plus `signals_raw` JSON.

**`analyst_labels`**: Human fraud/legitimate labels with entity type, reason,
source case ID, and created_by.

**`watchlist_entries`**: Explicit allow/deny/watch state per entity with expiration.

**`feature_definitions`**: Feature registry with name, entity type, data type,
window, active status. Aligns with DSL namespace.

> See also: `database/migrations/`, `packages/db-migrations/`,
> `infrastructure/docker/initdb.d/` for SQL sources.

---

## 10. Service Catalogue

| Service                | Port | Responsibility                                                                  | Key Dependencies                    | Maturity     |
|------------------------|------|---------------------------------------------------------------------------------|--------------------------------------|--------------|
| auth-service           | 3001 | JWT RS256 issuance/refresh, API key mgmt, DB-backed login, user CRUD, JWKS      | PostgreSQL, Redis                    | Verified     |
| event-collector        | 3002 | Event ingestion, schema validation, Kafka publish, DLQ routing, backpressure    | Kafka, Redis (rate limit)            | Verified     |
| device-intel-service   | 3003 | Device fingerprinting, emulator/bot detection, trust score                      | PostgreSQL, Redis                    | Verified     |
| velocity-service       | 3004 | Transaction velocity counters, typed entity counters, sliding windows           | Redis, Kafka (consumer)              | Verified     |
| behavioral-service     | 3005 | Mouse/keyboard/scroll behavioural fingerprinting, z-score anomaly, EMA          | PostgreSQL                           | Verified     |
| network-intel-service  | 3006 | IP reputation, VPN/proxy detection, geo-mismatch, ASN lookup                    | External APIs                        | Verified     |
| telco-intel-service    | 3007 | Phone number validation, carrier risk scoring, SIM swap detection               | External APIs                        | Verified     |
| rule-engine-service    | 3008 | DSL rule parsing, evaluation, weight management, hot reload via feature flags   | PostgreSQL, Redis                    | Verified     |
| decision-service       | 3009 | Signal aggregation, DSL eval, stateful context, watchlist enforcement, analytics| All signal services, PostgreSQL, Redis, Kafka | Verified |
| case-service           | 3010 | Case CRUD, SLA monitoring, analyst assignment, TenantGuard, GDPR export, labels | PostgreSQL, Kafka, auth-service      | Verified     |
| webhook-service        | 3011 | Signed webhook delivery, retry queue, DLQ, test traffic skip                    | Kafka, PostgreSQL                    | Verified     |
| graph-intel-service    | 3012 | Neo4j entity relationship analysis, fraud ring detection, device/IP sharing     | Neo4j                                | Verified     |
| feature-flag-service   | 3013 | Feature flag CRUD, rollout %, merchant allowlists, deterministic hash           | PostgreSQL                           | Verified     |
| outbox-relay           | 3014 | Transactional outbox pattern for reliable event publishing                      | PostgreSQL, Kafka                    | Observed risk|
| dashboard              | 5173 | React 18 analyst dashboard (16 pages), WebSocket live feed                      | auth-service, decision/case/rule APIs| Verified     |
| fraud-tester           | 3020 | Adversarial fraud testing, 5 agents, 9+ scenarios, battle arena                | event-collector                      | Verified     |

**Notes on maturity:**
- `outbox-relay` topic routing is canonical but lacks dedicated E2E test coverage.
- All P0 fixes have been applied: webhook contract fixed, Kafka topics canonical,
  ports standardized, credentials guarded, auth DB-backed.

> See also: `docs/TECHNICAL.md` section 3 for full service descriptions.

---

## 11. Shared Packages

All shared packages live under `packages/` and are consumed via npm workspaces.

| Package                        | Description                                                          |
|--------------------------------|----------------------------------------------------------------------|
| `@signalrisk/redis-module`     | NestJS Redis module (ioredis integration, `REDIS_CLIENT` injection token). Direct `new Redis()` prohibited (R11). |
| `@signalrisk/kafka-config`     | Canonical Kafka topic names (`TOPICS`), consumer group IDs (`CONSUMER_GROUPS`), and `createKafkaClient()` factory. Single source of truth for all topic strings. |
| `@signalrisk/kafka-health`     | Kafka health check utility (`/kafka-lag` endpoint)                   |
| `@signalrisk/event-schemas`    | JSON Schema registry + AJV validator for all event types             |
| `@signalrisk/signal-contracts` | Canonical signal contracts (Zod schemas) for intelligence pipeline   |
| `@signalrisk/telemetry`        | OpenTelemetry instrumentation (traces, metrics, Pino structured logs)|
| `@signalrisk/web-sdk`          | Browser SDK for device fingerprinting and event tracking             |
| `@signalrisk/mobile-sdk`       | React Native SDK for mobile device fingerprinting                    |
| `@signalrisk/health-check`     | NestJS health check module (`@nestjs/terminus` integration)          |
| `@signalrisk/db-migrations`    | Database migration SQL files (008+)                                  |

### kafka-config Usage Pattern

```
import { TOPICS, CONSUMER_GROUPS, createKafkaClient } from '@signalrisk/kafka-config';

const kafka = createKafkaClient({
  brokers: process.env.KAFKA_BROKERS,
  clientId: 'decision-engine',
});

const consumer = kafka.consumer({ groupId: CONSUMER_GROUPS.DECISION_ENGINE });
await consumer.subscribe({ topic: TOPICS.EVENTS_RAW });
```

> See also: `packages/kafka-config/src/index.ts` for complete topic and consumer group lists.

---

## 12. Dashboard

### Technology Stack

- **Framework:** React 18
- **Build tool:** Vite (dev server on port 5173)
- **State management:** Zustand
- **Styling:** TailwindCSS
- **Real-time:** WebSocket (Socket.io) with RS256 JWKS authentication

### Pages (16 total)

| Page                | Description                                       |
|---------------------|---------------------------------------------------|
| Overview            | System-wide KPI cards and charts                  |
| Cases               | Case list with search, filter, and status          |
| Rules               | Rule management with DSL editor                   |
| Fraud Ops           | Operational fraud dashboard                       |
| Analytics (3 tabs)  | Trends, risk distribution, merchant comparison    |
| Graph Intel         | Neo4j-powered entity relationship visualization   |
| Live Feed           | Real-time WebSocket decision stream               |
| Settings            | User preferences and configuration                |
| Admin: Users        | User CRUD, invite, password management            |
| Admin: System Health| Aggregated health status of all 14 backend services|
| Admin: Rules        | Admin-level rule governance                       |
| FraudTester: Battle Arena    | Adversarial test execution interface     |
| FraudTester: Scenarios       | Scenario configuration and management    |
| FraudTester: Reports         | Test result reports and detection rates   |
| FraudTester: Agent Config    | Agent parameter configuration            |

### WebSocket Architecture (ADR-014)

- **Auth:** RS256 JWKS verification on connection (matches TenantGuard pattern)
- **JWKS source:** `AUTH_SERVICE_URL/.well-known/jwks.json` (5-minute cache)
- **Room assignment:** `admin` role joins 'admin' room, others join `merchant:{merchantId}`
- **Broadcast:** Decisions emitted to merchant-specific room + admin room
- **Cross-tenant isolation:** Verified -- no cross-tenant broadcast possible

### DB-Backed Login

- Email + password authentication via `POST /v1/auth/login`
- Uses `UsersService.findByEmail()` + bcrypt verification
- Dev credentials: `admin@signalrisk.com` / `password` (seed fallback, dev only)
- Proxy routing: Vite config routes `/api/admin/*`, `/api/auth/*`, `/api/rules/*` to correct backend services

> See also: `apps/dashboard/` for source code.

---

## 13. Observability

### Distributed Tracing

All services export OpenTelemetry spans to the configured OTLP endpoint. Trace
context is propagated via `traceparent` HTTP header.

Key spans:
- `decision.evaluate` -- full decision latency
- `signal.fetch.{serviceName}` -- individual signal fetch latency
- `rule.evaluate` -- rule engine evaluation time
- `kafka.publish` / `kafka.consume` -- message queue operations

### Metrics (Prometheus)

Each service exposes `/metrics` for Prometheus scraping.

Key metrics:
- `signalrisk_decisions_total{outcome}` -- decision counts by outcome
- `signalrisk_decision_duration_ms` -- decision latency histogram
- `signalrisk_kafka_consumer_lag` -- Kafka consumer lag
- `signalrisk_signal_fetch_duration_ms{service}` -- per-signal latency
- `signalrisk_rule_hits_total{ruleId}` -- rule hit counts
- `feature_snapshot_write_errors_total` -- feature snapshot write failures

### Health Endpoints

All 15 services expose standardized health endpoints:
- `GET /health` -- liveness check (200 if process is running)
- `GET /health/ready` -- readiness check (200 if dependencies are available)

Admin health aggregation: auth-service `GET /v1/admin/health` pings all 14 backend
services and returns aggregated status.

### Structured Logging

JSON logs via `nestjs-pino`. All logs include:

```
{
  "level": "info",
  "time": "2026-03-08T...",
  "service": "decision-service",
  "merchantId": "...",
  "traceId": "...",
  "msg": "..."
}
```

### Stateful Fraud Observability

The stateful fraud layer adds these observable dimensions:

- State fetch latency by store (Redis, PostgreSQL, Neo4j)
- Feature freshness age
- State miss rate
- Stale feature usage rate
- Label propagation lag
- Watchlist update lag

### Performance Baselines

| Metric                  | Target      | Measured     |
|-------------------------|-------------|--------------|
| Decision p99 latency    | < 100ms     | ~82ms        |
| Decision p95 latency    | < 50ms      | ~41ms        |
| Throughput              | >= 5K req/s | 5,200 req/s  |
| Kafka consumer lag      | < 1,000     | < 200        |
| Redis cache hit rate    | > 80%       | ~87%         |
| E2E test suite (78)     | < 60s       | ~38s         |

### Latency Budget (p99)

| Component                   | Budget | Cold Cache |
|-----------------------------|--------|------------|
| Network ingress             | 15ms   | 20ms       |
| Event parsing + validation  | 8ms    | 8ms        |
| Feature Store retrieval     | 15ms   | 50ms       |
| Rule Engine evaluation      | 20ms   | 20ms       |
| Graph query (2-hop)         | 60ms   | 120ms      |
| Risk score aggregation      | 7ms    | 7ms        |
| Response serialization      | 5ms    | 5ms        |
| **Total (warm)**            |**130ms**|            |

> See also: `docs/TECHNICAL.md` section 12 for observability details.

---

## 14. Quality Gates & Testing

### Gate Definitions (G1-G8)

| Gate | Name             | When          | Blocking? | Description                                    |
|------|------------------|---------------|-----------|------------------------------------------------|
| G1   | Build + Lint     | Every PR      | Yes       | TypeScript build, ESLint, no `\|\| true`       |
| G2   | Unit Tests       | Every PR      | Yes       | 934+ tests across 71 suites, all green         |
| G3   | Integration      | Sprint exit   | Yes       | Kafka topic routing, DB migrations, RLS        |
| G4   | Security         | Sprint exit   | Yes       | Auth verification, tenant isolation negatives  |
| G5   | E2E              | Sprint exit   | Yes       | 78 tests, 3 projects, deterministic            |
| G6   | Performance      | Release       | Yes       | p99<500ms, rate limit, decision<15s, chaos     |
| G7   | Readiness        | Release       | Yes       | 14/14 services healthy, DR tests, rollback     |
| G8   | Evidence         | Release       | Yes       | Evidence pack, quality gates, scenario catalog |

### Unit Tests

- **934+ tests** across **71 test suites**
- decision-service alone has 137+ tests
- All services tested independently via `npm test --workspace=apps/{service}`

### E2E Tests

**Framework:** Playwright with 3 sequential projects (ADR-003):

```
e2e-light (smoke tests, health checks)
    |
    v
e2e-heavy (pipeline, blast, analytics, cases)
    |
    v
chaos (resilience -- stop/restart services)
```

**12 spec files, 78 tests:**

| File                         | Tests | Description                          |
|------------------------------|:-----:|--------------------------------------|
| happy-path.spec.ts           | ~8    | Event ingest, decision, auth flow    |
| fraud-blast.spec.ts          | 4     | 50-event velocity blast              |
| analytics-decision.spec.ts   | 8     | Analytics endpoints, persistence     |
| health-checks.spec.ts        | 13    | All service health endpoints         |
| merchant-crud.spec.ts        | ~6    | Merchant CRUD operations             |
| case-lifecycle.spec.ts       | ~6    | Case creation, resolution            |
| feature-flags.spec.ts        | ~8    | Flag CRUD, rollout evaluation        |
| kafka-chaos.spec.ts          | ~5    | Kafka stop/restart resilience        |
| rate-limit.spec.ts           | ~3    | Rate limiting behaviour              |
| multi-tenant.spec.ts         | 5     | TenantGuard RS256 JWKS verification  |

Configuration: 60s timeout per test, 4 workers, 0 retries (deterministic).

### FraudTester Framework

Integrated adversarial testing with 5 agents:

| Agent                   | Purpose                     | Config Parameters                |
|-------------------------|-----------------------------|----------------------------------|
| FraudSimulationAgent    | Standard fraud scenarios    | Schedule, Intensity (1-10)       |
| AdversarialAgent        | Bypass detection            | Attack Pattern, Intensity (1-10) |
| ChaosAgent              | System resilience           | Chaos Mode, Failure Rate, Timeout|
| ReconAgent              | Reconnaissance patterns     | -                                |
| ReplayAgent             | Replay attacks              | -                                |

Scenario categories: Device Farm, Velocity Evasion, Bot Checkout, SIM Swap,
Timeout Injection, Emulator Bypass, Slow Fraud, Bot Evasion, Chaos.

### Test Isolation

FraudTester traffic is isolated from production data:

| Layer         | Mechanism                        | Effect                         |
|---------------|----------------------------------|--------------------------------|
| HTTP          | `X-SignalRisk-Test: true` header | Signals test traffic           |
| Kafka         | `is-test: "true"` message header | Propagates to all consumers    |
| Velocity      | `test:{merchantId}` key prefix   | Separate counter namespace     |
| Decisions     | `is_test BOOLEAN` column         | Permanent audit trail          |
| Analytics     | `WHERE is_test = false`          | Test data excluded from metrics|
| Webhooks      | Skip delivery when `is-test`     | No false merchant alerts       |

### CI/CD Pipeline

- GitHub Actions: monorepo-aware, G1+G2 gates on every PR
- E2E workflow: real Docker Compose in CI (builds + runs full stack)
- Gate runner: `scripts/run-gates.sh G3|G4|G5|all`
- Evidence generator: `scripts/generate-evidence.sh <sprint>`

### Stop-the-Line Conditions

Any one of these halts deployment:

1. Cross-tenant data leakage
2. Token bypass successful
3. Webhook test isolation broken
4. Contract mismatch detected

> See also: `docs/testing/quality-gates.md`, `docs/testing/scenario-catalog.md`,
> `docs/testing/evidence-and-reporting.md`.

---

## 15. Production Readiness

### 9-Step Execution Order

Production transition follows this sequence -- steps are sequential and
non-skippable:

| Step | Name                        | Status   | Description                                             |
|------|------------------------------|----------|---------------------------------------------------------|
| 1    | Reality Verification         | Complete | Service/topic/port/env/DB inventory verified            |
| 2    | Contract Stabilization       | Complete | Single source of truth for all payloads/topics/claims   |
| 3    | CI Fail-Fast                 | Complete | `\|\| true` removed, build/test/lint produce real results |
| 4    | Auth & Tenant Fix            | Complete | Hardcoded credentials removed, JWT signature verified   |
| 5    | Schema & ID Alignment        | Complete | DTO-DB alignment, migration clean-room, RLS enforcement |
| 6    | Staging Gates                | Complete | G3-G5 sprint exit, RLS 12/12, smoke 16/16, E2E pass    |
| 7    | Performance & Resilience     | Complete | G6 p99<500ms, chaos Redis 5/5, Kafka 4/4               |
| 8    | Compliance & Go-Live         | Complete | G7 14/14 healthy, G8 evidence pack present              |
| 9    | Stateful Fraud Detection     | Complete | All 9 sprints (0-8) + P0 gap closure                   |

### P0 Fixes Applied

All 8 P0 critical fixes have been applied and verified:

1. `|| true` removed from package.json, Dockerfile, ci.yml
2. Webhook contract fixed (topic + field + kafka-config import)
3. Kafka topic hardcodes removed (10 files, 6 services)
4. Hardcoded credential guard (JWT_SECRET fallback removed, login NODE_ENV guarded)
5. JWT signature verification (TenantGuard RS256 JWKS)
6. Cases TEXT to UUID (migration 006)
7. Single source of truth audit (3 undocumented topics added to kafka-config)
8. Port default standardization (7 services aligned with docker-compose)

### Current Maturity Assessment

| Area                                                | Status         |
|-----------------------------------------------------|----------------|
| Event pipeline (ingest -> Kafka -> decision)        | Verified       |
| Decision engine (6 signals + DSL + stateful)        | Verified       |
| Case management (CRUD + SLA + labels)               | Verified       |
| Velocity (typed entity counters)                    | Verified       |
| Graph intelligence                                  | Verified       |
| Feature flags                                       | Verified       |
| Health checks                                       | Verified       |
| RLS (11+ tables)                                    | Verified       |
| Webhook (contract fixed)                            | Verified       |
| Auth store (PostgreSQL-backed)                      | Verified       |
| Dashboard login (DB-backed)                         | Verified       |
| WebSocket (RS256 JWKS + rooms)                      | Verified       |
| Watchlist enforcement                               | Verified       |
| Entity profiles + feature snapshots                 | Verified       |
| DSL rules (21 live in decision path)                | Verified       |
| Outbox-relay topic routing                          | Observed risk  |
| FraudTester analytics isolation                     | Unverified     |

### Remaining Work

Remaining work is operational rather than architectural:

- Stack-level rerun verification
- UAT/evidence refresh
- Staging runtime validation
- Outbox-relay topic routing E2E test coverage

> See also: `CLAUDE.md` section 7 for execution order details.

---

## 16. Architecture Decision Records

| ADR     | Title                                   | Sprint     | Summary                                                    |
|---------|-----------------------------------------|------------|------------------------------------------------------------|
| ADR-001 | Kafka Timeout Promise.race Wrappers     | Sprint 34  | DLQ 5s, producer 10s, lag poll 10s timeouts to prevent hangs |
| ADR-002 | SIGNAL_TIMEOUT_MS=2000ms in Docker      | Sprint 20  | Inter-container latency requires higher signal timeout     |
| ADR-003 | E2E Sequential Projects, 1 Worker       | Sprint 33  | 3 sequential Playwright projects to avoid race conditions  |
| ADR-004 | entityId=deviceId Velocity Polling      | Sprint 30  | Device fingerprint as primary velocity entity ID           |
| ADR-005 | KAFKA_COMPRESSION=gzip                  | Sprint 28  | LZ4 not available in KafkaJS, snappy untested              |
| ADR-006 | Decision Cache TTL=5s                   | Sprint 25  | Freshness vs performance balance for idempotency cache     |
| ADR-007 | Case SLA BLOCK=4h, REVIEW=24h          | Sprint 26  | Fraud ops SLA for case review timelines                    |
| ADR-008 | TenantGuard RS256 JWKS Verification     | Sprint 35  | Public key verification from auth-service JWKS endpoint    |
| ADR-009 | Entity Identity Standard                | Sprint 0-SF| Typed entities: customer/device/ip with distinct counters  |
| ADR-010 | Stateful Context Namespace              | Sprint 0-SF| `stateful.{entityType}.{featureName}` path convention      |
| ADR-011 | Prior-Decision Memory Guardrails        | Sprint 0-SF| Sync DB query, 50ms timeout, 30-day lookback, fallback    |
| ADR-012 | Analyst Feedback Policy                 | Sprint 0-SF| FRAUD->denylist, LEGITIMATE->cooldown, INCONCLUSIVE->noop  |
| ADR-013 | Dashboard Login DB-Backed               | Sprint 36  | UsersService + bcrypt, seed fallback dev-only              |
| ADR-014 | WebSocket RS256 JWKS + Tenant Rooms     | Sprint 36  | Room-based tenant isolation, cross-tenant broadcast blocked|
| ADR-015 | Watchlist Decision-Time Enforcement     | Sprint 36-37| Denylist/watchlist/allowlist precedence at decision time   |
| ADR-016 | Feature Snapshot Structured Columns     | Sprint 36  | f_* column mapping for ML-ready export                     |

> See also: `docs/claude/decision-log.md` for full ADR details.

---

## 17. Configuration Reference

### Key Environment Variables

| Variable                   | Service(s)         | Required | Description                                      |
|----------------------------|--------------------|----------|--------------------------------------------------|
| `DATABASE_URL`             | All backend        | Yes      | PostgreSQL connection string                     |
| `REDIS_URL`                | All backend        | Yes      | Redis connection string                          |
| `JWT_PUBLIC_KEY`           | All backend        | Yes      | RS256 public key (PEM)                           |
| `JWT_PRIVATE_KEY`          | auth-service       | Yes      | RS256 private key (PEM)                          |
| `NODE_ENV`                 | All                | Yes      | `development` / `production`                     |
| `KAFKA_BROKERS`            | Kafka producers    | Yes      | Comma-separated broker list                      |
| `KAFKA_COMPRESSION`        | Kafka producers    | No       | gzip / lz4 / snappy / zstd (default: gzip)      |
| `SIGNAL_TIMEOUT_MS`        | decision-service   | Yes*     | Per-signal fetch timeout (default: 150, Docker: 2000) |
| `ALLOWED_API_KEYS`         | event-collector    | Yes      | Comma-separated valid API keys                   |
| `AUTH_SERVICE_URL`          | case-service, WS   | No       | JWKS source (default: http://auth-service:3001)  |
| `HEALTH_PORT`              | outbox-relay       | No       | Health endpoint port (R10: uses HEALTH_PORT not PORT) |
| `JWT_ACCESS_TTL`           | auth-service       | No       | Access token TTL seconds (default: 900)          |
| `JWT_REFRESH_TTL`          | auth-service       | No       | Refresh token TTL seconds (default: 604800)      |
| `ENABLE_JTI_DENYLIST`      | auth-service       | No       | JWT revocation check (default: true)             |
| `ENABLE_API_KEY_VALIDATION`| event-collector    | No       | API key check (default: true)                    |
| `DEVICE_INTEL_URL`         | decision-service   | Yes      | device-intel-service base URL                    |
| `VELOCITY_URL`             | decision-service   | Yes      | velocity-service base URL                        |
| `BEHAVIORAL_URL`           | decision-service   | Yes      | behavioral-service base URL                      |
| `NETWORK_URL`              | decision-service   | Yes      | network-intel-service base URL                   |
| `TELCO_URL`                | decision-service   | Yes      | telco-intel-service base URL                     |
| `GRAPH_URL`                | decision-service   | Yes      | graph-intel-service base URL                     |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | All            | No       | OpenTelemetry collector URL                      |

### Redis Key Namespace Patterns (R7)

| Pattern                                            | Service          | TTL          | Purpose                    |
|----------------------------------------------------|------------------|--------------|----------------------------|
| `decision:cache:{merchantId}:{entityId}`           | decision-service | 5s           | Idempotency cache          |
| `jti:{jti}`                                        | auth-service     | token TTL    | JWT revocation denylist    |
| `{merchantId}:vel:{dim}:{entityType}:{entityId}`   | velocity-service | sliding      | Velocity counters          |
| `rule:weight:{ruleId}`                             | rule-engine      | persistent   | Feedback-adjusted weights  |
| `rate:{merchantId}:{endpoint}`                     | event-collector  | 10s window   | Rate limiting (Lua script) |
| `test:{merchantId}:{entityId}`                     | velocity-service | sliding      | Test traffic isolation     |

### Architecture Rules Summary (R1-R14)

| Rule | Name                           | Core Requirement                                                |
|------|--------------------------------|-----------------------------------------------------------------|
| R1   | Two auth systems               | API key for event-collector, JWT for everything else -- never mix|
| R2   | Auth store PostgreSQL          | MerchantsService uses pg.Pool, seed users NODE_ENV guarded      |
| R3   | TenantGuard RS256 JWKS         | Auth-service JWKS, 5-min cache, admin bypass for all merchants  |
| R4   | Kafka rules                    | Topics from kafka-config only, gzip compression, timeout wrappers|
| R5   | Signal fetch behaviour         | SIGNAL_TIMEOUT_MS=2000 Docker, timeout=null, circuit breaker    |
| R6   | Velocity-Decision mapping      | velocity returns snake_case, decision expects camelCase, signal-fetchers.ts maps |
| R7   | Redis key namespaces           | Documented patterns with merchant scoping                       |
| R8   | Event payload requirements     | eventId UUID, currency ISO-4217, paymentMethod enum, batch 202  |
| R9   | Two-layer idempotency          | IdempotencyService (persistent) + DecisionCacheService (5s TTL) |
| R10  | outbox-relay HEALTH_PORT       | Uses HEALTH_PORT env var, not PORT                              |
| R11  | NestJS conventions             | initTracing() first, ValidationPipe whitelist, @Inject(REDIS_CLIENT) |
| R12  | Entity-type convention         | entityType enum customer/device/ip, Redis keys include entityType|
| R13  | Stateful context namespace     | `stateful.{entityType}.{featureName}`, camelCase, registered in source-of-truth |
| R14  | Prior-decision memory guards   | Sync DB, 30-day max, 50ms timeout, circuit breaker, fallback zeros |

### NestJS Service Conventions (R11)

- `main.ts`: `initTracing()` before NestFactory
- `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`
- Redis: `@Inject(REDIS_CLIENT)` token -- direct `new Redis()` prohibited
- `GET /health` endpoint mandatory for every service

> See also: `CLAUDE.md` section 6 for authoritative rule definitions,
> `docs/claude/source-of-truth.md` for contract ownership map.

---

*End of document. For questions or updates, refer to the canonical source files
listed in each section's "See also" pointers.*
