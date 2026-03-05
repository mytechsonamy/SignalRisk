# SignalRisk — CTO/CIO Technical Presentation

---

## Slide 1: Title

**SignalRisk**
Real-time Fraud Decision Engine

*Technical Deep Dive for Technology Leaders*

---

## Slide 2: Architecture Overview

### Event-Driven Microservices with CQRS

```
┌─────────────────────────────────────────────────────────────────┐
│  MERCHANT INTEGRATION                                            │
│  SDK (iOS/Android/Web) ──→ REST API (OpenAPI 3.0)               │
│  OAuth2 + mTLS           <── Decision Response (<200ms)          │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│  API GATEWAY (NestJS)                                            │
│  JWT validation · Rate limiting · Idempotency · Tenant context   │
└──────────┬───────────────────┬──────────────────────────────────┘
           │                   │
     ┌─────▼─────┐      ┌─────▼──────┐
     │ Decision   │      │ Event      │
     │ Path       │      │ Collector  │
     │ (sync)     │      │ (async)    │
     └─────┬─────┘      └─────┬──────┘
           │                   │
           ▼                   ▼
┌──────────────────────────────────────────────────────────────────┐
│  PROCESSING CORE                                                  │
│                                                                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │ Velocity │ │ Device   │ │ Behavior │ │ Network  │            │
│  │ Engine   │ │ Intel    │ │ Intel    │ │ Intel    │            │
│  │ (Redis)  │ │ (PG+Redis│ │ (PG)    │ │ (MaxMind)│            │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘            │
│       └─────────────┼───────────┼─────────────┘                  │
│                     ▼           ▼                                 │
│  ┌─────────────────────┐  ┌─────────────────┐                    │
│  │ Rule Engine (DSL)   │  │ Feature Store   │                    │
│  └─────────┬───────────┘  │ (Redis Cluster) │                    │
│            ▼              └─────────────────┘                    │
│  ┌─────────────────────┐                                         │
│  │ Decision Engine     │──→ Score + Explanation                  │
│  └─────────────────────┘                                         │
└──────────────────────────────────────────────────────────────────┘
           │                        │
     ┌─────▼─────┐           ┌─────▼──────┐
     │ PostgreSQL │           │ Kafka      │
     │ + RLS      │           │ (events)   │
     └───────────┘           └────────────┘
```

---

## Slide 3: Latency Budget

### End-to-End Decision: <200ms p99

| Component | Budget (p99) | Cold Cache | Technology |
|-----------|:------------:|:----------:|-----------|
| Network ingress | 15ms | 20ms | CDN edge |
| Event parsing + validation | 8ms | 8ms | NestJS in-memory |
| Feature Store retrieval | 15ms | 50ms | Redis Cluster |
| Rule Engine evaluation | 20ms | 20ms | In-memory DSL interpreter |
| Graph query (2-hop) | 60ms | 120ms | Neo4j (Phase 2) |
| Risk score aggregation | 7ms | 7ms | In-memory |
| Response serialization | 5ms | 5ms | JSON |
| **Total (warm)** | **130ms** | | **70ms buffer** |

**Verification:** Load tested at 20K concurrent connections, burst tested at 5x rate (5K events/sec for 60s), cold-cache scenario included.

---

## Slide 4: Multi-Tenant Isolation

### Defense in Depth — No Single Point of Failure

```
Layer 1: API Gateway
  └─ JWT contains merchant_id, validated on every request
  └─ AsyncLocalStorage propagates tenant context (no thread-local leaks)

Layer 2: PostgreSQL Row-Level Security
  └─ Single RESTRICTIVE policy (prevents permissive OR bypass)
  └─ SET app.current_merchant_id per connection
  └─ All queries automatically scoped — no WHERE clause required

Layer 3: Redis Key Isolation
  └─ All keys prefixed: merchant:{id}:feature:{key}
  └─ No cross-prefix access possible

Layer 4: Kafka Topic Partitioning
  └─ Merchant-scoped topic partitions
  └─ Consumer groups per service, not per tenant

Layer 5: Neo4j (Phase 2)
  └─ Stored procedure tenant guards on all graph queries
  └─ Cross-merchant queries use pseudonymous HMAC tokens only
```

