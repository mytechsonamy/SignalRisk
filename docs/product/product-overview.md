# SignalRisk — Product Overview

> Product perspective | March 2026

---

## 1. Product Vision & Mission

**Vision:** Become the leading real-time fraud intelligence platform for emerging market digital payments.

**Mission:** Make fraud detection accessible, fast, and intelligent for mobile wallets, carrier billing platforms, and digital payment providers operating in high-growth, high-fraud markets.

SignalRisk is the only platform that combines telco, device, and behavioral intelligence signals in a single API call. Purpose-built for markets where Western fraud solutions fall short — Turkey, Middle East, Africa, and Latin America — SignalRisk delivers sub-200ms fraud decisions that protect revenue without blocking legitimate users.

**Core value proposition:**

- One API call gathers six intelligence signals, evaluates 21 fraud rules, checks entity history, and returns an explainable ALLOW / REVIEW / BLOCK decision.
- No other solution combines telco carrier data (SIM swap, MSISDN validation) with device fingerprinting and behavioral biometrics in a single product.
- Designed for the fraud patterns that matter in emerging markets: account farming, carrier billing abuse, device farm attacks, and mobile wallet fraud.

---

## 2. Target Market & Personas

### Market

- **Mobile wallets** — Papara (15M+ users), M-Pesa, Mercado Pago, PicPay, Param, Tosla
- **Carrier billing** — In-app purchases, subscriptions, gaming top-ups charged to phone bills
- **Digital payment platforms** — Payment gateways, PSPs, and fintech companies in Turkey, Middle East, Africa, and Latin America
- **Market size** — $32B+ annual fraud loss in emerging market digital payments, with mobile wallet fraud growing 45% year-over-year

### Personas

**Fraud Analyst**
Reviews flagged transactions, labels confirmed fraud and false positives, and monitors emerging fraud patterns. Needs a prioritized case queue with SLA tracking, explainable risk decisions showing which signals contributed, rule tuning suggestions based on labeling history, and real-time visibility into live transaction flow.

**Merchant Admin (Developer / Integration Owner)**
Integrates the SignalRisk API and SDKs, configures webhook endpoints, manages API keys, and monitors business-level fraud metrics. Needs clear SDK documentation, a fast integration path (under 1 day), analytics dashboards showing fraud rates by merchant, and self-service API key management.

**Platform Operator (Admin / Head of Risk)**
Manages the fraud platform end-to-end: user access, detection rules, system health, and compliance. Needs an admin panel with user management, rule CRUD with live toggle and weight adjustment, infrastructure health monitoring across all services, and audit trails for regulatory compliance.

---

## 3. Key Capabilities

### Detection & Scoring

| Capability | Status | Description |
|---|---|---|
| Multi-signal risk scoring | Verified | Six intelligence signals gathered in parallel: device, behavioral, network, velocity, telco, and graph |
| DSL rule engine | Verified | 21 live rules with hot reload, per-rule weights, and no-deploy toggling |
| Stateful fraud detection | Verified | Entity memory across transactions: repeat offender tracking, velocity history, sequence detection |
| Graph-based fraud ring detection | Verified | Neo4j-powered entity relationship analysis: device sharing, IP clustering, cross-merchant fraud rings |
| Closed-loop watchlist enforcement | Verified | Analyst labels automatically update watchlists; denylist triggers instant BLOCK on next transaction |
| Sequence detection | Verified | Three pattern detectors: login-then-payment under 30s, triple-failure-then-success, device-change-then-payment |

### Decision & Case Management

| Capability | Status | Description |
|---|---|---|
| Real-time decisions | Verified | ALLOW / REVIEW / BLOCK returned in under 200ms (p99), with full risk factor explanation |
| Automated case creation | Verified | REVIEW and BLOCK decisions automatically create analyst cases with SLA timers (BLOCK: 4h, REVIEW: 24h) |
| Analyst feedback loop | Verified | Fraud/legitimate/inconclusive labeling adjusts rule weights automatically (+0.05 for confirmed fraud, -0.03 for false positive) |
| GDPR/KVKK data export | Verified | Per-entity data export for right-of-access requests, full erasure propagation for right-to-be-forgotten |

### Dashboard & Analytics

