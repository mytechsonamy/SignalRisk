# SignalRisk -- Epic Breakdown & Sprint Plan v3

> Phase 1 MVP: Core Fraud Signals (4.5 months / 9 two-week sprints)
> Based on requirements-v4.md and architecture-v3.md
> v3: Scope right-sized (MVP vs Phase 2 split), statistical launch gates, threat modeling, observability shift-left, model ops artifact registry, cross-training plan

---

## 1. MVP Scope vs Phase 2 Deferral

To address scope/timeline feasibility concerns, the following items are explicitly deferred to Phase 2:

### Phase 1 MVP (This Plan -- 9 Sprints)
- Web SDK + Android SDK (2 platforms)
- Core dashboard (Overview, Cases, Rules, Settings)
- 5 intelligence modules (Device, Velocity, Behavioral, Network, Telco)
- Rule Engine + DSL + staged rollout
- Decision API with <200ms p99
- Label pipeline (chargeback + case resolution)
- Offline evaluation (segment-level FPR/TPR)
- Feature drift monitoring (PSI)
- Basic champion/challenger (shadow mode)

### Phase 2 (Post-Launch, 2-3 months)
- iOS SDK (deferred -- Android covers 85%+ of emerging market mobile)
- Advanced analytics dashboard (cohort analysis, funnel visualization)
- ML model integration (Feast feature store, model serving)
- Champion/Challenger live traffic split (beyond shadow)
- Global Device Reputation Network (cross-merchant scoring)
- Advanced bot detection (ML-based, beyond rule-based)
- Real-time streaming analytics (Flink/Spark)
- Multi-region active-active deployment

---

## 2. Epic Overview

| # | Epic | Priority | Sprints | Dependencies |
|---|------|----------|---------|--------------|
| E1 | Infrastructure & Foundation | P0 | S1-S2 | None |
| E2 | Event Pipeline (Kafka + Collector) | P0 | S1-S2 | E1 |
| E3 | Device Intelligence | P0 | S2-S3 | E2 |
| E4 | Velocity Engine | P0 | S2-S3 | E2 |
| E5 | Behavioral Intelligence | P0 | S3-S4 | E2 |
| E6 | Network Intelligence | P1 | S3-S4 | E2 |
| E7 | Rule Engine & DSL | P0 | S4-S5 | E3, E4, E5, E6 (signal contracts), E13 (RBAC for rule permissions) |
| E8 | Decision API | P0 | S5-S6 | E7, E9 (async enrichment contract), E13 (API auth) |
| E9 | Telco Intelligence (Basic) | P1 | S3-S5 | E2 |
| E10 | Dashboard -- Core | P1 | S4-S6 | E8, E13 (session auth, RBAC) |
| E11 | Dashboard -- Case Management | P1 | S5-S7 | E10, E13 (analyst role) |
| E12 | Dashboard -- Rule Management | P1 | S5-S7 | E10, E7, E13 (admin role for approval) |
| E13 | Auth, RBAC & Multi-Tenant | P0 | S1-S3 | E1 |
| E14 | Consent & Erasure | P1 | S5-S6 | E13 |
| E15 | Merchant SDK (Web + Android) | P0 | S3-S6 | E2, E8 |
| E16 | Chargeback & Label Pipeline | P0 | S6-S7 | E8 |
| E17 | Monitoring, Alerting & Observability | P0 | S1-S9 | E1 (continuous) |
| E18 | Security Hardening | P0 | S1-S9 | E1 (continuous, shift-left) |
| E19 | Fraud Data & Model Ops | P0 | S5-S8 | E8, E16 |
| E20 | Integration Testing & Launch Prep | P0 | S7-S9 | All |

**Changes from v2:**
- E7/E8/E10/E11/E12 now explicitly depend on E13 (auth/RBAC)
- E15 reduced to Web + Android (iOS deferred to Phase 2)
- MVP vs Phase 2 scope clearly defined (Section 1)
- Threat modeling added to S1-S2 (Section 3)
- Observability dashboards shifted earlier (S7 instead of S9)
- Statistical rigor added to business launch gates (Section 8)
- Model ops artifact registry added (Section 10)
- Cross-training plan added (Section 4)

---

## 3. Team Allocation

