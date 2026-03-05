# SignalRisk — Requirements Document v3

> **Revision Note:** Addresses all critical and high issues from AI Review Iteration 2.
> Key additions: Multi-tenant isolation framework, Cross-merchant data governance policy,
> Argon2 hashing for MSISDN, Differential privacy for data erasure, Granular consent model,
> Fraud-ops UX workflows, Percentile-consistent latency budgets, API key environment restrictions,
> Verification matrix, ML model retention limits, Dashboard case management.

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
- **SDK Size Target:** <100KB gzipped for web (sensor+browser entropy payload), <2MB for mobile
- Non-blocking integration (async event batching, max 5 events per batch)
- **Privacy:** SDK must expose granular consent API (see Section 14: Consent Framework)
- **Minimal mode:** Merchants can select which signal categories to collect (device/behavioral/sensor/browser)
- **Mobile Integrity:**
  - Jailbreak/root detection on mobile platforms
  - App attestation (iOS App Attest, Android SafetyNet/Play Integrity)
  - Anti-tamper checks to detect SDK modification

### FR-002: Event Collector
- **Priority:** P0 (Critical)
- High-throughput event ingestion via Kafka (3-node cluster minimum)
- Event schema validation (JSON Schema) and normalization
- Event deduplication via event_id + timestamp window (5 min)
- Throughput target: 10,000 events/second platform-wide, 1,000 events/second per merchant
- Event types: page_load, scroll, click, input_focus, typing, otp_request, confirm, purchase
- **Dead letter queue** for malformed events
- **Back-pressure handling:** Kafka consumer lag monitoring, auto-scaling consumers, configurable retry budgets (max 3 retries per event, exponential backoff), queue retention 72h max
- **Replay storm protection:** Rate-limit replay requests to 2x normal throughput, circuit breaker if replay exceeds 5x

### FR-003: Device Intelligence Module
- **Priority:** P0 (Critical)
- Device fingerprint generation (deterministic hash of collected signals)
- Device reuse detection across accounts (same device → multiple accounts alert)
- Emulator/simulator detection via sensor entropy (zero-value detection)
- Headless browser detection via browser entropy (default/null values)
- Device trust score: 0.0-1.0 based on age, history, associated accounts
- **Fingerprint stability:** Target >95% consistency for same device across 24h sessions
- **Fingerprint versioning:** Track fingerprint changes due to OS/browser updates, use fuzzy matching (≥80% signal overlap = same device) to account for minor variations

### FR-004: Behavioral Biometrics Module
- **Priority:** P0 (Critical)
- Human vs Bot session classification
- Session flow analysis: organic sessions exhibit variable inter-event timing (coefficient of variation >0.3), linear/bot sessions show uniform timing (CV <0.1)
- Key behavioral indicators with signal strength:
  - typing_cadence: HIGH signal (>0.7 importance)
  - swipe_speed: HIGH signal (>0.7 importance)
  - scroll_entropy: HIGH signal (>0.7 importance)
  - tap_pressure: MEDIUM signal (0.4-0.7 importance)
  - session_duration: MEDIUM signal (0.4-0.7 importance)
- **Accuracy target (Phase 1 rule-based):** >85% bot detection rate, <2% false positive on humans
- **Accuracy target (Phase 2 ML):** >95% bot detection rate, <0.5% false positive on humans
- **Evaluation methodology:** Labeled dataset of 10,000+ sessions (5,000 human, 5,000 bot), evaluated weekly on rolling 30-day window, segmented by platform (iOS/Android/Web) and merchant
- **Confidence intervals:** All reported metrics must include 95% confidence interval

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
  - **Model governance (Phase 2):**
    - Champion/challenger framework: new model must beat champion on all key metrics for 7-day shadow period
    - Bias/fairness monitoring: track false positive rates across demographic segments (device type, region, carrier)
    - Drift-triggered rollback: auto-revert if precision drops >5% or FPR increases >2% vs baseline within 24h window
    - Model promotion requires sign-off from Fraud Scientist + Engineering Lead
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
- **Tenant-isolated graph queries:** See Section 15: Multi-Tenant Isolation

