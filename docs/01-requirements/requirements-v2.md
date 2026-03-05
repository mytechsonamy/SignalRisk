# SignalRisk — Requirements Document v2

> **Revision Note:** Addresses all critical and high issues from AI Review Iteration 1.
> Key additions: Data Privacy & Consent framework, Incident Response, End-to-end latency budget,
> Testable accuracy metrics, Multi-aggregator strategy, Sharding plan, OAuth2/mTLS auth, SDK size review.

---

## 1. Product Overview

**Product Name:** SignalRisk
**Type:** Real-time fraud decision engine for wallet and carrier billing platforms
**Target Buyers:** Head of Risk, Head of Fraud, Payment Operations
**Focus:** Wallet + Telco Billing Fraud Detection (Emerging Markets)

### Vision
The only fraud intelligence platform purpose-built for emerging market wallet and carrier billing fraud — combining device, behavioral, and telco signals in a single API.

### Problem Statement
Western solutions (Stripe Radar, Riskified, Sift) are optimized for card payments and e-commerce. No strong global player exists for telco billing, wallet, and gaming payments specific to emerging markets. SignalRisk fills this gap by combining telco signals, behavioral biometrics, and device intelligence.

---

## 2. Target Fraud Types

| Fraud Type | Mechanism | Current Solution Gap |
|---|---|---|
| Account Farming | Device farm + fake accounts | Telco signal not integrated |
| Fake Subscription | Bot + stolen MSISDN | No carrier billing-specific solution |
| Bot Purchases | Headless browser, device emulation | No mobile gaming-specific signals |
| SIM Swap Fraud | Social engineering + telco | No real-time telco signal |
| Fake KYC | Device farm + document forgery | Weak device-identity correlation |

---

## 3. System Architecture (High-Level)

```
Merchant SDK (iOS/Android/Web)
  → Event Collector (Kafka)
    → Intelligence Layer:
       - Device Intel (fingerprinting)
       - Behavioral Intel (biometrics)
       - Network Intel (proxy/VPN detection)
       - Telco Intel (carrier signals)
    → Feature Store (Redis online / S3 offline)
      → Feature Pipeline (raw events → ML features)
    → Risk Engine (rule-based Phase 1 → LightGBM Phase 2)
    → Fraud Graph (Neo4j — cross-merchant)
  → Decision API (real-time risk score response)
```

---

## 4. Functional Requirements

### FR-001: Merchant SDK
- **Priority:** P0 (Critical)
- Multi-platform: iOS (Swift), Android (Kotlin), Web (JavaScript)
- Device fingerprint: user_agent, screen_resolution, canvas_fingerprint, timezone_offset, webgl_renderer
- Behavioral signals: typing_cadence, swipe_speed, scroll_entropy, session_duration
- Sensor entropy (mobile only): accelerometer, gyroscope, orientation
- Browser entropy (web only): WebGL renderer, AudioContext, font list
- **SDK Size Target:** <100KB gzipped for web (revised from 50KB — sensor+browser entropy requires more payload), <2MB for mobile
- Non-blocking integration (async event batching, max 5 events per batch)
- **Privacy:** SDK must expose `setConsent(granted: boolean)` API. No data collection until consent granted.
- **Minimal mode:** Merchants can select which signal categories to collect (device/behavioral/sensor/browser)

### FR-002: Event Collector
- **Priority:** P0 (Critical)
- High-throughput event ingestion via Kafka (3-node cluster minimum)
- Event schema validation (JSON Schema) and normalization
- Event deduplication via event_id + timestamp window (5 min)
- Throughput target: 10,000 events/second platform-wide, 1,000 events/second per merchant
- Event types: page_load, scroll, click, input_focus, typing, otp_request, confirm, purchase
- **Dead letter queue** for malformed events
- **Back-pressure handling** when downstream services are slow

### FR-003: Device Intelligence Module
- **Priority:** P0 (Critical)
- Device fingerprint generation (deterministic hash of collected signals)
- Device reuse detection across accounts (same device → multiple accounts alert)
- Emulator/simulator detection via sensor entropy (zero-value detection)
- Headless browser detection via browser entropy (default/null values)
- Device trust score: 0.0-1.0 based on age, history, associated accounts
- **Fingerprint stability:** Target >95% consistency for same device across 24h sessions

