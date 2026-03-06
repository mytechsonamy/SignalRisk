# SignalRisk v2 — Brownfield Gap Analysis: Sprint Plan (v1)
# STATUS: IN REVIEW (planning iteration 2, revision pending)

**Date:** 2026-03-06
**Requirements ref:** docs/01-requirements/bf-2026-03/gap-analysis-v7.md
**Architecture ref:** docs/03-architecture/bf-2026-03/architecture-v1.md

> Note: This is the first planning iteration. v2 will address reviewer feedback:
> integrate tests with features, split large tasks, add estimates and agent roles.

---

## Overview

10 tasks across 2 sprints. All tasks are fixes/additions to existing code.

| Sprint | Focus | Parallelism |
|--------|-------|-------------|
| Sprint 1 | Security + backend (P0, P3) | 4 agents |
| Sprint 2 | Dashboard + tests (P1, P2, P4) | 4 agents |

---

## Sprint 1 — Security & Backend

| ID | Task | Agent Role | Est | Service |
|----|------|-----------|-----|---------|
| T1 | AdminGuard jti Redis denylist + logout endpoint | Backend Engineer | 3h | auth-service |
| T1-test | AdminGuard unit tests (AC1-AC5 + Redis down→503) | QA Engineer | 2h | auth-service |
| T2 | Refresh token: deleted user → 401, resolveRole() helper | Backend Engineer | 1h | auth-service |
| T2-test | Refresh token handler tests (deleted, admin, merchant) | QA Engineer | 1h | auth-service |
| T3 | DLQ: exhaustRetries() → Kafka dlq.exhausted topic + cache cap | Backend Engineer | 2h | event-collector |
| T3-test | DlqConsumerService tests (6 cases) | QA Engineer | 2h | event-collector |
| T4 | Feature toggles env vars + startup log (3 services) | Backend Engineer | 1h | 3 services |

**Total Sprint 1:** ~12h, 4 agents parallel (T1+T2+T3+T4 first, then T1-test+T2-test+T3-test)

---

## Sprint 2 — Dashboard & Tests

| ID | Task | Agent Role | Est | Service |
|----|------|-----------|-----|---------|
| T5 | Sequential KPI polling + stale badge + visibilityChange | Frontend Engineer | 3h | dashboard |
| T5-test | OverviewPage component tests (badge lifecycle, visibilityChange) | QA Engineer | 2h | dashboard |
| T6 | AbortController for search + whitespace guard + loading indicator | Frontend Engineer | 2h | dashboard |
| T6-test | Search component + E2E fraud-ops.spec.ts assertions | QA Engineer | 2h | dashboard |
| T7a | ApiKeyService unit tests (8 cases) | QA Engineer | 1h | event-collector |
| T7b | ProxyDetector.isVpnIp() unit tests (12+ cases) | QA Engineer | 1h | network-intel-service |
| T8 | CaseDetailPanel + RulesPage + SettingsPage component tests | QA Engineer | 2h | dashboard |
| T10 | Docs: sync architecture-v1.md changes to code comments | DevEx | 0.5h | all |

**Total Sprint 2:** ~13.5h, 4 agents parallel

---

## Dependency Graph

```
Sprint 1 (all parallel):
  T1 → T1-test
  T2 → T2-test
  T3 → T3-test
  T4 (independent)

Sprint 2 (first wave parallel):
  T5 → T5-test
  T6 → T6-test (includes E2E)
  T7a, T7b (independent — testing existing implementations)
  T8 (CaseDetailPanel, RulesPage, SettingsPage tests — no impl dependency)
  T10 (no dependency)
```

Note: T7a/T7b test ApiKeyService and ProxyDetector which are ALREADY IMPLEMENTED (Sprint 1-8). Tests only, no new implementation.

---

## Acceptance Gate

Before marking sprint complete:
- `pnpm test` exits 0 in all affected services
- No non-flaky test failures
- Flaky test count ≤ 5 total across all services
- Feature toggle smoke test in integration environment

---

## Risk Register

| Risk | Mitigation |
|------|-----------|
| RedisService not injectable in AdminGuard | RedisModule is @Global() — confirm injection works in unit test |
| DLQ exhausted Kafka topic not pre-created | KafkaModule has `allowAutoTopicCreation: true` |
| AbortError surfaced as UI error | Catch AbortError specifically; do not show to user |
| Dashboard state shape change breaks existing tests | Add `isStale?: boolean` and `lastUpdated?: number` with defaults (false, 0) |