### FR-010: Decision API
- **Priority:** P0 (Critical)
- RESTful API (OpenAPI 3.0 spec)
- **Authentication:**
  - **Production:** OAuth2 client_credentials flow (required)
  - **mTLS** for enterprise tier connections (required for high-risk operations)
  - **Development/Staging only:** API key authentication (explicitly disabled in production via environment flag)
  - API key rotation every 90 days, keys scoped to specific endpoints and environments
- Rate limiting per tier (Startup: 100 req/s, Growth: 500 req/s, Enterprise: custom)
- Response payload: `{ risk_score, decision, signals[], session_id, request_id, latency_ms }`
- Webhook support for async notifications (fraud confirmed, rule triggered)
  - **Webhook signing:** HMAC-SHA256 signature on all webhook payloads, timestamp included to prevent replay (5-minute validity window)
- **Idempotency:** Duplicate requests within 5s window return cached response
- **API versioning:** URL-based (v1, v2) with 12-month deprecation policy
- **WAF/Bot protection:** Rate limiting, IP reputation checks, request fingerprinting on all public endpoints

### FR-011: Dashboard & Fraud Operations
- **Priority:** P1 (High)
- **Monitoring:**
  - Fraud rate monitoring (real-time, hourly, daily aggregations)
  - Real-time event stream visualization
  - Device network visualization (graph view)
  - Merchant-specific analytics
  - Alert configuration (email, webhook, Slack)
- **Rule Management:**
  - Create, edit, test, activate/deactivate rules via UI
  - Rule simulation against historical data
- **Fraud Operations Workflows:**
  - **Case queue:** Incoming REVIEW decisions auto-create investigation cases
  - **Case states:** NEW → ASSIGNED → INVESTIGATING → RESOLVED (fraud_confirmed / false_positive)
  - **Case ownership:** Auto-assign based on merchant/region, manual reassignment supported
  - **Evidence timeline:** Chronological view of all signals, events, and graph connections for a session
  - **Bulk actions:** Select multiple cases for batch resolution (e.g., mark all from same device as fraud)
  - **Alert deduplication:** Group related alerts (same device, same pattern) into single case
  - **SLA tracking:** Time-to-first-review and time-to-resolution metrics per analyst, configurable SLA targets per merchant
- **Access Control:**
  - **RBAC:** Admin, Analyst, Viewer roles per merchant
  - **Audit log viewer:** All administrative actions logged and viewable

### FR-012: Chargeback Feedback
- **Priority:** P1 (High)
- CSV upload for batch fraud reports
  - **Input validation:** File size limit 50MB, whitelist allowed columns, escape special characters, reject malformed rows with error report
  - **Schema enforcement:** Required fields (transaction_id, fraud_type, date), type validation per field
- API endpoint for real-time fraud confirmation
- Confirmed fraud feeds into rule weight adjustment

---

## 5. Non-Functional Requirements

### NFR-001: Performance — End-to-End Latency Budget
Total Decision API response: **<200ms p99**

All component budgets measured at **p99** (percentile-consistent):

| Component | Budget (p99) | Cold Cache | Measurement Method |
|---|---|---|---|
| Network ingress | 15ms | 20ms | CDN edge latency percentile |
| Event parsing + validation | 8ms | 8ms | Service histogram |
| Feature Store retrieval | 15ms | 50ms | Redis LATENCY HISTORY |
| Rule Engine evaluation | 20ms | 20ms | In-memory, no cache dependency |
| Graph query (2-hop) | 60ms | 120ms | Neo4j query profiler |
| Risk score aggregation | 7ms | 7ms | Service histogram |
| Response serialization | 5ms | 5ms | Service histogram |
| **Total allocated (warm)** | **130ms** | — | **70ms buffer for variance** |
| **Total allocated (cold)** | **230ms** | — | **Allowed to exceed 200ms on cold start** |