| Capability | Status | Description |
|---|---|---|
| Analyst dashboard | Verified | 16-page web application with real-time WebSocket feed, case management, rule editing, and analytics |
| Risk analytics | Verified | Risk trends, score distributions, velocity analysis, per-merchant statistics with 7-day and 30-day views |
| Adversarial testing (FraudTester) | Verified | 5 AI agents, 9+ attack scenarios, battle arena mode — measures true positive rate, false positive rate, and latency |
| Graph intelligence visualization | Verified | Interactive entity relationship graph showing fraud rings, device sharing, and cross-account linking |
| Live feed | Verified | Real-time decision stream via WebSocket with filtering by action type and merchant |

### Integration & Platform

| Capability | Status | Description |
|---|---|---|
| REST API | Verified | OpenAPI-documented endpoints for events, decisions, cases, rules, analytics, and administration |
| Web SDK | Verified | Browser SDK (<100KB gzipped) for device fingerprinting and behavioral signal collection |
| Mobile SDK | Verified | React Native SDK for mobile device fingerprinting |
| Webhook delivery | Verified | HMAC-SHA256 signed webhooks with exponential backoff retry (up to 72h) and DLQ for persistent failures |
| Multi-tenant isolation | Verified | Five-layer isolation: JWT-scoped API, PostgreSQL Row-Level Security, Redis key prefixing, Kafka partitioning, Neo4j tenant guards |
| Feature flags | Verified | Gradual rollout with percentage-based and merchant allowlist targeting; deterministic evaluation |
| Test traffic isolation | Verified | Header-based flag propagates through entire pipeline — test data excluded from analytics and webhooks |

### Security & Compliance

| Capability | Status | Description |
|---|---|---|
| RS256 JWT authentication | Verified | Asymmetric RSA key signing with 15-minute access tokens, 7-day refresh tokens, and JTI revocation |
| DB-backed operator login | Verified | Dashboard authentication via PostgreSQL-stored credentials with bcrypt hashing |
| Row-Level Security | Verified | All tenant-scoped database tables enforce row-level isolation — no cross-tenant data access possible |
| KVKK/GDPR consent framework | Verified | Granular consent API in SDK, per-user consent tracking with full audit trail, right-to-erasure propagation |
| API key authentication | Verified | Separate API key auth for event ingestion (sk_test_ prefix), validated against allowlist |

---

## 4. Decision Engine

### How It Works (Product Perspective)

When a transaction event arrives, SignalRisk gathers intelligence from six specialized sources simultaneously and returns a decision in under 200 milliseconds:

**Step 1 — Signal Collection (parallel)**

| Signal | What It Catches |
|---|---|
| Device Intelligence | Emulators, device farms, rooted devices, fingerprint spoofing, device reuse across accounts |
| Velocity Tracking | Transaction bursts, unusual frequency spikes, sliding window anomalies across 1-minute to 7-day windows |
| Behavioral Analysis | Bot checkout patterns, automated form filling, inhuman typing speed, session flow anomalies |
| Network Intelligence | VPN/proxy usage, Tor exit nodes, geo-mismatch between IP and billing country, suspicious ASN patterns |
| Telco Intelligence | SIM swap detection, invalid MSISDN, carrier risk scoring, subscription velocity abuse |
| Graph Intelligence | Fraud ring membership, device sharing across accounts, IP clustering, connection to previously confirmed fraud |

**Step 2 — Rule Evaluation**

21 DSL rules evaluate the combined signal context. Rules cover five categories:

- 10 base rules (emulator detection, Tor blocking, velocity bursts, bot behavior, etc.)
- 5 stateful rules (repeat blockers, device spread, IP burst, review escalation)
- 3 sequence rules (rapid login-to-payment, triple failure-then-success, device change-then-payment)
- 3 graph rules (fraud ring score, shared device clusters, IP sharing anomalies)

Rules can be toggled on/off and weight-adjusted without any code deployment.

**Step 3 — Watchlist Check**

Before the final decision, the engine checks the entity against watchlists maintained by analyst feedback:

- **Denylist** — Instant BLOCK (entity confirmed as fraudulent)
- **Watchlist** — Score boost (entity under observation)
- **Allowlist** — Score suppression (entity cleared by analyst)

**Step 4 — Decision**

The engine returns one of three outcomes with a full explanation:

| Decision | Meaning | Automated Action |
|---|---|---|
| ALLOW | Transaction is safe to proceed | No case created |
| REVIEW | Suspicious — needs analyst review | Case created, 24h SLA |
| BLOCK | High fraud confidence — reject | Case created, 4h SLA |