### FR-004: Behavioral Biometrics Module
- **Priority:** P0 (Critical)
- Human vs Bot session classification
- Session flow analysis (organic vs linear timing patterns)
- Key behavioral indicators with signal strength:
  - typing_cadence: HIGH signal (>0.7 importance)
  - swipe_speed: HIGH signal (>0.7 importance)
  - scroll_entropy: HIGH signal (>0.7 importance)
  - tap_pressure: MEDIUM signal (0.4-0.7 importance)
  - session_duration: MEDIUM signal (0.4-0.7 importance)
- **Accuracy target (Phase 1 rule-based):** >85% bot detection rate, <2% false positive on humans
- **Accuracy target (Phase 2 ML):** >95% bot detection rate, <0.5% false positive on humans
- **Evaluation methodology:** Labeled dataset of 10,000+ sessions (5,000 human, 5,000 bot), evaluated weekly on rolling 30-day window, segmented by platform (iOS/Android/Web) and merchant

### FR-005: Network Intelligence Module
- **Priority:** P1 (High)
- Proxy/VPN detection (commercial proxy DB + heuristic detection)
- IP geolocation (MaxMind GeoIP2 or equivalent)
- ASN analysis and reputation scoring
- Geo mismatch detection (IP country vs MSISDN country vs billing country)
- **Tor exit node detection**

### FR-006: Telco Intelligence Module
- **Priority:** P1 (High)
- **Phase 1: Multi-aggregator strategy** (not single-provider dependency)
  - Primary: Payguru (carrier billing, 2-4 week integration)
  - Secondary: Fortumo or Boku (redundancy, 4-6 week integration)
  - Minimum 2 aggregator integrations before production launch
- Phase 3+: Direct telco integration (Turkcell, Vodafone) — 6-18 months
- Telco signals: MSISDN prefix (carrier lookup), carrier identification, subscription velocity (rate anomaly), geo mismatch
- **SIM swap detection** (Phase 3 — requires direct telco integration)
- **Aggregator security assessment:** Each aggregator must pass security review before integration (data handling, encryption, compliance)

### FR-007: Feature Store
- **Priority:** P0 (Critical)
- Online feature store: Redis Cluster (3+ nodes) for real-time serving
- Offline feature store: PostgreSQL for batch training data
- Feature pipeline: transform raw events → ML-ready features (Kafka Streams or Flink)
- Feature versioning and lineage tracking
- Feature retrieval: <10ms p95 (Redis), <100ms p95 (PostgreSQL batch)
- **Feature catalog:** Documented feature definitions with data types, sources, and freshness requirements
- **Feature monitoring:** Alert on feature drift (distribution change >2 std dev)

### FR-008: Risk Engine
- **Priority:** P0 (Critical)
- Phase 1: Rule-based risk scoring
  - Configurable rule sets per merchant (JSON DSL)
  - Velocity rules (max transactions per device per hour/day)
  - Device reuse rules (max accounts per device)
  - Behavioral anomaly rules (session score thresholds)
  - **Rule versioning and rollback** — each rule change creates a new version
  - **Rule simulation:** Test rules against historical data before activation
  - **Anti-gaming:** Rules randomized slightly per evaluation to prevent threshold probing
- Phase 2: ML-based scoring (LightGBM)
  - **Model monitoring:** Track precision, recall, F1 weekly
  - **Model rollback:** Ability to revert to previous model version within 5 minutes
  - **Model explainability:** SHAP values for top 5 contributing features per decision
- Risk score output: 0.0-1.0 with decision (ALLOW, REVIEW, BLOCK)
- **Chargeback/dispute feedback loop:** Merchants report confirmed fraud → feeds back into rule tuning and model retraining

### FR-009: Fraud Graph
- **Priority:** P1 (High)
- Graph database: Neo4j (primary, self-hosted or Aura)
- Entity types: Device, Account, MSISDN, IP, Merchant, Email
- Relationship types: USED_BY, LOGGED_IN_FROM, PURCHASED_AT, LINKED_TO, SHARED_DEVICE
- Cross-merchant device detection (core IP/moat)
- Real-time graph queries for fraud scoring (<100ms for 2-hop queries)
- Account farming detection via connected components analysis
- **Graph sharding strategy:** Partition by merchant_id for Phase 1, cross-merchant graph in shared partition for Phase 2+
- **Data anonymization for cross-merchant:** Device fingerprints shared as hashed tokens, no PII crosses merchant boundaries

