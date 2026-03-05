# SignalRisk — Architecture Document v3

> **Revision v3:** Addresses remaining CRITICAL/HIGH from v2 review.
> Fixed: RLS policy changed to single RESTRICTIVE policy (prevents permissive OR bypass),
> NestJS tenant context uses AsyncLocalStorage for guaranteed query scoping,
> dedicated idempotency table (non-partitioned) for durable request dedup,
> Redis key scheme canonicalized with merchant prefix on all keys,
> cases.decision_id integrity via surrogate mapping table.

---

## 1. Architecture Overview

### 1.1 System Context

```
┌──────────────────────────────────────────────────────────────────┐
│                        MERCHANTS                                  │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                          │
│  │ Mobile   │  │ Web App │  │ Backend │                          │
│  │ App+SDK  │  │ +SDK    │  │ Server  │                          │
│  └────┬─────┘  └────┬────┘  └────┬────┘                          │
│       │              │            │                               │
└───────┼──────────────┼────────────┼───────────────────────────────┘
        │              │            │
        ▼              ▼            ▼
┌──────────────────────────────────────────────────────────────────┐
│                    SIGNALRISK PLATFORM                            │
│                                                                   │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │ API      │  │ Event        │  │ Dashboard    │               │
│  │ Gateway  │  │ Collector    │  │ (React SPA)  │               │
│  └────┬─────┘  └──────┬───────┘  └──────────────┘               │
│       │                │                                          │
│  ┌────▼────────────────▼──────────────────────────────┐          │
│  │              PROCESSING CORE                        │          │
│  │  ┌────────┐ ┌──────────┐ ┌────────┐ ┌───────────┐ │          │
│  │  │Velocity│ │ Device   │ │Behavior│ │ Network   │ │          │
│  │  │Engine  │ │ Intel    │ │ Intel  │ │ Intel     │ │          │
│  │  └────┬───┘ └────┬─────┘ └───┬────┘ └─────┬─────┘ │          │
│  │       └──────┬────┘───────────┘────────────┘       │          │
│  │              ▼                                      │          │
│  │  ┌─────────────────────┐  ┌─────────────────┐     │          │
│  │  │ Rule Engine (DSL)   │  │ Feature Store   │     │          │
│  │  └─────────┬───────────┘  │ (Redis Cluster) │     │          │
│  │            ▼              └─────────────────┘     │          │
│  │  ┌─────────────────────┐                           │          │
│  │  │ Decision Engine     │                           │          │
│  │  │ (score + explain)   │                           │          │
│  │  └─────────────────────┘                           │          │
│  └────────────────────────────────────────────────────┘          │
│                                                                   │
│  ┌────────────┐  ┌──────────┐  ┌──────────────────┐             │
│  │ PostgreSQL │  │ Kafka    │  │ Telco Aggregators│             │
│  │ + RLS      │  │ (events) │  │ (Payguru, etc)   │             │
│  └────────────┘  └──────────┘  └──────────────────┘             │
└──────────────────────────────────────────────────────────────────┘
```

### 1.2 Architecture Style

- **Event-driven microservices** for real-time processing
- **CQRS** — separate write path (event ingestion) from read path (decision queries, dashboard)
- **Transactional outbox** — database writes and Kafka publishes are atomic (no dual-write)
- **Idempotent consumers** — every Kafka consumer is idempotent (dedup via event_id in processed_events table)
- **Domain-driven service boundaries** aligned with fraud detection signal types
- **Shared-nothing between tenants** at data layer (PostgreSQL RLS, Redis key prefix, Kafka topic partitioning)

### 1.3 Key Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Language | TypeScript (NestJS) | Team velocity, type safety, shared across services |
| Message broker | Apache Kafka | High-throughput, replay capability, exactly-once semantics |
| Primary DB | PostgreSQL 16 + PgBouncer | Multi-tenant RLS, JSONB for flexible signals, mature ecosystem |
| Feature store | Redis Cluster (7.x) | <10ms p95 feature retrieval, sorted sets for velocity counters |
| Graph DB | Neo4j 5.x (Phase 2) | Native graph for device-account relationships |
| API style | REST (OpenAPI 3.0) | Merchant familiarity, SDK generation, caching |
| Auth | OAuth2 client_credentials (prod) | Industry standard, token-scoped to merchant |
| Secret management | HashiCorp Vault | Dynamic secrets, key rotation, audit trail |
| Orchestration | Kubernetes (EKS) | HPA for auto-scaling, multi-AZ deployment |
| Monitoring | Prometheus + Grafana + PagerDuty | Full observability, alerting |
| CI/CD | GitHub Actions + ArgoCD | GitOps deployment, policy-as-code gates |

---

## 2. Service Architecture

### 2.1 Service Catalog

```
┌─────────────────────────────────────────────────────────────┐
│ SERVICE                  │ TYPE      │ PORT  │ REPLICAS     │
├──────────────────────────┼───────────┼───────┼──────────────┤
│ api-gateway              │ HTTP/REST │ 3000  │ 3+ (HPA)     │
│ event-collector          │ HTTP→Kafka│ 3001  │ 3+ (HPA)     │
│ device-intel-service     │ Kafka→PG  │ 3002  │ 2+ (HPA)     │
│ velocity-engine          │ Kafka→Redis│ 3003 │ 2+ (HPA)     │
│ behavioral-intel-service │ Kafka→PG  │ 3004  │ 2+ (HPA)     │
│ network-intel-service    │ Kafka→PG  │ 3005  │ 2+ (HPA)     │
│ rule-engine              │ Internal  │ 3006  │ 2+ (HPA)     │
│ decision-engine          │ Internal  │ 3007  │ 3+ (HPA)     │
│ telco-intel-service      │ HTTP ext  │ 3008  │ 2            │
│ dashboard-api            │ HTTP/WS   │ 3010  │ 2+ (HPA)     │
│ dashboard-web            │ Static    │ 80    │ CDN           │
│ case-management-service  │ HTTP/WS   │ 3011  │ 2            │
│ consent-service          │ HTTP      │ 3012  │ 2            │
│ erasure-service          │ Async     │ 3013  │ 1            │
│ webhook-service          │ Async     │ 3014  │ 2            │
│ auth-service             │ HTTP      │ 3015  │ 2            │
├──────────────────────────┼───────────┼───────┼──────────────┤
│ Phase 2:                 │           │       │              │
│ ml-scoring-service       │ gRPC      │ 50051 │ 2+ (HPA)     │
│ graph-service            │ Internal  │ 3020  │ 2            │
│ dp-privacy-service       │ Internal  │ 3021  │ 1            │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Service Interaction Flow — Decision API Request

```
Merchant SDK/Server
       │
       ▼
  API Gateway  ←── JWT validation (local, cached JWKS from auth-service)
       │
       ├──→ Idempotency check (Redis: req:{request_id})
       │
       ▼
  Decision Engine (orchestrator)
       │
       ├──→ Feature Store (Redis) ── get cached device/velocity/behavioral features
       │         │
       │         └──→ Cache miss? → PostgreSQL feature lookup → cache fill
       │
       ├──→ Velocity Engine ── real-time counter check (Redis sorted sets)
       │
       ├──→ Device Intel ── fingerprint match, reputation score
       │
       ├──→ Behavioral Intel ── session risk score
       │
       ├──→ Network Intel ── proxy/VPN check, geo mismatch
       │
       ├──→ Telco Intel ── cached carrier lookup ONLY (Redis, no external call)
       │         │
       │         └──→ Cache miss? Use MSISDN prefix lookup (local DB, <2ms)
       │              External aggregator call is ASYNC enrichment (post-decision)
       │
       └──→ Rule Engine ── evaluate rules against all signals
              │
              ▼
         Risk Score Aggregation
         (weighted signal combination)
              │
              ▼
         Decision: ALLOW / REVIEW / BLOCK
         + risk_factors[] explanation
              │
              ▼
         Response to merchant (<200ms p99)
              │
              └──→ Async: Publish decision event to Kafka
                   └──→ Case creation (if REVIEW/BLOCK)
                   └──→ Webhook notification
                   └──→ Feature store update
