# SignalRisk — Epic Breakdown & Sprint Plan v1

> Phase 1 MVP: Core Fraud Signals (4 months / 8 two-week sprints)
> Based on requirements-v4.md and architecture-v3.md

---

## 1. Epic Overview

| # | Epic | Priority | Sprints | Dependencies |
|---|------|----------|---------|--------------|
| E1 | Infrastructure & Foundation | P0 | S1-S2 | None |
| E2 | Event Pipeline (Kafka + Collector) | P0 | S1-S2 | E1 |
| E3 | Device Intelligence | P0 | S2-S3 | E2 |
| E4 | Velocity Engine | P0 | S2-S3 | E2 |
| E5 | Behavioral Intelligence | P0 | S3-S4 | E2 |
| E6 | Network Intelligence | P1 | S3-S4 | E2 |
| E7 | Rule Engine & DSL | P0 | S3-S5 | E3, E4 |
| E8 | Decision API | P0 | S4-S5 | E7 |
| E9 | Telco Intelligence (Basic) | P1 | S4-S5 | E2 |
| E10 | Dashboard — Core | P1 | S4-S6 | E8 |
| E11 | Dashboard — Case Management | P1 | S5-S7 | E10 |
| E12 | Dashboard — Rule Management | P1 | S5-S7 | E10, E7 |
| E13 | Auth, RBAC & Multi-Tenant | P0 | S2-S4 | E1 |
| E14 | Consent & Erasure | P1 | S5-S6 | E13 |
| E15 | Merchant SDK (iOS/Android/Web) | P0 | S3-S6 | E2, E8 |
| E16 | Chargeback Feedback | P1 | S6-S7 | E8 |
| E17 | Monitoring, Alerting & Observability | P0 | S1-S8 | E1 (continuous) |
| E18 | Integration Testing & Security | P0 | S7-S8 | All |

---

## 2. Sprint Plan

### Sprint 1 (Weeks 1-2): Foundation

**Goal:** Infrastructure up, event pipeline skeleton, CI/CD pipeline.

| Task | Epic | Est | Owner |
|------|------|-----|-------|
| Provision EKS cluster (multi-AZ), RDS, ElastiCache, MSK | E1 | 3d | Backend |
| Set up ArgoCD + GitHub Actions CI/CD pipeline | E1 | 2d | Backend |
| Configure Vault for secrets management | E1 | 1d | Backend |
| PostgreSQL schema v1 (merchants, users, devices, events, decisions) | E1 | 2d | Backend |
| RLS policies (RESTRICTIVE) + PgBouncer SET LOCAL pattern | E1 | 1d | Backend |
| Kafka topic creation (48 partitions for events, 24 for decisions) | E2 | 0.5d | Backend |
| Event collector service scaffold (NestJS, Kafka producer) | E2 | 2d | Backend |
| Event schema validation (JSON Schema) + dead letter queue | E2 | 1d | Backend |
| OpenTelemetry instrumentation setup (base config) | E17 | 1d | Backend |
| Prometheus + Grafana basic dashboards | E17 | 1d | Backend |
| Docker Compose for local dev (all services) | E1 | 1d | Backend |

**Sprint 1 Exit Criteria:**
- EKS cluster running, CI/CD deploys to staging
- Events flow: HTTP → Event Collector → Kafka → Dead Letter on invalid
- RLS isolation verified with cross-tenant negative test
- Local dev environment runs all services

---

### Sprint 2 (Weeks 3-4): Core Data Pipeline + Auth

**Goal:** Device fingerprinting, velocity counters, auth service.