**Verification requirements:**
- Load test at 2x target concurrency (20,000 concurrent connections) before GA
- Burst test at 5x per-merchant rate (5,000 events/sec) for 60 seconds
- Cold-cache scenario: all Redis caches flushed, measure first 1,000 requests
- Results must include p50, p95, p99, p99.9 percentiles with 95% confidence intervals

### NFR-002: Availability & Disaster Recovery
- Uptime SLA: 99.9% (8.76h downtime/year max)
- **RTO (Recovery Time Objective):** 15 minutes
- **RPO (Recovery Point Objective):** 1 minute (streaming replication)
- Automatic failover for all critical components
- Multi-AZ deployment (minimum 2 availability zones)
- **Graceful degradation matrix:**
  | Component Down | Fallback Behavior | Risk Score Impact |
  |---|---|---|
  | Feature Store (Redis) | Rule-based scoring only (no ML features) | Score flagged "partial" |
  | Graph DB (Neo4j) | Skip cross-merchant check, score with local signals | Score flagged "partial" |
  | Kafka | HTTP direct ingestion (reduced throughput, max 1000 req/s) | No impact on scoring |
  | Telco aggregator | Score without telco signals, flag as partial | Score flagged "partial" |
  | ML Model service | Fall back to rule-based scoring | Score flagged "rule_only" |
- **Chaos testing:** Quarterly failure injection tests for each degradation scenario

### NFR-003: Scalability
- 10,000 concurrent API connections
- Horizontal scaling for Event Collector and Risk Engine (K8s HPA)
- 50M+ events/month per Growth tier merchant
- **Database scaling:**
  - PostgreSQL: Read replicas for analytics, connection pooling (PgBouncer)
  - Redis: Cluster mode with 3+ shards
  - Neo4j: Causal clustering (3-node minimum), partition by merchant for Phase 1
- Graph database: 100M+ nodes target for Phase 2
- **Capacity planning for failure scenarios:**
  - Webhook retry amplification: max 3 retries with exponential backoff (1s, 4s, 16s), dead letter after 3 failures
  - Aggregator outage replay: buffered events replayed at 2x normal rate, not burst
  - Backpressure SLO: Event Collector rejects new events with 429 when queue depth exceeds 1M, auto-recovers when queue drops below 500K

### NFR-004: Security
- See **Section 14: Data Privacy & Consent Framework** for KVKK/GDPR details
- See **Section 15: Multi-Tenant Isolation** for tenant security
- Data encryption at rest (AES-256) and in transit (TLS 1.3)
- **Authentication:** OAuth2 (production required) + mTLS for enterprise, API key for dev/staging only
- **Secret management:** HashiCorp Vault or AWS Secrets Manager
- Audit logging for all administrative actions (retained 5 years)
- **PII hashing:** MSISDN hashed with **Argon2id** (memory-hard) with per-user salt and system pepper. SHA-256 removed due to rainbow table vulnerability on phone number patterns.
- Device fingerprints anonymized for cross-merchant sharing
- **Penetration testing:** Annual pentest by third-party firm, first pentest before production launch
- **Vulnerability management:** CVE scanning in CI/CD, critical patches within 48h
- **WAF/Bot protection:** Mandatory on all public-facing API endpoints

### NFR-005: Data Retention & Lifecycle
| Data Type | Retention | Justification |
|---|---|---|
| Raw events | 90 days | Debugging, short-term analysis |
| Aggregated features | 1 year | Model training, trend analysis |
| Graph relationships | 3 years | Core asset, KVKK limits apply |
| Audit logs | 5 years | Regulatory compliance |
| User PII | Until erasure requested + 30 days | KVKK right to erasure |
| ML model artifacts | **3 years max** | Version history, rollback (bounded to prevent indefinite PII-derived retention) |
| ML training datasets | 2 years | Retraining, must be re-anonymized annually |

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
- Fraud operations dashboard with case management + RBAC
- Multi-aggregator telco signal (Payguru + 1 backup)
- Feature Store infrastructure (Redis Cluster)
- OAuth2 authentication (API keys dev/staging only)
- KVKK consent framework (granular consent)
- Chargeback feedback loop (manual upload with validation)
- Multi-tenant isolation framework
- WAF/Bot protection on public APIs

