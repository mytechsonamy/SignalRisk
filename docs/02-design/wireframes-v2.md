# SignalRisk — Wireframes v2

> **Revision:** Addresses CRITICAL (color-only signaling, case resolution compliance) + all HIGH issues
> from v1 review. Added: Auth screens, Settings/RBAC, False Positive flow, Rule governance,
> Real-time resilience indicators, Developer Portal persona split, Notification center.

---

## 1. Information Architecture

```
SignalRisk Platform
├── Auth (unauthenticated)
│   ├── Login (email + password)
│   ├── MFA Verification (TOTP / SMS)
│   ├── Forgot Password
│   └── Password Reset
│
├── Operations Workspace (fraud analyst persona)
│   ├── Overview (Home)
│   │   ├── KPI Cards
│   │   ├── Real-time Event Stream
│   │   ├── Fraud Trend Chart
│   │   └── Connection Health Indicator
│   ├── Cases
│   │   ├── Case Queue
│   │   ├── Case Detail + Evidence Timeline
│   │   ├── Resolution Panel (with approval gate)
│   │   └── Resolved Cases Archive
│   ├── Rules
│   │   ├── Rule List
│   │   ├── Rule Editor (DSL + visual)
│   │   ├── Rule Simulator
│   │   ├── Rule Approval Queue
│   │   ├── Rule Version History + Diff
│   │   └── Rule Conflict Analyzer
│   ├── Devices
│   │   ├── Device Search
│   │   ├── Device Detail
│   │   └── Device Farm Clusters
│   ├── Analytics
│   │   ├── Fraud by Type
│   │   ├── Velocity Heatmap
│   │   ├── Signal Effectiveness
│   │   └── Model Performance (Phase 2)
│   ├── Alerts Inbox
│   │   ├── Alert List (filterable, acknowledgeable)
│   │   └── Alert Detail → Deep link to Case/Analytics
│   └── Settings
│       ├── Merchant Config (tiered by risk)
│       ├── Webhook Management
│       ├── Team & RBAC (invite, roles, permissions)
│       ├── Alert Configuration
│       ├── Consent Config
│       ├── Audit Log Viewer
│       └── Change Review (pending config changes)
│
└── Developer Portal (separate workspace)
    ├── Quick Start Guide
    ├── SDK Integration (iOS / Android / Web)
    ├── API Reference (OpenAPI)
    ├── Webhook Testing Sandbox
    └── API Key Management (dev/staging)
```

---

## 2. Design Principles

### Accessibility-First Signal Design
All risk/status indicators use **color + icon + text** — never color alone:
- `BLOCK` → 🔴 Red + ⛔ icon + "BLOCK" text
- `REVIEW` → 🟠 Orange + ⚠️ icon + "REVIEW" text
- `ALLOW` → 🟢 Green + ✓ icon + "ALLOW" text
- Risk scores: color band + numeric value always visible (e.g., "0.82 HIGH")
- SLA: color dot + time remaining text + icon (⏰ warning, ❌ breached)

### Data Freshness
Every data panel shows `Last updated: X seconds ago` + connection status indicator:
- 🟢 Connected (live WebSocket)
- 🟡 Reconnecting... (auto-retry)
- 🔴 Disconnected (manual reconnect button + stale data banner)

---

## 3. Auth Screens

### 3.1 Login

```
┌─────────────────────────────────────────────────┐
│                                                  │
│              [SignalRisk Logo]                    │
│              Fraud Intelligence Platform          │
│                                                  │
│   ┌──────────────────────────────────────────┐   │
│   │  Email                                    │   │
│   │  [____________________________________]   │   │
│   │                                           │   │
│   │  Password                                 │   │
│   │  [____________________________________]   │   │
│   │                                           │   │
│   │  [✓ Remember me]     Forgot password? →   │   │
│   │                                           │   │
│   │  [          Sign In          ]            │   │
│   └──────────────────────────────────────────┘   │
│                                                  │
│   SSO: [Sign in with Google] [Sign in with SAML]│
│                                                  │
└─────────────────────────────────────────────────┘
```

### 3.2 MFA Verification