| Task | Epic | Est | Owner |
|------|------|-----|-------|
| Auth service: OAuth2 client_credentials + JWT issuance | E13 | 3d | Backend |
| Dashboard auth: Session-based + MFA (TOTP) | E13 | 2d | Backend |
| API Gateway: JWT validation (cached JWKS), rate limiting | E13 | 2d | Backend |
| AsyncLocalStorage tenant middleware (NestJS) | E13 | 1d | Backend |
| Device Intel service: Fingerprint generation + fuzzy match | E3 | 3d | Backend |
| Device reputation scoring (trust_score formula) | E3 | 2d | Backend |
| Emulator detection (rule-based: adb, sensor_noise, gpu_renderer) | E3 | 1d | Backend |
| Velocity Engine: Redis sorted sets, 6 dimensions | E4 | 3d | Backend |
| Velocity burst detection (3x baseline → BLOCK) | E4 | 1d | Backend |
| Velocity decay (exponential half-life) | E4 | 1d | Backend |
| Event collector: Backpressure control (queue depth guard, 429) | E2 | 1d | Backend |
| Transactional outbox table + relay process | E1 | 1d | Backend |

**Sprint 2 Exit Criteria:**
- OAuth2 token flow working end-to-end
- Device fingerprints generated and matched (>95% stability test)
- Velocity counters incrementing in Redis, burst detection firing
- Backpressure returns 429 when Kafka lag exceeds threshold

---

### Sprint 3 (Weeks 5-6): Intelligence Modules + Rule Engine Start

**Goal:** All signal sources producing, rule engine parsing DSL.

| Task | Epic | Est | Owner |
|------|------|-----|-------|
| Behavioral Intel: Session risk scoring (timing CV, nav entropy) | E5 | 3d | Backend |
| Behavioral: Bot detection (rule-based, >85% target) | E5 | 2d | Backend |
| Network Intel: MaxMind GeoIP2 integration (in-memory) | E6 | 1d | Backend |
| Network Intel: Proxy/VPN detection + Tor exit node list | E6 | 2d | Backend |
| Network Intel: Geo mismatch detection (IP vs MSISDN vs billing) | E6 | 1d | Backend |
| Rule Engine: DSL parser (EBNF grammar → AST) | E7 | 3d | Backend |
| Rule Engine: In-memory evaluation pipeline | E7 | 2d | Backend |
| Rule Engine: Threshold randomization (deterministic seed) | E7 | 0.5d | Backend |
| Rule Engine: Missing signal handling (skip/default_high/default_low) | E7 | 1d | Backend |
| SDK (Web): JavaScript SDK scaffold + DeviceCollector | E15 | 3d | SDK |
| SDK (Web): BehavioralCollector + BrowserCollector | E15 | 2d | SDK |
| SDK (Web): Event batcher + transport (HTTPS, cert pinning) | E15 | 1d | SDK |
| Feature Store: Redis cache layer (session features, device cache) | E1 | 1d | Backend |

**Sprint 3 Exit Criteria:**
- All 5 intelligence modules producing signals
- Rule DSL parses and evaluates correctly against test cases
- Web SDK sends events to collector, fingerprints match server-side
- Feature cache hit rate > 80% for warm entities

---

### Sprint 4 (Weeks 7-8): Decision API + Dashboard Foundation

**Goal:** Decision API live, dashboard shell with auth.

| Task | Epic | Est | Owner |
|------|------|-----|-------|
| Decision Engine: Orchestrator (parallel intel lookups via Promise.all) | E8 | 3d | Backend |
| Decision Engine: Score aggregation + risk_factors[] explanation | E8 | 2d | Backend |
| Decision Engine: Idempotency (Redis hot + PG cold) | E8 | 1d | Backend |
| Decision Engine: Graceful degradation (partial scoring) | E8 | 1d | Backend |
| Decision API: POST /v1/decisions endpoint + OpenAPI spec | E8 | 1d | Backend |
| Replay attack protection: X-Timestamp + X-Signature validation | E8 | 1d | Backend |
| Telco Intel: MSISDN prefix lookup (local DB) | E9 | 1d | Backend |
| Telco Intel: Payguru async enrichment consumer | E9 | 2d | Backend |
| Dashboard: React project setup (Vite, Tailwind, design tokens) | E10 | 1d | Frontend |
| Dashboard: App shell (sidebar, header, routing) | E10 | 2d | Frontend |
| Dashboard: Auth (login, MFA, forgot password, session mgmt) | E10 | 3d | Frontend |
| Dashboard: Overview page (KPI cards, trend chart, event stream) | E10 | 3d | Frontend |
| Dashboard API: WebSocket server + event relay from Kafka | E10 | 2d | Backend |
| SDK (Android): Kotlin SDK + DeviceCollector + integrity checks | E15 | 3d | SDK |
| SDK (iOS): Swift SDK + DeviceCollector + App Attest | E15 | 3d | SDK |

