# SignalRisk — Requirements Document v1

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
  → Event Collector
    → Intelligence Layer:
       - Device Intel (fingerprinting)
       - Behavioral Intel (biometrics)
       - Network Intel (proxy/VPN detection)
       - Telco Intel (carrier signals)
    → Feature Store (Redis online / S3 offline)
      → Feature Pipeline (raw events → ML features)
    → Risk Engine (rule-based Phase 1 → LightGBM Phase 2)
    → Fraud Graph (Neo4j/Neptune — cross-merchant)
  → Decision API (real-time risk score response)
```

---

## 4. Functional Requirements

### FR-001: Merchant SDK
- **Priority:** P0 (Critical)
- Multi-platform support: iOS, Android, Web JavaScript
- Collect device fingerprint data: user_agent, screen_resolution, canvas_fingerprint, timezone_offset, sensor_data, webgl_renderer
- Collect behavioral signals: typing_cadence, swipe_speed, tap_pressure, scroll_entropy, session_duration
- Collect sensor entropy (mobile): accelerometer noise_pattern, gyroscope micro_vibration, orientation gravity_vector
- Collect browser entropy: WebGL renderer, AudioContext DAC fingerprint, font list, installed plugins
- Lightweight (<50KB gzipped for web)
- Non-blocking integration (async event streaming)

### FR-002: Event Collector
- **Priority:** P0 (Critical)
- High-throughput event ingestion via Kafka
- Event schema validation and normalization
- Event deduplication
- Support minimum 10,000 events/second
- Event types: page_load, scroll, click, input_focus, typing, otp_request, confirm, purchase

### FR-003: Device Intelligence Module
- **Priority:** P0 (Critical)
- Device fingerprint generation and storage
- Device reuse detection across accounts
- Emulator/simulator detection via sensor entropy
- Headless browser detection via browser entropy
- Device trust score calculation

### FR-004: Behavioral Biometrics Module
- **Priority:** P0 (Critical)
- Human vs Bot session classification
- Session flow analysis (organic vs linear patterns)
- Timing analysis: human sessions show irregular timing; bot sessions show uniform rapid timing
- Key behavioral indicators:
  - typing_cadence: HIGH signal
  - swipe_speed: HIGH signal
  - scroll_entropy: HIGH signal
  - tap_pressure: MEDIUM signal
  - session_duration: MEDIUM signal

### FR-005: Network Intelligence Module
- **Priority:** P1 (High)
- Proxy/VPN detection
- IP geolocation
- ASN analysis
- IP reputation scoring
- Geo mismatch detection (IP country vs MSISDN country)

### FR-006: Telco Intelligence Module
- **Priority:** P1 (High)
- Phase 1: Aggregator-first approach (Payguru, Fortumo, Boku) — 2-6 week integration
- Phase 3+: Direct telco integration (Turkcell, Vodafone) — 6-18 months
- Telco signals: MSISDN prefix (carrier lookup), carrier identification, subscription velocity (rate anomaly), geo mismatch
- SIM swap detection (Phase 3)

### FR-007: Feature Store
- **Priority:** P0 (Critical)
- Online feature store: Redis for real-time serving
- Offline feature store: S3/PostgreSQL for batch training
- Feature pipeline: transform raw events → ML-ready features
- Feature reuse across models
- Feature versioning
- Support real-time scoring with <10ms feature retrieval

### FR-008: Risk Engine
- **Priority:** P0 (Critical)
- Phase 1: Rule-based risk scoring
  - Configurable rule sets per merchant
  - Velocity rules (transaction frequency thresholds)
  - Device reuse rules
  - Behavioral anomaly rules
- Phase 2: ML-based scoring (LightGBM)
- Risk score output: 0.0 - 1.0 with decision (ALLOW, REVIEW, BLOCK)
- Rule management dashboard

### FR-009: Fraud Graph
- **Priority:** P1 (High)
- Graph database: Neo4j (primary) or Amazon Neptune
- Entity types: Device, Account, MSISDN, IP, Merchant
- Relationship types: USED_BY, LOGGED_IN_FROM, PURCHASED_AT, LINKED_TO
- Cross-merchant device detection (core IP/moat)
- Real-time graph queries for fraud scoring
- Account farming detection via connected components analysis
- Example query: Find devices connected to >3 accounts across multiple merchants

### FR-010: Decision API
- **Priority:** P0 (Critical)
- RESTful API for real-time risk decisions
- Response time: <200ms (p99)
- Response payload: risk_score, decision (ALLOW/REVIEW/BLOCK), signals (contributing factors), session_id
- API key authentication per merchant
- Rate limiting per tier
- Webhook support for async notifications

### FR-011: Dashboard
- **Priority:** P1 (High)
- Fraud rate monitoring
- Real-time event stream visualization
- Rule management interface
- Device network visualization
- Merchant-specific analytics
- Alert configuration

---

## 5. Non-Functional Requirements

### NFR-001: Performance
- Decision API response time: <200ms (p99)
- Event ingestion throughput: 10,000 events/second minimum
- Feature Store retrieval: <10ms
- Graph query response: <100ms for 2-hop queries

### NFR-002: Availability
- Uptime SLA: 99.9%
- Automatic failover for all critical components
- Multi-AZ deployment
- Graceful degradation: if Feature Store is down, fall back to rule-based scoring only

### NFR-003: Scalability
- Support 10,000 concurrent users
- Horizontal scaling for Event Collector and Risk Engine
- Support 50M+ events/month per Growth tier merchant
- Graph database should handle 100M+ nodes

### NFR-004: Security
- KVKK (Turkish GDPR) compliance
- Data encryption at rest and in transit
- API key rotation support
- Audit logging for all administrative actions
- PII handling: hash MSISDN, anonymize device fingerprints for cross-merchant sharing
- Early legal counsel on data processing

### NFR-005: Data Retention
- Raw events: 90 days
- Aggregated features: 1 year
- Graph relationships: indefinite (core asset)
- Audit logs: 3 years

---

## 6. Revenue Model / Tiers

| Tier | Platform Fee | Event Fee | Risk Score Fee | Event Limit | Features |
|---|---|---|---|---|---|
| Startup | $500/mo | $0.002/event | Included | 5M/mo | Core detection, REST API, Dashboard |
| Growth | $2,000/mo | $0.001/event | $0.003/risk check | 50M/mo | + Behavioral signals, Fraud graph, SLA |
| Enterprise | Custom | Rev-share | Separate SLA | Unlimited | + Custom ML, On-prem, Dedicated support |

---

## 7. Phased Roadmap

### Phase 1 — MVP: Core Detection
- Device fingerprint
- Proxy detection
- Velocity rules
- Basic behavioral signals
- Rule-based risk scoring
- Fraud rate dashboard
- Device reuse detection
- Aggregator telco signal (Payguru)
- Feature Store infrastructure (Redis online)

### Phase 2 — ML: Intelligence Layer
- LightGBM risk model
- Sensor entropy analysis
- Browser entropy detection
- Affiliate fraud detection
- Traffic anomaly ML
- Advanced bot fingerprinting
- Real-time graph queries

### Phase 3 — Network: Global Moat
- Cross-merchant device blacklist
- Global device network
- Direct telco integration
- Network effect scoring
- Regional expansion (ME / Africa / LATAM)

---

## 8. Go-To-Market Strategy

1. **Payguru** (Anchor Customer) — Telco billing aggregator. Fast integration, real fraud data, reference case. Data-sharing agreement critical for ML training data.
2. **Papara / iyzico** — Wallet and payment gateway. High account farming + bot fraud need.
3. **Peak Games** — Bot purchases, fake in-app transactions. Good data source for network effect.
4. **Regional Expansion** — TR references → ME/Africa/LATAM. Fraud graph cross-region value.

---

## 9. Critical Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Cold start / insufficient data | CRITICAL | Anchor customer data-sharing deal. Rule-based for 3-6 months before ML. |
| Telco integration delay | MEDIUM | Aggregator-first approach (Payguru) |
| Scope creep | HIGH | Limit Phase 1 to Wallet + Telco only |
| Major competitor entry (Sardine, Sift) | MEDIUM | Local network effect moat, TR reference. 18-24 month window. |
| KVKK / data processing compliance | MEDIUM | Early legal counsel |

---

## 10. Competitive Landscape

| Company | Strength | Telco | Wallet | Behavioral | EM Coverage | Valuation |
|---|---|---|---|---|---|---|
| Evina | Telco billing fraud | Strong | No | No | Partial | ~$100M |
| Sardine | Fintech/crypto fraud | No | Partial | Yes | Weak | ~$250M |
| Sift | Marketplace/e-comm | No | No | Partial | Weak | ~$1B |
| FingerprintJS | Device intelligence | No | No | No | Weak | ~$1B |
| ThreatMetrix | Identity/device network | No | Partial | Partial | Weak | LexisNexis |
| Stripe Radar | Card payments | No | No | Partial | Weak | Stripe bundle |
| **SignalRisk** | **Wallet+Telco+Behavioral** | **Phase 1** | **Phase 1** | **Phase 1** | **TR→EM** | **Target** |

**Key Differentiator:** Sardine is the most dangerous competitor if they pivot to emerging markets. SignalRisk has an 18-24 month window to establish TR network effect.

---

## 11. MVP Team Requirements

| Role | Responsibility |
|---|---|
| Backend Engineer | API, event pipeline, rule engine, Feature Store infra |
| SDK Engineer (Critical) | iOS, Android, Web JS, device fingerprint, behavioral signals |
| Data Engineer | Fraud graph (Neo4j), event storage, data pipeline |
| Fraud Scientist | Rule design, labeled data, Phase 2 ML preparation |

**Note:** SDK Engineer is the most critical hire — SDK is the data collection point. Its quality affects the entire detection pipeline.

---

## 12. Tech Stack

- **Language:** TypeScript
- **Framework:** NestJS
- **Database:** PostgreSQL (primary), Redis (Feature Store online), Neo4j (Fraud Graph)
- **Message Queue:** Kafka (event streaming)
- **Infrastructure:** Docker, Kubernetes
- **ML (Phase 2):** LightGBM, Python (model training), Feature Store (Feast)
- **Monitoring:** Grafana, Prometheus
- **Cloud:** AWS or GCP (multi-AZ)

---

## 13. User Stories (Phase 1 MVP)

### US-001: As a merchant, I want to integrate SignalRisk SDK into my mobile app so that fraud signals are collected automatically.
**Acceptance Criteria:**
- SDK available for iOS (Swift), Android (Kotlin), Web (JavaScript)
- Integration requires <10 lines of code
- SDK starts collecting events on initialization
- Events are batched and sent asynchronously

### US-002: As a merchant, I want to call the Decision API before processing a transaction so that I get a real-time fraud risk assessment.
**Acceptance Criteria:**
- API returns risk_score (0-1), decision (ALLOW/REVIEW/BLOCK), and contributing signals
- Response time <200ms
- API authenticated via API key

### US-003: As a fraud analyst, I want to view a dashboard showing fraud rates and patterns so that I can monitor and tune detection rules.
**Acceptance Criteria:**
- Dashboard shows real-time fraud rate by merchant
- Shows top fraud signals and their frequency
- Allows drill-down into individual sessions
- Shows device reuse patterns

### US-004: As a fraud analyst, I want to configure velocity rules so that I can block transactions exceeding frequency thresholds.
**Acceptance Criteria:**
- UI for creating/editing velocity rules
- Rules support: max transactions per device per hour/day, max accounts per device, max MSISDN reuse
- Rules can be enabled/disabled per merchant

### US-005: As a merchant, I want to detect device farming so that fake accounts are blocked before they transact.
**Acceptance Criteria:**
- System detects when same device fingerprint creates multiple accounts
- Alert generated when threshold exceeded
- Device trust score decreases with multiple account associations

### US-006: As a fraud analyst, I want to see cross-merchant device relationships so that I can identify organized fraud rings.
**Acceptance Criteria:**
- Graph visualization showing device-account-merchant relationships
- Highlight devices associated with known fraud across multiple merchants
- Export suspicious device lists

### US-007: As a system, I want to collect telco signals from aggregators so that carrier billing fraud can be detected.
**Acceptance Criteria:**
- Integration with Payguru API for MSISDN prefix, carrier, subscription velocity
- Geo mismatch detection (IP country vs MSISDN country)
- Telco signals feed into risk scoring

### US-008: As a system, I want to distinguish human sessions from bot sessions using behavioral biometrics.
**Acceptance Criteria:**
- Classify sessions as human/bot based on typing cadence, scroll entropy, timing patterns
- Bot sessions flagged in real-time
- Accuracy target: >90% bot detection rate with <1% false positive on humans