```
┌─────────────────────────────────────────────────┐
│              [SignalRisk Logo]                    │
│                                                  │
│   ┌──────────────────────────────────────────┐   │
│   │  Two-Factor Authentication                │   │
│   │                                           │   │
│   │  Enter the 6-digit code from your         │   │
│   │  authenticator app                        │   │
│   │                                           │   │
│   │  [_] [_] [_] [_] [_] [_]                │   │
│   │                                           │   │
│   │  [          Verify          ]             │   │
│   │                                           │   │
│   │  Can't access code? Use backup code →     │   │
│   └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

---

## 4. Operations Workspace Screens

### 4.1 Overview / Home

```
┌─────────────────────────────────────────────────────────────┐
│  [SR Logo]  Operations         [🔍 Search] [🔔 3] [👤 User]│
│             🟢 Connected · Updated 5s ago                    │
├─────────┬───────────────────────────────────────────────────┤
│         │                                                    │
│ Overview│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────┐ │
│ Cases 12│  │ Fraud    │ │⛔Blocked │ │ Active   │ │ Avg   │ │
│ Rules   │  │ Rate     │ │ Txns     │ │ Devices  │ │Latency│ │
│ Devices │  │ 2.3% ▼   │ │ 1,234 ▲  │ │ 45,678   │ │ 42ms  │ │
│ Analytics│ │ ▁▂▃▂▁▂▃  │ │ ▁▃▅▇▅▃▅  │ │ ▃▃▃▃▄▄▅  │ │ ▂▂▂▁▁ │ │
│ Alerts 3│  └──────────┘ └──────────┘ └──────────┘ └───────┘ │
│ Settings│                                                    │
│         │  ┌────────────────────────────────────────────────┐│
│ ──────  │  │         Fraud Trend (7 day)                    ││
│ DevPortal│ │    ╱╲                                          ││
│  ↗ open │  │   ╱  ╲    ╱╲                                   ││
│         │  │  ╱    ╲  ╱  ╲___╱╲                             ││
│         │  │ ╱      ╲╱        ╲                             ││
│         │  │  [24h] [7d] [30d] [custom]                     ││
│         │  └────────────────────────────────────────────────┘│
│         │                                                    │
│         │  ┌────────────────────────────────────────────────┐│
│         │  │  Real-time Events    🟢 Live     [Pause]       ││
│         │  │  ─────────────────────────────────────────     ││
│         │  │  12:04:32 ⛔BLOCK  reuse+vpn     TR  0.92 HIGH││
│         │  │  12:04:31 ✓ ALLOW  clean         TR  0.12 LOW ││
│         │  │  12:04:30 ⚠️REVIEW velocity      TR  0.71 HIGH││
│         │  │  12:04:28 ⛔BLOCK  bot_detected  DE  0.95 HIGH││
│         │  └────────────────────────────────────────────────┘│
└─────────┴───────────────────────────────────────────────────┘
```

### 4.2 Case Queue

```
┌─────────────────────────────────────────────────────────────┐
│  Cases (12 open)       Updated 8s ago    [+ Filter] [Export]│
├─────────────────────────────────────────────────────────────┤
│  Status: [All ▼]  Assigned: [All ▼]  [🔍 Search cases...]  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ☐ │ Case     │ Risk       │ Signals           │ SLA       │
│  ──┼──────────┼────────────┼───────────────────┼───────────│
│  ☐ │ #C-1042  │ ⛔0.92 HIGH│ reuse+vpn (3 acct)│ ❌ 0h left│
│    │ NEW      │            │ 📱 iPhone 15      │ Breached  │
│  ──┼──────────┼────────────┼───────────────────┼───────────│
│  ☐ │ #C-1041  │ ⚠️0.78 HIGH│ velocity+bot      │ ⏰ 1h left│
│    │ ASSIGNED │ → @jane    │ 📱 Android        │ Warning   │
│  ──┼──────────┼────────────┼───────────────────┼───────────│
│  ☐ │ #C-1040  │ ⛔0.85 HIGH│ farm (8 accounts) │ ✓ 4h left │
│    │ INVESTIGATING│ @john  │ 📱 Pixel 8        │ On track  │
│                                                              │
│  [☐ Select All]  [Bulk: Assign ▼] [Bulk: Resolve ▼]        │
│  ⚠️ Bulk actions are logged and can be undone within 30s    │
│                                                              │
│  1-25 of 342                          [← 1 2 3 ... 14 →]   │
└─────────────────────────────────────────────────────────────┘

Empty State:
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│              ✅ No open cases                                │
│              All caught up! Check back later.               │
│                                                              │
│              [View Resolved Cases]                           │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 Case Detail + Resolution