```

### 2.3 Latency Budget Allocation

| Step | Component | Budget (p99) | Implementation |
|------|-----------|-------------|----------------|
| 1 | Network ingress + TLS | 15ms | CloudFront edge, TLS 1.3 |
| 2 | Auth token validation | 5ms | JWT validation (local, cached JWKS) |
| 3 | Feature retrieval | 15ms | Redis Cluster, pipelined MGET |
| 4 | Velocity check | 10ms | Redis ZCOUNT on sorted sets |
| 5 | Device reputation | 10ms | Redis cached score, PG fallback |
| 6 | Behavioral score | 5ms | Pre-computed, Redis cached |
| 7 | Network intel | 15ms | MaxMind in-memory DB + Redis cache |
| 8 | Telco lookup | 5ms | Redis cached carrier info OR local MSISDN prefix DB (no external call in hot path) |
| 9 | Rule evaluation | 20ms | In-memory rule engine, no I/O |
| 10 | Score aggregation | 5ms | In-memory weighted sum |
| 11 | Response serialization | 5ms | JSON serialization |
| **Total (sequential)** | | **110ms** | **90ms buffer for variance** |

All intelligence lookups (steps 3-8) execute in **parallel** via Promise.all(), so the actual latency is max(steps 3-8) not sum. Estimated parallel latency: ~20ms p99 (bounded by Network Intel MaxMind + Redis).

---

## 3. Data Architecture

### 3.1 PostgreSQL Schema (Multi-Tenant)

```sql
-- All tenant tables include merchant_id with RLS
-- RLS policy: current_setting('app.merchant_id') = merchant_id

-- Core tenant data
CREATE TABLE merchants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  tier          TEXT NOT NULL CHECK (tier IN ('startup', 'growth', 'enterprise')),
  config        JSONB NOT NULL DEFAULT '{}',  -- merchant-specific settings
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE devices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id     UUID NOT NULL REFERENCES merchants(id),
  fingerprint     TEXT NOT NULL,          -- deterministic hash
  first_seen      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  txn_count       INTEGER NOT NULL DEFAULT 0,
  fraud_count     INTEGER NOT NULL DEFAULT 0,
  trust_score     NUMERIC(3,2) NOT NULL DEFAULT 0.50,
  entropy_score   NUMERIC(3,2),
  metadata        JSONB,                  -- OS, browser, hardware signals
  is_emulator     BOOLEAN DEFAULT FALSE,
  UNIQUE (merchant_id, fingerprint)
);

CREATE TABLE events (
  id              UUID NOT NULL DEFAULT gen_random_uuid(),
  merchant_id     UUID NOT NULL REFERENCES merchants(id),
  device_id       UUID REFERENCES devices(id),
  session_id      TEXT NOT NULL,
  event_type      TEXT NOT NULL,           -- page_load, click, purchase, etc
  payload         JSONB NOT NULL,
  ip_address      INET,
  country         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, created_at)             -- partition key included in PK
) PARTITION BY RANGE (created_at);
-- Monthly partitions, auto-created via pg_partman, 90-day retention
-- Global uniqueness on id enforced at application layer (UUID v7 = time-ordered, collision-free)

CREATE TABLE decisions (
  id              UUID NOT NULL DEFAULT gen_random_uuid(),
  merchant_id     UUID NOT NULL REFERENCES merchants(id),
  request_id      TEXT NOT NULL,
  device_id       UUID REFERENCES devices(id),
  session_id      TEXT,
  risk_score      NUMERIC(3,2) NOT NULL,
  decision        TEXT NOT NULL CHECK (decision IN ('ALLOW', 'REVIEW', 'BLOCK')),
  risk_factors    JSONB NOT NULL,         -- [{signal, weight, detail}]
  signals         TEXT[] NOT NULL,
  latency_ms      INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, created_at),            -- partition key included in PK
  UNIQUE (request_id, created_at)          -- partition key included in UNIQUE
) PARTITION BY RANGE (created_at);

-- Dedicated idempotency table (non-partitioned, durable cross-partition dedup)
CREATE TABLE decision_idempotency (
  merchant_id   UUID NOT NULL,
  request_id    TEXT NOT NULL,
  decision_id   UUID NOT NULL,
  response      JSONB NOT NULL,           -- cached response for replay
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (merchant_id, request_id)
);
-- TTL: Rows older than 24 hours cleaned by scheduled job (pg_cron)
-- Hot path: Redis cache (5s TTL) for sub-millisecond dedup
-- Cold path: PG lookup on Redis miss, covers retries/replays beyond 5s window
-- Flow: Check Redis → miss? Check PG → miss? Process → Write PG + Redis atomically

CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id     UUID NOT NULL REFERENCES merchants(id),
  email           TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('admin', 'senior_analyst', 'analyst', 'viewer')),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  mfa_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Stable decision reference table (non-partitioned, enables FK from cases)
CREATE TABLE decision_refs (
  id              UUID PRIMARY KEY,         -- same as decisions.id
  merchant_id     UUID NOT NULL REFERENCES merchants(id),
  request_id      TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL,     -- denormalized for partition lookup
  UNIQUE (merchant_id, request_id)
);
-- Populated atomically with decisions via transactional outbox
-- Enables: SELECT d.* FROM decisions d JOIN decision_refs r ON d.id = r.id AND d.created_at = r.created_at

CREATE TABLE cases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id     UUID NOT NULL REFERENCES merchants(id),
  decision_id     UUID NOT NULL REFERENCES decision_refs(id),  -- enforceable FK
  status          TEXT NOT NULL DEFAULT 'NEW'
                  CHECK (status IN ('NEW', 'ASSIGNED', 'INVESTIGATING', 'RESOLVED')),
  assigned_to     UUID REFERENCES users(id),
  resolution      TEXT CHECK (resolution IN ('fraud_confirmed', 'false_positive',
                  'insufficient_evidence', 'escalated', 'duplicate')),
  reason_code     TEXT,
  notes           TEXT,
  sla_deadline    TIMESTAMPTZ NOT NULL,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id     UUID NOT NULL REFERENCES merchants(id),
  name            TEXT NOT NULL,
  dsl             TEXT NOT NULL,           -- rule DSL source
  version         INTEGER NOT NULL DEFAULT 1,
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'pending_approval', 'active', 'disabled', 'archived')),
  rollout_pct     INTEGER DEFAULT 100,     -- staged rollout percentage
  author_id       UUID NOT NULL REFERENCES users(id),
  approved_by     UUID REFERENCES users(id),
  simulation      JSONB,                   -- last simulation results
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id     UUID NOT NULL REFERENCES merchants(id),
  user_id         UUID REFERENCES users(id),
  action          TEXT NOT NULL,
  resource_type   TEXT NOT NULL,
  resource_id     TEXT,
  details         JSONB,
  ip_address      INET,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE consent_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id     UUID NOT NULL REFERENCES merchants(id),
  subject_id      TEXT NOT NULL,           -- external user identifier
  consent_state   JSONB NOT NULL,          -- {device: true, behavioral: false, ...}
  source          TEXT NOT NULL,            -- sdk, api, dashboard
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS policies: Single RESTRICTIVE policy per table (prevents permissive OR bypass)
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices FORCE ROW LEVEL SECURITY;  -- applies to table owner too

-- Single RESTRICTIVE policy combines "context must be set" + "tenant match" in one predicate.
-- This avoids the PostgreSQL permissive policy OR-combination vulnerability.
CREATE POLICY tenant_isolation ON devices AS RESTRICTIVE
  FOR ALL
  USING (
    current_setting('app.merchant_id', true) IS NOT NULL
    AND merchant_id = current_setting('app.merchant_id')::uuid
  );
-- Repeat for: events, decisions, cases, rules, users, audit_log, consent_records
-- If app.merchant_id is unset → IS NOT NULL fails → zero rows returned (deny-by-default)
-- If app.merchant_id is set → only matching merchant rows visible

