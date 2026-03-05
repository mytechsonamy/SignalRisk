# SignalRisk — Component Map v2

> UI Component hierarchy, reuse strategy, and domain composites

---

## 1. Component Hierarchy

```
App Shell
├── Sidebar (persistent)
│   ├── Logo
│   ├── NavItem (icon + label, active state)
│   ├── NavSection (collapsible group)
│   └── UserMenu (avatar + role + logout)
├── Header (persistent)
│   ├── PageTitle + Breadcrumb
│   ├── GlobalSearch
│   ├── NotificationBell (badge count)
│   └── MerchantSwitcher (admin only)
├── Content Area
│   ├── Pages (route-based)
│   └── Overlays (modals, drawers, toasts)
└── Auth Shell (unauthenticated routes)
    ├── LoginForm
    ├── MFAVerification
    └── PasswordReset
```

---

## 2. Core Components

### 2.1 Data Display

| Component | Description | Used In |
|-----------|-------------|---------|
| `KPICard` | Metric + trend arrow + sparkline | Overview, Analytics |
| `RiskBadge` | Color + icon + text risk score (0.0-1.0) | Cases, Devices, Events |
| `DecisionBadge` | ALLOW/REVIEW/BLOCK pill with icon | Cases, Event Stream |
| `SignalTag` | Fraud signal label (device_reuse, vpn...) | Cases, Decision API |
| `SLAIndicator` | Icon + color + time remaining (never color-only) | Case Queue |
| `DeviceCard` | Device info + trust score + reputation | Case Detail, Devices |
| `ReputationGauge` | Semi-circle gauge 0.0-1.0 with numeric label | Device Detail |
| `VelocityBar` | Horizontal bar vs threshold + numeric value | Case Detail, Analytics |
| `EventStreamRow` | Time + decision + signals + country + score | Overview |
| `TimelineItem` | Timestamp + event description + icon | Case Detail |
| `DataTable` | Sortable, filterable table with compact rows (tabular-nums) | Cases, Devices, Events |
| `EmptyState` | Illustration + message + CTA when no data | All list views |

### 2.2 Data Input

| Component | Description | Used In |
|-----------|-------------|---------|
| `SearchInput` | Global search with autocomplete | Header |
| `FilterBar` | Composable filter chips (status, date, type) | Cases, Devices, Analytics |
| `DateRangePicker` | Preset ranges + custom calendar | Analytics, Simulation |
| `RuleEditor` | Monaco-based DSL editor with syntax highlighting | Rules |
| `ThresholdSlider` | Number input + slider for rule thresholds | Rules |
| `SelectDropdown` | Single/multi select with search | Filters, Settings |
| `TextArea` | Multiline input for notes | Case Resolution |

### 2.3 Navigation & Actions

| Component | Description | Used In |
|-----------|-------------|---------|
| `Button` | Primary/Secondary/Danger/Ghost variants | Everywhere |
| `IconButton` | Icon-only with tooltip | Toolbar actions |
| `BulkActionBar` | Appears on multi-select, action buttons | Case Queue |
| `TabGroup` | Horizontal tabs for sub-sections | Device Detail, Analytics |
| `Pagination` | Page numbers + per-page selector | Case Queue, Devices |
| `Breadcrumb` | Hierarchical navigation trail | All pages |
| `ConfirmDialog` | Modal with confirm/cancel for destructive actions | Rule activation, case resolve |

### 2.4 Charts & Visualization

| Component | Description | Library | Used In |
|-----------|-------------|---------|---------|
| `TrendChart` | Time-series line chart (fraud rate, events) | Recharts | Overview, Analytics |
| `HeatmapGrid` | Velocity heatmap (hour x day) | Recharts | Analytics |
| `BarChart` | Horizontal/vertical bars | Recharts | Analytics, Velocity |
| `PieChart` | Fraud type distribution | Recharts | Analytics |
| `SparkLine` | Inline mini chart in KPI cards | Recharts | Overview |
| `DeviceGraph` | Force-directed graph (device-account links) | D3.js | Devices (Phase 2) |

All charts include a visually hidden `<table>` alternative for screen readers (WCAG).

### 2.5 Layout

| Component | Description |
|-----------|-------------|
| `PageContainer` | Max-width + padding wrapper |
| `CardGrid` | Responsive grid of cards (1-4 columns) |
| `SplitPanel` | Two-column resizable layout (Case Detail) |
| `LoadingSkeleton` | Animated placeholder while loading |
| `ErrorBoundary` | Error fallback with retry |

### 2.6 Feedback

| Component | Description |
|-----------|-------------|
| `Toast` | Success/error/warning notification (auto-dismiss) |
| `AlertBanner` | Persistent alert at top of content area |
| `Badge` | Count badge (notification bell, case queue) |
| `Tooltip` | Hover info (signal descriptions, score breakdown) |
| `ProgressBar` | Determinate progress (simulation, export) |
| `ConnectionStatus` | WebSocket state indicator (connected/reconnecting/offline) |

### 2.7 Auth

| Component | Description |
|-----------|-------------|
| `LoginForm` | Email + password + remember me |
| `MFAInput` | 6-digit TOTP code entry |
| `SessionExpiredModal` | Auto-shown when token expires, redirect to login |

---

## 3. Domain Composites

Higher-order components that compose core primitives for specific fraud-ops workflows.

### 3.1 Case Management

