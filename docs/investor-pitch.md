# SignalRisk — Investor Pitch Deck

---

## Slide 1: Title

**SignalRisk**
Real-time Fraud Intelligence for Emerging Markets

*The only platform combining telco, device, and behavioral signals in a single API — purpose-built for wallet and carrier billing fraud.*

---

## Slide 2: Problem

### $32B+ Annual Fraud Loss in Emerging Market Digital Payments

- Mobile wallet fraud growing 45% YoY in Turkey, ME, Africa, LATAM
- Carrier billing fraud (fake subscriptions, bot purchases) has no dedicated solution
- Account farming and SIM swap fraud are rampant in telco-connected payments

**Western solutions don't work here:**
- Stripe Radar, Riskified, Sift → optimized for card payments and e-commerce
- No coverage for telco billing, wallet fraud, or gaming-specific patterns
- Lack local telco signal integration
- Pricing models don't fit emerging market unit economics

---

## Slide 3: Solution

### SignalRisk: Three Signal Layers, One API, <200ms

```
   TELCO SIGNALS          DEVICE SIGNALS         BEHAVIORAL SIGNALS
   ─────────────          ──────────────         ──────────────────
   Carrier verification   Fingerprinting         Typing cadence
   MSISDN validation      Reputation scoring     Scroll entropy
   SIM swap detection     Farm/emulator detect   Bot classification
   Subscription velocity  Cross-account reuse    Session risk scoring
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                          ┌──────▼──────┐
                          │  SignalRisk  │
                          │  Decision   │
                          │  Engine     │
                          └──────┬──────┘
                                 │
                        Risk Score + Explanation
                        ALLOW / REVIEW / BLOCK
```

**Single API call** returns risk score (0.0-1.0) + decision + human-readable risk factors — all in <200ms.

---

## Slide 4: Why Now

1. **Mobile wallet explosion** — Turkey: Papara (15M+ users), Param, Tosla; Africa: M-Pesa, Flutterwave; LATAM: Mercado Pago, PicPay
2. **Carrier billing growth** — In-app purchases, subscriptions, gaming top-ups via phone bill
3. **Regulatory pressure** — KVKK (Turkey), NDPR (Nigeria), LGPD (Brazil) require localized fraud solutions
4. **No incumbent** — 18-24 month window before Western players adapt to these verticals

---

## Slide 5: Competitive Moat

### No Competitor Combines All Three

| | Telco | Device | Behavioral | Emerging Market Focus |
|---|:---:|:---:|:---:|:---:|
| Evina | ● | ○ | ○ | Partial |
| FingerprintJS | ○ | ● | ○ | No |
| Sift | ○ | △ | ● | No |
| Sardine | ○ | ● | ● | No |
| **SignalRisk** | **●** | **●** | **●** | **Yes** |

**Defensible moats:**
- **Data network effect** — Cross-merchant fraud graph grows with each customer. Device seen committing fraud at Merchant A is flagged at Merchant B.
- **Telco integration** — Direct carrier API partnerships are slow to build (6-18 months), creating high switching costs.
- **Local expertise** — Purpose-built for emerging market fraud patterns (carrier billing, MSISDN-based identity, device farming).

---

## Slide 6: Product

### Developer-First API + Analyst-Focused Dashboard

**For Developers:**
- SDKs: iOS (Swift), Android (Kotlin), Web (JavaScript)
- REST API with OpenAPI 3.0 spec
- Webhook support for async fraud notifications
- <100KB web SDK, async non-blocking integration

**For Fraud Analysts:**
- Real-time fraud operations dashboard
- Case management with SLA tracking and escalation
- Rule editor with DSL, simulation, and staged rollout
- Device reputation explorer and velocity heatmaps
- Full audit trail and RBAC

---

## Slide 7: Technology

### Built for Scale and Speed

| | |
|---|---|
| **<200ms** | End-to-end decision latency (p99) |
| **10,000** | Concurrent API connections |
| **99.9%** | Uptime SLA with graceful degradation |
| **10K eps** | Event throughput platform-wide |
| **<10ms** | Feature store retrieval (p95) |