-- RLS + PgBouncer Isolation Pattern:
-- PgBouncer uses transaction-mode pooling. SET LOCAL scopes to transaction.
--
-- NestJS enforcement via AsyncLocalStorage (guarantees ALL queries use tenant context):
--
-- @Injectable()
-- export class TenantMiddleware implements NestMiddleware {
--   constructor(private dataSource: DataSource, private als: AsyncLocalStorage<TenantCtx>) {}
--
--   use(req, res, next) {
--     const merchantId = req.merchantId; // from JWT validation middleware
--     if (!merchantId) throw new ForbiddenException('No tenant context');
--
--     // AsyncLocalStorage ensures every query in this request uses this connection
--     this.als.run({ merchantId }, async () => {
--       const queryRunner = this.dataSource.createQueryRunner();
--       await queryRunner.connect();
--       await queryRunner.startTransaction();
--       await queryRunner.query("SET LOCAL app.merchant_id = $1", [merchantId]);
--
--       // Store queryRunner in ALS so repositories use it automatically
--       this.als.getStore().queryRunner = queryRunner;
--
--       res.on('finish', async () => {
--         await queryRunner.commitTransaction();
--         await queryRunner.release();
--       });
--       res.on('error', async () => {
--         await queryRunner.rollbackTransaction();
--         await queryRunner.release();
--       });
--       next();
--     });
--   }
-- }
--
-- Custom repository base class:
-- @Injectable()
-- export class TenantRepository<T> extends Repository<T> {
--   get queryRunner() {
--     return this.als.getStore()?.queryRunner;  // always uses tenant-scoped connection
--   }
-- }
--
-- Guarantees:
-- 1. SET LOCAL scoped to transaction, auto-cleared on COMMIT/ROLLBACK
-- 2. AsyncLocalStorage binds queryRunner to request — no query escapes tenant context
-- 3. RESTRICTIVE policy denies all if context missing (defense-in-depth)
-- 4. FORCE ROW LEVEL SECURITY applies even to table owner role
-- 5. Integration test: After request, verify connection has no residual merchant_id
```

### 3.2 Redis Data Model

```
# Velocity counters (sorted sets — score = timestamp)
velocity:{merchant_id}:txn_per_ip:{ip}           ZADD score=now member=txn_id
velocity:{merchant_id}:txn_per_device:{fp}        ZADD score=now member=txn_id
velocity:{merchant_id}:txn_per_msisdn:{hash}      ZADD score=now member=txn_id
velocity:{merchant_id}:txn_per_account:{acct}      ZADD score=now member=txn_id
velocity:{merchant_id}:otp_per_device:{fp}         ZADD score=now member=req_id
velocity:{merchant_id}:acct_per_ip:{ip}            ZADD score=now member=acct_id

# Window queries: ZCOUNT key (now - window) now
# Cleanup: ZREMRANGEBYSCORE key 0 (now - max_retention)
# TTL: 7 days on all velocity keys (auto-expire stale counters)

# Device reputation cache
device:{merchant_id}:{fingerprint}                 HSET trust_score, txn_count, fraud_ratio, ...
# TTL: 24 hours, refreshed on every device event

# Feature cache (pre-computed per session)
features:{merchant_id}:{session_id}                HSET all_features_as_hash
# TTL: 30 minutes (session lifetime)

# Idempotency cache (merchant-scoped)
idempotent:{merchant_id}:{request_id}              SET response_json
# TTL: 5 seconds (hot dedup), backed by decision_idempotency table (24h)

# Rate limiting (sliding window)
ratelimit:{merchant_id}                            ZSET (timestamp-based sliding window)
```

### 3.3 Kafka Topics

```
# Event ingestion (partitioned by salted merchant key to avoid hot partitions)
# Partition key: hash(merchant_id + session_id) — distributes large merchants across partitions
# while keeping same-session events co-located for ordering guarantees
signalrisk.events.raw              → 48 partitions, 72h retention (sized for 48K events/sec headroom)
signalrisk.events.validated        → 48 partitions, 72h retention
signalrisk.events.dead-letter      → 6 partitions, 30d retention

# Decision pipeline
signalrisk.decisions               → 24 partitions, 30d retention
signalrisk.decisions.review        → 6 partitions (auto-creates cases)
signalrisk.decisions.block         → 6 partitions (auto-creates cases + alerts)

# Intelligence updates
signalrisk.device.reputation       → 6 partitions (device score changes)
signalrisk.velocity.breach         → 6 partitions (threshold exceeded)
signalrisk.alerts                  → 6 partitions (system alerts)

# Feedback loop
signalrisk.feedback.chargeback     → 3 partitions
signalrisk.feedback.false-positive → 3 partitions

# Consent / Erasure
signalrisk.consent.changes         → 3 partitions
signalrisk.erasure.requests        → 3 partitions (triggers propagation)

# Dashboard real-time
signalrisk.dashboard.events        → 6 partitions (WebSocket relay)
```

---

## 4. Intelligence Modules

### 4.1 Device Intelligence Service

**Responsibility:** Fingerprint generation, device reputation scoring, emulator detection.

```
Input: Raw device signals from SDK (via Kafka)
Output: Device reputation score, emulator flag, trust score

Pipeline:
  1. Parse raw signals → normalize (OS version, screen size, etc.)
  2. Generate fingerprint (deterministic hash of stable signals)
  3. Fuzzy match against known devices (≥80% signal overlap = same device)
  4. Calculate trust score:
     trust = w1*age_factor + w2*clean_txn_ratio + w3*entropy_score + w4*(1-fraud_ratio)
     where:
       age_factor = min(days_since_first_seen / 90, 1.0)
       clean_txn_ratio = 1 - (fraud_count / max(txn_count, 1))
       entropy_score = signal_richness (0-1, more real signals = higher)
       fraud_ratio = fraud_count / max(txn_count, 1) (90-day rolling)
     Weights: w1=0.15, w2=0.35, w3=0.20, w4=0.30
  5. Emulator detection (rule-based Phase 1):
     IF adb_enabled = true → emulator_score += 0.4
     IF sensor_noise = 0 → emulator_score += 0.3
     IF gpu_renderer IN ('SwiftShader', 'llvmpipe') → emulator_score += 0.2
     IF thermal_state = constant → emulator_score += 0.1
     IF emulator_score > 0.5 → flag as emulator
  6. Publish updated reputation to Redis + Kafka
```

**Storage:**
- PostgreSQL: Full device record (fingerprint, metadata, history)
- Redis: Cached trust_score + emulator flag (24h TTL)

### 4.2 Velocity Engine

**Responsibility:** Real-time sliding window counters, burst detection.

```
Input: Every validated event (via Kafka)
Output: Velocity scores per dimension, breach alerts

Implementation:
  Redis sorted sets per dimension per entity:
    ZADD velocity:{merchant}:txn_per_device:{fp} <timestamp> <txn_id>

  Count query (e.g., 1-hour window):
    ZCOUNT velocity:{merchant}:txn_per_device:{fp} (now-3600) now

  Burst detection:
    Every 5 seconds, check if count > 3x baseline (merchant-configured)
    If breach → publish to signalrisk.velocity.breach → immediate BLOCK

  Exponential decay:
    Instead of hard window edges, apply decay factor:
    effective_count = sum(e^(-λ * (now - event_time))) for events in window
    λ = ln(2) / half_life (configurable per merchant, default 30min)

  Cleanup:
    Periodic ZREMRANGEBYSCORE to remove events older than max window (7d)
    Keys TTL: 7 days (auto-expire inactive entities)
```

**Dimensions (6):**

| Dimension | Key Pattern | Windows | Default Threshold |
|-----------|-------------|---------|-------------------|
| txn_per_ip | `velocity:{m}:txn_per_ip:{ip}` | 1min, 1h, 24h | 10, 50, 200 |
| txn_per_msisdn | `velocity:{m}:txn_per_msisdn:{hash}` | 1h, 24h | 20, 100 |
| txn_per_device | `velocity:{m}:txn_per_device:{fp}` | 1h, 24h | 15, 80 |
| txn_per_account | `velocity:{m}:txn_per_account:{id}` | 1h, 24h, 7d | 10, 50, 200 |
| otp_per_device | `velocity:{m}:otp_per_device:{fp}` | 1h | 5 |
| acct_per_ip | `velocity:{m}:acct_per_ip:{ip}` | 1h, 24h | 3, 10 |

### 4.3 Behavioral Intelligence Service

**Responsibility:** Session risk scoring, bot detection.

```
Input: Session events (typing, scroll, click, navigation) via Kafka
Output: Session risk score, bot probability

Indicators computed per session:
  - timing_cv: Coefficient of variation of inter-event timing
    CV > 0.3 → human, CV < 0.1 → bot
  - session_age: Time since session start (< 30s before purchase = suspicious)
  - time_to_purchase: Session start → first purchase event
  - navigation_entropy: Shannon entropy of page visit sequence
    H = -Σ p(page) * log2(p(page))
    Low entropy (< 1.0) = linear/bot, High (> 2.0) = organic browsing
  - click_distribution: Spatial variance of click coordinates
    Near-zero variance = bot clicking same spot
  - typing_cadence: Mean + std dev of keypress intervals
    Constant cadence (std < 10ms) = bot