| Role | Count | S1-S3 | S4-S6 | S7-S9 |
|------|-------|-------|-------|-------|
| Backend Engineer (Senior) | 1 | Infra, Auth, RLS, Outbox | Decision API, Rule Engine | Integration, Perf tuning |
| Backend Engineer | 1 | Events, Kafka, Velocity | Signals, Cases API | Security, DR |
| Backend Engineer | 1 | DB, Device Intel, Auth | Telco, Webhooks, Erasure | Model Ops, Launch |
| Frontend Engineer (Senior) | 1 | -- | Dashboard core, Auth UI | Cases UI, Rules UI, Polish |
| Frontend Engineer | 1 | -- | Overview, Settings | Analytics, A11y, States |
| SDK Engineer | 1 | -- | Web SDK | Android SDK, Docs |
| SRE / Platform Engineer | 1 | EKS, CI/CD, ArgoCD, Vault | Monitoring, Alerting, Dashboards | Load test, DR, Prod deploy |
| QA / Automation Engineer | 1 | Test framework, E2E scaffold | Isolation tests, API tests | Full regression, Perf tests |
| QA (part-time, S7-S9 surge) | 0.5 | -- | -- | Regression, pen test support |
| Security Engineer (part-time) | 0.5 | OPA policies, SAST, threat model | Pen test prep, vuln scans | Pen test, remediation |
| Security Engineer (surge S7-S8) | 0.5 | -- | -- | Pen test execution, remediation |
| Fraud Scientist | 1 | Rule design, labeled data, threat model | Bot tuning, simulation, pairing w/ Backend-Sr on E7 | Model eval, drift, playbooks |

**Total: 9.5 FTE** (9 base + 0.5 QA surge + 0.5 Security surge in S7-S9)

**Scope reduction impact:** Removing iOS SDK frees ~4d SDK effort in S4 and ~3d in S6, providing buffer for Android polish and documentation.

---

## 4. Cross-Training & Bus Factor Mitigation

| Critical Area | Primary | Backup | Cross-Training Method |
|---------------|---------|--------|----------------------|
| RLS / Tenant Isolation | Backend-Sr | Backend-3 | Pair programming S1-S2, shared runbook |
| Decision Engine | Backend-Sr | Backend | Code review + shadow on-call S6+ |
| Rule Engine DSL | Backend-Sr | Fraud Scientist | Joint development sessions S4-S5 |
| EKS / Infrastructure | SRE | Backend-Sr | Shared Terraform access, DR drill pairing |
| Kafka Operations | SRE | Backend | MSK runbook, shared monitoring dashboards |
| Pen Test Remediation | Security | Backend-Sr | Joint triage sessions S8 |
| Fraud Rules & Tuning | Fraud Scientist | Backend-Sr | Weekly sync S3+, paired rule simulation reviews |

---

## 5. Sprint Plan

### Sprint 1 (Weeks 1-2): Foundation -- Infrastructure, Auth Start & Threat Model

**Goal:** Core infrastructure provisioned, CI/CD pipeline, auth started, threat model workshop.

| Task | Epic | Est | Owner |
|------|------|-----|-------|
| **Threat modeling workshop:** STRIDE analysis on Decision API, SDK, Dashboard auth, tenant isolation | E18 | 1d | Security + Backend-Sr + Fraud Scientist |
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
| OPA base policies (namespace isolation, image allowlists) | E18 | 0.5d | Security |
| E2E test framework scaffold (Jest + Supertest) | E20 | 1d | QA |

**Sprint 1 Exit Criteria:**
- EKS cluster running, CI/CD deploys to staging
- Events flow: HTTP -> Event Collector -> Kafka -> Dead Letter on invalid
- RLS isolation verified with cross-tenant negative test
- SAST pipeline blocks on critical findings
- Local dev environment runs all services
- **Threat model document** published with top-10 threats and mitigations mapped to sprints

---

### Sprint 2 (Weeks 3-4): Data Pipeline + Auth Complete

**Goal:** Device fingerprinting, velocity counters, auth service complete, abuse case review.

| Task | Epic | Est | Owner |
|------|------|-----|-------|
| **Abuse case review:** SDK tampering, token theft, tenant impersonation scenarios | E18 | 0.5d | Security + Backend-Sr |
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
- Abuse case document published

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

**Goal:** Rule engine parsing DSL with all signal types, dashboard shell with auth.