**Sprint 4 Exit Criteria:**
- Decision API returns risk score < 200ms p99 (warm cache)
- Dashboard: Login → MFA → Overview with live event stream
- All 3 SDKs (Web/Android/iOS) sending events + fingerprints
- Payguru enrichment running async post-decision

---

### Sprint 5 (Weeks 9-10): Case Management + Rule UI

**Goal:** Fraud analysts can triage cases and manage rules.

| Task | Epic | Est | Owner |
|------|------|-----|-------|
| Case Management service: Auto-create cases from REVIEW/BLOCK | E11 | 2d | Backend |
| Case queue API: List, filter, sort, pagination | E11 | 1d | Backend |
| Case detail API: Evidence timeline, device reputation | E11 | 2d | Backend |
| Case resolution API: Resolve, escalate, bulk actions | E11 | 2d | Backend |
| SLA tracking: Deadline calculation + breach alerts | E11 | 1d | Backend |
| Dashboard: Case queue page (table, filters, SLA indicators) | E11 | 3d | Frontend |
| Dashboard: Case detail page (split panel, evidence, resolution) | E11 | 3d | Frontend |
| Dashboard: Bulk action bar | E11 | 1d | Frontend |
| Rule Management API: CRUD, versioning, simulation endpoint | E12 | 2d | Backend |
| Rule simulation: Replay N-day events through candidate rule | E12 | 2d | Backend |
| Dashboard: Rule list + editor (Monaco DSL) | E12 | 3d | Frontend |
| Dashboard: Rule conflict analyzer UI | E12 | 1d | Frontend |
| Consent service: SDK consent API + Kafka propagation | E14 | 2d | Backend |
| Webhook service: HMAC-signed delivery + retry | E8 | 2d | Backend |

**Sprint 5 Exit Criteria:**
- Cases auto-created from BLOCK/REVIEW decisions
- Analysts can: view queue → open case → review evidence → resolve
- Rules can be: created (DSL) → simulated → conflicts detected
- Consent changes propagate within 5 minutes

---

### Sprint 6 (Weeks 11-12): Rule Governance + Settings + SDK Polish

**Goal:** Rule approval workflow, RBAC settings, SDK production-ready.

| Task | Epic | Est | Owner |
|------|------|-----|-------|
| Rule approval queue API: Submit, approve, reject | E12 | 2d | Backend |
| Rule staged rollout: Shadow → 10% → 50% → 100% | E12 | 2d | Backend |
| Rule hot-reload: Kafka-driven cache invalidation | E12 | 1d | Backend |
| Rule version history + diff API | E12 | 1d | Backend |
| Dashboard: Rule approval queue page | E12 | 2d | Frontend |
| Dashboard: Staged rollout controls | E12 | 1d | Frontend |
| Dashboard: Rule version history + diff view | E12 | 1d | Frontend |
| Dashboard: Alerts inbox (list, acknowledge, snooze, escalate) | E10 | 2d | Frontend |
| Dashboard: Settings — Team & RBAC page | E13 | 2d | Frontend |
| Dashboard: Settings — Webhook management | E10 | 1d | Frontend |
| Dashboard: Settings — Audit log viewer | E13 | 1d | Frontend |
| Erasure service: Fan-out deletion + subject key index | E14 | 3d | Backend |
| Erasure: Verified deletion report | E14 | 1d | Backend |
| SDK: Anti-evasion (payload signing, tamper detection) | E15 | 2d | SDK |
| SDK: Consent manager integration | E15 | 1d | SDK |
| Chargeback API: CSV upload with validation | E16 | 2d | Backend |
| Chargeback: Rule weight feedback loop | E16 | 1d | Backend |