Bot score = weighted combination:
  bot_score = 0.25*timing_cv_signal + 0.20*nav_entropy_signal
            + 0.20*click_dist_signal + 0.15*typing_signal
            + 0.10*session_age_signal + 0.10*time_to_purchase_signal

Storage: Session features cached in Redis (30min TTL)
```

### 4.4 Network Intelligence Service

**Responsibility:** Proxy/VPN detection, geo mismatch, IP reputation.

```
Implementation:
  - MaxMind GeoIP2 database (in-memory, updated weekly)
  - Commercial proxy/VPN database (IPQualityScore or similar)
  - Tor exit node list (updated daily from public sources)
  - ASN reputation database

Checks (parallel):
  1. Geo lookup: IP → country, city, ASN
  2. VPN/Proxy check: IP against proxy database
  3. Tor check: IP against exit node list
  4. Geo mismatch: IP_country vs MSISDN_country vs billing_country
  5. ASN reputation: Known hosting/cloud ASNs flagged

Output signals:
  - is_vpn: boolean
  - is_proxy: boolean
  - is_tor: boolean
  - geo_mismatch: boolean + detail (which pair mismatched)
  - ip_risk_score: 0.0-1.0
```

### 4.5 Telco Intelligence Service

**Responsibility:** Carrier identification, MSISDN validation, aggregator integration.

```
Phase 1:
  - MSISDN prefix lookup → carrier identification (local DB, <2ms)
  - Payguru API integration for carrier billing fraud signals

  HOT PATH (in decision pipeline):
    - Redis cached carrier info (TTL: 1 hour)
    - Cache miss → MSISDN prefix DB lookup (local, <2ms)
    - NO external aggregator call in decision path

  ASYNC ENRICHMENT (post-decision):
    - After decision response, publish enrichment request to Kafka
    - Telco enrichment consumer calls Payguru API asynchronously
    - Updates Redis cache + PostgreSQL device record
    - Next decision for same entity uses enriched data
    - Circuit breaker per aggregator (3 failures → open for 30s)

Phase 3:
  - Direct carrier API integration (Turkcell, Vodafone)
  - SIM swap detection
```

---

## 5. Rule Engine Architecture

### 5.1 DSL Specification

```
Grammar (EBNF):
  rule       := condition "THEN" action
  condition  := expr (("AND" | "OR") expr)*
  expr       := field operator value
             |  "NOT" expr
             |  "(" condition ")"
  field      := signal_name ("_" window)?
  operator   := ">" | "<" | ">=" | "<=" | "==" | "!=" | "IN"
  value      := number | string | list
  action     := "risk" "+=" number
             |  "BLOCK"
             |  "REVIEW"
             |  "ALLOW"
             |  "TAG" "(" string ")"
  window     := "1min" | "1h" | "24h" | "7d"

Examples:
  IF device_accounts > 3 AND ip_country != msisdn_country THEN risk += 0.4
  IF transactions_per_device_1h > 10 AND device_fraud_ratio > 0.3 THEN BLOCK
  IF time_to_purchase < 30 AND navigation_entropy < 0.2 THEN risk += 0.3
  IF otp_requests_per_device_1h > 5 THEN risk += 0.5
  IF is_vpn == true AND device_age < 24h THEN REVIEW
```

### 5.2 Rule Evaluation Pipeline

```
1. Parse DSL → AST (cached per rule version, invalidate on edit)
2. Load all active rules for merchant (sorted by priority)
3. For each rule:
   a. Resolve field references against signal context
   b. Evaluate condition tree
   c. If match → execute action (accumulate risk or set decision)
4. Apply rule randomization (±5% on thresholds to prevent probing)
   Seed: HMAC(request_id, rule_id) — deterministic per request, so same request
   always gets same jitter (reproducible for audit/debugging)
5. Final risk score = base_score + Σ(rule_adjustments), clamped to [0.0, 1.0]
6. Decision: score >= 0.8 → BLOCK, score >= 0.5 → REVIEW, else ALLOW
   (thresholds configurable per merchant)
```

### 5.3 Rule Governance

```
Draft → Simulate → Submit for Approval → Approved → Staged Rollout → Active

Simulation:
  - Replay last N days of events through rule engine with new rule added
  - Report: matched transactions, estimated blocks, estimated false positives
  - Compare with baseline (current active rules)

Staged Rollout:
  - Shadow mode (0%): Rule evaluates but decision not applied
  - 10% → 50% → 100%: Gradual traffic allocation
  - Auto-rollback: If false positive rate increases >2% at any stage, revert

Conflict Detection:
  - Parse all active rules + candidate rule
  - Detect overlapping conditions that could cause score > 1.0
  - Warn on contradictory actions (same condition → BLOCK and ALLOW)
```

---

## 6. Security Architecture

### 6.1 Authentication & Authorization

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Merchant API │────→│ API Gateway  │────→│ Auth Service │
│ (OAuth2)     │     │ (rate limit) │     │ (JWT verify) │
└──────────────┘     └──────────────┘     └──────────────┘

Production:
  - OAuth2 client_credentials flow
  - JWT tokens with claims: { merchant_id, tier, scopes }
  - JWKS endpoint for key rotation
  - Token TTL: 1 hour, refresh via client_credentials

Enterprise:
  - mTLS required (client certificate pinned to merchant)

Dev/Staging ONLY:
  - API key authentication
  - API key module compiled out of production Docker image (build-time removal)
  - Startup fail-closed check: production refuses to start if API key module detected

Dashboard:
  - Session-based auth (httpOnly secure cookies)
  - MFA required for admin + senior_analyst roles
  - Session TTL: 8 hours, re-auth for sensitive operations (rule activation)
```

### 6.2 Data Protection

```
At rest:
  - PostgreSQL: AWS RDS encryption (AES-256, KMS-managed key per instance; per-merchant
    column-level encryption via pgcrypto for sensitive fields, keys from Vault)
  - Redis: Encrypted at rest (AWS ElastiCache encryption)
  - Kafka: Encrypted at rest (AWS MSK)
  - S3: SSE-S3 with per-merchant prefix policies

In transit:
  - TLS 1.3 for all service-to-service communication
  - mTLS within Kubernetes cluster (Istio service mesh)

PII handling:
  - MSISDN: Argon2id hash (at-rest) + HMAC-SHA256 token (lookups)
  - IP addresses: Stored in events (90-day retention), hashed in aggregations
  - Device fingerprints: Deterministic hash, no raw signals stored after processing
```

### 6.3 Multi-Tenant Isolation

| Layer | Mechanism | Enforcement |
|-------|-----------|-------------|
| PostgreSQL | Row-Level Security (RLS) | `merchant_id = current_setting('app.merchant_id')` |
| Redis | Key prefix namespacing | `{merchant_id}:*` prefix on all keys |
| Kafka | Per-merchant topic partitioning | Consumer group scoped to merchant |
| S3 | Per-merchant IAM prefix policy | Bucket policy + IAM role |
| Neo4j (Phase 2) | Stored procedure guards | Mandatory merchant_id WHERE clause |
| API | JWT merchant_id claim validation | Middleware on all endpoints |

**Testing:** Every API endpoint has a negative test verifying cross-tenant access returns 403. CI/CD gate blocks deployment if isolation tests fail.

---

## 7. Infrastructure Architecture

### 7.1 Kubernetes Deployment

```
Namespace: signalrisk-production
├── Deployments
│   ├── api-gateway (3 replicas, HPA: 3-10 based on CPU/RPS)
│   ├── event-collector (3 replicas, HPA: 3-15 based on Kafka lag)
│   ├── decision-engine (3 replicas, HPA: 3-10 based on latency p99)
│   ├── velocity-engine (2 replicas, HPA: 2-8)
│   ├── device-intel (2 replicas, HPA: 2-6)
│   ├── behavioral-intel (2 replicas, HPA: 2-6 based on Kafka lag)
│   ├── network-intel (2 replicas, HPA: 2-6 based on CPU)
│   ├── telco-intel (2 replicas, HPA: 2-4 based on Kafka lag)
│   ├── rule-engine (2 replicas, HPA: 2-6)
│   ├── dashboard-api (2 replicas, HPA: 2-6)
│   ├── case-management (2 replicas)
│   ├── consent-service (2 replicas)
│   ├── erasure-service (1 replica)
│   ├── webhook-service (2 replicas)
│   └── auth-service (2 replicas)
├── StatefulSets
│   ├── kafka (3 brokers, multi-AZ)
│   └── zookeeper (3 nodes) — or KRaft mode
├── External Services (managed)
│   ├── PostgreSQL (RDS, multi-AZ, read replicas)
│   ├── Redis Cluster (ElastiCache, 3+ shards, multi-AZ)
│   └── Neo4j (Phase 2: Aura or self-hosted)
├── Ingress
│   ├── ALB → api-gateway (merchant API)
│   ├── ALB → dashboard-web (React SPA via CloudFront)
│   └── ALB → event-collector (SDK events)
└── Service Mesh
    └── Istio (mTLS, traffic management, observability)
```