| Task | Epic | Est | Owner |
|------|------|-----|-------|
| Rule Engine: DSL parser (EBNF grammar -> AST) | E7 | 3d | Backend-Sr |
| Rule Engine: In-memory evaluation pipeline | E7 | 2d | Backend-Sr |
| Rule Engine: Threshold randomization (deterministic seed) | E7 | 0.5d | Backend-Sr |
| Rule Engine: Missing signal handling (skip/default_high/default_low) | E7 | 1d | Backend-Sr |
| Rule Engine: Integration with all 5 signal contracts | E7 | 1d | Backend-Sr |
| Rule Engine: Unit test suite (>90% branch coverage) | E7 | 1d | QA |
| **Fraud Scientist pairing:** Joint rule design session with Backend-Sr | E7 | 1d | Fraud Scientist + Backend-Sr |
| Dashboard: React project setup (Vite, Tailwind, design tokens) | E10 | 1d | Frontend-Sr |
| Dashboard: App shell (sidebar, header, routing, RBAC route guards) | E10 | 2d | Frontend-Sr |
| Dashboard: Auth (login, MFA, forgot password, session mgmt) | E10 | 3d | Frontend-Sr |
| Dashboard: Overview page (KPI cards, trend chart, event stream) | E10 | 3d | Frontend |
| Dashboard API: WebSocket server + event relay from Kafka | E10 | 2d | Backend |
| SDK (Android): Kotlin SDK + DeviceCollector + Play Integrity | E15 | 5d | SDK |
| Cross-tenant isolation: All signal module endpoints | E18 | 1d | QA |
| Dependency vulnerability scan + remediation | E18 | 1d | Security |

**Sprint 4 Exit Criteria:**
- Rule DSL parses and evaluates correctly against test cases (all signal types)
- Dashboard: Login -> MFA -> Overview with live event stream (RBAC enforced)
- Web + Android SDKs sending events + fingerprints
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
- **Business gate:** Decision API FPR < 5% on labeled test set (N >= 1000 decisions)

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
| SDK (Android): Anti-evasion (payload signing, Play Integrity) | E15 | 2d | SDK |
| SDK (Web): Anti-evasion (payload signing, tamper detection) | E15 | 1d | SDK |
| SDK: Consent manager integration | E15 | 1d | SDK |
| Webhook service: HMAC-signed delivery + retry | E8 | 2d | Backend |
| Erasure service: Fan-out deletion + subject key index | E14 | 3d | Backend |
| Cross-tenant isolation: Rule + Webhook endpoints | E18 | 1d | QA |

**Sprint 6 Exit Criteria:**
- Full rule lifecycle: Draft -> Simulate -> Approve -> Staged Rollout -> Active
- Chargeback labels flowing into label store
- Offline evaluation produces segment-level FPR/TPR reports
- SDK payload signing + integrity checks active (Web + Android)
- RBAC: Admin/Senior/Analyst/Viewer permissions enforced

---

### Sprint 7 (Weeks 13-14): Model Ops + Observability + Performance

**Goal:** Feature drift monitoring, production observability, progressive load testing.

| Task | Epic | Est | Owner |
|------|------|-----|-------|
| Feature drift monitoring: PSI baseline computation | E19 | 2d | Fraud Scientist |
| Feature drift: KS test for continuous features + alerts | E19 | 1d | Fraud Scientist |
| Champion/Challenger framework: A/B rule set evaluation (shadow) | E19 | 3d | Backend-Sr |
| **Model/Rule artifact registry:** Version tracking, promotion policy, rollback criteria | E19 | 2d | Backend-Sr + Fraud Scientist |
| Rule weight feedback loop (chargeback -> rule performance) | E16 | 2d | Backend |
| **Production Grafana dashboards:** Decision latency, throughput, FPR, queue depth, tenant health | E17 | 2d | SRE |
| **PagerDuty alert configuration** (P0-P3 routing) + runbook links | E17 | 1d | SRE |
| **API documentation:** OpenAPI spec + developer portal content | E8 | 2d | Backend |
| **SDK documentation:** Quick start guides (Web + Android) | E15 | 2d | SDK |
| Dashboard: Alerts inbox (list, acknowledge, snooze, escalate) | E10 | 2d | Frontend-Sr |
| Dashboard: Settings -- Team & RBAC page | E13 | 2d | Frontend |
| Dashboard: Settings -- Webhook management + Audit log viewer | E10 | 2d | Frontend |
| Dashboard: Analytics -- fraud by type, velocity heatmap | E10 | 2d | Frontend-Sr |
| Dashboard: Device detail page + reputation card | E10 | 2d | Frontend |
| Erasure: Verified deletion report | E14 | 1d | Backend-3 |
| Load test: 10K events/sec sustained (60 min), p99 < 200ms | E20 | 2d | SRE |
| Cold-cache test: Decision latency with flushed Redis | E20 | 0.5d | SRE |
| Cross-tenant isolation: Full regression (all endpoints) | E18 | 2d | QA |
| E2E integration test suite: Complete flow coverage | E20 | 3d | QA |