| Composite | Composed Of | Description |
|-----------|-------------|-------------|
| `CaseQueueTable` | DataTable + RiskBadge + DecisionBadge + SLAIndicator + BulkActionBar | Sortable case list with inline risk/SLA indicators and bulk actions |
| `CaseDispositionPanel` | Button (Confirm/Escalate/FP) + TextArea + ConfirmDialog | Right-side panel for case resolution with approval gates and false positive path |
| `EvidenceSummaryCard` | SignalTag + VelocityBar + DeviceCard + TimelineItem | Aggregated evidence view within case detail — signals, velocity, device, timeline |
| `CaseTimeline` | TimelineItem[] + FilterBar | Chronological event log with signal-type filtering |

### 3.2 Rule Management

| Composite | Composed Of | Description |
|-----------|-------------|-------------|
| `RuleEditorPanel` | RuleEditor + ThresholdSlider + Button (Test/Save/Activate) | Full rule editing workspace with DSL editor and threshold controls |
| `RuleConflictAnalyzer` | AlertBanner + DataTable | Shows overlapping/contradicting rules before activation |
| `RuleStagedRollout` | ProgressBar + SelectDropdown + Button | Shadow mode → 10% → 50% → 100% deployment controls |
| `RuleVersionHistory` | DataTable + Button (Diff/Rollback) | Version list with diff view and one-click rollback |

### 3.3 Device Intelligence

| Composite | Composed Of | Description |
|-----------|-------------|-------------|
| `DeviceReputationCard` | ReputationGauge + SignalTag[] + VelocityBar | Complete device trust profile with all reputation signals |
| `DeviceEnvironmentPanel` | DataTable + RiskBadge | Hardware/software/network environment details with anomaly flags |

### 3.4 Analytics & Monitoring

| Composite | Composed Of | Description |
|-----------|-------------|-------------|
| `FraudOverviewDashboard` | KPICard[] + TrendChart + EventStreamRow[] | Main overview page assembly |
| `ActionImpactPreview` | BarChart + KPICard + AlertBanner | Predicted impact when activating/deactivating a rule (affected transaction volume, estimated FP/TP shift) |
| `VelocityAnalyticsPanel` | HeatmapGrid + BarChart + FilterBar + DateRangePicker | Velocity pattern analysis with time-window controls |

### 3.5 Notifications

| Composite | Composed Of | Description |
|-----------|-------------|-------------|
| `AlertInbox` | DataTable + RiskBadge + Button (Acknowledge/Snooze/Escalate) | Alert management with severity-based sorting and bulk actions |
| `AlertConfigPanel` | SelectDropdown + ThresholdSlider + Toggle | Per-alert-type threshold and channel configuration |

---

## 4. Component States

All interactive components support:
- **Default** — normal state
- **Hover** — cursor over (subtle background change)
- **Active/Pressed** — click/tap (slightly darker)
- **Focus** — keyboard focus (2px blue ring, `state.focus-ring` token + `shadow.focus`)
- **Disabled** — greyed out, no interaction, `aria-disabled="true"`
- **Loading** — skeleton or spinner
- **Error** — red border/text for validation errors (`state.error` token)

---

## 5. Accessibility Patterns

| Pattern | Implementation |
|---------|---------------|
| Risk communication | Color + icon + text label (never color alone) |
| Focus management | `focus-visible` ring on all interactive elements |
| Keyboard navigation | Tab order follows visual layout; Escape closes modals/drawers |
| Screen reader | `aria-live="polite"` for toast/alert updates; `role="status"` for KPI changes |
| Chart alternatives | Hidden `<table>` with chart data; `aria-label` on SVG chart containers |
| Reduced motion | `prefers-reduced-motion` disables all transitions except opacity |
| Keyboard shortcuts | Documented in header help menu; all shortcuts have visible labels |

---

## 6. Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Framework | React 18 | Industry standard, rich ecosystem |
| Styling | Tailwind CSS | Utility-first, matches design tokens |
| Components | Headless UI + custom | Accessible primitives, full control |
| Charts | Recharts | React-native, lightweight |
| Graph Viz | D3.js (Phase 2) | Force-directed device graphs |
| Code Editor | Monaco Editor | DSL syntax highlighting, autocomplete |
| Icons | Lucide React | Consistent, MIT licensed |
| State | Zustand | Lightweight, no boilerplate |
| Data Fetching | TanStack Query | Caching, polling for real-time |
| Router | React Router v6 | Standard |
| Form | React Hook Form + Zod | Validation aligned with API schemas |

---

## 7. Theming

- **Default theme:** Light mode (as wireframed)
- **Dark mode:** Planned for Phase 2 (fraud analysts often prefer dark)
- All colors from design tokens — no hardcoded hex values
- Risk/decision colors are semantic — independent of theme
- `font-variant: tabular-nums` applied globally to numeric data columns

---

## 8. Real-time Data Strategy

| Data | Method | Refresh Rate |
|------|--------|-------------|
| Event Stream | WebSocket | Real-time (< 1s) |
| KPI Cards | Polling (TanStack Query) | 30 seconds |
| Case Queue | Polling + WebSocket notification | 10 seconds + push on new case |
| Charts | Polling | 60 seconds |
| Device Reputation | On-demand (fetch on view) | N/A |
| Rule Simulation | Request-response | N/A (async job) |

### Connection Resilience

| State | Behavior |
|-------|----------|
| Connected | Green dot in status bar, real-time updates flowing |
| Reconnecting | Yellow pulse, exponential backoff (1s → 2s → 4s → 8s → 30s max) |
| Offline | Red dot + banner "Live updates paused", auto-retry on network restore |
| Stale data | `staleTime: 30s` in TanStack Query; grey "Last updated X ago" label on stale cards |