### 7.2 High Availability

```
Multi-AZ deployment (minimum 2 AZs):
  - All deployments spread across AZs via pod anti-affinity
  - PostgreSQL: Multi-AZ RDS with streaming replication (RPO: 1 min)
  - Redis: Multi-AZ ElastiCache with automatic failover
  - Kafka: Rack-aware replication (min.insync.replicas=2)

Failover:
  - RDS automatic failover: < 60 seconds
  - Redis failover: < 15 seconds
  - K8s pod restart: < 30 seconds (readiness probes)
  - Total RTO: < 15 minutes (as per NFR-002)

Graceful degradation matrix:
  Redis down → Rule-based scoring only (no cached features), flag "partial"
  Kafka down → HTTP direct ingestion (1000 req/s max), decision API unaffected
  Telco aggregator down → Skip telco signals, flag "partial"
  Network intel down → Skip VPN/geo check, flag "partial"
  Any intel service down → Score with available signals, flag missing services
```

### 7.3 Monitoring & Alerting

```
Metrics (Prometheus):
  - API latency: p50, p95, p99 per endpoint
  - Decision distribution: ALLOW/REVIEW/BLOCK counts per merchant
  - Event throughput: events/sec per topic
  - Kafka consumer lag per consumer group
  - Redis memory usage, connection count, command latency
  - PostgreSQL connection pool utilization, query latency
  - Error rates per service (4xx, 5xx)
  - Velocity breach count per dimension
  - Rule evaluation latency and match rate
  - Feature store hit/miss ratio

Dashboards (Grafana):
  - Platform Overview: API health, event throughput, decision distribution
  - Per-Service: Latency, error rate, resource usage
  - Fraud Analytics: Fraud rate trends, signal effectiveness
  - Infrastructure: K8s resource usage, node health

Alerts (PagerDuty):
  P0 (immediate): API error rate > 5%, decision latency p99 > 500ms,
                   data breach indicator, service completely down
  P1 (30 min):    Kafka lag > 10K messages, Redis memory > 80%,
                   false positive rate spike > 5%
  P2 (2 hour):    API latency p99 > 300ms, single replica down,
                   feature store miss rate > 20%

Structured logging (JSON):
  - Correlation ID (request_id) across all services
  - Log levels: ERROR → PagerDuty, WARN → Grafana alert, INFO → retained 30 days
  - PII masking: MSISDN, IP, email masked in logs (last 4 digits only)
```

---

## 8. Dashboard Architecture

### 8.1 Frontend Stack

```
React 18 SPA
├── Tailwind CSS (design tokens from design-tokens-v2.json)
├── Headless UI (accessible primitives)
├── Recharts (charts) + D3.js (device graph, Phase 2)
├── Monaco Editor (rule DSL)
├── Zustand (state management)
├── TanStack Query (data fetching, caching, polling)
├── React Router v6 (routing)
├── React Hook Form + Zod (forms, validation)
└── Lucide React (icons)

Build: Vite → CloudFront CDN
Auth: Session cookies (httpOnly, secure, SameSite=Strict)
```

### 8.2 Real-time Communication

```
WebSocket (dashboard-api):
  - Event stream: Real-time fraud events
  - Case updates: New cases, status changes, assignment
  - Alert notifications: Threshold breaches, system alerts

Connection resilience:
  - Exponential backoff: 1s → 2s → 4s → 8s → max 30s
  - Heartbeat: 15s interval, 45s timeout
  - Stale data: TanStack Query staleTime per resource type
    KPI cards: 30s, Charts: 60s, Event stream: 10s

Polling fallback:
  - If WebSocket fails 3x, fall back to polling
  - KPI: 30s, Case queue: 10s, Charts: 60s
```

### 8.3 Dashboard API Endpoints

```
# Auth
POST   /api/auth/login          → Session cookie
POST   /api/auth/mfa/verify     → MFA verification
POST   /api/auth/logout         → Session invalidation
POST   /api/auth/forgot-password → Send reset link
POST   /api/auth/reset-password  → Reset with token

# Cases
GET    /api/cases               → Paginated case list (filters, sort)
GET    /api/cases/:id           → Case detail + evidence
PATCH  /api/cases/:id           → Update status, assign, resolve
POST   /api/cases/bulk          → Bulk actions

# Rules
GET    /api/rules               → Rule list
POST   /api/rules               → Create rule
GET    /api/rules/:id           → Rule detail + version history
PATCH  /api/rules/:id           → Update rule
POST   /api/rules/:id/simulate  → Run simulation
POST   /api/rules/:id/approve   → Approve (admin only)
POST   /api/rules/:id/rollout   → Change rollout percentage

# Devices
GET    /api/devices             → Device search
GET    /api/devices/:id         → Device detail + reputation

# Analytics
GET    /api/analytics/overview  → KPI aggregations
GET    /api/analytics/trend     → Time-series fraud rate
GET    /api/analytics/velocity  → Velocity heatmap data
GET    /api/analytics/signals   → Signal effectiveness

# Alerts
GET    /api/alerts              → Alert list
PATCH  /api/alerts/:id          → Acknowledge, snooze, escalate

# Settings
GET    /api/settings/team       → Team members
POST   /api/settings/team/invite → Invite user
PATCH  /api/settings/team/:id   → Update role
GET    /api/settings/audit-log  → Audit log entries
GET    /api/settings/webhooks   → Webhook configs
POST   /api/settings/webhooks   → Create webhook

# WebSocket
WS     /ws/events               → Real-time event stream
WS     /ws/cases                → Case update notifications
WS     /ws/alerts               → Alert notifications
```

---

## 9. Consent & Erasure Architecture

### 9.1 Consent Service

```
Flow:
  SDK → setConsent({device: true, behavioral: false, ...})
       → POST /api/consent with merchant_id + subject_id + state
       → Store in PostgreSQL consent_records
       → Publish to signalrisk.consent.changes topic
       → All consumers check consent before processing signals

Enforcement:
  Every intelligence service checks consent before processing:
    if (!consent.device) → skip device fingerprinting
    if (!consent.behavioral) → skip session analysis
    if (!consent.sensor) → skip sensor entropy
    if (!consent.crossMerchant) → exclude from cross-merchant graph

Revocation:
  Consent change propagated within 5 minutes via Kafka consumer groups.
  Post-revocation: stop collecting non-consented categories, but already-processed
  aggregate features retained (with DP noise if applicable).
```

### 9.2 Erasure Service

```
Flow:
  Merchant → POST /api/erasure {subject_id}
  → Erasure service creates erasure job
  → Fan-out deletion to all systems:
    1. PostgreSQL: DELETE events, decisions, cases WHERE subject matches
    2. Redis: DEL all keys matching subject's device/session/account
    3. Kafka: Publish tombstone records to compact topics
    4. Feature Store: Remove cached features
    5. Neo4j (Phase 2): Remove nodes and edges
    6. ML training data (Phase 2): Exclude from active datasets
    7. Backups: Write to tombstone log for re-application on restore

  Completion:
    - Each system reports deletion status
    - Erasure confirmation sent to merchant with per-system audit
    - SLA: Complete within 72 hours

  Verified deletion:
    After 72h, automated check queries all systems for any remaining data
    → Generate erasure completion report
```

---

## 10. API Versioning & SDK Architecture

### 10.1 Decision API (Merchant-Facing)