**Sprint 7 Exit Criteria:**
- Feature drift monitoring active with PSI alerts
- Champion/Challenger framework operational (shadow mode)
- Model/rule artifact registry operational with rollback procedure documented
- **Production Grafana dashboards deployed** (not deferred to S9)
- **API + SDK docs published** (not deferred to S9)
- **Perf gate:** 10K events/sec sustained, p99 < 200ms
- **Coverage gate:** >80% integration test coverage; decision/auth/isolation >90% branch
- Cross-tenant isolation: 100% regression pass

---

### Sprint 8 (Weeks 15-16): Security Hardening + Ops Readiness

**Goal:** Pen test, operational playbooks, fraud ops workflows.

| Task | Epic | Est | Owner |
|------|------|-----|-------|
| Penetration test execution (third-party) | E18 | 5d | Security (full-time) |
| Pen test finding remediation (critical/high) | E18 | 3d | Backend-Sr + Security |
| KMS key rotation policy + break-glass procedure | E18 | 1d | SRE |
| Immutable audit log verification | E18 | 1d | Backend-3 |
| Fraud Ops Playbook: Review policy, escalation matrix | E19 | 2d | Fraud Scientist |
| Fraud Ops: Analyst QA sampling (random case re-review) | E19 | 1d | Fraud Scientist |
| Fraud Ops: Case outcome -> rule tuning feedback loop SLA | E19 | 1d | Backend |
| Dashboard: Empty states + Error states (403, 404, 500, form) | E10 | 2d | Frontend |
| Dashboard: Per-widget degraded state indicators | E10 | 1d | Frontend |
| Dashboard: Keyboard shortcuts + accessibility audit (WCAG 2.1 AA) | E10 | 2d | Frontend-Sr |
| Dashboard: Connection resilience (WebSocket reconnect, stale indicators) | E10 | 1d | Frontend |
| Dashboard: Responsive behavior (tablet/mobile view-only) | E10 | 1d | Frontend-Sr |
| Runbook: P0 incident procedures for all critical services | E17 | 2d | SRE |
| DR drill: Failover to DR region, run 1 hour, fail back | E20 | 1d | SRE |
| Vendor fallback testing: Payguru/MaxMind outage simulation | E20 | 1d | QA |
| Performance tuning: Redis memory optimization (compact timestamps) | E4 | 1d | Backend-Sr |
| Performance tuning: PostgreSQL query optimization + indexes | E1 | 1d | Backend-Sr |
| Regression test suite (full) | E20 | 2d | QA + QA-surge |

**Sprint 8 Exit Criteria:**
- Pen test complete, all critical/high findings remediated
- KMS rotation + break-glass procedures documented and tested
- Fraud ops playbooks published (review, escalation, QA)
- DR drill completed successfully
- Vendor fallback (degraded mode) tested
- All dashboards have degraded + error + empty state coverage
- Full regression suite passing

---

### Sprint 9 (Weeks 17-18): Launch Prep + Buffer

**Goal:** Production deployment, final verification, business KPI validation.

| Task | Epic | Est | Owner |
|------|------|-----|-------|
| Staging -> Production deployment (canary rollout) | E1 | 2d | SRE |
| Production smoke test suite | E20 | 1d | QA |
| Final load test on production (canary, 10% traffic) | E20 | 1d | SRE |
| Business KPI baseline measurement (see Section 8 for methodology) | E19 | 2d | Fraud Scientist |
| Segment-level evaluation report (by merchant, by payment type) | E19 | 2d | Fraud Scientist |
| Grafana dashboard alert fine-tuning (production baselines) | E17 | 1d | SRE |
| Go-live checklist verification | E20 | 0.5d | All |
| Launch day monitoring war room setup | E17 | 0.5d | SRE |
| **Buffer:** Remediation of any remaining issues | ALL | 5d | All |

**Sprint 9 Exit Criteria = Launch Criteria** (see Section 8)

---

## 6. Dependency Graph

