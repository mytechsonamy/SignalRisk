# SignalRisk -- Epic Breakdown & Sprint Plan v2

> Phase 1 MVP: Core Fraud Signals (4.5 months / 9 two-week sprints)
> Based on requirements-v4.md and architecture-v3.md
> v2: Addresses review feedback -- expanded team, security shift-left, model ops epic, business-risk launch gates, continuous perf testing

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
| E7 | Rule Engine & DSL | P0 | S4-S5 | E3, E4, E5, E6 (signal contracts) |
| E8 | Decision API | P0 | S5-S6 | E7, E9 (async enrichment contract) |
| E9 | Telco Intelligence (Basic) | P1 | S3-S5 | E2 |
| E10 | Dashboard -- Core | P1 | S4-S6 | E8 |
| E11 | Dashboard -- Case Management | P1 | S5-S7 | E10 |
| E12 | Dashboard -- Rule Management | P1 | S5-S7 | E10, E7 |
| E13 | Auth, RBAC & Multi-Tenant | P0 | S1-S3 | E1 |
| E14 | Consent & Erasure | P1 | S5-S6 | E13 |
| E15 | Merchant SDK (iOS/Android/Web) | P0 | S3-S6 | E2, E8 |
| E16 | Chargeback & Label Pipeline | P0 | S6-S7 | E8 |
| E17 | Monitoring, Alerting & Observability | P0 | S1-S9 | E1 (continuous) |
| E18 | Security Hardening | P0 | S1-S9 | E1 (continuous, shift-left) |
| E19 | Fraud Data & Model Ops | P0 | S5-S8 | E8, E16 |
| E20 | Integration Testing & Launch Prep | P0 | S7-S9 | All |

**Changes from v1:**
- E7 now depends on E5/E6 signal contracts (not just E3/E4)
- E8 now depends on E9 async enrichment contract
- E13 (Auth) shifted earlier (S1-S3) -- security shift-left
- E16 expanded: Chargeback + Label Pipeline (ground truth)
- E18 split from E20: Security is continuous from S1 (not S7-S8)
- E19 NEW: Fraud Data & Model Ops (label pipeline, evaluation, governance)
- E20: Integration + Launch Prep (was E18)
- Added Sprint 9 for launch hardening buffer

---

## 2. Team Allocation (Expanded)

| Role | Count | S1-S3 | S4-S6 | S7-S9 |
|------|-------|-------|-------|-------|
| Backend Engineer (Senior) | 1 | Infra, Auth, RLS, Outbox | Decision API, Rule Engine | Integration, Perf tuning |
| Backend Engineer | 1 | Events, Kafka, Velocity | Signals, Cases API | Security, DR |
| Backend Engineer | 1 | DB, Device Intel, Auth | Telco, Webhooks, Erasure | Model Ops, Launch |
| Frontend Engineer (Senior) | 1 | -- | Dashboard core, Auth UI | Cases UI, Rules UI, Polish |
| Frontend Engineer | 1 | -- | Overview, Settings | Analytics, A11y, Empty/Error states |
| SDK Engineer | 1 | -- | Web SDK | Android/iOS SDK, Docs |
| SRE / Platform Engineer | 1 | EKS, CI/CD, ArgoCD, Vault | Monitoring, Alerting | Load test, DR, Prod deploy |
| QA / Automation Engineer | 1 | Test framework, E2E scaffold | Isolation tests, API tests | Full regression, Perf tests |
| Security Engineer (part-time) | 0.5 | OPA policies, SAST setup | Pen test prep, vuln scans | Pen test, remediation |
| Fraud Scientist | 1 | Rule design, labeled data | Bot tuning, simulation | Model eval, drift monitoring |

**Total: 8.5 FTE** (up from 5 in v1)

---

## 3. Sprint Plan

### Sprint 1 (Weeks 1-2): Foundation -- Infrastructure & Auth Start

