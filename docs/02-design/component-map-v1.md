# SignalRisk — Component Map v1

> UI Component hierarchy and reuse strategy

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
└── Content Area
    ├── Pages (route-based)
    └── Overlays (modals, drawers, toasts)
```

---

## 2. Core Components

### 2.1 Data Display

| Component | Description | Used In |
|-----------|-------------|---------|
| `KPICard` | Metric + trend arrow + sparkline | Overview, Analytics |
| `RiskBadge` | Color-coded risk score (0.0-1.0) | Cases, Devices, Events |
| `DecisionBadge` | ALLOW/REVIEW/BLOCK pill | Cases, Event Stream |
| `SignalTag` | Fraud signal label (device_reuse, vpn...) | Cases, Decision API |
| `SLAIndicator` | Red/yellow/green circle + time remaining | Case Queue |
| `DeviceCard` | Device info + trust score + reputation | Case Detail, Devices |
| `ReputationGauge` | Semi-circle gauge 0.0-1.0 | Device Detail |
| `VelocityBar` | Horizontal bar vs threshold | Case Detail, Analytics |
| `EventStreamRow` | Time + decision + signals + country + score | Overview |
| `TimelineItem` | Timestamp + event description + icon | Case Detail |

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
| `HeatmapGrid` | Velocity heatmap (hour × day) | Recharts | Analytics |
| `BarChart` | Horizontal/vertical bars | Recharts | Analytics, Velocity |
| `PieChart` | Fraud type distribution | Recharts | Analytics |
| `SparkLine` | Inline mini chart in KPI cards | Recharts | Overview |
| `DeviceGraph` | Force-directed graph (device-account links) | D3.js | Devices (Phase 2) |

### 2.5 Layout

| Component | Description |
|-----------|-------------|
| `PageContainer` | Max-width + padding wrapper |
| `CardGrid` | Responsive grid of cards (1-4 columns) |
| `SplitPanel` | Two-column resizable layout (Case Detail) |
| `EmptyState` | Illustration + message when no data |
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

---

## 3. Component States

All interactive components support:
- **Default** — normal state
- **Hover** — cursor over (subtle background change)
- **Active/Pressed** — click/tap (slightly darker)
- **Focus** — keyboard focus (2px blue outline)
- **Disabled** — greyed out, no interaction
- **Loading** — skeleton or spinner
- **Error** — red border/text for validation errors

---

## 4. Technology Stack

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

## 5. Theming

- **Default theme:** Light mode (as wireframed)
- **Dark mode:** Planned for Phase 2 (fraud analysts often prefer dark)
- All colors from design tokens — no hardcoded hex values
- Risk/decision colors are semantic — independent of theme

---

## 6. Real-time Data Strategy

| Data | Method | Refresh Rate |
|------|--------|-------------|
| Event Stream | WebSocket | Real-time (< 1s) |
| KPI Cards | Polling (TanStack Query) | 30 seconds |
| Case Queue | Polling + WebSocket notification | 10 seconds + push on new case |
| Charts | Polling | 60 seconds |
| Device Reputation | On-demand (fetch on view) | N/A |
| Rule Simulation | Request-response | N/A (async job) |