### FR-010: Decision API
- **Priority:** P0 (Critical)
- RESTful API (OpenAPI 3.0 spec)
- **Authentication:** OAuth2 client_credentials flow (primary), API key fallback for development
- **mTLS** for enterprise tier connections
- Rate limiting per tier (Startup: 100 req/s, Growth: 500 req/s, Enterprise: custom)
- Response payload: `{ risk_score, decision, signals[], session_id, request_id, latency_ms }`
- Webhook support for async notifications (fraud confirmed, rule triggered)
- **Idempotency:** Duplicate requests within 5s window return cached response
- **API versioning:** URL-based (v1, v2) with 12-month deprecation policy

### FR-011: Dashboard
- **Priority:** P1 (High)
- Fraud rate monitoring (real-time, hourly, daily aggregations)
- Real-time event stream visualization
- Rule management interface (create, edit, test, activate/deactivate)
- Device network visualization (graph view)
- Merchant-specific analytics
- Alert configuration (email, webhook, Slack)
- **RBAC:** Admin, Analyst, Viewer roles per merchant
- **Audit log viewer:** All administrative actions logged and viewable

---

## 5. Non-Functional Requirements

### NFR-001: Performance — End-to-End Latency Budget
Total Decision API response: **<200ms p99**

| Component | Budget | Notes |
|---|---|---|
| Network ingress | 10ms | CDN/edge routing |
| Event parsing + validation | 5ms | JSON schema validation |
| Feature Store retrieval | 10ms | Redis Cluster p95 |
| Rule Engine evaluation | 15ms | In-memory rules |
| Graph query (2-hop) | 50ms | Neo4j with warm cache |
| Risk score aggregation | 5ms | Weighted combination |
| Response serialization | 5ms | JSON encoding |
| **Total allocated** | **100ms** | **100ms buffer for variance** |

- Event ingestion throughput: 10,000 events/second platform-wide
- Per-merchant burst: 1,000 events/second
- Feature Store retrieval: <10ms p95

### NFR-002: Availability & Disaster Recovery
- Uptime SLA: 99.9% (8.76h downtime/year max)
- **RTO (Recovery Time Objective):** 15 minutes
- **RPO (Recovery Point Objective):** 1 minute (streaming replication)
- Automatic failover for all critical components
- Multi-AZ deployment (minimum 2 availability zones)
- **Graceful degradation matrix:**
  | Component Down | Fallback Behavior |
  |---|---|
  | Feature Store (Redis) | Rule-based scoring only (no ML features) |
  | Graph DB (Neo4j) | Skip cross-merchant check, score with local signals |
  | Kafka | HTTP direct ingestion (reduced throughput) |
  | Telco aggregator | Score without telco signals, flag as partial |
  | ML Model service | Fall back to rule-based scoring |

### NFR-003: Scalability
- 10,000 concurrent API connections
- Horizontal scaling for Event Collector and Risk Engine (K8s HPA)
- 50M+ events/month per Growth tier merchant
- **Database scaling:**
  - PostgreSQL: Read replicas for analytics, connection pooling (PgBouncer)
  - Redis: Cluster mode with 3+ shards
  - Neo4j: Causal clustering (3-node minimum), partition by merchant for Phase 1
- Graph database: 100M+ nodes target for Phase 2

### NFR-004: Security
- **KVKK/GDPR Compliance:**
  - Explicit user consent required before data collection (SDK consent API)
  - Data minimization: Only collect signals enabled by merchant configuration
  - Right to erasure: API endpoint to delete all data for a given user/device within 72h
  - Right to data portability: Export user data in machine-readable format
  - Data residency: Turkey (primary), EU option for international merchants
  - DPO (Data Protection Officer) appointed before production launch
  - **Annual KVKK compliance audit** by external firm
- Data encryption at rest (AES-256) and in transit (TLS 1.3)
- **Authentication:** OAuth2 + mTLS for enterprise, API key rotation every 90 days
- **Secret management:** HashiCorp Vault or AWS Secrets Manager
- Audit logging for all administrative actions (retained 3 years)
- PII handling: Hash MSISDN (SHA-256 + salt), anonymize device fingerprints for cross-merchant sharing
- **Penetration testing:** Annual pentest by third-party firm, first pentest before production launch
- **Vulnerability management:** CVE scanning in CI/CD, critical patches within 48h

### NFR-005: Data Retention & Lifecycle
| Data Type | Retention | Justification |
|---|---|---|
| Raw events | 90 days | Debugging, short-term analysis |
| Aggregated features | 1 year | Model training, trend analysis |
| Graph relationships | 3 years (revised) | Core asset, but KVKK requires limits |
| Audit logs | 5 years | Regulatory compliance |
| User PII | Until erasure requested + 30 days | KVKK right to erasure |
| ML model artifacts | Indefinite | Version history, rollback |