**Goal:** Core infrastructure provisioned, CI/CD pipeline, auth service started.

| Task | Epic | Est | Owner |
|------|------|-----|-------|
| Provision EKS cluster (multi-AZ) + networking (VPC, subnets) | E1 | 2d | SRE |
| ArgoCD + GitHub Actions CI/CD pipeline | E1 | 2d | SRE |
| Vault configuration for secrets management | E1 | 1d | SRE |
| Docker Compose for local dev (all services) | E1 | 1d | SRE |
| PostgreSQL (RDS) + ElastiCache provisioning | E1 | 1d | Backend-Sr |
| PostgreSQL schema v1 (merchants, users, devices, events, decisions) | E1 | 2d | Backend-Sr |
| RLS policies (RESTRICTIVE) + PgBouncer SET LOCAL pattern | E1 | 1d | Backend-Sr |
| Kafka (MSK) provisioning + topic creation (48 partitions) | E2 | 1d | Backend |
| Event collector service scaffold (NestJS, Kafka producer) | E2 | 2d | Backend |
| Event schema validation (JSON Schema) + dead letter queue | E2 | 1d | Backend |
| Auth service: OAuth2 client_credentials scaffold | E13 | 2d | Backend-3 |
| OpenTelemetry base config + Prometheus/Grafana setup | E17 | 1d | SRE |
| SAST pipeline (Snyk, Trivy) integrated in CI | E18 | 1d | Security |
| OPA base policies (namespace isolation, image allowlists) | E18 | 1d | Security |
| E2E test framework scaffold (Jest + Supertest) | E20 | 1d | QA |

**Sprint 1 Exit Criteria:**
- EKS cluster running, CI/CD deploys to staging
- Events flow: HTTP -> Event Collector -> Kafka -> Dead Letter on invalid
- RLS isolation verified with cross-tenant negative test
- SAST pipeline blocks on critical findings
- Local dev environment runs all services

---

### Sprint 2 (Weeks 3-4): Data Pipeline + Auth Complete

**Goal:** Device fingerprinting, velocity counters, auth service complete.

| Task | Epic | Est | Owner |
|------|------|-----|-------|
| Auth service: JWT issuance + JWKS endpoint | E13 | 2d | Backend-3 |
| Dashboard auth: Session-based + MFA (TOTP) | E13 | 2d | Backend-3 |
| API Gateway: JWT validation (cached JWKS), rate limiting | E13 | 2d | Backend-3 |
| AsyncLocalStorage tenant middleware (NestJS) | E13 | 1d | Backend-Sr |
| Device Intel service: Fingerprint generation + fuzzy match | E3 | 3d | Backend |
| Device reputation scoring (trust_score formula) | E3 | 2d | Backend |
| Emulator detection (rule-based: adb, sensor_noise, gpu_renderer) | E3 | 1d | Backend |
| Velocity Engine: Redis sorted sets, 6 dimensions | E4 | 3d | Backend-Sr |
| Velocity burst detection (3x baseline -> BLOCK) | E4 | 1d | Backend-Sr |
| Velocity decay (exponential half-life) | E4 | 1d | Backend-Sr |
| Event collector: Backpressure control (queue depth guard, 429) | E2 | 1d | Backend |
| Transactional outbox table + relay process | E1 | 1d | Backend-Sr |
| Cross-tenant isolation test suite (starter: auth + events) | E18 | 2d | QA |
| Perf baseline: Event collector throughput benchmark | E17 | 1d | SRE |

**Sprint 2 Exit Criteria:**
- OAuth2 token flow working end-to-end
- Device fingerprints generated and matched (>95% stability test)
- Velocity counters incrementing in Redis, burst detection firing
- Backpressure returns 429 when Kafka lag exceeds threshold
- Cross-tenant isolation: 100% on auth + event endpoints
- **Perf gate:** Event collector > 5K events/sec on staging

---

### Sprint 3 (Weeks 5-6): Intelligence Modules + Signal Contracts