```
┌─────────────────────────────────────────────────────────────┐
│  ← Cases    #C-1042    ⛔ BLOCK 0.92    [Take Ownership]    │
│             Status: NEW → [Assign to me]                     │
├──────────────────────────────┬──────────────────────────────┤
│  EVIDENCE TIMELINE           │  DEVICE REPUTATION           │
│                              │  Trust: 0.15 ⛔ CRITICAL     │
│  12:04:32 ⛔ Decision: BLOCK │  First Seen: 2d ago          │
│  12:04:31 Risk Score: 0.92  │  Txns: 47 | Fraud: 34%      │
│  12:04:30 Signals:          │  Accounts: 5 | Farm: 0.82   │
│    ⛔ device_reuse (w:0.3)  │  Emulator: NO | ADB: NO     │
│    ⚠️ vpn_detected (w:0.2)  │                              │
│    ⚠️ velocity (w:0.2)      │  VELOCITY                    │
│  12:04:28 Session start     │  Txn/hr: ████████ 12 (>5 ⚠️)│
│  12:04:15 /checkout         │  Txn/day: ████████████ 47    │
│  12:04:02 /cart (2s dwell)  │  OTP/hr: ███ 3               │
│  12:03:45 /product/123      │                              │
│  12:03:30 Session created   │  LINKED ACCOUNTS (5)         │
│    session_age: 62s         │  user_123 Active    TR       │
│    time_to_purchase: 62s ⚠️  │  user_456 Suspended TR      │
│                              │  user_789 Active    TR       │
├──────────────────────────────┴──────────────────────────────┤
│                                                              │
│  ┌── RESOLUTION (Analyst) ───────────────────────────────┐  │
│  │                                                        │  │
│  │  Decision: (●) Fraud Confirmed  ( ) False Positive    │  │
│  │            ( ) Insufficient Evidence  ( ) Escalate    │  │
│  │                                                        │  │
│  │  Reason Code: [Device Farm ▼]                         │  │
│  │                                                        │  │
│  │  Notes: [5 accounts on same device, all created ___]  │  │
│  │                                                        │  │
│  │  Actions:                                              │  │
│  │    [☑ Block Device] [☑ Block Linked Accounts (5)]     │  │
│  │    [☐ Add to Blacklist] [☐ Notify Merchant]           │  │
│  │                                                        │  │
│  │  ⚠️ High-impact action: Blocking 5 accounts requires  │  │
│  │  Senior Analyst approval (auto-escalated)              │  │
│  │                                                        │  │
│  │  [Cancel]              [Submit for Review]             │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌── FALSE POSITIVE PATH ────────────────────────────────┐  │
│  │  If "False Positive" selected:                         │  │
│  │  • Release device from block (if blocked)             │  │
│  │  • Restore account access (if suspended)              │  │
│  │  • Feed false positive signal back to rule engine     │  │
│  │  • Tag for model retraining (Phase 2)                 │  │
│  │  Reason Code: [Legitimate User ▼]                     │  │
│  │  Evidence: [Customer verified identity via support___] │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  AUDIT TRAIL (immutable)                                     │
│  ──────────────────────                                      │
│  12:10:45 @john resolved: Fraud Confirmed (Device Farm)     │
│  12:10:45 Action: Block device fp_a1b2 + 5 accounts        │
│  12:10:45 Approved by: @senior_jane (auto-escalated)        │
│  12:05:00 @john took ownership                               │
│  12:04:32 Case auto-created from BLOCK decision             │
└─────────────────────────────────────────────────────────────┘
```

### 4.4 Rule Editor + Governance