**Sprint 6 Exit Criteria:**
- Full rule lifecycle: Draft → Simulate → Approve → Staged Rollout → Active
- Erasure propagates across all systems within 72h
- RBAC: Admin/Senior/Analyst/Viewer permissions enforced
- SDK payload signing + integrity checks active

---

### Sprint 7 (Weeks 13-14): Integration, Security & Performance

**Goal:** End-to-end integration, security hardening, performance optimization.

| Task | Epic | Est | Owner |
|------|------|-----|-------|
| End-to-end integration test suite (SDK → Event → Decision → Case) | E18 | 3d | Backend |
| Cross-tenant isolation test suite (all endpoints, 403 verification) | E18 | 2d | Backend |
| Load test: 10K events/sec sustained (60 min), p99 < 200ms | E18 | 2d | Backend |
| Cold-cache test: Decision latency with flushed Redis | E18 | 0.5d | Backend |
| Security: API key module build-time removal verification | E18 | 0.5d | Backend |
| Security: OPA policy check in CI/CD | E18 | 1d | Backend |
| Security: Snyk + Trivy vulnerability scan (zero critical) | E18 | 1d | Backend |
| Dashboard: Empty states for all views | E10 | 1d | Frontend |
| Dashboard: Error states (403, 404, 500, form validation) | E10 | 1d | Frontend |
| Dashboard: Per-widget degraded state indicators | E10 | 1d | Frontend |
| Dashboard: Device detail page + reputation card | E10 | 2d | Frontend |
| Dashboard: Analytics — fraud by type, velocity heatmap | E10 | 2d | Frontend |
| DR drill: Failover to DR region, run 1 hour, fail back | E18 | 1d | Backend |
| Feature drift monitoring: PSI baseline + alerts | E17 | 1d | Backend |
| PagerDuty alert configuration (P0-P3 routing) | E17 | 0.5d | Backend |

**Sprint 7 Exit Criteria:**
- All integration tests pass (>80% coverage)
- Cross-tenant isolation: 100% endpoints return 403 on cross-tenant
- Load test: p99 < 200ms at 10K events/sec
- Zero critical vulnerabilities
- DR drill completed successfully

---

### Sprint 8 (Weeks 15-16): Polish, Documentation & Launch Prep

**Goal:** Production-ready, documented, launch criteria met.

| Task | Epic | Est | Owner |
|------|------|-----|-------|
| API documentation: OpenAPI spec + developer portal content | E8 | 2d | Backend |
| SDK documentation: Quick start guides (iOS/Android/Web) | E15 | 2d | SDK |
| Runbook: P0 incident procedures for all critical services | E17 | 2d | Backend |
| Dashboard: Keyboard shortcuts + accessibility audit (WCAG 2.1 AA) | E10 | 2d | Frontend |
| Dashboard: Connection resilience (WebSocket reconnect, stale indicators) | E10 | 1d | Frontend |
| Dashboard: Responsive behavior (tablet/mobile view-only) | E10 | 1d | Frontend |
| Performance tuning: Redis memory optimization (compact timestamps) | E4 | 1d | Backend |
| Performance tuning: PostgreSQL query optimization + indexes | E1 | 1d | Backend |
| Staging → Production deployment (canary rollout) | E1 | 1d | Backend |
| Smoke test: Production verification suite | E18 | 1d | Backend |
| Penetration test coordination (third-party) | E18 | 1d | Backend |
| Monitoring: Production Grafana dashboards + alert tuning | E17 | 1d | Backend |
| Go-live checklist verification | E18 | 0.5d | Backend |