### Phase 2 — ML: Intelligence Layer (Month 5-8)
- LightGBM risk model with SHAP explainability
- Model governance framework (champion/challenger, bias monitoring)
- Sensor entropy analysis (emulator detection)
- Browser entropy detection (headless detection)
- Affiliate fraud detection
- Traffic anomaly ML model
- Advanced bot fingerprinting
- Real-time graph queries
- A/B testing framework for model comparison
- Automated chargeback feedback pipeline
- Cross-merchant fraud graph with differential privacy

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
| KVKK / data processing compliance | HIGH | DPO hired, external audit, granular consent framework, data residency in TR |
| Single aggregator dependency | HIGH | Multi-aggregator strategy from day 1 |
| Rule gaming by attackers | MEDIUM | Rule randomization, threshold jittering, behavioral signals as secondary check |
| Cross-tenant data leakage | CRITICAL | Multi-tenant isolation framework with mandatory negative tests (see Section 15) |
| Re-identification from aggregated data | HIGH | Differential privacy (ε ≤ 1.0) on retained features, k-anonymity (k ≥ 5) |

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
| Security/Compliance Lead | KVKK compliance, DPO responsibilities, security reviews, incident response |

---

## 12. Tech Stack

- **Language:** TypeScript
- **Framework:** NestJS
- **Database:** PostgreSQL (primary) + PgBouncer, Redis Cluster (Feature Store), Neo4j (Fraud Graph)
- **Message Queue:** Kafka (3-node cluster)
- **Auth:** OAuth2 (client_credentials, production), mTLS (enterprise), API key (dev/staging only)
- **Secrets:** HashiCorp Vault
- **Infrastructure:** Docker, Kubernetes (HPA enabled)
- **ML (Phase 2):** LightGBM, Python, SHAP, Feature Store (Feast)
- **Monitoring:** Grafana, Prometheus, PagerDuty (alerting)
- **Cloud:** AWS (primary, multi-AZ), GCP (backup option)
- **Privacy:** Argon2id (MSISDN hashing), differential privacy (feature aggregation)

---

## 13. User Stories (Phase 1 MVP)

### US-001: SDK Integration with Granular Consent
As a merchant, I want to integrate SignalRisk SDK with granular user consent management so that fraud signals are collected only for consented categories.
- SDK available for iOS, Android, Web
- Granular consent API: `setConsent({ device: true, behavioral: false, sensor: true })`
- No data collection for non-consented categories
- Merchant can configure which signal categories to enable
- **Developer experience metrics:** Time-to-first-event <30 minutes, integration error rate <5%, sample apps for iOS/Android/Web
- **Backward compatibility:** SDK API follows semver, breaking changes only in major versions with 6-month migration window

### US-002: Real-time Risk Decision
As a merchant, I want to call the Decision API before processing a transaction so that I get a real-time fraud risk assessment within 200ms.
- API returns: risk_score (0-1), decision (ALLOW/REVIEW/BLOCK), signals[], request_id
- Response time <200ms p99 (warm cache), <300ms p99 (cold cache)
- OAuth2 authenticated (production), API key (dev/staging only)

### US-003: Fraud Operations Dashboard with RBAC
As a fraud analyst, I want to use a case management dashboard with role-based access so that I can triage, investigate, and resolve fraud cases efficiently.
- Roles: Admin, Analyst, Viewer
- Real-time fraud rate by merchant
- Case queue with auto-assignment and SLA tracking
- Evidence timeline per case (signals, events, graph connections)
- Bulk actions for batch case resolution
- All admin actions audit-logged
- **Usability target:** Analyst can triage a case (view evidence + make decision) in <2 minutes average

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
- **Differential privacy** applied to cross-merchant aggregations (ε ≤ 1.0)
- No merchant-specific PII crosses boundaries
- Graph visualization of device-account relationships
- **Tenant-isolated queries:** Merchant can only see their own data + anonymized cross-merchant signals

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
- **95% confidence intervals** reported for all metrics