```
┌─────────────────────────────────────────────────────────────┐
│  Rules → Edit: Device Farm Detection v2         [Save Draft]│
├─────────────────────────────────────────────────────────────┤
│  Name: [Device Farm Detection v2          ]                  │
│  Status: Draft    Author: @john    Version: 3               │
│                                                              │
│  ┌── DSL EDITOR (Monaco) ───────────────────────────────┐   │
│  │  IF device_accounts > 3                               │   │
│  │  AND ip_country != msisdn_country                     │   │
│  │  AND device_fraud_ratio > 0.2                         │   │
│  │  THEN risk += 0.4                                     │   │
│  │                                                       │   │
│  │  IF device_accounts > 5                               │   │
│  │  AND device_age < 24h                                 │   │
│  │  THEN BLOCK                                           │   │
│  └───────────────────────────────────────────────────────┘   │
│  [Visual Builder] [DSL] [✓ Valid] [⚠️ 1 Conflict]           │
│                                                              │
│  ┌── CONFLICT ANALYZER ─────────────────────────────────┐   │
│  │  ⚠️ Rule overlap detected with "Geo Mismatch v1"     │   │
│  │  Condition: ip_country != msisdn_country              │   │
│  │  Combined effect: risk could exceed 1.0 (0.4+0.3)    │   │
│  │  Recommendation: Cap combined risk or merge rules     │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌── SIMULATION ────────────────────────────────────────┐   │
│  │  Against: [Last 7 days ▼]    [▶ Run Simulation]       │   │
│  │  Matched: 2,345 txns                                  │   │
│  │  Would block: 234 (10%) | Known fraud caught: 94.3%  │   │
│  │  False positives: 36 (1.5%)                           │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌── ACTIVATION WORKFLOW ───────────────────────────────┐   │
│  │  Rollout: ( ) Immediate  (●) Staged (10% → 50% → 100%)│  │
│  │  Approval: Required (Admin role)                       │   │
│  │  [Submit for Approval] → Enters Rule Approval Queue    │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  VERSION HISTORY                                             │
│  v3 (current draft) @john 10m ago                           │
│  v2 (active) @jane 3 days ago  [Diff v2↔v3] [Rollback]     │
│  v1 (archived) @john 2 weeks ago                            │
└─────────────────────────────────────────────────────────────┘
```

### 4.5 Alerts Inbox

```
┌─────────────────────────────────────────────────────────────┐
│  Alerts (3 unread)                    [Mark All Read]       │
├─────────────────────────────────────────────────────────────┤
│  Filter: [All ▼]  Type: [All ▼]                            │
├─────────────────────────────────────────────────────────────┤
│  🔴 NEW   Fraud rate spike: 8.2% (>5% threshold)           │
│           Merchant: Papara    15 min ago                    │
│           [View Analytics →]  [Acknowledge]                 │
│  ──────────────────────────────────────────────────────────│
│  🟡 ACK   Velocity breach: 45 txn/hr from IP 192.168.x     │
│           Auto-blocked    2 hours ago    @jane              │
│           [View Case #C-1039 →]                             │
│  ──────────────────────────────────────────────────────────│
│  🔴 NEW   Device farm detected: 12 accounts on 2 devices   │
│           Merchant: Peak Games    30 min ago                │
│           [View Devices →]  [Acknowledge]                   │
│  ──────────────────────────────────────────────────────────│
│  ✓  READ  Rule conflict: "Geo Mismatch v1" overlaps "Farm" │
│           System    1 day ago                               │
│           [View Rules →]                                    │
└─────────────────────────────────────────────────────────────┘
```

### 4.6 Settings — Team & RBAC

```
┌─────────────────────────────────────────────────────────────┐
│  Settings → Team & Roles                                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  TEAM MEMBERS                              [+ Invite]       │
│  ┌──────────┬──────────┬─────────┬──────────┬──────────┐   │
│  │ Name     │ Email    │ Role    │ Status   │ Actions  │   │
│  ├──────────┼──────────┼─────────┼──────────┼──────────┤   │
│  │ John D.  │ john@... │ Admin   │ Active   │ [Edit]   │   │
│  │ Jane S.  │ jane@... │ Sr.Anly │ Active   │ [Edit]   │   │
│  │ Bob K.   │ bob@...  │ Analyst │ Active   │ [Edit]   │   │
│  │ Alice M. │ alice@.. │ Viewer  │ Invited  │ [Resend] │   │
│  └──────────┴──────────┴─────────┴──────────┴──────────┘   │
│                                                              │
│  ROLES & PERMISSIONS                                        │
│  ┌──────────────┬────────┬────────┬────────┬────────┐      │
│  │ Permission   │ Admin  │ Sr.Ana │ Analyst│ Viewer │      │
│  ├──────────────┼────────┼────────┼────────┼────────┤      │
│  │ View cases   │ ✓      │ ✓      │ ✓      │ ✓      │      │
│  │ Resolve cases│ ✓      │ ✓      │ ✓      │ -      │      │
│  │ Bulk actions │ ✓      │ ✓      │ -      │ -      │      │
│  │ Approve high │ ✓      │ ✓      │ -      │ -      │      │
│  │ Manage rules │ ✓      │ ✓      │ Draft  │ -      │      │
│  │ Activate rule│ ✓      │ -      │ -      │ -      │      │
│  │ Manage team  │ ✓      │ -      │ -      │ -      │      │
│  │ View audit   │ ✓      │ ✓      │ ✓      │ -      │      │
│  │ API keys     │ ✓      │ -      │ -      │ -      │      │
│  │ Webhooks     │ ✓      │ ✓      │ -      │ -      │      │
│  └──────────────┴────────┴────────┴────────┴────────┘      │
│                                                              │
│  ⚠️ Changes to roles require Admin approval                 │
│  📋 All changes logged in Audit Trail                       │
└─────────────────────────────────────────────────────────────┘
```