**Goal:** All signal sources producing, signal contracts frozen for Rule Engine.

| Task | Epic | Est | Owner |
|------|------|-----|-------|
| Behavioral Intel: Session risk scoring (timing CV, nav entropy) | E5 | 3d | Backend |
| Behavioral: Bot detection (rule-based, >85% target) | E5 | 2d | Backend |
| Network Intel: MaxMind GeoIP2 integration (in-memory) | E6 | 1d | Backend-3 |
| Network Intel: Proxy/VPN detection + Tor exit node list | E6 | 2d | Backend-3 |
| Network Intel: Geo mismatch detection (IP vs MSISDN vs billing) | E6 | 1d | Backend-3 |
| Telco Intel: MSISDN prefix lookup (local DB) | E9 | 1d | Backend-Sr |
| Telco Intel: Payguru async enrichment consumer | E9 | 2d | Backend-Sr |
| **Signal Contract Freeze:** Define signal schemas for E3/E4/E5/E6/E9 | ALL | 1d | Backend-Sr |
| Feature Store: Redis cache layer (session features, device cache) | E1 | 1d | Backend |
| SDK (Web): JavaScript SDK scaffold + DeviceCollector | E15 | 3d | SDK |
| SDK (Web): BehavioralCollector + BrowserCollector | E15 | 2d | SDK |
| SDK (Web): Event batcher + transport (HTTPS, cert pinning) | E15 | 1d | SDK |
| Cross-tenant isolation: Device + Velocity endpoints | E18 | 1d | QA |
| API integration tests: Auth + Event + Device + Velocity | E20 | 2d | QA |
| Perf gate: Device + Velocity latency benchmarks | E17 | 1d | SRE |

**Sprint 3 Exit Criteria:**
- All 5 intelligence modules producing signals
- **Signal contracts frozen** (typed interfaces published for Rule Engine)
- Web SDK sends events to collector, fingerprints match server-side
- Feature cache hit rate > 80% for warm entities
- **Perf gate:** Device lookup < 50ms p99, Velocity < 20ms p99

---

### Sprint 4 (Weeks 7-8): Rule Engine + Dashboard Foundation

**Goal:** Rule engine parsing DSL with all signal types, dashboard shell.

| Task | Epic | Est | Owner |
|------|------|-----|-------|
| Rule Engine: DSL parser (EBNF grammar -> AST) | E7 | 3d | Backend-Sr |
| Rule Engine: In-memory evaluation pipeline | E7 | 2d | Backend-Sr |
| Rule Engine: Threshold randomization (deterministic seed) | E7 | 0.5d | Backend-Sr |
| Rule Engine: Missing signal handling (skip/default_high/default_low) | E7 | 1d | Backend-Sr |
| Rule Engine: Integration with all 5 signal contracts | E7 | 1d | Backend-Sr |
| Rule Engine: Unit test suite (>90% branch coverage) | E7 | 1d | QA |
| Dashboard: React project setup (Vite, Tailwind, design tokens) | E10 | 1d | Frontend-Sr |
| Dashboard: App shell (sidebar, header, routing) | E10 | 2d | Frontend-Sr |
| Dashboard: Auth (login, MFA, forgot password, session mgmt) | E10 | 3d | Frontend-Sr |
| Dashboard: Overview page (KPI cards, trend chart, event stream) | E10 | 3d | Frontend |
| Dashboard API: WebSocket server + event relay from Kafka | E10 | 2d | Backend |
| SDK (Android): Kotlin SDK + DeviceCollector + integrity checks | E15 | 3d | SDK |
| SDK (iOS): Swift SDK + DeviceCollector + App Attest | E15 | 3d | SDK |
| Cross-tenant isolation: All signal module endpoints | E18 | 1d | QA |
| Dependency vulnerability scan + remediation | E18 | 1d | Security |