Every decision includes human-readable risk factors explaining which signals contributed and why, enabling analysts to quickly validate or override the automated judgment.

---

## 5. Integration Model

### Three Steps to Fraud Protection

**Step 1: Install SDK (5 minutes)**

Add the SignalRisk Web or Mobile SDK to your application. The SDK automatically collects device fingerprinting and behavioral signals in the background with no user-visible impact. Under 100KB gzipped, async and non-blocking.

**Step 2: Evaluate Risk (1 API call)**

Send transaction events to the SignalRisk API. A single REST call returns a risk score (0-100), a decision (ALLOW / REVIEW / BLOCK), and human-readable risk factors — all in under 200ms.

**Step 3: Act on Decision**

Use the decision to approve, flag, or reject the transaction in your application. Optionally receive async webhook callbacks for downstream processing.

### Integration Channels

| Channel | Use Case |
|---|---|
| REST API | Primary integration — send events, query decisions, manage rules and cases |
| Web SDK | Browser-side device fingerprinting and behavioral signal collection |
| Mobile SDK | Mobile device fingerprinting (React Native) |
| Kafka events | Streaming integration for high-throughput event pipelines |
| WebSocket feed | Real-time decision stream for monitoring dashboards |
| Webhook callbacks | Async notifications for decision outcomes with HMAC-SHA256 signature verification |

Canonical implementation references:

- [Merchant Integration Guide](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/docs/product/merchant-integration-guide.md)
- [Data Model](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/docs/architecture/data-model.md)

### Time to Value

- **1 day** — SDK integration and first events flowing
- **24 hours** — First fraud insights from collected data
- **1 week** — Tuned rules with merchant-specific thresholds
- **30 days** — Full closed-loop operation with analyst feedback improving detection accuracy

---

## 6. Deployment Model

### Infrastructure

SignalRisk runs as a containerized microservices platform with four infrastructure components:

| Component | Role |
|---|---|
| PostgreSQL | Primary relational store with Row-Level Security for tenant isolation |
| Redis | Real-time feature store, velocity counters, decision cache, rate limiting |
| Apache Kafka | Event streaming backbone (KRaft mode, no Zookeeper dependency) |
| Neo4j | Graph database for entity relationship analysis and fraud ring detection |

### Deployment Options

- **Docker Compose** — Full stack deployment with 19 containers (4 infrastructure + 15 application services). Single-command startup for development and staging.
- **Kubernetes** — Helm umbrella chart with HorizontalPodAutoscaler (min 2, max 10 replicas per service), liveness/readiness probes, and ArgoCD GitOps integration.

### Scalability Path

| Tier | Volume | Infrastructure |
|---|---|---|
| Startup | 5M events/month | 3 API replicas, 3-node Redis, 3-node Kafka, 1 PostgreSQL + 1 replica |
| Growth | 50M events/month | 5+ API replicas, 6-node Redis, 5-node Kafka, 1 Primary + 3 read replicas |
| Enterprise | 500M+ events/month | 10+ API replicas (HPA), 12+ node Redis, 7+ node Kafka, multi-region PostgreSQL, 3-node Neo4j causal cluster |

Auto-scaling is driven by CPU/memory utilization and custom metrics including Kafka consumer lag and request latency percentiles.

---

## 7. Competitive Differentiation

### No Competitor Combines All Three Signal Layers

| Capability | Evina | FingerprintJS | Sift | Sardine | SignalRisk |
|---|---|---|---|---|---|
| Telco signals | Yes | No | No | No | **Yes** |
| Device intelligence | Limited | Yes | Partial | Yes | **Yes** |
| Behavioral biometrics | No | No | Yes | Yes | **Yes** |
| Emerging market focus | Partial | No | No | No | **Yes** |
| Carrier billing coverage | Partial | No | No | No | **Yes** |
| Graph-based fraud rings | No | No | Partial | Partial | **Yes** |
| Stateful entity memory | No | No | Partial | Partial | **Yes** |

### Defensible Moats

**Data Network Effect**
The cross-merchant fraud graph grows with every customer. A device seen committing fraud at Merchant A is immediately flagged at Merchant B. This makes the platform more valuable as adoption increases — a classic network effect that compounds over time.

**Telco Integration Advantage**
Direct carrier API partnerships take 6-18 months to establish, creating high switching costs. SIM swap detection, MSISDN validation, and carrier risk scoring are capabilities that cannot be quickly replicated.