```
Base URL: https://api.signalrisk.com/v1

POST /v1/decisions
  Headers:
    Authorization: Bearer <oauth2_token>
    X-Request-Id: <uuid>  (idempotency key)
    Content-Type: application/json

  Request:
  {
    "event_type": "purchase",
    "session_id": "sess_abc123",
    "device": {
      "fingerprint": "fp_xyz",
      "signals": { ... }  // raw device signals
    },
    "user": {
      "account_id": "usr_456",
      "msisdn_hash": "hmac_sha256_token"  // pre-hashed by SDK
    },
    "transaction": {
      "amount": 49.99,
      "currency": "TRY",
      "merchant_ref": "ord_789"
    }
  }

  Response (< 200ms p99):
  {
    "request_id": "req_abc",
    "risk_score": 0.82,
    "decision": "BLOCK",
    "risk_factors": [
      { "signal": "device_reuse", "weight": 0.3, "detail": "5 accounts on device" },
      { "signal": "vpn_detected", "weight": 0.2, "detail": "commercial VPN" },
      { "signal": "velocity_breach", "weight": 0.2, "detail": "15 txn/hour" }
    ],
    "signals": ["device_reuse", "vpn_detected", "velocity_breach"],
    "session_id": "sess_abc123",
    "latency_ms": 45,
    "flags": []  // ["partial"] if any intel service unavailable
  }
```

### 10.2 SDK Architecture

```
SDK (iOS / Android / Web)
├── Signal Collectors (modular)
│   ├── DeviceCollector (fingerprint, hardware, OS)
│   ├── BehavioralCollector (typing, scroll, tap)
│   ├── SensorCollector (accelerometer, gyroscope) — mobile only
│   └── BrowserCollector (WebGL, AudioContext, fonts) — web only
├── Consent Manager
│   ├── setConsent() — granular per category
│   ├── getConsent() — current state
│   └── onConsentChange() — callback
├── Event Batcher
│   ├── Max 5 events per batch
│   ├── Flush interval: 2 seconds or batch full
│   └── Retry: 3x with exponential backoff
├── Transport
│   ├── HTTPS to event-collector
│   └── Certificate pinning (mobile)
└── MSISDN Hasher
    └── HMAC-SHA256 on-device before transmission
       (key provisioned via secure config endpoint)

Size targets:
  Web: < 100KB gzipped
  iOS: < 2MB framework
  Android: < 2MB AAR
```

---

## 11. Deployment & CI/CD

### 11.1 Pipeline

```
GitHub PR
  → Lint + Type Check (TypeScript strict)
  → Unit Tests (Jest, >80% coverage)
  → Integration Tests (testcontainers: PG, Redis, Kafka)
  → Cross-tenant isolation tests
  → Security scan (Snyk, Trivy)
  → OPA policy check (no API key auth in prod config)
  → Build Docker images
  → Push to ECR
  → ArgoCD sync to staging
  → Staging smoke tests
  → Manual approval gate
  → ArgoCD sync to production (canary → full)
```

### 11.2 Environment Topology

```
Development:  Docker Compose (all services local)
Staging:      EKS cluster (single AZ, smaller instances)
Production:   EKS cluster (multi-AZ, HPA enabled)
              RDS PostgreSQL (multi-AZ, read replicas)
              ElastiCache Redis (multi-AZ, cluster mode)
              MSK Kafka (multi-AZ, 3 brokers)
```

---

## 12. Phase 2 Architecture Extensions

### 12.1 ML Scoring Service (Phase 2)

```
- LightGBM model served via gRPC (Python service)
- Feature vector assembled from Feature Store (Redis)
- Champion/challenger: traffic split via Istio VirtualService
- Shadow mode: new model scores alongside champion, results logged but not used
- SHAP explainability: top 5 features per decision
- Model registry: MLflow (version tracking, artifact storage)
```

### 12.2 Graph Service (Phase 2)

```
- Neo4j 5.x (Aura managed or self-hosted causal cluster)
- Entities: Device, Account, MSISDN, IP, Email
- Relationships: USED_BY, LOGGED_IN_FROM, SHARED_DEVICE, LINKED_TO
- Queries via stored procedures only (tenant isolation)
- Cross-merchant: Pseudonymous tokens (HMAC-SHA256, 90-day epoch rotation)
- 2-hop query budget: < 100ms p99
```

### 12.3 Differential Privacy Service (Phase 2)

```
- Privacy ledger: PostgreSQL table tracking all DP queries
- Per-subject budget: ε = 5.0/year
- Per-merchant budget: ε = 10.0/year
- Noise: Laplacian (counting), Gaussian (aggregates)
- Query throttle: Approval required when budget < 20%
- Hard deny: Cached last-known-good when budget exhausted
```

---

## 13. Migration & Evolution Strategy

### 13.1 Phase 1 → Phase 2 Migration Path

| Component | Phase 1 | Phase 2 | Migration |
|-----------|---------|---------|-----------|
| Risk scoring | Rule engine only | Rules + LightGBM | Add ML as optional signal, champion/challenger |
| Device links | Single-merchant PG | Neo4j graph | Batch export PG relationships → Neo4j import |
| Privacy | Basic KVKK compliance | Full DP framework | Add DP service, privacy ledger, budget tracking |
| Cross-merchant | None | Pseudonymous graph | New HMAC tokenization, shared partition creation |
| Telco | 1 aggregator (Payguru) | 2+ aggregators | Add second aggregator with circuit breaker |

### 13.2 Database Evolution

- PostgreSQL schema managed via Prisma migrations
- Redis data model: Backward-compatible key additions (no breaking changes)
- Kafka topics: New topics for new features, existing topics unchanged
- Neo4j: Schema-free, additive (new node/relationship types)

---

## 14. Cost Estimates (Phase 1 MVP)

| Resource | Specification | Monthly Cost (est.) |
|----------|--------------|-------------------|
| EKS Cluster | 3 nodes (m5.xlarge), multi-AZ | ~$450 |
| RDS PostgreSQL | db.r6g.large, multi-AZ, 100GB + read replica | ~$550 |
| ElastiCache Redis | cache.r6g.large, 3 shards, multi-AZ | ~$550 |
| MSK Kafka | kafka.m5.large, 3 brokers | ~$650 |
| ALB | 2 load balancers | ~$80 |
| CloudFront | CDN for dashboard SPA | ~$30 |
| Vault | HashiCorp Cloud (starter) | ~$100 |
| MaxMind | GeoIP2 Enterprise | ~$100 |
| Monitoring | Grafana Cloud + PagerDuty | ~$150 |
| Data transfer | Cross-AZ + NAT Gateway + egress | ~$300 |
| Backups/Snapshots | RDS automated + Redis + S3 | ~$120 |
| Security scanning | Snyk + Trivy | ~$100 |
| Logging/Tracing | CloudWatch + OpenTelemetry storage | ~$200 |
| **Total** | | **~$3,380/mo** |

Note: Costs scale with traffic. At 10K events/sec sustained, expect ~$6,000-7,000/mo.
At 50K events/sec (Growth tier), expect ~$12,000-15,000/mo.

---

## 15. Disaster Recovery

### 15.1 Region-Wide DR Plan

```
Primary region: eu-west-1 (Ireland) — closest to Turkey with good connectivity
DR region: eu-central-1 (Frankfurt)

RPO: 1 minute (async streaming replication)
RTO: 30 minutes (region-wide failover)

Replication strategy:
  PostgreSQL: RDS cross-region read replica (async, ~1s lag)
  Redis: ElastiCache Global Datastore (async replication)
  Kafka: MirrorMaker 2 to DR region (async, configurable lag)
  S3: Cross-region replication enabled

Failover procedure:
  1. Detect region failure (Route53 health checks, 3 consecutive failures)
  2. Promote RDS cross-region replica to primary (~5 min)
  3. Promote ElastiCache Global Datastore (~1 min)
  4. MirrorMaker consumers switch to DR Kafka cluster
  5. Route53 failover DNS update (~60s TTL)
  6. Verify all services healthy in DR region
  7. Total estimated RTO: 15-30 minutes

DR testing:
  - Quarterly DR drill (failover to DR region, run for 1 hour, fail back)
  - Annual full DR exercise (run production from DR for 24 hours)
  - Automated DR readiness check: daily verification that replication lag < 5s
```

---

## 16. Distributed Tracing & Observability

### 16.1 OpenTelemetry Integration