**Architecture:** Event-driven microservices (TypeScript/NestJS), Kafka for streaming, PostgreSQL with row-level security for multi-tenancy, Redis Cluster for real-time features, Neo4j for fraud graph.

**Security:** OAuth2 + mTLS, AES-256 encryption, Argon2id PII protection, KVKK/GDPR compliant, annual pentests.

---

## Slide 8: Business Model

### SaaS + Usage-Based Pricing

| Tier | Monthly Fee | Per-Event | Target |
|------|------------|-----------|--------|
| **Startup** | $500 | $0.002 | Early-stage wallets, small merchants |
| **Growth** | $2,000 | $0.001 + $0.003/risk check | Mid-size platforms, gaming companies |
| **Enterprise** | Custom | Revenue share | Large wallets, telcos, payment gateways |

**Unit economics example (Growth tier):**
- Merchant with 20M events/month + 5M risk checks/month
- Revenue: $2,000 + $20,000 + $15,000 = **$37,000/month**
- Gross margin target: **80%+** (infrastructure costs scale sub-linearly)

**Expansion revenue:** Customers naturally upgrade tiers as transaction volume grows. Cross-merchant fraud graph creates network-effect lock-in.

---

## Slide 9: Go-To-Market

### Land in Turkey, Expand to Emerging Markets

**Phase 1 — Turkey (Month 1-8)**
- Aggregator partnerships: Payguru, Fortumo/Boku
- Anchor customers: Papara (wallet), Peak Games (gaming), iyzico (payments)
- Revenue target: 3-5 paying customers

**Phase 2 — Regional (Month 9-14)**
- Middle East: UAE, Saudi Arabia
- Africa: Nigeria, Kenya, South Africa
- LATAM: Brazil, Mexico
- Leverage Turkey case studies and cross-merchant fraud graph as selling point

**Sales motion:**
- Developer-led growth (SDK integration, free tier/trial)
- Head of Risk / Head of Fraud as buyer
- POC → paid conversion within 30 days

---

## Slide 10: Roadmap

```
PHASE 1 (Month 1-4)                    PHASE 2 (Month 5-8)
────────────────────                    ────────────────────
✓ SDK (iOS/Android/Web)                 ML Model (LightGBM + SHAP)
✓ Device Intelligence                   Fraud Graph (Neo4j)
✓ Velocity Engine                       Model Governance
✓ Behavioral Signals                    Advanced Emulator Detection
✓ Rule Engine (DSL)                     A/B Testing Framework
✓ Decision API                          2nd Aggregator Integration
✓ Dashboard + Case Mgmt
✓ Telco (1 aggregator)

PHASE 3 (Month 9-14)
────────────────────
Cross-Merchant Fraud Graph
Direct Telco Integration
SIM Swap Detection
Regional Expansion (ME/Africa/LATAM)
```

---

## Slide 11: Team (Template)

*[Team bios to be added]*

**Key roles needed:**
- CEO/Founder — Domain expertise in fraud/payments
- CTO — Platform architecture, ML
- Head of Fraud Science — Rule tuning, ML models
- Head of Sales — Enterprise sales in Turkey/ME

---

## Slide 12: The Ask

### Seed Round: $[X]M

**Use of funds:**
- 50% — Engineering (team of [X], infrastructure)
- 20% — Go-to-market (sales, partnerships, marketing)
- 15% — Data & ML (fraud scientists, labeled datasets, model training)
- 15% — Operations (compliance, legal, office)

**Milestones to Series A:**
- 5+ paying customers in Turkey
- $[X]K MRR
- Cross-merchant fraud graph live
- ML model in production with measurable lift over rules
- 1 regional expansion market entered

---

## Slide 13: Why SignalRisk Wins

1. **Only player combining telco + device + behavioral** — no competitor has all three
2. **Purpose-built for emerging markets** — not a Western solution retrofitted
3. **Network effect moat** — fraud graph gets more valuable with every merchant
4. **Developer experience** — single API, <200ms, clear risk explanations
5. **18-24 month window** — before Western incumbents can adapt

**The opportunity:** Become the Stripe Radar of emerging market digital payments — but smarter, because we see signals they can't.