**Mandatory negative tests:** Every sprint includes cross-tenant access attempt tests that must fail.

---

## Slide 5: Service Catalog

### 15 Microservices, Domain-Aligned

| Service | Type | Scaling |
|---------|------|---------|
| api-gateway | HTTP/REST | 3+ replicas, HPA |
| event-collector | HTTP → Kafka | 3+ replicas, HPA |
| device-intel-service | Kafka → PG | 2+ replicas, HPA |
| velocity-engine | Kafka → Redis | 2+ replicas, HPA |
| behavioral-intel-service | Kafka → PG | 2+ replicas, HPA |
| network-intel-service | Kafka → PG | 2+ replicas, HPA |
| rule-engine | Internal | 2+ replicas, HPA |
| decision-engine | Internal | 3+ replicas, HPA |
| telco-intel-service | HTTP external | 2 replicas |
| dashboard-api | HTTP/WebSocket | 2+ replicas, HPA |
| dashboard-web | Static (CDN) | CDN |
| case-management-service | HTTP/WS | 2 replicas |
| consent-service | HTTP | 2 replicas |
| erasure-service | Async | 1 replica |
| webhook-service | Async | 2 replicas |
| auth-service | HTTP | 2 replicas |

**Phase 2 additions:** ml-scoring-service (gRPC), graph-service, dp-privacy-service

---

## Slide 6: Data Architecture

### Storage Strategy

| Store | Use Case | Retention | Scaling |
|-------|----------|-----------|---------|
| **PostgreSQL 16** | Decisions, cases, rules, audit, features (offline) | See retention policy | Read replicas + PgBouncer |
| **Redis Cluster 7.x** | Feature store (online), velocity counters, idempotency, cache | Session-scoped | 3+ shards, cluster mode |
| **Apache Kafka** | Event streaming, async processing, transactional outbox | 72h queue retention | 3-node cluster minimum |
| **Neo4j 5.x** (Phase 2) | Fraud graph (device-account-MSISDN-IP relationships) | 3 years | Causal clustering (3 nodes) |

### Data Retention Policy

| Data Type | Retention | Justification |
|-----------|-----------|---------------|
| Raw events | 90 days | Debugging, analysis |
| Aggregated features | 1 year | Model training, trends |
| Graph relationships | 3 years | Core asset |
| Audit logs | 5 years | Regulatory compliance |
| User PII | 72h post-erasure request | KVKK right to erasure |
| ML model artifacts | 3 years max | Version history, rollback |

---

## Slide 7: Security Architecture

### Defense Layers

**Authentication & Authorization:**
- Production: OAuth2 client_credentials (mandatory)
- Enterprise: mTLS for high-risk operations
- Dev/Staging only: API key (compiled out of production image)
- RBAC: Admin, Senior Analyst, Analyst, Viewer
- OPA policy-as-code gates in CI/CD

**PII Protection — Dual Representation:**
```
MSISDN Input: +905551234567
                    │
         ┌──────────┴──────────┐
         ▼                     ▼
   Argon2id Hash          HMAC-SHA256 Token
   (at-rest storage)      (lookup/join operations)
   64MB memory, 3 iter    Scoped keys per use case
   Per-user salt + pepper  180-day rotation
   No reverse lookup       Deterministic, O(1) lookup
```

**Infrastructure:**
- AES-256 at rest, TLS 1.3 in transit
- HashiCorp Vault for secrets (dynamic secrets, rotation, audit)
- WAF/bot protection on all public endpoints
- CVE scanning in CI/CD, critical patches within 48h
- Annual third-party penetration testing

**Incident Response:**
- P0: Data breach / full outage → 15min response, 1h resolve
- P1: Partial outage / FP spike → 30min response, 4h resolve
- 24/7 on-call rotation for P0/P1

---

## Slide 8: Availability & Disaster Recovery

### 99.9% Uptime SLA with Graceful Degradation