**Sprint 4 Exit Criteria:**
- Rule DSL parses and evaluates correctly against test cases (all signal types)
- Dashboard: Login -> MFA -> Overview with live event stream
- All 3 SDKs (Web/Android/iOS) sending events + fingerprints
- **Perf gate:** Rule evaluation < 5ms p99 for 50-rule set
- Zero critical vulnerabilities

---

### Sprint 5 (Weeks 9-10): Decision API + Case Management

**Goal:** Decision API live, fraud analysts can triage cases.

| Task | Epic | Est | Owner |
|------|------|-----|-------|
| Decision Engine: Orchestrator (parallel intel lookups via Promise.all) | E8 | 3d | Backend-Sr |
| Decision Engine: Score aggregation + risk_factors[] explanation | E8 | 2d | Backend-Sr |
| Decision Engine: Idempotency (Redis hot + PG cold) | E8 | 1d | Backend-Sr |
| Decision Engine: Graceful degradation (partial scoring) | E8 | 1d | Backend-Sr |
| Decision API: POST /v1/decisions endpoint + OpenAPI spec | E8 | 1d | Backend-Sr |
| Replay attack protection: X-Timestamp + X-Signature validation | E8 | 1d | Backend |
| Case Management service: Auto-create cases from REVIEW/BLOCK | E11 | 2d | Backend |
| Case queue API: List, filter, sort, pagination | E11 | 1d | Backend-3 |
| Case detail API: Evidence timeline, device reputation | E11 | 2d | Backend-3 |
| Case resolution API: Resolve, escalate, bulk actions | E11 | 2d | Backend-3 |
| SLA tracking: Deadline calculation + breach alerts | E11 | 1d | Backend-3 |
| Dashboard: Case queue page (table, filters, SLA indicators) | E11 | 3d | Frontend-Sr |
| Dashboard: Case detail page (split panel, evidence, resolution) | E11 | 3d | Frontend |
| Dashboard: Bulk action bar | E11 | 1d | Frontend |
| Consent service: SDK consent API + Kafka propagation | E14 | 2d | Backend |
| Labeled test dataset: Curate 10K decisions (known fraud/legit) | E19 | 3d | Fraud Scientist |
| Cross-tenant isolation: Decision + Case endpoints | E18 | 1d | QA |
| Integration test: SDK -> Event -> Decision -> Case E2E flow | E20 | 2d | QA |

**Sprint 5 Exit Criteria:**
- Decision API returns risk score < 200ms p99 (warm cache)
- Cases auto-created from BLOCK/REVIEW decisions
- Analysts can: view queue -> open case -> review evidence -> resolve
- Consent changes propagate within 5 minutes
- **Perf gate:** Decision API p99 < 200ms at 1K concurrent requests
- **Business gate:** Decision API FPR < 5% on labeled test set

---

### Sprint 6 (Weeks 11-12): Rule Governance + SDK Polish + Labels

**Goal:** Rule approval workflow, SDK production-ready, label pipeline operational.

| Task | Epic | Est | Owner |
|------|------|-----|-------|
| Rule Management API: CRUD, versioning, simulation endpoint | E12 | 2d | Backend-Sr |
| Rule simulation: Replay N-day events through candidate rule | E12 | 2d | Backend-Sr |
| Rule approval queue API: Submit, approve, reject | E12 | 2d | Backend |
| Rule staged rollout: Shadow -> 10% -> 50% -> 100% | E12 | 2d | Backend |
| Rule hot-reload: Kafka-driven cache invalidation | E12 | 1d | Backend |
| Rule version history + diff API | E12 | 1d | Backend |
| Dashboard: Rule list + editor (Monaco DSL) | E12 | 3d | Frontend-Sr |
| Dashboard: Rule conflict analyzer UI | E12 | 1d | Frontend-Sr |
| Dashboard: Rule approval queue page | E12 | 2d | Frontend |
| Dashboard: Staged rollout controls | E12 | 1d | Frontend |
| Dashboard: Rule version history + diff view | E12 | 1d | Frontend |
| Chargeback API: CSV upload with validation | E16 | 2d | Backend-3 |
| Chargeback: Label ingestion pipeline (async, delayed labels) | E16 | 2d | Backend-3 |
| Label store: Decision-label join + dataset versioning | E19 | 3d | Backend-3 |
| Offline evaluation pipeline: Precision/Recall/FPR by segment | E19 | 2d | Fraud Scientist |
| SDK: Anti-evasion (payload signing, tamper detection) | E15 | 2d | SDK |
| SDK: Consent manager integration | E15 | 1d | SDK |
| Webhook service: HMAC-signed delivery + retry | E8 | 2d | Backend |
| Erasure service: Fan-out deletion + subject key index | E14 | 3d | Backend |
| Cross-tenant isolation: Rule + Webhook endpoints | E18 | 1d | QA |