### 4.7 Device Detail (unchanged from v1, with a11y fixes)

Same as v1 but all scores show: color + icon + numeric value + text label.

### 4.8 Analytics — Velocity Heatmap (unchanged, with data table alternative)

Same as v1 plus:
```
[Toggle: Chart View | Table View]
Table view provides accessible data-table equivalent for screen readers.
```

---

## 5. User Flows (Updated)

### 5.1 Case Triage — Fraud Confirmed
```
Login → MFA → Overview → Cases (badge: 12)
  → Case Queue (sorted: SLA breached first)
    → Click #C-1042 → Case Detail
      → [Take Ownership] (locks case to analyst)
      → Review: Evidence Timeline + Device Rep + Velocity
      → Decision: Fraud Confirmed
      → Reason: Device Farm
      → Actions: [✓ Block Device] [✓ Block 5 Accounts]
      → ⚠️ High-impact: auto-escalated to Senior
      → Senior @jane approves in queue
      → [Resolve] → Audit trail entry created
      → Next case auto-loaded
```

### 5.2 Case Triage — False Positive
```
  → Case Detail → Review evidence
    → Decision: False Positive
    → Reason: Legitimate User
    → Evidence note: "Customer verified via support"
    → Actions: [✓ Release Device] [✓ Restore Account]
    → Feedback: FP signal sent to rule engine
    → [Resolve] → Audit trail + FP counter incremented
```

### 5.3 Rule Lifecycle
```
Analyst drafts rule → [Save Draft]
  → [Simulate] against 7-day data
  → Review results (94% catch rate, 1.5% FP)
  → ⚠️ Conflict detected with existing rule
  → Adjust thresholds or merge
  → [Submit for Approval]
  → Admin reviews in Rule Approval Queue
  → Admin approves → Staged rollout (10% → 50% → 100%)
  → Monitor impact in Analytics
  → If regression: [Rollback to v2] in Version History
```

---

## 6. Real-time Resilience

| Scenario | UX Behavior |
|----------|-------------|
| WebSocket connected | 🟢 indicator, live events stream |
| WebSocket disconnected | 🟡 "Reconnecting..." banner, auto-retry (exp backoff: 1s, 2s, 4s, 8s, max 30s) |
| Disconnected > 60s | 🔴 "Connection lost" banner + [Reconnect] button, stale data warning on all panels |
| Event spike (>5x normal) | Auto-throttle display to 1 event/sec, show "X events queued" |
| Polling failure | "Last updated Xs ago" turns yellow/red, retry on next interval |
| Stale case data | Banner: "This case was updated by @other. [Refresh]" |

---

## 7. Responsive Behavior

| Viewport | Layout |
|----------|--------|
| Desktop (>1280px) | Full sidebar + 2-column content |
| Tablet (768-1280px) | Collapsible sidebar, single column |
| Mobile (<768px) | Bottom nav, card-based, view-only (no case resolution) |

---

## 8. Accessibility (WCAG 2.1 AA)

- **Color + icon + text** for all status indicators (never color alone)
- **Contrast:** ≥ 4.5:1 for text, ≥ 3:1 for large text and UI components
- **Keyboard:** All actions reachable via Tab/Enter/Escape, visible focus ring (2px blue)
- **Screen readers:** All interactive elements have ARIA labels
- **Charts:** Toggle between chart view and accessible data table
- **Heatmap:** Accessible via data table + keyboard cell navigation
- **Monaco editor:** ARIA-compatible, screen reader mode available
- **Split panels:** Keyboard-resizable (Arrow keys), ARIA splitter role
- **Timeline:** Ordered list semantics, each item has role="listitem"
- **Tab order:** Follows visual layout (left-to-right, top-to-bottom)
- **Focus management:** Modal trap focus, drawer returns focus on close
- **Keyboard shortcuts:**
  - `?` — Show shortcut help
  - `G then C` — Go to Cases
  - `G then R` — Go to Rules
  - `G then O` — Go to Overview
  - `N` — Next case in queue
  - `P` — Previous case
  - `E` — Escalate current case