```
S1: E1 (Infra) ---> E2 (Events) ---> E17 (Monitoring, continuous)
    E13 (Auth)      E18 (Security + Threat Model, continuous)
         |
S2:     E3 (Device) ---> E4 (Velocity)
         |
S3:     E5 (Behavioral) ---> E6 (Network) ---> E9 (Telco)
         |                                       |
         +--- Signal Contract Freeze ------>-----+
                                                  |
S4:     E7 (Rule Engine) <--- all signal contracts + E13(RBAC)
         |
S5:     E8 (Decision API) <--- E7 + E9(async) + E13(API auth)
         |                        |
         E11 (Cases) <-E13       E14 (Consent)
         |
S6:     E12 (Rules UI) <-E13    E16 (Chargeback + Labels)
         |                        |
S7:     E19 (Model Ops) <--- E16 labels
         |   E17 (Prod dashboards + docs published)
S8:     E18 (Pen Test)        E20 (DR + Regression)
         |
S9:     E20 (Launch Prep + Buffer)
```

---

## 7. Signal Contract Freeze (Sprint 3 Milestone)

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

## 8. Launch Criteria (Business + Technical + Operational)

### Technical Launch Gates
- [ ] Decision API: p99 < 200ms (warm), < 300ms (cold)
- [ ] Bot detection: >85% TPR, <2% FPR (on labeled test set, N >= 500 bot samples)
- [ ] Feature retrieval: p95 < 10ms
- [ ] Event throughput: 10K events/sec sustained (60 min)
- [ ] Fingerprint stability: >95% same-device match (24h window, N >= 1000 devices)
- [ ] Cross-tenant isolation: 100% pass rate (all endpoints)
- [ ] Consent revocation: < 5 minutes propagation
- [ ] Data erasure: < 72 hours verified
- [ ] Zero critical/high vulnerabilities (Snyk/Trivy/pen test)
- [ ] API docs + SDK quick start published
- [ ] Runbook for all P0 scenarios
- [ ] DR drill completed successfully
- [ ] Pen test completed, all critical/high findings remediated
- [ ] KMS rotation + break-glass tested

### Business-Risk Launch Gates (with Statistical Rigor)

All business metrics measured on **production-like traffic** over a **7-day lookback window** with **95% confidence intervals:**

| Gate | Threshold | Min Sample Size | Measurement Method |
|------|-----------|----------------|--------------------|
| Overall FPR | < 3% (95% CI upper bound) | N >= 5,000 decisions | Labeled dataset (chargeback + case resolution labels) |
| Per-merchant FPR | < 5% (95% CI upper bound) | N >= 200 decisions per merchant | Same, segmented by merchant_id |
| Approval rate delta | < 2% degradation vs pre-launch baseline | N >= 1,000 per corridor | Compare against historical approval rates per payment corridor |
| Fraud-loss rate | < target per vertical (set during onboarding) | N >= 500 flagged transactions | Chargebacks received within 45-day window |
| Review queue SLA | 95% triaged within 4 hours | N >= 100 REVIEW cases | Case management SLA tracking |
| Label pipeline freshness | Labels ingested within 48h of receipt | Continuous monitoring | Chargeback ingestion timestamp delta |

**Gate evaluation process:**
1. Fraud Scientist computes metrics from label store + decision logs
2. Confidence intervals calculated using Wilson score interval (for proportions)
3. Results reviewed in segment-level report (by merchant, payment type, country)
4. Fraud ops and product sign-off required before GA traffic ramp

### Operational Readiness Gates
- [ ] PagerDuty routing configured (P0-P3) with runbook links
- [ ] Grafana dashboards deployed: Decision latency, throughput, FPR, queue depth, tenant health
- [ ] Vendor fallback tested (Payguru/MaxMind outage simulation)
- [ ] War room plan for launch day (24h monitoring)
- [ ] Rollback procedure tested (canary -> full rollback in < 5 min)
- [ ] Fraud ops playbooks published (review policy, escalation matrix, QA sampling)
- [ ] Feature drift monitoring active with PSI alerts configured
- [ ] Champion/Challenger framework operational (shadow mode)
- [ ] Model/rule artifact registry operational with rollback procedure

---

## 9. Continuous Quality Gates (Per-Sprint)

| Gate | Frequency | Threshold | Owner |
|------|-----------|-----------|-------|
| SAST scan (Snyk/Trivy) | Every PR | Zero critical | Security |
| Cross-tenant isolation test | Per sprint (incremental) | 100% pass on tested endpoints | QA |
| Unit test coverage | Per sprint | >80% lines; >90% branch on decision/auth/isolation | QA |
| Integration test (E2E) | Per sprint (incremental) | All tested flows pass | QA |
| Performance benchmark | Per sprint (for new services) | Within SLA (see per-sprint perf gates) | SRE |
| Dependency vuln scan | Bi-weekly | Zero critical, <5 high | Security |

---

## 10. Model/Rule Artifact Registry (NEW)