### NFR-006: Incident Response
- **Incident severity levels:**
  - P0 (Critical): Data breach, complete service outage → Response within 15 min, resolve within 1h
  - P1 (High): Partial outage, false positive spike >5% → Response within 30 min, resolve within 4h
  - P2 (Medium): Performance degradation, single component failure → Response within 2h
  - P3 (Low): Non-critical bug, UI issue → Next business day
- **Data breach protocol:**
  1. Isolate affected systems
  2. Notify KVKK authority within 72 hours
  3. Notify affected data subjects without undue delay
  4. Forensic investigation within 7 days
  5. Post-mortem report within 14 days
- **On-call rotation:** 24/7 coverage for P0/P1 incidents
- **Runbook:** Documented procedures for all P0 scenarios

---

## 6. Revenue Model

| Tier | Platform Fee | Event Fee | Risk Score Fee | Event Limit | Features |
|---|---|---|---|---|---|
| Startup | $500/mo | $0.002/event | Included | 5M/mo | Core detection, REST API, Dashboard |
| Growth | $2,000/mo | $0.001/event | $0.003/risk check | 50M/mo | + Behavioral signals, Fraud graph, SLA |
| Enterprise | Custom | Rev-share | Separate SLA | Unlimited | + Custom ML, On-prem, mTLS, Dedicated support |

---

## 7. Phased Roadmap

### Phase 1 — MVP: Core Detection (Month 1-4)
- Device fingerprint + reuse detection
- Proxy/VPN detection
- Velocity rules (configurable per merchant)
- Basic behavioral signals (typing cadence, scroll entropy)
- Rule-based risk scoring with simulation
- Fraud rate dashboard with RBAC
- Multi-aggregator telco signal (Payguru + 1 backup)
- Feature Store infrastructure (Redis Cluster)
- OAuth2 authentication
- KVKK consent framework
- Chargeback feedback loop (manual upload)

### Phase 2 — ML: Intelligence Layer (Month 5-8)
- LightGBM risk model with SHAP explainability
- Sensor entropy analysis (emulator detection)
- Browser entropy detection (headless detection)
- Affiliate fraud detection
- Traffic anomaly ML model
- Advanced bot fingerprinting
- Real-time graph queries
- A/B testing framework for model comparison
- Automated chargeback feedback pipeline

### Phase 3 — Network: Global Moat (Month 9-14)
- Cross-merchant device blacklist (anonymized)
- Global device network graph
- Direct telco integration (Turkcell, Vodafone)
- SIM swap detection
- Network effect scoring
- Regional expansion (ME / Africa / LATAM)

---

## 8. Go-To-Market Strategy

1. **Multi-aggregator start** — Payguru (primary) + Fortumo/Boku (secondary). Data-sharing agreement with Payguru for labeled fraud data.
2. **Papara / iyzico** — Wallet and payment gateway. High account farming + bot fraud need.
3. **Peak Games** — Bot purchases, fake in-app transactions. Good data source for network effect.
4. **Regional Expansion** — TR references → ME/Africa/LATAM. Fraud graph cross-region value.

---

## 9. Critical Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Cold start / insufficient data | CRITICAL | Multi-aggregator data-sharing deals. Rule-based for 3-6 months. Synthetic data augmentation for initial model training. |
| Telco integration delay | MEDIUM | Aggregator-first with minimum 2 providers |
| Scope creep | HIGH | Limit Phase 1 to Wallet + Telco only. Strict feature freeze after planning. |
| Major competitor entry (Sardine, Sift) | MEDIUM | Local network effect moat, TR reference. 18-24 month window. |
| KVKK / data processing compliance | HIGH (upgraded) | DPO hired, external audit, consent framework in SDK, data residency in TR |
| Single aggregator dependency | HIGH | Multi-aggregator strategy from day 1 |
| Rule gaming by attackers | MEDIUM | Rule randomization, threshold jittering, behavioral signals as secondary check |

---

## 10. Competitive Landscape

| Company | Strength | Telco | Wallet | Behavioral | EM Coverage |
|---|---|---|---|---|---|
| Evina | Telco billing fraud | Strong | No | No | Partial |
| Sardine | Fintech/crypto fraud | No | Partial | Yes | Weak |
| Sift | Marketplace/e-comm | No | No | Partial | Weak |
| FingerprintJS | Device intelligence | No | No | No | Weak |
| **SignalRisk** | **Wallet+Telco+Behavioral** | **Phase 1** | **Phase 1** | **Phase 1** | **TR→EM** |

