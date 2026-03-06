# SignalRisk — Real-Time Fraud Detection

Real-time fraud decision engine for wallet and carrier billing platforms. Processes 5,000+ events/sec with p99 < 100ms.

## Quick Start

```bash
# Clone and install
git clone https://github.com/signalrisk/signalrisk.git
cd signalrisk
npm install

# Start all services (requires Docker)
docker-compose up -d

# Run compliance check
bash scripts/compliance-check.sh

# Run all tests
npm run test:all
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| auth-service | 3001 | JWT + API key auth, rate limiting |
| event-collector | 3000 | Event ingestion, Kafka publishing |
| decision-service | 3002 | Fraud scoring orchestrator |
| device-intel | 3003 | Device fingerprint analysis |
| velocity-engine | 3004 | Transaction velocity counters |
| behavioral-service | 3005 | ML-based behavioral biometrics |
| network-intel | 3006 | IP reputation, bot detection |
| telco-intel | 3007 | Phone number risk scoring |
| graph-intel | 3012 | Neo4j fraud ring detection |
| rule-engine | 3008 | DSL-based fraud rules, hot-reload |
| case-service | 3010 | Case management |
| webhook-service | 3011 | HMAC-SHA256 webhook delivery |
| feature-flag | 3013 | Feature flags, rule rollout |

---

**Real-time fraud decision engine for wallet and carrier billing platforms.**

The only fraud intelligence platform purpose-built for emerging market wallet and carrier billing fraud — combining device, behavioral, and telco signals in a single API.

---

## Problem

Western fraud solutions (Stripe Radar, Riskified, Sift) are optimized for card payments and e-commerce. No strong global player exists for telco billing, wallet, and gaming payments specific to emerging markets. SignalRisk fills this gap.

## Core Moat: Telco + Device + Behavior

No competitor combines all three signal layers:

| Competitor | Telco | Device | Behavioral |
|-----------|-------|--------|------------|
| Evina | Yes | No | No |
| FingerprintJS | No | Yes | No |
| Sift | No | Weak | Yes |
| **SignalRisk** | **Yes** | **Yes** | **Yes** |

## Target Fraud Types

- **Account Farming** — Device farm + fake accounts
- **Fake Subscription** — Bot + stolen MSISDN
- **Bot Purchases** — Headless browser, device emulation
- **SIM Swap Fraud** — Social engineering + telco
- **Fake KYC** — Device farm + document forgery

---

## Architecture

```
Merchant SDK (iOS/Android/Web)
  → API Gateway (REST, OAuth2)
    → Event Collector (Kafka)
      → Intelligence Layer:
         - Device Intel (fingerprinting, reputation, farm detection)
         - Behavioral Intel (biometrics, session risk)
         - Network Intel (proxy/VPN, geo mismatch)
         - Telco Intel (carrier signals, MSISDN)
         - Velocity Engine (sliding window counters)
      → Feature Store (Redis Cluster)
      → Rule Engine (Merchant DSL)
      → Decision Engine (score + explain)
  → Decision API Response (<200ms p99)
