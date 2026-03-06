# SignalRisk Dashboard — User Guide

> For fraud analysts and operations teams | Version 0.1.0

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Overview Page](#2-overview-page)
3. [Cases Page](#3-cases-page)
4. [Fraud Ops Page](#4-fraud-ops-page)
5. [Rules Page](#5-rules-page)
6. [Analytics Page](#6-analytics-page)
7. [Live Feed Page](#7-live-feed-page)
8. [Admin Page](#8-admin-page)
9. [Settings Page](#9-settings-page)
10. [Roles & Permissions](#10-roles--permissions)
11. [Keyboard Shortcuts & Tips](#11-keyboard-shortcuts--tips)

---

## 1. Getting Started

### Logging In

Navigate to your dashboard URL and enter your credentials. The system uses JWT authentication with a 15-minute session, automatically renewed by activity.

- **Admin account**: full access to all pages including Admin panel
- **Analyst account**: access to Cases, Fraud Ops, Analytics, Live Feed
- **Merchant account**: limited to their own cases and analytics

After login you are taken directly to the **Overview** page.

### Navigation

The left sidebar contains links to all pages. Your role badge (Admin/Analyst/Merchant) and email are shown in the top-right corner. Use **Sign out** to end the session and revoke your token.

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

Each card shows a trend arrow (up/down) and percentage change compared to the previous period. A yellow **Stale** badge appears if the data could not be refreshed.

### Decision Trend Chart

The line chart shows decision counts broken down by outcome (ALLOW / REVIEW / BLOCK) for the last 60 minutes at 2-minute intervals. Hover over any point to see exact counts. The three lines are colour-coded: green (ALLOW), amber (REVIEW), red (BLOCK).

### Live Event Stream

The right panel shows decisions arriving in real time via WebSocket. Each row displays:
- Timestamp
- Entity ID (device or user fingerprint)
- Decision outcome badge (colour-coded)
- Processing latency in milliseconds

A green **Connected** indicator confirms the WebSocket is active. If it shows red/disconnected, refresh the page.

---

## 3. Cases Page

**Path:** `/cases`

The Cases page is the primary analyst workflow queue. It shows all cases that require human review.

### Understanding the Queue

By default the queue shows only **OPEN** cases — cases awaiting a decision. Cases automatically leave the queue when you Resolve or Escalate them.

Each row in the table shows:
- **Case ID** — unique identifier (click View to open details)
- **Entity ID** — device fingerprint or user ID that triggered the event
- **Action** — the automated decision (REVIEW or BLOCK)
- **Priority** — HIGH / MEDIUM / LOW based on risk score
- **Risk Score** — numeric score 0–100
- **SLA** — remaining time before SLA breach (turns amber when < 6h, red when breached)
- **Status** — current case status
- **Assignee** — analyst assigned to the case
- **Actions** — View button

### Filtering

Use the filter bar at the top to narrow the queue:

- **Status dropdown** — All Statuses / Open / In Review / Escalated / Resolved
- **Priority dropdown** — All Priorities / HIGH / MEDIUM / LOW
- **Search** — filter by Entity ID (300ms debounce, cancels in-flight requests on change)

Switching back to **Open** after viewing resolved/escalated cases returns you to the active queue.

### Case Detail Panel

Click **View** on any row to open the sliding detail panel on the right.

**Decision Summary** shows the original automated decision: action, risk score, entity ID, and priority.

**Risk Factors** lists the signals that contributed to the score, each with:
- Signal name (e.g. `device_emulator`, `high_velocity`, `geo_mismatch`)
- Contribution percentage with a visual bar
- Human-readable description of why the signal fired

**SLA** shows remaining time with a colour indicator.

**Evidence Timeline** shows the sequence of events that created this case:
- When the event was received and scored
- The decision outcome with risk score
- When the case was created for manual review

**Resolution** section (only for OPEN / IN_REVIEW cases):
1. Select a decision: **FRAUD**, **LEGITIMATE**, or **INCONCLUSIVE**
2. Optionally add notes explaining your reasoning
3. Click **Submit Resolution** — the case immediately leaves the queue

**Escalate Case** button (only for OPEN cases): escalates to a senior analyst. The case immediately leaves the OPEN queue.

### Bulk Actions

Check the checkbox on multiple rows (or use the header checkbox to select all). A **Bulk Action Bar** appears at the bottom of the page letting you resolve all selected cases at once.

### Pagination

If there are more than 20 cases, Previous/Next buttons appear below the table. The current page and total count are shown.

---

## 4. Fraud Ops Page

**Path:** `/fraud-ops`

The Fraud Ops page is for labelling cases to improve the accuracy of the rule engine. Unlike the Cases page (which manages the queue), Fraud Ops focuses on REVIEW-action cases specifically for training purposes.

### Labeling Stats Bar

At the top right, the stats bar shows today's labeling activity:
- **Today: N labeled** — total decisions made today
- **Fraud: N** — confirmed fraud labels
- **FP: N** — false positive (legitimate) labels
- **Accuracy: N%** — fraud confirmed / (fraud + false positive)
- **Pending: N** — cases awaiting labeling

These stats update in real-time as you label cases.

### Review Queue

The queue lists REVIEW-action cases sorted by risk score (highest first). Each row has:
- Case details (entity, risk score, priority, SLA)
- **Claim** button — assigns the case to you (changes status to IN_REVIEW)
- **Label** button — opens the outcome modal

### Outcome Modal

Click **Label** to open the outcome decision modal:
- **Fraud Confirmed** — the event was genuinely fraudulent
- **False Positive** — the event was legitimate (rule fired incorrectly)
- **Inconclusive** — insufficient evidence to decide

Submitting a label:
1. Removes the case from the review queue
2. Updates today's labeling stats
3. Triggers a feedback event that adjusts rule weights (Fraud +0.05, False Positive −0.03)

### Batch Labeling

Select multiple cases using checkboxes and use the **Batch Review Bar** at the bottom to apply the same outcome to all selected cases at once.

---

## 5. Rules Page

**Path:** `/rules`

The Rules page lets you manage the DSL rules that the decision engine evaluates against every incoming event.

### Rules Table

Each rule shows:
- **Rule Name** — human-readable identifier
- **Expression** — the DSL condition (truncated; hover for full text)
- **Outcome** — what the rule triggers: ALLOW, REVIEW, or BLOCK (colour-coded)
- **Weight** — contribution slider (0.10–1.00)
- **Active** — click to toggle on/off without deleting
- **Actions** — Edit and Delete buttons

### Toggling a Rule

Click the **Yes/No** text in the Active column to instantly enable or disable a rule. No deployment is needed — changes take effect within seconds.

### Adjusting Rule Weight

Drag the slider in the Weight column to change how strongly a rule influences the final score. A weight of 1.0 means full contribution; 0.1 means minimal. Changes save immediately.

### Adding a Rule

Click **+ Add Rule** in the top right to open the Add Rule modal:

1. **Rule Name** — descriptive name (e.g. "High Risk Country Block")
2. **DSL Expression** — the condition to evaluate. Available contexts:
   - `device.country`, `device.isEmulator`, `device.trustScore`
   - `velocity.count_1h`, `velocity.count_24h`
   - `network.vpnDetected`, `network.isProxy`, `network.country`
   - `telco.isValid`, `telco.carrierRisk`
   - `txn.amount`, `txn.currency`
3. **Outcome** — click ALLOW, REVIEW, or BLOCK
4. **Weight** — initial contribution weight (0.10–1.00)
5. **Active immediately** — check to enable the rule on creation

Click **Create Rule** to save.

### Editing a Rule

Click **Edit** on any row to open the Edit Rule modal. All fields are editable. Changes take effect immediately on save.

### Deleting a Rule

Click **Delete** and confirm the prompt. Deletion is permanent. Consider deactivating first if you may need the rule again.

---

## 6. Analytics Page

**Path:** `/analytics`

The Analytics page provides historical performance metrics and merchant-level breakdowns.

### Velocity Chart

A time-series chart showing event volume per hour. Use this to identify unusual spikes in activity that may indicate an ongoing fraud attack.

### Merchant Breakdown

A table showing per-merchant statistics:
- Event volume
- Block rate percentage
- Average risk score

High block rates or unusual risk scores can indicate a compromised merchant account or an ongoing attack against a specific merchant.

---

## 7. Live Feed Page

**Path:** `/live-feed`

The Live Feed page shows a full-screen real-time stream of all decisions as they happen.

Each row displays:
- Timestamp
- Entity ID
- Decision outcome (colour-coded badge: green ALLOW, amber REVIEW, red BLOCK)
- Processing latency

The feed auto-scrolls and keeps the most recent 100 decisions. A **Connected** badge confirms the WebSocket is active. Use this page on a monitoring screen during high-risk periods or incident response.

---

## 8. Admin Page

**Path:** `/admin`

Admin page access is restricted to users with the **Admin** role.

The page is organised into three tabs:

### System Health Tab

Shows the live health status of all 13 microservices:
- Service name and port
- Status indicator: healthy (green), degraded (amber), down (red)
- Response time in milliseconds
- Last checked timestamp

Use this tab to quickly identify which service is causing issues during an incident.

### Rules Tab

Same as the Rules page — provides full rule CRUD functionality. See [Section 5](#5-rules-page) for details.

### Users Tab

Lists all admin and analyst users:
- Name, email, role
- Last login timestamp
- Status (active/inactive)

Use this tab to onboard new analysts, change roles, or deactivate accounts.

---

## 9. Settings Page

**Path:** `/settings`

The Settings page stores platform configuration preferences for this browser session.

| Setting | Description |
|---------|-------------|
| API Base URL | Base URL for API calls (default: `http://localhost:3000`) |
| WebSocket URL | URL for the live event stream WebSocket |
| Environment | Current environment name (development/staging/production) |
| Version | Platform version number |

Edit any field and click **Save Settings**. A green **Saved** confirmation appears briefly. Settings are persisted to `localStorage` and survive page reloads.

If `localStorage` is unavailable (private browsing, storage quota), a red **Settings could not be saved** message is shown.

---

## 10. Roles & Permissions

| Feature | Admin | Analyst | Merchant |
|---------|-------|---------|----------|
| Overview | Read | Read | Read (own) |
| Cases — view queue | Yes | Yes | Own only |
| Cases — resolve/escalate | Yes | Yes | No |
| Fraud Ops — label | Yes | Yes | No |
| Rules — view | Yes | Yes | No |
| Rules — create/edit/delete | Yes | No | No |
| Analytics | Yes | Yes | Own only |
| Live Feed | Yes | Yes | No |
| Admin panel | Yes | No | No |
| Settings | Yes | Yes | Yes |

---

## 11. Keyboard Shortcuts & Tips

### Closing the Case Detail Panel

Press **Escape** or click the backdrop to close the sliding panel without taking any action.

### Status Filter Reset

To return to the default OPEN queue after browsing resolved cases, select **Open** in the status dropdown.

### SLA Priority

Sort by SLA column to work the most time-sensitive cases first. Cases breaching SLA (3h 59m or less) are highlighted in red — prioritise these to avoid SLA violations.

### Search Tips

The search box in Cases filters by Entity ID. It debounces 300ms and cancels previous requests — you can type quickly without waiting.

### Stale Data Badge

If the Overview KPI cards show a yellow **Stale** badge, the API call failed. The data shown is from the last successful fetch. The dashboard will retry automatically on next tab focus or after 30 seconds.

### Rule Weight Best Practices

- Start new rules at **0.5 weight** and let the feedback loop adjust over time
- Only set weight to **1.0** for rules with extremely high precision (confirmed zero false positives)
- Set weight to **0.1** (minimum) rather than deleting rules — this preserves history
- Deactivate rules before deleting to observe the impact on decision distribution first

---

*For API integration details, see `docs/dev/api-reference.md`.*
*For technical architecture, see `docs/TECHNICAL.md`.*
*For incident response, see `docs/runbooks/on-call-playbook.md`.*