**Sprint 6 Exit Criteria:**
- Full rule lifecycle: Draft -> Simulate -> Approve -> Staged Rollout -> Active
- Chargeback labels flowing into label store
- Offline evaluation produces segment-level FPR/TPR reports
- SDK payload signing + integrity checks active
- RBAC: Admin/Senior/Analyst/Viewer permissions enforced

---

### Sprint 7 (Weeks 13-14): Model Ops + Analytics + Performance

**Goal:** Feature drift monitoring, analytics dashboard, progressive load testing.

| Task | Epic | Est | Owner |
|------|------|-----|-------|
| Feature drift monitoring: PSI baseline computation | E19 | 2d | Fraud Scientist |
| Feature drift: KS test for continuous features + alerts | E19 | 1d | Fraud Scientist |
| Champion/Challenger framework: A/B rule set evaluation | E19 | 3d | Backend-Sr |
| Rule weight feedback loop (chargeback -> rule performance) | E16 | 2d | Backend |
| Dashboard: Alerts inbox (list, acknowledge, snooze, escalate) | E10 | 2d | Frontend-Sr |
| Dashboard: Settings -- Team & RBAC page | E13 | 2d | Frontend |
| Dashboard: Settings -- Webhook management | E10 | 1d | Frontend |
| Dashboard: Settings -- Audit log viewer | E13 | 1d | Frontend |
| Dashboard: Analytics -- fraud by type, velocity heatmap | E10 | 2d | Frontend-Sr |
| Dashboard: Device detail page + reputation card | E10 | 2d | Frontend |
| Dashboard: Empty states for all views | E10 | 1d | Frontend |
| Dashboard: Error states (403, 404, 500, form validation) | E10 | 1d | Frontend |
| Erasure: Verified deletion report | E14 | 1d | Backend-3 |
| Load test: 10K events/sec sustained (60 min), p99 < 200ms | E20 | 2d | SRE |
| Cold-cache test: Decision latency with flushed Redis | E20 | 0.5d | SRE |
| Cross-tenant isolation: Full regression (all endpoints) | E18 | 2d | QA |
| E2E integration test suite: Complete flow coverage | E20 | 3d | QA |
| PagerDuty alert configuration (P0-P3 routing) | E17 | 0.5d | SRE |

**Sprint 7 Exit Criteria:**
- Feature drift monitoring active with PSI alerts
- Champion/Challenger framework operational (shadow mode)
- Analytics dashboard functional with live data
- **Perf gate:** 10K events/sec sustained, p99 < 200ms
- **Coverage gate:** >80% integration test coverage on critical paths (decision, auth, isolation: >90% branch)
- Cross-tenant isolation: 100% regression pass

---

### Sprint 8 (Weeks 15-16): Security Hardening + Ops Readiness

**Goal:** Pen test, operational playbooks, fraud ops workflows.