| Component Down | Fallback | Impact on Scoring |
|---------------|----------|-------------------|
| Redis (Feature Store) | Rule-based scoring only | Score flagged "partial" |
| Neo4j (Graph) | Skip cross-merchant check | Score flagged "partial" |
| Kafka | HTTP direct ingestion (1K req/s) | No impact |
| Telco aggregator | Score without telco signals | Score flagged "partial" |
| ML Model service | Fall back to rules | Score flagged "rule_only" |

- **RTO:** 15 minutes
- **RPO:** 1 minute (streaming replication)
- **Multi-AZ deployment** (minimum 2 availability zones)
- **Chaos testing:** Quarterly failure injection for each degradation scenario
- **Backpressure:** Event Collector rejects with 429 when queue > 1M events, auto-recovers at 500K

---

## Slide 9: Intelligence Modules Deep Dive

### Device Intelligence
- Fingerprinting: user_agent, canvas, WebGL, timezone, screen, sensors
- Reputation: trust score 0.0-1.0 (age, history, fraud_ratio, velocity, entropy)
- Farm detection: ADB status, CPU core count, sensor noise, frame rate variance, GPU renderer, thermal state
- Fingerprint stability: >95% consistency across 24h sessions
- Fuzzy matching: ≥80% signal overlap = same device

### Velocity Engine
- Sliding window counters: per IP, MSISDN, device, account (1min / 1h / 24h / 7d)
- Redis sorted sets + HyperLogLog for memory efficiency
- Burst detection: 3x baseline in 5min → immediate BLOCK
- Exponential decay (configurable half-life) to prevent boundary gaming
- Per-merchant configurable thresholds

### Behavioral Biometrics
- Session risk: typing cadence, swipe speed, scroll entropy, tap pressure
- Bot classification: inter-event timing CV (<0.1 = bot, >0.3 = human)
- Session flow: time_to_purchase, navigation_entropy, click_distribution
- Phase 1 target: >85% bot detection, <2% false positive
- Phase 2 target: >95% bot detection, <0.5% false positive

### Rule Engine DSL
```
IF device_accounts > 3 AND ip_country != msisdn_country
  THEN risk += 0.4

IF transactions_per_device_1h > 10 AND device_fraud_ratio > 0.3
  THEN BLOCK

IF time_to_purchase < 30s AND navigation_entropy < 0.2
  THEN risk += 0.3
```
- Simulation against historical data before activation
- Conflict detection between overlapping rules
- Staged rollout: 10% → 50% → 100%
- Version history with diff and one-click rollback

---

## Slide 10: Fraud Operations Dashboard

### Built for Fraud Analyst Productivity

**Case Management:**
- Auto-created cases from REVIEW/BLOCK decisions
- Case states: NEW → ASSIGNED → INVESTIGATING → RESOLVED
- SLA tracking with breach alerts
- Escalation: Analyst → Senior → Manager
- Evidence timeline with all signals aggregated
- Bulk resolution for related cases (same device/pattern)

**Rule Governance:**
- Rule approval queue with impact analysis
- Simulation results shown to approver (matched txns, catch rate, FP rate)
- Conflict analyzer prevents contradicting rules
- Full audit trail on every change

**Real-time Monitoring:**
- WebSocket event stream with auto-reconnect (exponential backoff)
- Per-widget degraded state (healthy/stale/failed independent tracking)
- KPI cards: fraud rate, blocked transactions, active devices, latency

**Accessibility:** WCAG 2.1 AA compliant — color + icon + text for all indicators, keyboard navigation, screen reader support.

---

## Slide 11: Compliance & Privacy

### KVKK/GDPR Ready from Day One

**Consent Framework:**
- Granular consent API in SDK (device/behavioral/sensor/browser categories)
- Merchants can select which signal categories to collect
- Consent stored per-user with full audit trail

**Right to Erasure — Full Propagation:**
1. Primary data deletion (PII, events, features)
2. Derived artifact cleanup (aggregated features, graph nodes)
3. ML model unlearning (retrain or delete affected models within 30 days)
4. Backup purge (encrypted backups with crypto-shredding)
5. Completion audit record