```
All services instrumented with OpenTelemetry SDK (TypeScript):
  - Auto-instrumentation for NestJS, Kafka, Redis, PostgreSQL
  - Custom spans for business logic (rule evaluation, signal scoring)
  - Trace context propagated via W3C Trace Context headers

Trace flow for Decision API:
  api-gateway (root span)
    ├── auth.jwt_validate
    ├── idempotency.check (Redis)
    ├── decision-engine.orchestrate
    │   ├── feature-store.get (Redis, parallel)
    │   ├── velocity.check (Redis, parallel)
    │   ├── device-intel.score (Redis/PG, parallel)
    │   ├── behavioral.score (Redis, parallel)
    │   ├── network-intel.check (MaxMind, parallel)
    │   ├── telco.cached_lookup (Redis, parallel)
    │   ├── rule-engine.evaluate
    │   └── score.aggregate
    └── kafka.publish_decision (async)

Sampling policy:
  - 100% for errors and slow requests (>200ms)
  - 10% for normal requests (adjustable)
  - 100% for first 1000 requests after deployment (canary verification)

Backend: Jaeger or Grafana Tempo (integrated with Grafana dashboards)
Retention: 7 days full traces, 30 days aggregated metrics
```

---

## 17. Transactional Outbox Pattern

### 17.1 Exactly-Once Event Publishing

```
Problem: Dual-write (DB + Kafka) risks inconsistency if either fails.

Solution: Transactional outbox table in PostgreSQL.

CREATE TABLE outbox (
  id          BIGSERIAL PRIMARY KEY,
  topic       TEXT NOT NULL,
  key         TEXT,                  -- Kafka partition key
  payload     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published   BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMPTZ
);

Flow:
  1. Service writes business data + outbox row in SAME transaction
     BEGIN;
       INSERT INTO decisions (...) VALUES (...);
       INSERT INTO outbox (topic, key, payload) VALUES ('signalrisk.decisions', merchant_id, {...});
     COMMIT;

  2. Outbox relay (separate process) polls outbox table:
     SELECT * FROM outbox WHERE published = FALSE ORDER BY id LIMIT 100;
     → Publish each to Kafka
     → UPDATE outbox SET published = TRUE, published_at = NOW() WHERE id = ...;

  3. If Kafka publish fails → row stays unpublished, retried next poll

  4. Cleanup: DELETE FROM outbox WHERE published = TRUE AND published_at < NOW() - INTERVAL '24 hours';

Consumer idempotency:
  Every Kafka consumer maintains a processed_events set:
    CREATE TABLE processed_events (
      event_id TEXT PRIMARY KEY,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  Before processing: INSERT ... ON CONFLICT DO NOTHING; if inserted → process, else skip.
  Cleanup: DELETE WHERE processed_at < NOW() - INTERVAL '7 days';
```

---

## 18. Rule Hot-Reload Mechanism

```
Problem: Rules are evaluated in-memory for speed. How do new/changed rules propagate?

Solution: Event-driven rule cache invalidation.

Flow:
  1. Rule created/updated/activated → dashboard-api writes to PostgreSQL
  2. dashboard-api publishes to Kafka topic: signalrisk.rules.changes
     Payload: { merchant_id, rule_id, action: "ACTIVATE"|"DEACTIVATE"|"UPDATE", version }
  3. rule-engine consumers receive event
  4. rule-engine fetches updated rule set from PostgreSQL
  5. Parse DSL → AST, replace in-memory rule cache atomically
  6. Publish acknowledgment to signalrisk.rules.ack

Consistency:
  - Rule change takes effect within 5 seconds (Kafka propagation + PG fetch)
  - During propagation, old rules continue serving (no gap)
  - Version tracking: decision response includes rule_set_version for auditability

Startup:
  - On boot, rule-engine loads all active rules from PostgreSQL
  - Subscribes to change topic for live updates
```

---

## 19. Erasure Subject Index

```
Problem: "DEL all Redis keys matching subject" requires SCAN (O(N), slow).

Solution: Subject-to-key index in PostgreSQL.

CREATE TABLE subject_key_index (
  id            BIGSERIAL PRIMARY KEY,
  merchant_id   UUID NOT NULL,
  subject_id    TEXT NOT NULL,          -- external user identifier
  store         TEXT NOT NULL,          -- 'redis', 'postgresql', 'kafka', 'neo4j'
  key_pattern   TEXT NOT NULL,          -- Redis key or PG table:column:value
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_subject_keys ON subject_key_index (merchant_id, subject_id);

Flow:
  1. When a device/session/account is created/linked, register keys:
     INSERT INTO subject_key_index (merchant_id, subject_id, store, key_pattern)
     VALUES
       ($1, $2, 'redis', 'device:{m}:{fp}'),
       ($1, $2, 'redis', 'velocity:{m}:txn_per_device:{fp}'),
       ($1, $2, 'redis', 'features:{m}:{session_id}'),
       ($1, $2, 'postgresql', 'events:device_id:{device_id}'),
       ($1, $2, 'postgresql', 'decisions:device_id:{device_id}');

  2. On erasure request:
     SELECT key_pattern, store FROM subject_key_index
     WHERE merchant_id = $1 AND subject_id = $2;
     → For each: execute targeted deletion (DEL in Redis, DELETE in PG)

  3. After deletion: DELETE FROM subject_key_index WHERE merchant_id = $1 AND subject_id = $2;

Benefits:
  - No SCAN/KEYS in Redis (O(1) lookups per key)
  - Complete audit of what was deleted
  - Works across all storage systems uniformly
```

---

## 20. Rule Engine — Missing Signal Handling

```
When a rule references a signal that is unavailable (service down, consent withheld,
data not yet collected):

Policy: SKIP rule, do not fail.

Implementation:
  1. Before rule evaluation, build signal context with available signals
  2. For each rule, check if all referenced fields exist in context
  3. If any field is missing:
     a. Skip this rule entirely (do not evaluate partial conditions)
     b. Add to missing_signals list in decision response
  4. Decision response includes:
     "flags": ["partial"],
     "missing_signals": ["telco_carrier", "behavioral_score"],
     "rules_skipped": 2

  Merchant can configure per-rule behavior:
    - skip (default): Rule not evaluated if any input missing
    - default_high: Treat missing signal as high-risk (conservative)
    - default_low: Treat missing signal as low-risk (permissive)

  This is configured per-rule in the DSL:
    IF device_accounts > 3 [ON_MISSING: skip] THEN risk += 0.4
```

---

## 21. Backpressure Control

### 21.1 Event Collector Backpressure

```
Problem: Kafka lag spike or event storm can overwhelm the pipeline.

Three-layer defense:

Layer 1 — API Gateway Rate Limiter:
  - Per-merchant sliding window (Redis ZSET)
  - Startup tier: 100 req/s, Growth: 500 req/s, Enterprise: custom
  - Burst allowance: 2x rate for 10 seconds, then hard limit
  - Exceeded → HTTP 429 with Retry-After header

Layer 2 — Event Collector Queue Depth Guard:
  - Monitor Kafka producer queue depth (local buffer before Kafka ack)
  - If local queue > 10,000 events → start rejecting with 429
  - If Kafka lag (consumer group) > 100,000 messages → trigger backpressure:
    - Event collector returns 429 to new SDK requests
    - Dashboard shows "Event ingestion paused" alert
    - Auto-recovery: resume when lag drops below 50,000

Layer 3 — Circuit Breaker per downstream service:
  - Each intelligence service has a circuit breaker (3 failures → open 30s)
  - Open circuit → decision engine skips that signal, flags "partial"
  - Half-open → allow 1 request to test recovery
  - Fully open → normal operation

Kafka consumer scaling:
  - HPA on event-collector scales consumers based on Kafka lag metric
  - Consumer lag alert: P1 if lag > 10K messages for > 5 minutes
  - Emergency: manual consumer group rebalance + increase partitions
```

---

## 22. Feature Drift Monitoring

### 22.1 Statistical Drift Detection