| Task | Epic | Est | Owner |
|------|------|-----|-------|
| Penetration test execution (third-party) | E18 | 5d | Security |
| Pen test finding remediation (critical/high) | E18 | 3d | Backend-Sr + Security |
| KMS key rotation policy + break-glass procedure | E18 | 1d | SRE |
| Immutable audit log verification | E18 | 1d | Backend-3 |
| Fraud Ops Playbook: Review policy, escalation matrix | E19 | 2d | Fraud Scientist |
| Fraud Ops: Analyst QA sampling (random case re-review) | E19 | 1d | Fraud Scientist |
| Fraud Ops: Case outcome -> rule tuning feedback loop SLA | E19 | 1d | Backend |
| Dashboard: Per-widget degraded state indicators | E10 | 1d | Frontend |
| Dashboard: Keyboard shortcuts + accessibility audit (WCAG 2.1 AA) | E10 | 2d | Frontend-Sr |
| Dashboard: Connection resilience (WebSocket reconnect, stale indicators) | E10 | 1d | Frontend |
| Dashboard: Responsive behavior (tablet/mobile view-only) | E10 | 1d | Frontend |
| Runbook: P0 incident procedures for all critical services | E17 | 2d | SRE |
| DR drill: Failover to DR region, run 1 hour, fail back | E20 | 1d | SRE |
| Vendor fallback testing: Payguru/MaxMind outage simulation | E20 | 1d | QA |
| Performance tuning: Redis memory optimization (compact timestamps) | E4 | 1d | Backend-Sr |
| Performance tuning: PostgreSQL query optimization + indexes | E1 | 1d | Backend-Sr |

**Sprint 8 Exit Criteria:**
- Pen test complete, all critical/high findings remediated
- KMS rotation + break-glass procedures documented and tested
- Fraud ops playbooks published (review, escalation, QA)
- DR drill completed successfully
- Vendor fallback (degraded mode) tested
- All dashboards have degraded state indicators

---

### Sprint 9 (Weeks 17-18): Launch Prep + Buffer

**Goal:** Production deployment, documentation, final verification.

| Task | Epic | Est | Owner |
|------|------|-----|-------|
| API documentation: OpenAPI spec + developer portal content | E8 | 2d | Backend |
| SDK documentation: Quick start guides (iOS/Android/Web) | E15 | 2d | SDK |
| Production Grafana dashboards + alert tuning | E17 | 1d | SRE |
| Staging -> Production deployment (canary rollout) | E1 | 2d | SRE |
| Production smoke test suite | E20 | 1d | QA |
| Final load test on production (canary, 10% traffic) | E20 | 1d | SRE |
| Business KPI baseline measurement (FPR, approval rate) | E19 | 1d | Fraud Scientist |
| Segment-level evaluation report (by merchant, by payment type) | E19 | 2d | Fraud Scientist |
| Go-live checklist verification | E20 | 0.5d | All |
| Launch day monitoring war room setup | E17 | 0.5d | SRE |
| **Buffer:** Remediation of any remaining issues | ALL | 5d | All |

**Sprint 9 Exit Criteria = Launch Criteria** (see Section 7)

---

## 4. Dependency Graph

```
S1: E1 (Infra) ---> E2 (Events) ---> E17 (Monitoring, continuous)
    E13 (Auth)      E18 (Security, continuous)
         |
S2:     E3 (Device) ---> E4 (Velocity)
         |
S3:     E5 (Behavioral) ---> E6 (Network) ---> E9 (Telco)
         |                                       |
         +--- Signal Contract Freeze ------>-----+
                                                  |
S4:     E7 (Rule Engine) <--- all signal contracts
         |
S5:     E8 (Decision API) <--- E7 + E9(async)
         |                        |
         E11 (Cases)           E14 (Consent)
         |
S6:     E12 (Rules UI)        E16 (Chargeback + Labels)
         |                        |
S7:     E19 (Model Ops) <--- E16 labels
         |
S8:     E18 (Pen Test)        E20 (Load Test + DR)
         |
S9:     E20 (Launch Prep + Buffer)
```