**Cross-Merchant Privacy:**
- Device fingerprints tokenized via scoped HMAC-SHA256 with 90-day epoch rotation
- No PII crosses merchant boundaries
- Differential privacy budget accounting (Phase 2)

**Data Residency:** All data stored in Turkey (or customer-specified region)

---

## Slide 12: Integration Guide

### 3-Step Integration

**Step 1: Install SDK** (5 minutes)
```javascript
// Web SDK (<100KB gzipped)
import { SignalRisk } from '@signalrisk/web-sdk';
const sr = new SignalRisk({ merchantId: 'your-id' });
sr.init(); // starts collecting signals
```

**Step 2: Evaluate Risk** (server-side, 1 API call)
```bash
POST /v1/decisions
Authorization: Bearer <oauth2_token>

{
  "session_id": "sess_abc123",
  "event_type": "purchase",
  "amount": 99.99,
  "msisdn": "+905551234567"
}
```

**Step 3: Act on Decision**
```json
{
  "risk_score": 0.82,
  "decision": "BLOCK",
  "risk_factors": [
    { "signal": "device_reuse", "weight": 0.3, "detail": "5 accounts" },
    { "signal": "velocity_breach", "weight": 0.2, "detail": "15 txn/hr" }
  ]
}
```

**Time to value:** SDK integration in 1 day, first fraud insights within 24 hours of data collection.

---

## Slide 13: Scalability Path

### From Startup to Enterprise Scale

```
STARTUP (5M events/mo)          GROWTH (50M events/mo)
─────────────────────           ──────────────────────
3 API Gateway replicas          5+ API Gateway replicas
2 Intel service replicas        3+ Intel service replicas
3-node Redis Cluster            6-node Redis Cluster
1 PostgreSQL + 1 replica        1 Primary + 3 read replicas
3-node Kafka cluster            5-node Kafka cluster

ENTERPRISE (500M+ events/mo)
────────────────────────────
10+ API Gateway replicas (HPA)
5+ Intel service replicas (HPA)
12+ node Redis Cluster
Multi-region PostgreSQL
7+ node Kafka cluster
3-node Neo4j causal cluster
Dedicated infrastructure option
```

**Auto-scaling:** Kubernetes HPA on CPU/memory + custom metrics (Kafka consumer lag, request latency p99).

---

## Slide 14: DevOps & Observability

### GitOps Pipeline

```
Developer → GitHub PR
  → CI (GitHub Actions):
    - Build + test
    - CVE scan
    - OPA policy check (no API keys in prod config)
    - Contract tests (OpenAPI compliance)
  → Merge to main
    → ArgoCD detects change
      → Progressive rollout (canary → full)
        → Prometheus + Grafana monitoring
          → PagerDuty alerting
```

**Observability stack:**
- **Metrics:** Prometheus (latency percentiles, error rates, Kafka lag, Redis hit ratios)
- **Logs:** Structured JSON, centralized (ELK or similar)
- **Tracing:** Distributed tracing across all services (request_id propagation)
- **Alerting:** PagerDuty for P0/P1, Slack for P2/P3
- **Dashboards:** Grafana with pre-built boards per service + business metrics

---

## Slide 15: Why SignalRisk — Technical Summary

| Capability | Detail |
|-----------|--------|
| **Latency** | <200ms p99 end-to-end decision |
| **Scale** | 10K concurrent, 10K events/sec, HPA auto-scaling |
| **Availability** | 99.9% SLA, graceful degradation, 15min RTO |
| **Security** | OAuth2 + mTLS, Argon2id + HMAC, Vault, annual pentests |
| **Multi-tenancy** | 5-layer isolation (API, RLS, Redis prefix, Kafka, Neo4j guards) |
| **Compliance** | KVKK/GDPR, full erasure propagation, consent framework |
| **Extensibility** | Rule DSL, webhook API, ML model plug-in (Phase 2) |
| **Observability** | Prometheus, Grafana, distributed tracing, PagerDuty |
| **Integration** | 1-day SDK setup, REST API, OpenAPI 3.0, SDK auto-generation |

**Bottom line:** Enterprise-grade fraud infrastructure that deploys like a modern SaaS — secure, observable, and built to scale with your transaction volume.