```

### Key Architecture Decisions

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Language | TypeScript (NestJS) | Type safety, shared across services |
| Message Broker | Apache Kafka | High-throughput, replay, exactly-once |
| Primary DB | PostgreSQL 16 + RLS | Multi-tenant isolation, JSONB |
| Feature Store | Redis Cluster 7.x | <10ms p95 feature retrieval |
| Graph DB | Neo4j 5.x (Phase 2) | Device-account relationships |
| Frontend | React 18 + Tailwind | Recharts, Monaco Editor, Zustand |
| Auth | OAuth2 + mTLS (enterprise) | Token-scoped per merchant |
| Secrets | HashiCorp Vault | Dynamic secrets, rotation, audit |
| Orchestration | Kubernetes (EKS) | HPA auto-scaling, multi-AZ |
| CI/CD | GitHub Actions + ArgoCD | GitOps, policy-as-code gates |

### Architecture Style

- Event-driven microservices with CQRS
- Transactional outbox pattern (no dual-write)
- Idempotent Kafka consumers
- Shared-nothing multi-tenancy (PostgreSQL RLS, Redis key prefix, Kafka topic partitioning)

---

## Decision API Response

```json
{
  "risk_score": 0.82,
  "decision": "BLOCK",
  "risk_factors": [
    { "signal": "device_reuse", "weight": 0.3, "detail": "device seen on 5 accounts" },
    { "signal": "vpn_detected", "weight": 0.2, "detail": "commercial VPN proxy" },
    { "signal": "velocity_breach", "weight": 0.2, "detail": "15 txn/hour from device" },
    { "signal": "behavioral_bot", "weight": 0.12, "detail": "CV=0.05, linear timing" }
  ],
  "latency_ms": 45
}
```

---

## Platform Features

### Fraud Operations Dashboard
- Real-time event stream with WebSocket
- Case management with SLA tracking and escalation workflows
- Rule editor with DSL, simulation, conflict analysis, and staged rollout
- Device reputation and velocity heatmaps
- Alert inbox with acknowledge/snooze/escalate
- RBAC (Admin, Senior Analyst, Analyst, Viewer)
- Full audit trail

### Intelligence Modules
- **Device Intel** — Fingerprinting, reputation scoring, emulator/farm detection (ADB, sensor noise, GPU renderer, thermal state)
- **Velocity Engine** — Sliding window counters per IP/MSISDN/device/account, burst detection, exponential decay
- **Behavioral Intel** — Typing cadence, scroll entropy, session risk, bot classification
- **Network Intel** — Proxy/VPN detection, IP geolocation, ASN reputation, Tor exit nodes
- **Telco Intel** — Carrier lookup, MSISDN validation, SIM swap detection (Phase 3)

### Security & Compliance
- KVKK/GDPR compliant with granular consent framework
- PII protection: Argon2id (at-rest) + scoped HMAC-SHA256 (lookup tokens)
- Data encryption: AES-256 at rest, TLS 1.3 in transit
- Annual penetration testing, CVE scanning in CI/CD
- Right to erasure with full propagation (including model unlearning)

---

## Non-Functional Requirements

| Metric | Target |
|--------|--------|
| Decision API Latency | <200ms p99 |
| Concurrent Connections | 10,000 |
| Uptime SLA | 99.9% |
| Feature Store Retrieval | <10ms p95 |
| RTO | 15 minutes |
| RPO | 1 minute |
| Event Throughput | 10,000 events/sec platform-wide |

---

## Revenue Model

| Tier | Platform Fee | Event Fee | Event Limit | Features |
|------|-------------|-----------|-------------|----------|
| Startup | $500/mo | $0.002/event | 5M/mo | Core detection, REST API, Dashboard |
| Growth | $2,000/mo | $0.001/event | 50M/mo | + Behavioral, Fraud graph, SLA |
| Enterprise | Custom | Rev-share | Unlimited | + Custom ML, On-prem, mTLS, Dedicated support |

---

## Roadmap

### Phase 1 — MVP (Month 1-4)
SDK + Event Collector + Device Intel + Velocity Engine + Behavioral Signals + Network Intel + Rule Engine (DSL) + Decision API + Dashboard + Telco (1 aggregator) + OAuth2 + KVKK Consent

### Phase 2 — Intelligence (Month 5-8)
LightGBM ML model + SHAP explainability + Neo4j Fraud Graph + Advanced emulator detection + Model governance (champion/challenger) + A/B testing + 2nd aggregator + Differential privacy

### Phase 3 — Network Effect (Month 9-14)
Cross-merchant fraud graph + Cross-merchant device blacklist + Direct telco integration (Turkcell, Vodafone) + SIM swap detection + Regional expansion (ME / Africa / LATAM)

---

## Go-To-Market

1. **Aggregator partnerships** — Payguru (primary) + Fortumo/Boku (secondary)
2. **Papara / iyzico** — Wallet/payment gateway, high account farming need
3. **Peak Games** — Bot purchases, fake in-app transactions
4. **Regional expansion** — Turkey references → ME / Africa / LATAM

---

## Tech Stack

`TypeScript` `NestJS` `PostgreSQL` `Redis Cluster` `Apache Kafka` `Neo4j` `React` `Tailwind CSS` `Recharts` `Monaco Editor` `Docker` `Kubernetes` `Terraform` `GitHub Actions` `ArgoCD` `HashiCorp Vault` `Prometheus` `Grafana`

## SDLC Status

Current Phase: ARCHITECTURE

## Documentation

- [Architecture Overview](docs/architecture/system-overview.md)
- [API Reference](docs/dev/api-reference.md)
- [Getting Started](docs/dev/getting-started.md)
- [Disaster Recovery](docs/runbooks/disaster-recovery.md)
- [Load Testing](docs/runbooks/load-testing.md)
- [Go-Live Checklist](docs/runbooks/go-live-checklist.md)
- [PCI-DSS Scoping](docs/compliance/pci-dss-scoping.md)
- [GDPR Data Flow](docs/compliance/gdpr-data-flow.md)
- [Requirements v4](docs/01-requirements/requirements-v4.md)
- [Wireframes v3](docs/02-design/wireframes-v3.md)
- [Component Map v2](docs/02-design/component-map-v2.md)
- [Architecture v3](docs/03-architecture/architecture-v3.md)