---

## 5. Signal Contract Freeze (Sprint 3 Milestone)

Before Rule Engine (E7) development begins, all intelligence modules must publish typed signal contracts:

| Module | Signal Interface | Fields |
|--------|-----------------|--------|
| E3 Device Intel | `DeviceSignals` | device_id, trust_score, is_emulator, fingerprint_stability, days_since_first_seen |
| E4 Velocity | `VelocitySignals` | tx_count_1h, tx_count_24h, amount_sum_1h, unique_devices_24h, burst_detected |
| E5 Behavioral | `BehavioralSignals` | session_risk_score, timing_cv, nav_entropy, is_bot, bot_confidence |
| E6 Network | `NetworkSignals` | is_proxy, is_vpn, is_tor, geo_mismatch, country_code, risk_country |
| E9 Telco | `TelcoSignals` | carrier_name, msisdn_type, sim_swap_days, line_type, enrichment_available |

Each contract is a TypeScript interface in `packages/signal-contracts/`. Rule Engine imports these types. Changes after freeze require E7 impact assessment.

---

## 6. Continuous Quality Gates (Per-Sprint)

Instead of concentrating testing in final sprints, each sprint has mandatory gates:

| Gate | Frequency | Threshold | Owner |
|------|-----------|-----------|-------|
| SAST scan (Snyk/Trivy) | Every PR | Zero critical | Security |
| Cross-tenant isolation test | Per sprint (incremental) | 100% pass on tested endpoints | QA |
| Unit test coverage | Per sprint | >80% lines, >90% on decision/auth/isolation | QA |
| Integration test (E2E) | Per sprint (incremental) | All tested flows pass | QA |
| Performance benchmark | Per sprint (for new services) | Within SLA (see per-sprint perf gates) | SRE |
| Dependency vuln scan | Bi-weekly | Zero critical, <5 high | Security |

---

## 7. Launch Criteria (Business + Technical)

### Technical Launch Gates
- [ ] Decision API: p99 < 200ms (warm), < 300ms (cold)
- [ ] Bot detection: >85% TPR, <2% FPR (on labeled test set)
- [ ] Feature retrieval: p95 < 10ms
- [ ] Event throughput: 10K events/sec sustained (60 min)
- [ ] Fingerprint stability: >95% same-device match (24h)
- [ ] Cross-tenant isolation: 100% pass rate (all endpoints)
- [ ] Consent revocation: < 5 minutes propagation
- [ ] Data erasure: < 72 hours verified
- [ ] Zero critical/high vulnerabilities (Snyk/Trivy/pen test)
- [ ] API docs + SDK quick start published
- [ ] Runbook for all P0 scenarios
- [ ] DR drill completed successfully
- [ ] Pen test completed, all critical/high findings remediated
- [ ] KMS rotation + break-glass tested

### Business-Risk Launch Gates (NEW)
- [ ] Decision API overall FPR: < 3% (on production-like traffic)
- [ ] Decision API FPR by merchant segment: < 5% per merchant
- [ ] Approval rate delta: < 2% degradation vs baseline (per corridor)
- [ ] Fraud-loss rate: < target set per merchant vertical (wallet/carrier)
- [ ] Manual review queue SLA: 95% of REVIEW cases triaged within 4 hours
- [ ] Chargeback label pipeline: labels ingested within 48h of receipt
- [ ] Segment-level evaluation report reviewed and approved by fraud ops
- [ ] Fraud ops playbooks published (review policy, escalation matrix, QA sampling)
- [ ] Feature drift monitoring active with PSI alerts configured
- [ ] Champion/Challenger framework operational (at least shadow mode)

### Operational Readiness Gates (NEW)
- [ ] PagerDuty routing configured (P0-P3)
- [ ] Grafana dashboards: Decision latency, throughput, FPR, queue depth
- [ ] Vendor fallback tested (Payguru/MaxMind outage simulation)
- [ ] War room plan for launch day (24h monitoring)
- [ ] Rollback procedure tested (canary -> full rollback in < 5 min)

