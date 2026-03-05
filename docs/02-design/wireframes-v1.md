# SignalRisk — Wireframes v1

> DESIGN Phase, Iteration 1
> B2B Fraud Intelligence Dashboard + SDK Developer Portal

---

## 1. Information Architecture

```
SignalRisk Dashboard
├── Overview (Home)
│   ├── KPI Cards (fraud rate, blocked txns, active devices, avg latency)
│   ├── Real-time Event Stream
│   └── Fraud Trend Chart (24h / 7d / 30d)
├── Cases
│   ├── Case Queue (NEW / ASSIGNED / INVESTIGATING)
│   ├── Case Detail
│   │   ├── Evidence Timeline
│   │   ├── Device Reputation Card
│   │   ├── Session Replay (events)
│   │   └── Resolution Panel
│   └── Resolved Cases (Archive)
├── Rules
│   ├── Rule List (active / inactive / draft)
│   ├── Rule Editor (DSL + visual)
│   ├── Rule Simulator
│   └── Rule Version History
├── Devices
│   ├── Device Search
│   ├── Device Detail (reputation, linked accounts, txn history)
│   └── Device Farm Clusters
├── Analytics
│   ├── Fraud by Type
│   ├── Fraud by Merchant
│   ├── Velocity Heatmap
│   ├── Signal Effectiveness
│   └── Model Performance (Phase 2)
├── Settings
│   ├── Merchant Config
│   ├── Webhook Management
│   ├── API Keys (dev/staging)
│   ├── Team & RBAC
│   ├── Alert Rules
│   └── Consent Config
└── Developer Portal
    ├── Quick Start Guide
    ├── SDK Integration
    ├── API Reference
    └── Webhook Testing
```

---

## 2. Screen Wireframes

### 2.1 Overview / Home

```
┌─────────────────────────────────────────────────────────────┐
│  [SignalRisk Logo]           Search [____]    [Alerts 🔔] [U]│
├─────────┬───────────────────────────────────────────────────┤
│         │                                                    │
│ Overview│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────┐ │
│ Cases   │  │ Fraud    │ │ Blocked  │ │ Active   │ │ Avg   │ │
│ Rules   │  │ Rate     │ │ Txns     │ │ Devices  │ │Latency│ │
│ Devices │  │ 2.3% ▼   │ │ 1,234 ▲  │ │ 45,678   │ │ 42ms  │ │
│ Analytics│ └──────────┘ └──────────┘ └──────────┘ └───────┘ │
│ Settings│                                                    │
│ DevPortal│ ┌────────────────────────────────────────────────┐│
│         │  │         Fraud Trend (7 day)                    ││
│         │  │    ╱╲                                          ││
│         │  │   ╱  ╲    ╱╲                                   ││
│         │  │  ╱    ╲  ╱  ╲___╱╲                             ││
│         │  │ ╱      ╲╱        ╲                             ││
│         │  │  [24h] [7d] [30d] [custom]                     ││
│         │  └────────────────────────────────────────────────┘│
│         │                                                    │
│         │  ┌────────────────────────────────────────────────┐│
│         │  │  Real-time Event Stream              [Pause]   ││
│         │  │  ─────────────────────────────────────────     ││
│         │  │  12:04:32  BLOCK  device_reuse+vpn   TR 0.92  ││
│         │  │  12:04:31  ALLOW  clean              TR 0.12  ││
│         │  │  12:04:30  REVIEW velocity_breach    TR 0.71  ││
│         │  │  12:04:28  BLOCK  behavioral_bot     DE 0.95  ││
│         │  │  12:04:27  ALLOW  clean              TR 0.08  ││
│         │  └────────────────────────────────────────────────┘│
└─────────┴───────────────────────────────────────────────────┘
```

### 2.2 Case Queue