```
Problem: Feature distributions change over time (data drift), degrading model/rule accuracy.

Phase 1 (Rule-based):
  - Baseline feature distributions computed daily from last 30 days
  - Real-time monitoring for each feature:
    - Null/missing rate: Alert if > baseline + 5%
    - Range violation: Alert if values exceed expected min/max
    - Distribution shift: Population Stability Index (PSI) computed daily
      PSI = Σ (actual_pct - expected_pct) × ln(actual_pct / expected_pct)
      PSI < 0.1 → stable
      PSI 0.1-0.25 → moderate shift (P2 alert)
      PSI > 0.25 → significant shift (P1 alert, investigate)

Phase 2 (ML):
  - Full statistical drift detection pipeline:
    - Kolmogorov-Smirnov (KS) test per numeric feature (weekly)
    - Chi-squared test per categorical feature (weekly)
    - Feature importance drift: compare SHAP rankings week-over-week
    - Prediction drift: KL divergence on score distribution
  - Automated response:
    PSI > 0.25 or KS p-value < 0.01 → trigger model retrain evaluation
    Feature completely absent → circuit-break that feature, alert P0
  - Feature catalog (PostgreSQL):
    CREATE TABLE feature_catalog (
      name        TEXT PRIMARY KEY,
      type        TEXT NOT NULL,        -- numeric, categorical, boolean
      source      TEXT NOT NULL,        -- device, behavioral, velocity, network, telco
      freshness   INTERVAL NOT NULL,    -- max staleness before alert
      baseline    JSONB,                -- {mean, std, min, max, histogram}
      updated_at  TIMESTAMPTZ
    );
  - Feast integration (Phase 2): Feature Store with versioning, lineage, serving
```

---

## 23. Replay Attack Protection

### 23.1 API Request Signing & Replay Prevention

```
Problem: Attacker captures a valid API request and replays it.

Defense layers:

1. Request timestamp validation:
   Required header: X-Timestamp (ISO 8601, UTC)
   Server validates: |server_time - X-Timestamp| < 300 seconds (5-minute window)
   Stale requests → HTTP 401 "Request timestamp out of range"

2. Request signature (HMAC):
   Required header: X-Signature
   Signature = HMAC-SHA256(signing_key, method + path + X-Timestamp + body_hash)
   body_hash = SHA256(request_body)
   signing_key = merchant-specific secret (rotated every 90 days, from Vault)

   Verification:
   - Reconstruct signature from request components
   - Compare with X-Signature (constant-time comparison)
   - Mismatch → HTTP 401

3. Nonce (optional, for enterprise tier):
   Required header: X-Nonce (UUID, unique per request)
   Server stores nonce in Redis: nonce:{merchant_id}:{nonce} TTL 300s
   Duplicate nonce → HTTP 409 "Duplicate request"

4. Idempotency (already implemented):
   X-Request-Id serves as idempotency key
   Same request_id → return cached response (no re-processing)

Combined defense:
  Timestamp prevents replay of old requests
  Signature prevents tampering
  Nonce prevents same-window replay (enterprise)
  Idempotency prevents duplicate processing
```

---

## 24. SDK Anti-Evasion & Integrity

### 24.1 SDK Integrity Verification

```
Problem: Attackers bypass/modify SDK to send fake signals.

Defense layers:

1. SDK Payload Signing:
   - SDK signs event payload with embedded secret (obfuscated in binary)
   - Signature included in X-SDK-Signature header
   - Server verifies signature before processing
   - Key rotation: SDK secret rotated per app version release

2. Runtime Tamper Detection (Mobile):
   Android:
     - ProGuard/R8 obfuscation of SDK code
     - Root detection (SafetyNet/Play Integrity API attestation)
     - Debugger detection (isDebuggerConnected, TracerPid check)
     - Hooking framework detection (Frida, Xposed, Magisk)
     - APK signature verification at runtime
     - Native code (JNI) for critical integrity checks (harder to patch)
   iOS:
     - App Attest (DeviceCheck framework)
     - Jailbreak detection (known path checks, fork() behavior, dylib injection)
     - Code signing verification at runtime

3. Device Attestation:
   - Android: Play Integrity API → device verdict + app integrity verdict
     → Server validates verdict token with Google's API
     → Untrusted device → flag in signals, increase risk score
   - iOS: App Attest → cryptographic assertion of app integrity
     → Server validates assertion with Apple
     → Failed attestation → flag as untrusted

4. Signal Consistency Checks (Server-side):
   - Cross-validate SDK signals against each other:
     IF claimed_device = "iPhone 15" AND gpu_renderer = "SwiftShader" → inconsistency flag
     IF sensor_data present AND attestation = "emulator" → contradiction flag
     IF behavioral signals perfectly uniform → likely injected
   - Impossible combinations → signal_integrity_score = LOW
   - Consistency score feeds into risk engine as a signal

5. Transport Security:
   - Certificate pinning (mobile SDKs)
   - TLS 1.3 only
   - Request size limits (max 50KB per event batch)

Limitation: SDK-side defenses are always bypassable by determined attackers.
Server-side signal consistency checks are the strongest defense.
The goal is to raise the cost of evasion, not make it impossible.
```

---

## 25. Scale Architecture Notes

### 25.1 Kafka Partition Scaling

```
Current MVP config: 12 partitions on main topics
Problem: At 10K events/sec, 12 partitions may bottleneck.
Rule of thumb: 1 partition ≈ 1K events/sec throughput.

Revised partition strategy:
  signalrisk.events.raw          → 48 partitions (supports 48K events/sec headroom)
  signalrisk.events.validated    → 48 partitions
  signalrisk.decisions           → 24 partitions
  signalrisk.events.dead-letter  → 6 partitions (low volume)
  Other topics                    → 12 partitions (adequate for control plane)

Note: Start with higher partition count from day 1. Increasing partitions later
requires consumer rebalance and can cause temporary data re-ordering.
Decreasing partitions is not possible without topic recreation.
```

### 25.2 Redis Memory Management

```
Problem: Velocity engine ZSETs grow fast with timestamp-based members.

Memory optimization:
  1. Aggressive TTL: All velocity keys TTL = 7 days (auto-expire inactive entities)
  2. Periodic cleanup: ZREMRANGEBYSCORE removes events outside max window
  3. Member compression: Use 8-byte compact timestamps instead of full UUID members
     Member format: <32-bit unix_ts><32-bit counter> = 8 bytes vs 36-byte UUID
  4. Large merchant optimization:
     - If entity has > 10K events in ZSET → switch to HyperLogLog for count-only
     - HyperLogLog: 12KB fixed per key, ~0.81% error rate
     - Acceptable for velocity counting (we need approximate counts, not exact)
  5. Memory budget per merchant tier:
     Startup: ~500MB Redis allocation
     Growth: ~2GB Redis allocation
     Enterprise: ~5GB+ (dedicated shard)

Monitoring:
  - Redis INFO memory per prefix (custom script)
  - Alert: merchant allocation > 80% → investigate + clean or upgrade
```

### 25.3 Feature Store Evolution (Phase 2)

```
Phase 1: Redis Cluster as feature store (simple, fast, sufficient for rules)
Phase 2: Migrate to Feast for ML feature management:
  - Online store: Redis (unchanged for serving)
  - Offline store: PostgreSQL or S3/Parquet (training data)
  - Feature registry: Feast catalog (versioning, lineage, documentation)
  - Feature computation: Kafka Streams → Feast materialization
  - Benefits: Feature reuse across models, point-in-time correctness,
    automated feature freshness monitoring

Migration path:
  1. Install Feast, configure Redis as online store (transparent to consumers)
  2. Register existing Redis features in Feast catalog
  3. Add offline store for batch feature computation
  4. ML service reads features via Feast SDK instead of direct Redis
```

### 25.4 Global Device Reputation Network (Strategic Moat)

```
Architecture's strongest strategic asset: cross-merchant device reputation.

Phase 1 (single-merchant):
  Device reputation computed per merchant (trust_score, fraud_ratio, velocity)
  Already enables: device farming detection, reuse detection

Phase 2 (cross-merchant, pseudonymous):
  Device reputation aggregated across merchants via HMAC tokens:
    device X → trust_score = 0.15, fraud_ratio = 0.34, seen_across = 12 merchants
  This creates a network effect:
    - More merchants → richer device reputation → better fraud detection
    - New merchants get instant value from existing network
    - Attackers can't farm devices across merchants (detected globally)

  This is the ThreatMetrix/LexisNexis moat — and SignalRisk can build it
  specifically for emerging market wallet/telco fraud.

  Implementation:
    - Cross-merchant device token: HMAC-SHA256 with 90-day epoch rotation
    - Shared Neo4j partition: only pseudonymous tokens + aggregate scores
    - No PII crosses merchant boundaries
    - DP noise on cross-merchant aggregates (ε ≤ 1.0)
    - Merchant opt-in required (Joint Controller Agreement)

  Network value formula:
    device_global_reputation = weighted_avg(
      merchant_trust_scores,
      weights = merchant_volume_share
    )
    where only consented merchants contribute
```
