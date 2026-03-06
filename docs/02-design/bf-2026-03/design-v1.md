# SignalRisk v2 — Brownfield Gap Analysis: Design (v1)
# STATUS: APPROVED (lightweight — brownfield UI changes only, no new screens)

**Date:** 2026-03-06
**Scope:** UI/UX changes required by gap analysis requirements (v7)

> Note: This is a brownfield project. All existing screens and design system remain unchanged.
> This document only covers the delta — new UI states, indicators, and interaction behaviors.

---

## Affected Components

### 1. KPI Cards — Stale Data State (P1.1)
**Component:** `apps/dashboard/src/pages/OverviewPage.tsx` + `dashboard.store.ts`

**New UI states:**

| State | Visual | Copy |
|-------|--------|------|
| Fresh | `lastUpdated` timestamp below value (gray, small) | "Updated Xm ago" |
| Stale (network) | Amber badge above timestamp | "Offline — last updated Xm ago" |
| Stale (server 5xx) | Amber badge above timestamp | "Stale — last updated Xm ago" |
| Recovery | Badge disappears, timestamp updates | "Updated just now" |

**Design constraints:**
- Use existing amber color token (`text-amber-500` / `bg-amber-50`)
- Badge appears in same-tick as failure (no animation delay)
- No modal, no blocking overlay — dashboard remains fully usable

---

### 2. Case Search — Loading & Empty States (P2.4)
**Component:** `apps/dashboard/src/pages/FraudOpsPage.tsx` (case search input)

**Interaction states:**

| Trigger | State | Indicator |
|---------|-------|-----------|
| Typing (non-whitespace) | Debounce (300ms) | No indicator during wait |
| Active API call | Searching | "Searching…" text or spinner near input |
| Results returned | Display | Case list updates |
| No results | Empty | "No cases match your search" (centered, muted) |
| Whitespace-only input | Reset | Full list, no indicator |
| Clear input | Reset | Full list, page 1 |

**Design constraints:**
- "Searching…" indicator: inline, near the search input, not a full-page loader
- "No cases match your search": use existing empty-state pattern from CasesPage
- AbortController: old requests silently cancelled (no UI feedback for cancellation)

---

### 3. Settings Form — Error & Success States (P2.3)
**Component:** `apps/dashboard/src/App.tsx` SettingsPage

**States:**

| Event | Visual | Duration |
|-------|--------|---------|
| Save success | Green "Saved" text next to button | 2 seconds, then disappears |
| localStorage error | Red inline error "Settings could not be saved" | Until next save attempt |

**Already implemented.** No design change needed — matches existing pattern.

---

## No New Screens

All other gap items (P0.x security, P3.x backend) are API/backend changes with no UI impact.

The Evidence Timeline (P2.2), Rules Page (P2.1), and KPI/trend wiring (P1.x) were already implemented in prior sessions — no new design required.

---

## Design System Tokens Used

| Usage | Token |
|-------|-------|
| Stale/offline badge bg | `bg-amber-50` |
| Stale/offline badge text | `text-amber-600` |
| Timestamp secondary text | `text-text-secondary` (existing) |
| Error text | `text-red-600` (existing) |
| Success text | `text-green-600` (existing) |

All tokens are from the existing Tailwind design system. No new tokens needed.