### US-009: Chargeback Feedback with Input Validation
As a merchant, I want to report confirmed fraud cases via validated CSV upload or API so that the detection system learns safely.
- CSV upload with strict validation (50MB limit, schema enforcement, special character escaping)
- API endpoint for real-time fraud confirmation
- Confirmed fraud feeds into rule weight adjustment
- Rejected rows returned with error descriptions

### US-010: Data Erasure (KVKK) with Differential Privacy
As a user, I want my data to be deleted upon request with privacy guarantees so that my right to erasure under KVKK is fully respected.
- Merchant-facing API to trigger erasure for a user/device
- All PII and raw events deleted within 72 hours
- Aggregated features undergo **differential privacy sanitization** before retention (ε ≤ 1.0)
- k-anonymity check (k ≥ 5): if removing user's data makes any group identifiable, apply additional noise
- Erasure confirmation sent to merchant with audit trail
- **Re-identification risk assessment:** Automated check that retained data cannot be linked back to erased user

---

## 14. Data Privacy & Consent Framework

### 14.1 Granular Consent Model
- **Consent categories:** device_signals, behavioral_signals, sensor_signals, browser_signals, cross_merchant_sharing
- **SDK API:**
  ```
  SignalRisk.setConsent({
    device: true,
    behavioral: true,
    sensor: false,
    browser: true,
    crossMerchant: false
  })
  ```
- **Per-jurisdiction defaults:**
  - Turkey (KVKK): All categories require explicit opt-in
  - EU (GDPR): All categories require explicit opt-in
  - Other regions: Configurable per merchant (default: opt-in required)
- **Consent storage:** Consent state stored locally on device + server-side record
- **Revocation SLA:** Consent revocation takes effect within **5 minutes** across all systems (propagated via event bus)
- **Consent audit trail:** Every consent change logged with timestamp, source (SDK/API/dashboard), and previous state

### 14.2 Cross-Merchant Data Governance
- **Legal basis:** Legitimate interest for fraud prevention (KVKK Art. 5/2-f, GDPR Art. 6/1-f)
- **Controller/Processor model:**
  - Each merchant is **data controller** for their customer data
  - SignalRisk is **data processor** for single-merchant operations
  - SignalRisk is **joint controller** with merchants for cross-merchant fraud graph (requires explicit merchant agreement)
- **Data Processing Impact Assessment (DPIA):** Mandatory before cross-merchant graph activation
- **Permitted data sharing:**
  - Cross-merchant: Only anonymized device fingerprint hashes and fraud scores
  - Never shared: Raw PII, behavioral biometrics, raw events, transaction details
  - Purpose limitation: Fraud detection only, no marketing or profiling
- **Contract requirements:** Data Processing Agreement (DPA) required with each merchant, Joint Controller Agreement for cross-merchant participants
- **Annual audit:** External privacy audit of cross-merchant data flows

### 14.3 Data Residency
- **Primary:** Turkey (Istanbul region)
- **EU option:** Available for international merchants (Frankfurt/Amsterdam)
- **Data does not leave its residency region** — cross-region fraud signals shared only as anonymized scores

---

## 15. Multi-Tenant Isolation Framework

### 15.1 Data Plane Isolation
- **Database:** Row-level security (RLS) enforced at PostgreSQL level; every table with merchant data includes `merchant_id` column with RLS policy
- **Redis:** Key prefix namespacing per merchant (`merchant:{id}:*`), no cross-merchant key access
- **Neo4j:** Merchant-scoped queries enforced at application layer; cross-merchant queries limited to anonymized shared partition only
- **Kafka:** Per-merchant topic partitioning; consumer groups scoped to merchant
- **Object storage (S3):** Per-merchant prefix with IAM policies preventing cross-access