```
┌─────────────────────────────────────────────────────────────┐
│  Cases                                [+ New Filter] [Export]│
├─────────────────────────────────────────────────────────────┤
│  Status: [All ▼]  Priority: [All ▼]  Assigned: [All ▼]     │
│  Date Range: [Last 7 days ▼]         [🔍 Search cases...]   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ☐ │ Case ID     │ Risk  │ Signals        │ Device    │ SLA │
│  ──┼─────────────┼───────┼────────────────┼───────────┼─────│
│  ☐ │ #C-1042     │ 0.92  │ reuse+vpn      │ iPhone 15 │ 🔴  │
│    │ NEW         │ BLOCK │ 3 accounts     │ farm:yes  │ 2h  │
│  ──┼─────────────┼───────┼────────────────┼───────────┼─────│
│  ☐ │ #C-1041     │ 0.78  │ velocity+bot   │ Android   │ 🟡  │
│    │ ASSIGNED    │ REVIEW│ 12 txn/hr      │ emul:no   │ 4h  │
│  ──┼─────────────┼───────┼────────────────┼───────────┼─────│
│  ☐ │ #C-1040     │ 0.85  │ farm_detected  │ Pixel 8   │ 🟢  │
│    │ INVESTIGATING│ BLOCK│ 8 accounts     │ farm:yes  │ 6h  │
│                                                              │
│  [☐ Select All]  [Bulk: Assign ▼] [Bulk: Resolve ▼]        │
│                                                              │
│  Showing 1-25 of 342 cases          [← 1 2 3 4 ... 14 →]   │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 Case Detail

```
┌─────────────────────────────────────────────────────────────┐
│  ← Back to Cases    Case #C-1042         Status: NEW        │
│                                          Priority: HIGH      │
├──────────────────────────────┬──────────────────────────────┤
│                              │                              │
│  EVIDENCE TIMELINE           │  DEVICE REPUTATION           │
│  ─────────────────           │  ──────────────────          │
│  12:04:32 Decision: BLOCK    │  Trust Score: 0.15 🔴        │
│  12:04:31 Risk Score: 0.92   │  First Seen: 2 days ago      │
│  12:04:30 Signals detected:  │  Txn Count: 47               │
│    • device_reuse (w: 0.3)   │  Fraud Ratio: 0.34           │
│    • vpn_detected (w: 0.2)   │  Accounts: 5                 │
│    • velocity (w: 0.2)       │  Emulator: NO                │
│  12:04:28 Session start      │  ADB: NO                     │
│  12:04:15 Page: /checkout    │  Farm Score: 0.82            │
│  12:04:02 Page: /cart        │                              │
│  12:03:45 Page: /product/123 │  VELOCITY                    │
│  12:03:30 Session created    │  ──────────                  │
│    session_age: 62s          │  Txn/hr: 12 (threshold: 5)   │
│    time_to_purchase: 62s     │  Txn/day: 47 (threshold: 20) │
│                              │  OTP/hr: 3                   │
│  SESSION SIGNALS             │                              │
│  ───────────────             │  LINKED ACCOUNTS             │
│  typing_cadence: 0.92 (bot)  │  ──────────────              │
│  scroll_entropy: 0.15 (low)  │  user_123 (active)           │
│  navigation: linear          │  user_456 (suspended)        │
│  click_dist: concentrated    │  user_789 (active)           │
│                              │  user_012 (new, 1h ago)      │
│                              │  user_345 (new, 2h ago)      │
├──────────────────────────────┴──────────────────────────────┤
│  RESOLUTION                                                  │
│  ──────────                                                  │
│  Decision: [Fraud Confirmed ▼]                               │
│  Reason:   [Device Farm ▼]                                   │
│  Notes:    [5 accounts on same device, velocity breach___]   │
│  Action:   [Block Device] [Block All Accounts] [Escalate]    │
│                                                              │
│  [Resolve Case]                              [Escalate →]    │
└─────────────────────────────────────────────────────────────┘
```

### 2.4 Rule Editor

```
┌─────────────────────────────────────────────────────────────┐
│  Rules → New Rule                           [Save Draft]     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Rule Name: [Device Farm Detection v2          ]             │
│  Description: [Block devices with multiple accounts + geo___]│
│  Status: [Draft ▼]    Priority: [1-100: 80]                 │
│                                                              │
│  ┌── RULE DSL ──────────────────────────────────────────┐   │
│  │                                                       │   │
│  │  IF device_accounts > 3                               │   │
│  │  AND ip_country != msisdn_country                     │   │
│  │  AND device_fraud_ratio > 0.2                         │   │
│  │  THEN risk += 0.4                                     │   │
│  │                                                       │   │
│  │  IF device_accounts > 5                               │   │
│  │  AND device_age < 24h                                 │   │
│  │  THEN BLOCK                                           │   │
│  │                                                       │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  [Visual Editor]  [DSL Editor]  [Validate ✓]                │
│                                                              │
│  ┌── AVAILABLE SIGNALS ─────────────────────────────────┐   │
│  │  Device: device_accounts, device_age, device_fraud_   │   │
│  │          ratio, device_velocity, device_trust_score   │   │
│  │  Velocity: txn_per_ip, txn_per_device, txn_per_      │   │
│  │            msisdn, otp_per_device, acct_per_ip       │   │
│  │  Behavioral: typing_cadence, scroll_entropy,          │   │
│  │              session_age, time_to_purchase            │   │
│  │  Network: ip_country, proxy_detected, vpn_detected   │   │
│  │  Telco: msisdn_country, carrier, subscription_vel    │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌── SIMULATION ────────────────────────────────────────┐   │
│  │  Test against: [Last 7 days ▼]    [Run Simulation]   │   │
│  │                                                       │   │
│  │  Results: 2,345 transactions matched                  │   │
│  │  Would have blocked: 234 (10%)                        │   │
│  │  Known fraud caught: 198 / 210 (94.3%)               │   │
│  │  False positives: 36 (1.5%)                           │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  [Cancel]  [Save Draft]  [Activate Rule]                     │
└─────────────────────────────────────────────────────────────┘
```

### 2.5 Device Detail

```
┌─────────────────────────────────────────────────────────────┐
│  Devices → fp_a1b2c3d4e5f6                                  │
├──────────────────────────────┬──────────────────────────────┤
│                              │                              │
│  DEVICE INFO                 │  REPUTATION HISTORY          │
│  ───────────                 │  ──────────────────          │
│  Fingerprint: a1b2c3...f6   │  Trust Score Over Time:      │
│  Type: iPhone 15 Pro         │  1.0 ┤                      │
│  OS: iOS 18.2                │  0.5 ┤──╲                   │
│  First Seen: 2026-02-28      │  0.0 ┤    ╲___╱╲___        │
│  Last Seen: 2026-03-05       │      └──────────────→       │
│  Farm Score: 0.82 🔴         │       Feb    Mar            │
│  Emulator: NO                │                              │
│  ADB: NO                     │  VELOCITY (24h)              │
│  GPU: Apple A17 Pro          │  ────────────                │
│  Sensor Noise: Normal        │  Txn/hr:  ████████ 12       │
│                              │  OTP/hr:  ███ 3              │
│  LINKED ACCOUNTS (5)         │  Acct/day: █████████████ 5   │
│  ────────────────            │                              │
│  user_123  Active   TR       │  TRANSACTION HISTORY         │
│  user_456  Suspended TR      │  ────────────────────        │
│  user_789  Active   TR       │  12:04 Purchase $12 → BLOCK  │
│  user_012  New      DE       │  11:58 OTP Request  → OK     │
│  user_345  New      TR       │  11:45 Purchase $8  → REVIEW │
│                              │  11:30 Login        → OK     │
│                              │  11:15 Register     → OK     │
└──────────────────────────────┴──────────────────────────────┘
```

### 2.6 Analytics — Velocity Heatmap

```
┌─────────────────────────────────────────────────────────────┐
│  Analytics → Velocity Heatmap       [24h] [7d] [30d]        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Transactions per Hour by Device                             │
│                                                              │
│  Hour: 00 02 04 06 08 10 12 14 16 18 20 22                 │
│  Mon   ░░ ░░ ░░ ░░ ▒▒ ▓▓ ██ ██ ▓▓ ▒▒ ░░ ░░               │
│  Tue   ░░ ░░ ░░ ░░ ▒▒ ▓▓ ██ ▓▓ ▓▓ ▒▒ ░░ ░░               │
│  Wed   ░░ ░░ ░░ ░░ ▒▒ ██ ██ ██ ▓▓ ▒▒ ░░ ░░               │
│  Thu   ░░ ░░ ░░ ▒▒ ▓▓ ██ ██ ██ ██ ▓▓ ▒▒ ░░               │
│  Fri   ░░ ░░ ░░ ▒▒ ▓▓ ██ ██ ██ ▓▓ ▒▒ ░░ ░░               │
│  Sat   ░░ ░░ ░░ ░░ ▒▒ ▓▓ ▓▓ ▓▓ ▒▒ ░░ ░░ ░░               │
│  Sun   ░░ ░░ ░░ ░░ ░░ ▒▒ ▓▓ ▒▒ ▒▒ ░░ ░░ ░░               │
│                                                              │
│  ░ Low  ▒ Medium  ▓ High  █ Peak (anomaly threshold)       │
│                                                              │
│  Top Velocity Breaches (7d):                                │
│  ┌────────────┬──────────┬──────────┬───────┐               │
│  │ IP/Device  │ Txn/hr   │ Threshold│ Status│               │
│  │ 192.168.x  │ 45       │ 10       │ BLOCK │               │
│  │ fp_d4e5f6  │ 38       │ 5        │ BLOCK │               │
│  │ 10.0.x.x   │ 22       │ 10       │ REVIEW│               │
│  └────────────┴──────────┴──────────┴───────┘               │
└─────────────────────────────────────────────────────────────┘
```

### 2.7 Developer Portal — SDK Quick Start

```
┌─────────────────────────────────────────────────────────────┐
│  Developer Portal                                            │
├─────────┬───────────────────────────────────────────────────┤
│         │                                                    │
│ Quick   │  # Quick Start                                    │
│  Start  │                                                    │
│ SDK     │  Get fraud detection running in 5 minutes.        │
│  Docs   │                                                    │
│ API     │  ## 1. Install SDK                                │
│  Ref    │  ```                                              │
│ Webhooks│  npm install @signalrisk/web-sdk                  │
│ Testing │  ```                                              │
│         │                                                    │
│         │  ## 2. Initialize                                  │
│         │  ```javascript                                     │
│         │  import { SignalRisk } from '@signalrisk/web-sdk'; │
│         │                                                    │
│         │  SignalRisk.init({                                 │
│         │    merchantId: 'your-merchant-id',                │
│         │    consent: {                                      │
│         │      device: true,                                │
│         │      behavioral: true                              │
│         │    }                                               │
│         │  });                                               │
│         │  ```                                              │
│         │                                                    │
│         │  ## 3. Check Risk Before Purchase                  │
│         │  ```javascript                                     │
│         │  const result = await SignalRisk.checkRisk({       │
│         │    event: 'purchase',                              │
│         │    amount: 29.99,                                  │
│         │    currency: 'TRY'                                │
│         │  });                                               │
│         │                                                    │
│         │  if (result.decision === 'BLOCK') {               │
│         │    // Handle blocked transaction                   │
│         │  }                                                │
│         │  ```                                              │
│         │                                                    │
│         │  ## 4. Response                                    │
│         │  ```json                                          │
│         │  {                                                │
│         │    "risk_score": 0.82,                            │
│         │    "decision": "BLOCK",                            │
│         │    "risk_factors": [                               │
│         │      {"signal":"device_reuse","weight":0.3},      │
│         │      {"signal":"vpn_detected","weight":0.2}       │
│         │    ]                                              │
│         │  }                                                │
│         │  ```                                              │
│         │                                                    │
│         │  Time to first event: ~5 minutes                  │
└─────────┴───────────────────────────────────────────────────┘
```

---

## 3. User Flows

### 3.1 Fraud Analyst — Case Triage Flow
```
Login → Overview Dashboard → See alert badge on Cases
  → Cases Queue (filtered: NEW, sorted by SLA)
    → Click case #C-1042
      → Review Evidence Timeline (signals, session events)
      → Check Device Reputation Card (trust score, linked accounts)
      → Check Velocity panel (txn/hr breach)
      → Decision: [Fraud Confirmed] + Reason: [Device Farm]
      → Action: [Block Device] + [Block All Linked Accounts]
      → [Resolve Case]
    → Next case auto-loaded from queue
