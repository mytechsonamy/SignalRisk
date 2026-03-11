# SignalRisk Dashboard — User Guide

> For fraud analysts and operations teams | Verified baseline: 11 March 2026

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Overview Page](#2-overview-page)
3. [Cases Page](#3-cases-page)
4. [Rules Page](#4-rules-page)
5. [Fraud Ops Page](#5-fraud-ops-page)
6. [Analytics Page](#6-analytics-page)
7. [Graph Intelligence Page](#7-graph-intelligence-page)
8. [Live Feed Page](#8-live-feed-page)
9. [Settings Page](#9-settings-page)
10. [Admin Page](#10-admin-page)
11. [FraudTester — Battle Arena](#11-fraudtester--battle-arena)
12. [FraudTester — Scenario Library](#12-fraudtester--scenario-library)
13. [FraudTester — Detection Reports](#13-fraudtester--detection-reports)
14. [FraudTester — Agent Configuration](#14-fraudtester--agent-configuration)
15. [Roles & Permissions](#15-roles--permissions)
16. [Keyboard Shortcuts & Tips](#16-keyboard-shortcuts--tips)

---

## 1. Getting Started

### What is SignalRisk?

SignalRisk is a real-time fraud decision engine that evaluates incoming transactions against multiple intelligence signals — device fingerprinting, behavioural analysis, network reputation, velocity tracking, telco intelligence, and graph-based entity analysis — to produce instant ALLOW, REVIEW, or BLOCK decisions.

The Dashboard is the analyst-facing web application for monitoring fraud activity, managing cases, tuning detection rules, and running adversarial tests against the detection engine.

### Logging In

Navigate to your dashboard URL (`http://localhost:5173` in development) and enter your credentials.

Current verified behavior:

- dashboard login uses seed users in development
- seed-user login is disabled when `NODE_ENV=production`
- the dashboard stores auth state client-side and redirects to the Overview page after successful login

Development seed users:

- **Admin account**: `admin@signalrisk.io`
- **Analyst account**: `analyst@signalrisk.io`

Default development passwords are environment-driven and may fall back to seed values in local environments. Do not reuse seed credentials outside development.

After login you are taken directly to the **Overview** page.

### Navigation

The left sidebar contains links to all pages, organized into two sections:

**Main navigation:**
- Overview, Cases, Rules, Fraud Ops, Analytics, Graph Intel, Live Feed, Settings, Admin

**Fraud Tester section:**
- Overview, Battle Arena, Scenarios, Reports, Agents, Targets

Your role badge and email are shown in the top-right corner. Use **Sign out** to end your current dashboard session.

The footer shows the platform version (currently v0.1.0).

---

## 2. Overview Page

**Path:** `/` (home)

The Overview page provides a real-time snapshot of platform health and fraud activity.

### KPI Cards

Four metric cards at the top update automatically every 30 seconds:

| Card | Description |
|------|-------------|
| Decisions / hr | Number of fraud decisions made in the last hour |
| Block Rate % | Percentage of decisions that resulted in BLOCK |
| Review Rate % | Percentage of decisions that resulted in REVIEW |
| Avg Latency ms | Average decision processing time in milliseconds |

Each card shows a trend arrow (up/down in green or red) and percentage change compared to the previous period. A yellow **Stale** badge appears if the data could not be refreshed.

### Decision Trend Chart

The "Decisions — Last 60 Minutes" line chart shows decision counts broken down by outcome (ALLOW / REVIEW / BLOCK) at 2-minute intervals. The three lines are colour-coded: green (ALLOW), amber (REVIEW), red (BLOCK). Hover over any point to see exact counts.

### Live Event Stream

The right panel shows the most recent decisions arriving in real time via WebSocket. Each row displays:
- Timestamp
- Entity ID (device or user fingerprint)
- Decision outcome badge (colour-coded)
- Processing latency in milliseconds

A green **Connected** indicator confirms the WebSocket is active. If it shows red **Disconnected**, click **Retry connection** to reconnect.

---

## 3. Cases Page

**Path:** `/cases`

The Cases page is the primary analyst workflow queue. It shows all cases that require human review.

### Understanding the Queue

By default the queue shows only **Open** cases — cases awaiting a decision. Cases automatically leave the queue when you Resolve or Escalate them.

Each row in the table shows:
- **Case ID** — unique identifier
- **Entity ID** — device fingerprint or user ID that triggered the event
- **Action** — the automated decision (REVIEW or BLOCK)
- **Priority** — HIGH / MEDIUM / LOW based on risk score
- **Risk Score** — numeric score 0–100
- **SLA** — remaining time before SLA breach
- **Status** — current case status
- **Assignee** — analyst assigned to the case
- **Actions** — View button

### Filtering

Use the filter bar at the top to narrow the queue:

- **Status dropdown** — Open / In Review / Escalated / Resolved
- **Priority dropdown** — All Priorities / HIGH / MEDIUM / LOW
- **Search** — filter by Entity ID (300ms debounce)

### Case Detail Panel

Click **View** on any row to open the sliding detail panel:

- **Decision Summary**: action, risk score, entity ID, priority
- **Risk Factors**: signal contributions with visual bars and descriptions
- **SLA**: remaining time with colour indicator
- **Evidence Timeline**: sequence of events (received, scored, case created)
- **Resolution**: select FRAUD / LEGITIMATE / INCONCLUSIVE, add notes, submit
- **Escalate Case**: escalate to senior analyst

### Pagination

Previous/Next buttons appear when there are more than 20 cases.

---

## 4. Rules Page

**Path:** `/rules`

The Rules page lets you manage the DSL rules that the decision engine evaluates against every incoming event.

### Rules Table

Each rule shows:

| Column | Description |
|--------|-------------|
| Rule Name | Human-readable identifier |
| Expression | DSL condition (e.g. `velocity.burstDetected == true`, `stateful.customer.previousBlockCount30d > 2`) |
| Outcome | ALLOW, REVIEW, or BLOCK (colour-coded) |
| Weight | Contribution weight 0.10–1.00 |
| Active | Yes/No toggle |
| Actions | Edit / Delete buttons |

### Adding a Rule

Click **+ Add Rule** to open the modal:

1. **Rule Name** — descriptive name
2. **DSL Expression** — condition using contexts: `device`, `velocity`, `behavioral`, `network`, `telco`, `txn`, `stateful` (including `stateful.customer.*`, `stateful.device.*`, `stateful.ip.*`, `stateful.graph.*`, `stateful.sequence.*`)
3. **Outcome** — ALLOW, REVIEW, or BLOCK
4. **Weight** — initial contribution (0.10–1.00)
5. **Active immediately** — check to enable on creation

### Toggling and Weight Adjustment

- Click the Active column to instantly enable/disable a rule (no deploy needed)
- Drag the Weight slider to change rule influence on the final score

---

## 5. Fraud Ops Page

**Path:** `/fraud-ops`

The Fraud Ops page is for labelling cases to improve the accuracy of the rule engine. Unlike the Cases page (which manages the queue), Fraud Ops focuses on REVIEW-action cases specifically for training purposes.

### Labeling Stats Bar

Top-right stats show today's labeling activity:
- **Today: N labeled** — total decisions made today
- **Fraud: N** — confirmed fraud labels
- **FP: N** — false positive (legitimate) labels
- **Accuracy: N%** — fraud confirmed / (fraud + false positive)
- **Pending: N** — cases awaiting labeling

### Review Queue

The "Review Queue" lists REVIEW-action cases sorted by risk score (highest first). When no cases are pending, it shows "No cases pending review".

### Outcome Modal

Click **Label** to choose:
- **Fraud Confirmed** — genuinely fraudulent (rule weight +0.05)
- **False Positive** — legitimate event (rule weight −0.03)
- **Inconclusive** — insufficient evidence

---

## 6. Analytics Page

**Path:** `/analytics`

The Analytics page provides historical performance metrics with three tabbed views and a period selector.

### Risk Trends Tab

- **Period selector**: 7d / 30d toggle buttons
- **Decision Trends chart**: Line chart showing daily ALLOW/REVIEW/BLOCK counts over time (green/amber/red lines)
- **Decision Outcomes donut**: Pie/donut chart showing the proportion of ALLOW, REVIEW, and BLOCK decisions
- **Risk Score Distribution**: Bar chart showing how many decisions fall into each 10-point risk bucket (0-10, 10-20, ..., 90-100)

### Velocity Tab

- **Events per Hour**: Area chart showing event volume over time, useful for identifying traffic spikes that may indicate an ongoing attack

### Merchant Stats Tab

- **Merchant Statistics table**: Per-merchant breakdown showing:
  - Merchant name/ID
  - Volume (total events)
  - Avg Risk Score
  - Block Rate % (highlighted in red when > 10%)

Use the **Refresh** button (top-right) to force-reload analytics data.

---

## 7. Graph Intelligence Page

**Path:** `/graph-intel`

The Graph Intelligence page visualizes entity relationships to detect fraud rings, device sharing, and cross-merchant account linking.

### KPI Cards

Four cards at the top:

| Card | Description |
|------|-------------|
| Entities in Graph | Total nodes in the entity relationship graph |
| Active Fraud Rings | Detected fraud ring clusters |
| Confirmed Fraud Accounts | Accounts confirmed as fraudulent |
| Suspicious Devices | Devices flagged as suspicious |

### Highlight Filters

Toggle buttons to focus the graph visualization:
- **All nodes** — show everything
- **Fraud rings (N)** — highlight only fraud ring members
- **Fraud accounts (N)** — highlight confirmed fraud accounts
- **Suspicious devices (N)** — highlight suspicious devices

### Detail Tabs

- **Rings** — lists detected fraud rings with "No fraud rings detected / Graph looks clean" when none exist
- **Devices** — lists suspicious devices
- **Guide** — usage guide for interpreting the graph

### Search

Use the search bar (top-right) to search by account or device ID. Click **Search** to focus the graph on a specific entity.

### Graph Visualization

The main area displays an interactive network graph. Nodes represent entities (devices, accounts), edges represent relationships (shared IP, shared device, etc.). The graph populates as events are processed through the system.

---

## 8. Live Feed Page

**Path:** `/live-feed`

The Live Feed page shows real-time decisions as they happen via WebSocket.

### Counter Cards

Three colour-coded cards at the top show running totals:
- **ALLOW** (green) — allowed decisions
- **REVIEW** (amber) — review decisions
- **BLOCK** (red) — blocked decisions

### Controls

- **Action filter dropdown** — filter by All actions / ALLOW / REVIEW / BLOCK
- **Merchant ID filter** — filter by specific merchant
- **Pause button** — pause/resume the live stream

### Decision Table

| Column | Description |
|--------|-------------|
| TIME | When the decision was made |
| ENTITY ID | Device/user fingerprint |
| MERCHANT | Merchant ID |
| ACTION | ALLOW / REVIEW / BLOCK (colour-coded) |
| RISK SCORE | Numeric risk score |
| RISK FACTORS | Contributing signals |

Use this page on a monitoring screen during high-risk periods or incident response.

---

## 9. Settings Page

**Path:** `/settings`

The Settings page is a lightweight local preferences form. It does not manage server-side platform configuration.

Current verified fields:

| Setting | Description | Current Default |
|---------|-------------|-----------------|
| API Base URL | Stored local API base URL preference | `http://localhost:3000` |
| WebSocket URL | Live feed WebSocket endpoint | `http://localhost:3000` |
| Environment | Current environment | `development` |
| Version | Platform version | `0.1.0` |

Settings are persisted to `localStorage` and survive page reloads.

---

## 10. Admin Page

**Path:** `/admin` (Admin role required)

The Admin page is organized into three tabs:

### Users Tab

- Lists users available through the admin API/store
- Includes user management actions surfaced by the current admin UI
- Use this area for operational user administration, not merchant auth onboarding

### System Health Tab

- Shows live health status of all microservices
- **All Systems Operational** banner (green) when everything is healthy
- Service list with status indicators (healthy/degraded/down)
- **Refresh** button and "Last checked" timestamp

### Rules Tab

Same as the Rules page — provides full rule CRUD functionality.

---

## 11. FraudTester — Battle Arena

**Path:** `/fraud-tester/battle-arena`

### What is FraudTester?

FraudTester is a **QA and Red Team tool** for testing SignalRisk's fraud detection capabilities. It generates synthetic fraud events, submits them through the real pipeline, and measures detection accuracy.

**Who uses it:** Security/QA engineers, fraud analysts, developers
**What it measures:** True Positive Rate (TPR), False Positive Rate (FPR), latency

### Layout

The page is divided into three sections:

**Left — Attack Team:**
Shows the 5 AI agents with status badges:
- Fraud Sim — standard fraud pattern simulation
- Adversarial — adaptive evasion techniques
- Chaos — random noise and edge cases
- Recon — reconnaissance patterns
- Replay — replay attacks

**Center — Detection Score:**
- Detection gauge (0-100%) with Idle/Running state
- TPR / FPR / AVG LATENCY metrics
- LIVE FEED showing real-time attack results
- DETECTION TREND chart tracking detection rate across battles

**Right — Configuration:**
- **Target**: Select target system (SignalRisk)
- **Duration**: 5 minutes / 10 minutes / 30 minutes
- **Intensity**: Low / Medium / High
- **Scenarios**: Checkboxes for Device Farm, Emulator Spoof, Bot Checkout, Velocity Evasion, SIM Swap

### Starting a Battle

1. Configure scenarios, duration, and intensity in the right panel
2. Click **Start Battle** (blue button in header or config panel)
3. Watch real-time results in the center panel
4. Results are colour-coded: red (BLOCK = detected), amber (REVIEW), green (ALLOW = missed)

### Test Isolation

All Battle Arena traffic is automatically marked with `X-SignalRisk-Test: true`. Test data is excluded from production analytics and no webhooks are triggered.

---

## 12. FraudTester — Scenario Library

**Path:** `/fraud-tester/scenarios`

The Scenario Library displays all available fraud test scenarios.

### Category Filters

Filter buttons at the top: **Device**, **Velocity**, **Identity**, **Bot**, **Network**

### Sort and Search

- **Search** field for filtering by name
- **Sort by** dropdown (Detection Rate)

### Scenario Cards

Each card shows:

| Field | Description |
|-------|-------------|
| Category badges | Colour-coded tags (device, velocity, bot, identity, network, adversarial, chaos) |
| Scenario name | e.g. Emulator Spoof, Device Farm, Bot Checkout |
| Description | What the attack pattern does |
| Last run | When the scenario was last executed |
| Run count | Total number of executions |
| Detection rate | Historical detection percentage (bar + %) |
| Expected outcome | BLOCK / REVIEW / ALLOW badge |

### Available Scenarios (9+)

| Scenario | Category | Detection Rate | Expected |
|----------|----------|---------------|----------|
| Emulator Spoof | device | 98% | BLOCK |
| Device Farm | device | 94% | BLOCK |
| Bot Checkout | bot | 91% | BLOCK |
| SIM Swap | identity | 78% | REVIEW |
| Velocity Evasion | velocity | 67% | REVIEW |
| Slow Fraud | velocity + adversarial | 28% evasion | ALLOW |
| Bot Evasion | bot + adversarial | — | Tests limits |
| Emulator Bypass | device + adversarial | — | Tests limits |
| Timeout Injection | network + chaos | — | Graceful degradation |

### + New Scenario

Click **+ New Scenario** (top-right) to create a custom test scenario.

---

## 13. FraudTester — Detection Reports

**Path:** `/fraud-tester/reports`

The Detection Reports page shows historical battle results and detection performance trends.

### Battle List

Left panel lists all completed battles:
- Battle number (#1, #2, #3...)
- Date and time
- Scenario count
- Overall detection rate % (colour-coded)

### Battle Detail (right panel)

Click a battle to view detailed results:

**KPI Cards:**
- TPR (True Positive Rate)
- FPR (False Positive Rate)
- AVG LATENCY (per decision)
- SCENARIOS RUN (passed count)

**Scenario Breakdown Table:**

| Column | Description |
|--------|-------------|
| SCENARIO | Scenario name |
| DETECTION | Detection rate with progress bar |
| ESCAPED (FN) | False negatives (e.g. 1/10) |
| AVG LATENCY | Average processing time |
| STATUS | PASS / FAIL badge |

**Trend — Last 3 Battles:**
- Detection Rate Trend (TPR) line chart across battles
- Avg Latency per Battle bar chart

### Interpreting Results

- **TPR > 85%** is the target for production readiness
- **FPR < 5%** ensures legitimate users are not blocked
- Rising FPR → overly aggressive rules, need weight adjustment
- Falling TPR on adversarial scenarios → detection gaps to address

---

## 14. FraudTester — Agent Configuration

**Path:** `/fraud-tester/agents` (sidebar: Configuration)

The Agent Configuration page lets you configure the three AI agents used in Battle Arena.

### Fraud Simulation Agent

- **Description**: Simulates known fraud patterns including device farms, emulator spoofing, and bot checkout
- **Schedule**: Configurable schedule field
- **Intensity**: Slider 1-10 (Low / Medium / High)
- **Status**: Ready (green dot) / Running / Error

### Adversarial Agent

- **Description**: Uses adaptive evasion techniques to test the robustness of fraud detection
- **Attack Pattern**: Configurable attack pattern field
- **Intensity**: Slider 1-10
- **Status**: Ready / Running / Error

### Chaos Agent

- **Description**: Injects random noise and edge-case scenarios to stress-test detection resilience
- **Chaos Mode**: Configurable mode field
- **Failure Rate**: Slider 0-50% (default: 30%)
- **Timeout (ms)**: Configurable timeout field
- **Status**: Ready / Running / Error

All agents show a green "Ready" status indicator when properly configured. The footer message reads: "All agents are active. Configure parameters per-agent above and save to persist settings."

---

## 15. Roles & Permissions

| Feature | Admin | Analyst | Merchant |
|---------|-------|---------|----------|
| Overview | Read | Read | Read (own) |
| Cases — view queue | Yes | Yes | Own only |
| Cases — resolve/escalate | Yes | Yes | No |
| Fraud Ops — label | Yes | Yes | No |
| Rules — view | Yes | Yes | No |
| Rules — create/edit/delete | Yes | No | No |
| Analytics | Yes | Yes | Own only |
| Graph Intelligence | Yes | Yes | No |
| Live Feed | Yes | Yes | No |
| Admin panel | Yes | No | No |
| Settings | Yes | Yes | Yes |
| FraudTester — Battle Arena | Yes | Yes | No |
| FraudTester — Scenarios | Yes | Yes | No |
| FraudTester — Reports | Yes | Yes | No |
| FraudTester — Configuration | Yes | No | No |

---

## 16. Keyboard Shortcuts & Tips

### Navigation Tips

- Press **Escape** or click the backdrop to close the Case Detail sliding panel
- Select **Open** in the status dropdown to return to the active queue after browsing resolved cases
- Sort by SLA column to work time-sensitive cases first (red = SLA breached)

### Search

The search box in Cases filters by Entity ID. It debounces 300ms and cancels previous requests — type quickly without waiting.

### Stale Data Badge

If Overview KPI cards show a yellow **Stale** badge, the API call failed. Data shown is from the last successful fetch. Retry happens on tab focus or after 30 seconds.

### Rule Weight Best Practices

- Start new rules at **0.5 weight** and let the feedback loop adjust
- Only set **1.0** for rules with confirmed zero false positives
- Set **0.1** (minimum) rather than deleting — preserves history
- Deactivate rules before deleting to observe impact first

### FraudTester Tips

- Use **low intensity** for initial rule validation, **high intensity** for stress testing
- Run adversarial scenarios after rule changes to verify detection
- Compare battle reports over time to track improvement
- All test data is automatically isolated from production — no cleanup needed
- Battle results do **not** appear in Dashboard analytics (test isolation)
- FraudTester = "how good is our detection?" / Dashboard = "what is happening right now?"

### Analytics Tips

- Use the **7d / 30d** toggle to switch between short-term and long-term views
- Check Merchant Stats tab for high block rates that may indicate compromised merchants
- Velocity tab shows hourly event volume — useful for spotting attack patterns

---

*For API integration details, see `docs/dev/api-reference.md`.*
*For technical architecture, see `docs/TECHNICAL.md`.*
*For incident response, see `docs/runbooks/on-call-playbook.md`.*