### 15.2 Control Plane Isolation
- **Authentication:** Each merchant gets unique OAuth2 client credentials; tokens include `merchant_id` claim
- **Authorization:** All API endpoints validate `merchant_id` from token against requested resource
- **Admin access:** Platform admin role separate from merchant admin; requires MFA + audit logging
- **Dashboard:** Merchant users can only see their own data; platform admins see cross-merchant analytics (anonymized)

### 15.3 Encryption Context
- **Per-merchant encryption keys** for sensitive data at rest (managed via Vault)
- **Key rotation:** Every 90 days per merchant, with zero-downtime re-encryption
- **Cross-merchant shared data:** Encrypted with platform key, not merchant key

### 15.4 Testing Requirements
- **Mandatory negative tests:** Every API endpoint tested with cross-tenant access attempt (must return 403)
- **Graph isolation tests:** Verify merchant A cannot traverse to merchant B's non-anonymized nodes
- **Redis isolation tests:** Verify key prefix enforcement prevents cross-merchant reads
- **Penetration test scope:** Must include multi-tenant isolation bypass attempts
- **CI/CD gate:** Cross-tenant isolation tests must pass before deployment

---

## 16. Verification Matrix

| Requirement | Test Method | Dataset/Sample | Environment | Pass Threshold | Measurement Window |
|---|---|---|---|---|---|
| Decision API <200ms p99 | Load test (k6/Locust) | 1M requests, 20K concurrent | Staging (prod-equivalent) | p99 < 200ms warm, <300ms cold | 30-minute sustained test |
| Bot detection >85% | Classification test | 10K labeled sessions (50/50) | Staging | >85% TPR, <2% FPR (95% CI) | Rolling 30-day window |
| Feature retrieval <10ms p95 | Redis benchmark | 100K feature lookups | Staging | p95 < 10ms, p99 < 25ms | 10-minute burst test |
| Graph query <100ms 2-hop | Neo4j profiler | 10K queries, 1M+ nodes graph | Staging | p99 < 100ms warm cache | 15-minute sustained test |
| Event throughput 10K/s | Kafka producer test | 10K events/sec sustained | Staging | Zero message loss, <1s lag | 60-minute sustained test |
| Fingerprint stability >95% | Regression test | 1K devices, 24h sessions | Production (canary) | >95% same-device match | 7-day monitoring window |
| Consent revocation <5min | Integration test | 100 concurrent revocations | Staging | All systems updated <5min | Per-test measurement |
| Cross-tenant isolation | Negative test suite | All API endpoints | CI/CD + Staging | 100% 403 on cross-tenant | Every deployment |
| Data erasure <72h | E2E test | 100 erasure requests | Staging | PII verified deleted <72h | Per-test measurement |
| Uptime 99.9% | Synthetic monitoring | Continuous | Production | <8.76h downtime/year | Rolling 365-day window |

---

## 17. Glossary

| Term | Definition |
|---|---|
| Real-time | System response within the defined latency SLA (<200ms p99 for Decision API) |
| Organic session | User session with variable inter-event timing (coefficient of variation >0.3) |
| Linear session | Bot/automated session with uniform inter-event timing (coefficient of variation <0.1) |
| Basic behavioral signals | typing_cadence + scroll_entropy (Phase 1 minimum signal set) |
| Feature drift | Statistical distribution of a feature changes >2 standard deviations from baseline |
| Cold cache | State where Redis/Neo4j caches are empty (e.g., after restart or failover) |
| Warm cache | Normal operating state with populated caches |
| Differential privacy (ε) | Privacy budget parameter; lower ε = stronger privacy. Target ε ≤ 1.0 for cross-merchant and erasure scenarios |
| k-anonymity | Privacy model ensuring each record is indistinguishable from at least k-1 other records |