```
Target: < 2 minutes per case triage

### 3.2 Fraud Analyst — Rule Creation Flow
```
Rules → [+ New Rule]
  → Enter rule name + description
  → Write DSL or use visual builder:
      IF device_accounts > 3 AND ip_country != msisdn_country
      THEN risk += 0.4
  → [Validate] → syntax check passes
  → [Simulate] against last 7 days
    → Review: 94.3% fraud caught, 1.5% false positive
  → Adjust thresholds if needed
  → [Save Draft] → review with team
  → [Activate Rule] (requires Admin role)
```

### 3.3 Merchant Developer — SDK Integration Flow
```
Developer Portal → Quick Start
  → Copy npm install command
  → Copy init snippet → paste in app
  → Set consent config
  → Deploy to staging
  → Check Dashboard → see first events arriving
  → Copy checkRisk() snippet → add before purchase
  → Test with sample transactions
  → See risk scores in Dashboard → integration complete
```
Target: < 30 minutes to first event

### 3.4 Admin — Alert Configuration Flow
```
Settings → Alert Rules
  → [+ New Alert]
    → Condition: fraud_rate > 5% for 15 minutes
    → Channel: [Slack] + [Email]
    → Recipients: fraud-team channel, analyst@merchant.com
    → [Save Alert]
  → Alert triggers → notification sent → analyst navigates to Cases
```

---

## 4. Responsive Behavior

| Viewport | Layout | Notes |
|----------|--------|-------|
| Desktop (>1280px) | Full sidebar + 2-column content | Primary usage |
| Tablet (768-1280px) | Collapsible sidebar, single column | Supported |
| Mobile (<768px) | Bottom nav, card-based layout | View-only (no case resolution on mobile) |

Primary target: Desktop — fraud analysts work on large screens.

---

## 5. Accessibility Requirements

- WCAG 2.1 AA compliance minimum
- Color contrast ratio ≥ 4.5:1 for all text
- Keyboard navigable (all actions reachable via Tab/Enter/Escape)
- Screen reader labels on all interactive elements
- Risk scores visualized with color AND text/icon (not color alone)
- Focus indicators visible on all interactive elements