---

## 11. MVP Team

| Role | Responsibility |
|---|---|
| Backend Engineer | API, event pipeline, rule engine, Feature Store infra |
| SDK Engineer (Critical) | iOS, Android, Web JS, device fingerprint, behavioral signals, consent API |
| Data Engineer | Fraud graph (Neo4j), event storage, data pipeline |
| Fraud Scientist | Rule design, labeled data, Phase 2 ML preparation |
| **Security/Compliance Lead** | KVKK compliance, DPO responsibilities, security reviews, incident response |

---

## 12. Tech Stack

- **Language:** TypeScript
- **Framework:** NestJS
- **Database:** PostgreSQL (primary) + PgBouncer, Redis Cluster (Feature Store), Neo4j (Fraud Graph)
- **Message Queue:** Kafka (3-node cluster)
- **Auth:** OAuth2 (client_credentials), mTLS (enterprise)
- **Secrets:** HashiCorp Vault
- **Infrastructure:** Docker, Kubernetes (HPA enabled)
- **ML (Phase 2):** LightGBM, Python, SHAP, Feature Store (Feast)
- **Monitoring:** Grafana, Prometheus, PagerDuty (alerting)
- **Cloud:** AWS (primary, multi-AZ), GCP (backup option)

---

## 13. User Stories (Phase 1 MVP)

### US-001: SDK Integration with Consent
As a merchant, I want to integrate SignalRisk SDK with user consent management so that fraud signals are collected only with user permission.
- SDK available for iOS, Android, Web
- `setConsent(true)` must be called before any data collection
- Merchant can configure which signal categories to enable
- Integration requires <15 lines of code

### US-002: Real-time Risk Decision
As a merchant, I want to call the Decision API before processing a transaction so that I get a real-time fraud risk assessment within 200ms.
- API returns: risk_score (0-1), decision (ALLOW/REVIEW/BLOCK), signals[], request_id
- Response time <200ms p99
- OAuth2 authenticated

### US-003: Fraud Dashboard with RBAC
As a fraud analyst, I want to view a dashboard with role-based access so that I can monitor fraud rates and manage rules.
- Roles: Admin, Analyst, Viewer
- Real-time fraud rate by merchant
- Drill-down into individual sessions
- All admin actions audit-logged

### US-004: Configurable Velocity Rules
As a fraud analyst, I want to configure and simulate velocity rules before activation so that I can safely tune detection.
- Create/edit rules via UI (JSON DSL)
- Simulate rule against last 7 days of historical data
- Rules versioned with rollback capability
- Enable/disable per merchant

### US-005: Device Farming Detection
As a merchant, I want to detect device farming so that fake accounts are blocked before they transact.
- Same device fingerprint → multiple accounts alert
- Configurable threshold (default: >3 accounts per device)
- Device trust score decreases with multiple associations

### US-006: Cross-Merchant Device Graph (Phase 2)
As a fraud analyst, I want to see cross-merchant device relationships using anonymized data so that organized fraud rings can be identified without exposing PII.
- Device fingerprints shared as hashed tokens
- No merchant-specific PII crosses boundaries
- Graph visualization of device-account relationships

### US-007: Multi-Aggregator Telco Signals
As a system, I want to collect telco signals from at least 2 aggregators so that carrier billing fraud detection is not dependent on a single provider.
- Integration with Payguru + secondary aggregator
- Geo mismatch detection (IP country vs MSISDN country)
- Graceful fallback if one aggregator is unavailable

### US-008: Bot Session Detection
As a system, I want to distinguish human sessions from bot sessions using behavioral biometrics with measurable accuracy.
- Phase 1: >85% bot detection rate, <2% FP on humans (rule-based)
- Evaluated on labeled dataset of 10,000+ sessions
- Weekly accuracy reporting per platform (iOS/Android/Web)

### US-009: Chargeback Feedback Loop
As a merchant, I want to report confirmed fraud cases so that the detection system learns and improves over time.
- CSV upload for batch fraud reports
- API endpoint for real-time fraud confirmation
- Confirmed fraud feeds into rule weight adjustment

### US-010: Data Erasure (KVKK)
As a user, I want my data to be deleted upon request so that my right to erasure under KVKK is respected.
- Merchant-facing API to trigger erasure for a user/device
- All PII and raw events deleted within 72 hours
- Aggregated/anonymized features retained (no PII)
- Erasure confirmation sent to merchant