**Sprint 8 Exit Criteria (Launch Criteria):**
- [ ] Decision API: p99 < 200ms (warm), < 300ms (cold)
- [ ] Bot detection: >85% TPR, <2% FPR (on labeled test set)
- [ ] Feature retrieval: p95 < 10ms
- [ ] Event throughput: 10K events/sec sustained
- [ ] Fingerprint stability: >95% same-device match (24h)
- [ ] Cross-tenant isolation: 100% pass rate
- [ ] Consent revocation: < 5 minutes propagation
- [ ] Data erasure: < 72 hours verified
- [ ] Zero critical/high vulnerabilities (Snyk/Trivy)
- [ ] API docs + SDK quick start published
- [ ] Runbook for all P0 scenarios
- [ ] DR drill completed
- [ ] Penetration test scheduled (pre-GA)

---

## 3. Dependency Graph

```
S1: E1 (Infra) ──→ E2 (Events) ──→ E17 (Monitoring, continuous)
         │
S2:      ├──→ E13 (Auth) ──→ E3 (Device) ──→ E4 (Velocity)
         │
S3:      │    E5 (Behavioral) ──→ E6 (Network) ──→ E7 (Rule Engine)
         │                                              │
S4:      │    E9 (Telco) ──→ E8 (Decision API) ←───────┘
         │                        │
S5:      │    E14 (Consent) ──→ E11 (Cases) + E12 (Rules UI)
         │                        │
S6:      │    E15 (SDK) ──→ E16 (Chargeback)
         │
S7-S8:   └──→ E18 (Integration + Security + Launch)
```

---

## 4. Team Allocation

| Role | S1-S2 | S3-S4 | S5-S6 | S7-S8 |
|------|-------|-------|-------|-------|
| Backend Engineer | Infra, Events, Auth | Decision API, Telco | Cases, Rules API | Integration, Perf |
| Backend Engineer | DB, RLS, Velocity | Rule Engine, Signals | Erasure, Webhooks | Security, DR |
| Frontend Engineer | — | Dashboard shell, Auth | Cases UI, Rules UI | Polish, A11y |
| SDK Engineer | — | Web SDK | Android/iOS SDK | SDK docs, anti-evasion |
| Fraud Scientist | Rule design | Bot detection tuning | Rule simulation | Labeled data, testing |

---

## 5. Risk Register

| Risk | Impact | Mitigation | Sprint |
|------|--------|------------|--------|
| Decision API latency > 200ms | HIGH | Parallel intel lookups, Redis caching, async telco | S4 (load test early) |
| Bot detection < 85% accuracy | MEDIUM | Labeled dataset quality, weekly tuning cycle | S3-S4 |
| Kafka partition hot spots | MEDIUM | Session-salted keys, 48 partitions from day 1 | S1 |
| SDK size > 100KB (web) | LOW | Tree-shaking, modular collectors | S3-S4 |
| Payguru integration delay | MEDIUM | Async enrichment, score without telco (flag partial) | S4-S5 |
| Cross-tenant data leakage | CRITICAL | RESTRICTIVE RLS, AsyncLocalStorage, negative tests | S2 (verify early) |
| Redis memory growth | MEDIUM | Compact timestamps, TTL enforcement, HyperLogLog | S7-S8 |
| KVKK compliance gap | HIGH | Consent service early (S5), erasure verification (S6) | S5-S6 |

---

## 6. Definition of Done (per Epic)

- [ ] All user stories implemented and unit tested (>80% coverage)
- [ ] Integration tests passing
- [ ] Cross-tenant isolation test passing (if applicable)
- [ ] API documentation updated (OpenAPI spec)
- [ ] Grafana dashboard/alerts configured
- [ ] Code reviewed and merged to main
- [ ] Deployed to staging and smoke tested
- [ ] Performance within SLA (latency, throughput)