---

## 8. Risk Register (Updated)

| Risk | Impact | Mitigation | Sprint | Owner |
|------|--------|------------|--------|-------|
| Decision API latency > 200ms | HIGH | Parallel intel lookups, Redis caching, async telco | S5 (perf gate) | Backend-Sr |
| Bot detection < 85% accuracy | MEDIUM | Labeled dataset quality, weekly tuning cycle | S3-S5 | Fraud Scientist |
| Kafka partition hot spots | MEDIUM | Session-salted keys, 48 partitions from day 1 | S1 | SRE |
| SDK size > 100KB (web) | LOW | Tree-shaking, modular collectors | S3-S4 | SDK |
| Payguru integration delay | MEDIUM | Async enrichment, score without telco (flag partial), synthetic fallback data for tests | S3-S5 | Backend-Sr |
| Cross-tenant data leakage | CRITICAL | RESTRICTIVE RLS, AsyncLocalStorage, negative tests every sprint | S1+ | QA + Security |
| Redis memory growth | MEDIUM | Compact timestamps, TTL enforcement, HyperLogLog for cardinality | S7-S8 | Backend-Sr |
| KVKK compliance gap | HIGH | Consent service early (S5), erasure verification (S6) | S5-S6 | Backend-3 |
| Label delay (chargebacks weeks late) | HIGH | Async label pipeline, provisional labels from case resolutions, dataset versioning | S6-S7 | Fraud Scientist |
| FPR too high at launch | HIGH | Segment-level evaluation, per-merchant FPR caps, staged rule rollout, champion/challenger | S7-S9 | Fraud Scientist |
| Pen test reveals critical issues | HIGH | SAST from S1, OPA policies, dep scanning -- minimize late surprises | S8 | Security |
| MaxMind data quality variance | MEDIUM | Confidence scoring, fallback to IP-range DB, circuit breaker | S3-S4 | Backend-3 |
| Team ramp-up delay | MEDIUM | Clear onboarding docs, local dev setup in S1, pair programming first 2 sprints | S1-S2 | All |

---

## 9. Definition of Done (per Epic)

- [ ] All user stories implemented and unit tested (>80% coverage; >90% for decision/auth/isolation)
- [ ] Integration tests passing
- [ ] Cross-tenant isolation test passing (if applicable)
- [ ] API documentation updated (OpenAPI spec)
- [ ] Grafana dashboard/alerts configured
- [ ] Code reviewed and merged to main
- [ ] Deployed to staging and smoke tested
- [ ] Performance within SLA (per-sprint perf gate passed)
- [ ] Zero critical vulnerabilities in SAST scan
- [ ] Fraud ops sign-off (for E7/E8/E11/E12/E19)

---

## 10. External Dependency Management (NEW)

| Vendor/Service | Usage | Fallback Strategy | SLA Assumption |
|----------------|-------|-------------------|----------------|
| Payguru | Telco enrichment (SIM swap, carrier) | Score without telco, flag `enrichment_available: false` | 99.5% uptime, 500ms p99 |
| MaxMind GeoIP2 | IP geolocation, proxy/VPN detection | Local IP-range DB (updated weekly), reduced confidence | In-memory DB, no external dependency |
| AWS MSK (Kafka) | Event streaming | Multi-AZ, auto-recovery. If region-down: DR failover | 99.95% |
| AWS RDS (PostgreSQL) | Primary database | Multi-AZ with auto-failover. RPO < 1s, RTO < 5min | 99.95% |
| AWS ElastiCache (Redis) | Velocity, caching, idempotency | If Redis down: score without velocity (degrade), idempotency from PG | 99.95% |

For all vendors: synthetic fallback data available in staging for isolated testing without live vendor calls. Circuit breakers with exponential backoff on all external calls.