**Local Expertise**
Purpose-built for emerging market fraud patterns: carrier billing abuse, MSISDN-based identity fraud, device farming, and mobile wallet account takeover. Western fraud solutions are optimized for card-present and e-commerce use cases that do not map to these markets.

**18-24 Month Window**
Before Western incumbents can adapt their products to cover telco billing, wallet fraud, and gaming-specific patterns in these markets, SignalRisk can establish market leadership and customer lock-in through the fraud graph network effect.

---

## 8. Current Status

### Platform Maturity

SignalRisk has completed 39+ engineering sprints from zero to a functional, production-approaching platform. Current maturity level: **Level 4 of 5** (runtime verification and staging validation remain for Level 5 closure).

### Key Numbers

| Metric | Value |
|---|---|
| Microservices | 15 (14 backend + 1 dashboard) |
| Unit tests | 934+ across 71 test suites (0 failures) |
| E2E tests | 78 across 12 spec files and 3 Playwright projects |
| DSL fraud rules | 21 live (10 base + 5 stateful + 3 sequence + 3 graph) |
| Database migrations | 15 |
| Architecture Decision Records | 16 |
| Dashboard pages | 16 |
| Shared packages | 9 |
| Docker containers | 19 (4 infrastructure + 15 application) |

### Completion Highlights

- All 8 P0 critical fixes applied and verified
- Full closed-loop fraud cycle operational: event ingestion, decision, case creation, analyst labeling, watchlist update, next-decision enforcement
- Stateful fraud detection: all 9 sprints completed (Sprint 0-8) plus P0 gap closure
- DB-backed dashboard authentication with RS256 JWT and WebSocket tenant isolation
- Quality gates G1-G8 defined and executed; chaos testing (Redis/Kafka down/recovery) passing
- Five-layer multi-tenant isolation verified with negative tests

---

## 9. Roadmap & Next Steps

### Near-Term (Level 5 Closure)

- Staging environment validation with full Docker stack rerun
- Evidence pack refresh and runtime behavior verification
- Final documentation synchronization

### Medium-Term (Product Expansion)

- **ML scoring service** — LightGBM + SHAP model integration via gRPC for hybrid rule + ML scoring
- **Neo4j causal clustering** — Production-grade graph deployment with 3-node cluster for high-availability fraud ring detection
- **Kubernetes production deployment** — Full Helm-based deployment with ArgoCD GitOps, canary rollouts, and multi-AZ availability

### Longer-Term (Market Growth)

- **Advanced analytics and reporting** — Merchant-facing fraud trend reports, rule effectiveness dashboards, ROI calculators
- **Mobile SDK enhancements** — Native iOS (Swift) and Android (Kotlin) SDKs beyond React Native
- **Regional expansion** — Localized telco integrations for Middle East, Africa, and Latin America markets
- **A/B testing framework** — Rule variant testing with traffic splitting and statistical significance tracking
- **Cross-merchant fraud graph** — Opt-in shared intelligence network with privacy-preserving tokenized identifiers

---

## 10. Success Metrics / KPIs

### Performance

| Metric | Target | Current |
|---|---|---|
| Decision latency (p99) | < 500ms | ~82ms (p99), ~41ms (p95) |
| Decision latency (target) | < 200ms | Achieved |
| Throughput | 5,000+ events/sec | 5,200 events/sec verified |
| Availability | 99.9% | Architecture supports (15-minute RTO, 1-minute RPO) |

### Detection Quality

| Metric | Target |
|---|---|
| True positive rate (TPR) | > 85% |
| False positive rate (FPR) | < 5% |
| Emulator detection rate | > 98% |
| Bot detection rate | > 91% |

### Operational

| Metric | Target |
|---|---|
| Case SLA — BLOCK | 4 hours |
| Case SLA — REVIEW | 24 hours |
| Integration time | < 1 day (SDK to first events) |
| Time to first fraud insights | < 24 hours |
| Rule deployment | Zero downtime (hot reload) |

### Business

| Metric | Description |
|---|---|
| Fraud loss reduction | Percentage decrease in merchant fraud losses after SignalRisk integration |
| Analyst throughput | Cases resolved per analyst per day with SLA compliance rate |
| Merchant onboarding velocity | Days from contract to production traffic |
| Net revenue retention | Expansion revenue from growing transaction volumes |
| Cross-merchant graph coverage | Percentage of entities with multi-merchant visibility |