All rule sets and model artifacts are version-controlled with promotion policies:

| Artifact Type | Storage | Versioning | Promotion Flow | Rollback |
|---------------|---------|-----------|----------------|----------|
| Rule Set (DSL) | PostgreSQL `rules` table | Auto-increment per rule | Draft -> Simulate -> Approve -> Shadow -> Staged (10/50/100%) -> Active | Instant: revert to previous active version via API |
| Signal Contract | Git (`packages/signal-contracts/`) | Semantic versioning | PR review -> merge -> publish npm package | Git revert + republish |
| Labeled Dataset | S3 + PostgreSQL metadata | Date-versioned snapshots | Auto-snapshot weekly + on-demand | Load previous snapshot |
| Evaluation Report | S3 + PostgreSQL metadata | Date-versioned | Auto-generate on new labels/rules | N/A (historical) |
| PSI Baseline | PostgreSQL `drift_baselines` | Date-versioned | Auto-recompute monthly or on rule change | Load previous baseline |

**Promotion policy:**
- No rule reaches 100% traffic without: (a) simulation on 7-day historical data, (b) shadow mode for 24h, (c) staged rollout with automated FPR monitoring at each stage
- Automatic rollback trigger: FPR increase > 1% absolute at any rollout stage

---

## 11. Risk Register

| Risk | Impact | Mitigation | Sprint | Owner |
|------|--------|------------|--------|-------|
| Decision API latency > 200ms | HIGH | Parallel intel lookups, Redis caching, async telco | S5 (perf gate) | Backend-Sr |
| Bot detection < 85% accuracy | MEDIUM | Labeled dataset quality, weekly tuning cycle, Fraud Scientist pairing | S3-S5 | Fraud Scientist |
| Kafka partition hot spots | MEDIUM | Session-salted keys, 48 partitions from day 1 | S1 | SRE |
| SDK size > 100KB (web) | LOW | Tree-shaking, modular collectors | S3-S4 | SDK |
| Payguru integration delay | MEDIUM | Async enrichment, score without telco (flag partial), synthetic fallback | S3-S5 | Backend-Sr |
| Cross-tenant data leakage | CRITICAL | RESTRICTIVE RLS, AsyncLocalStorage, negative tests every sprint, threat model | S1+ | QA + Security |
| Redis memory growth | MEDIUM | Compact timestamps, TTL enforcement, HyperLogLog for cardinality | S7-S8 | Backend-Sr |
| KVKK compliance gap | HIGH | Consent service early (S5), erasure verification (S6) | S5-S6 | Backend-3 |
| Label delay (chargebacks weeks late) | HIGH | Async label pipeline, provisional labels from case resolutions, dataset versioning | S6-S7 | Fraud Scientist |
| FPR too high at launch | HIGH | Segment-level evaluation with CI, per-merchant caps, staged rollout, auto-rollback | S7-S9 | Fraud Scientist |
| Pen test reveals critical issues | HIGH | SAST from S1, OPA, threat model, dep scanning -- minimize late surprises | S8 | Security |
| MaxMind data quality variance | MEDIUM | Confidence scoring, fallback to IP-range DB, circuit breaker | S3-S4 | Backend-3 |
| Team ramp-up delay | MEDIUM | Clear onboarding docs, local dev setup in S1, pair programming | S1-S2 | All |
| Key person unavailability | HIGH | Cross-training plan (Section 4), documented runbooks, shared access | S1+ | All |

---

## 12. Definition of Done (per Epic)

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

## 13. External Dependency Management

| Vendor/Service | Usage | Fallback Strategy | SLA Assumption |
|----------------|-------|-------------------|----------------|
| Payguru | Telco enrichment (SIM swap, carrier) | Score without telco, flag `enrichment_available: false` | 99.5% uptime, 500ms p99 |
| MaxMind GeoIP2 | IP geolocation, proxy/VPN detection | Local IP-range DB (updated weekly), reduced confidence | In-memory DB, no external dependency |
| AWS MSK (Kafka) | Event streaming | Multi-AZ, auto-recovery. If region-down: DR failover | 99.95% |
| AWS RDS (PostgreSQL) | Primary database | Multi-AZ with auto-failover. RPO < 1s, RTO < 5min | 99.95% |
| AWS ElastiCache (Redis) | Velocity, caching, idempotency | If Redis down: score without velocity (degrade), idempotency from PG | 99.95% |

For all vendors: synthetic fallback data available in staging for isolated testing. Circuit breakers with exponential backoff on all external calls.
