# SignalRisk Level 5 Final Hardening Plan

> Date: 11 March 2026
> Basis: code review of auth, decision, feedback, gate runner, evidence, and current roadmap documents

This document supersedes the remaining Level-5 closure subset of `docs/production-readiness-level4-5-plan.md`.

Final go/no-go release verification should be executed with `docs/level5-signoff-checklist.md`.

## 1. Current Maturity Assessment

### Current state

SignalRisk is no longer a prototype-only fraud product.

Verified in code:

- live DSL evaluation is in the decision path
- stateful fraud context is active
- typed prior-decision memory exists
- WebSocket auth uses RS256 + JWKS
- tenant room isolation exists for live decision streaming
- closed-loop feedback enforcement exists through watchlist / allowlist / denylist
- feature snapshot persistence exists

### Current maturity judgment

- Level 4 Closed-Loop Fraud: largely implemented in code
- Level 5 Production Fraud Platform: partially implemented in code, not yet fully closed

### Practical maturity score

| Area | Score | Notes |
|---|---:|---|
| Fraud domain depth | 8.5/10 | strong signal mix, stateful fraud, graph, feedback loop |
| Decisioning maturity | 8/10 | live DSL + stateful path is active |
| Security consistency | 7/10 | core JWT model improved; some auth surface cleanup remains |
| Operational readiness | 6.5/10 | core gates improved, but signoff chain still weak |
| Release trustworthiness | 6/10 | evidence and signoff are still too document-presence driven |
| Overall production maturity | 7/10 | strong staging / pilot-prep, not final Level 5 |

## 2. P0 Level-5 Blockers

These are the remaining blockers that should be treated as Level-5 closure prerequisites.

### P0-1: Release trust chain is still weak

`scripts/run-gates.sh` `G8` still validates mostly document presence rather than real release evidence quality.

Observed:

- latest sprint exit file exists
- quality gates file exists
- scenario catalog exists
- `CLAUDE.md` exists
- ADR file exists

This is not enough for production signoff.

Required closure:

- `G8` must validate artifact quality, not just file existence
- evidence must include actual pass/fail outputs for blocking scenarios
- waiver and exception handling must be explicit
- release signoff must fail if blocking artifacts are stale, missing, or contradictory

Primary files:

- `scripts/run-gates.sh`
- `docs/testing/evidence-and-reporting.md`
- `docs/testing/quality-gates.md`

### P0-2: Evidence generation still hides failures

`scripts/generate-evidence.sh` still collects test output using `|| true`.

Impact:

- failed tests can still generate a polished evidence pack
- release reporting can drift from actual test truth

Required closure:

- remove `|| true` from unit, dashboard, and E2E collection paths
- evidence generation must record failures without converting them into pseudo-success
- if collection is intentionally non-blocking, the report must explicitly say `collection failed`

Primary files:

- `scripts/generate-evidence.sh`

### P0-3: Observability debt on closed-loop state persists

Comments say metrics should exist, but runtime counters are not actually emitted.

Missing or effectively absent in code:

- `entity_profile_update_errors_total`
- `feature_snapshot_write_errors_total`
- `watchlist_check_timeout_total`
- `entity_type_fallback_total`

Impact:

- silent degradation in durable state and ML export paths
- no reliable signal when Level 4/5 paths partially fail in staging or pilot

Required closure:

- emit real counters through the project’s telemetry path
- add these counters to dashboards and alerts
- define acceptable error thresholds in release evidence

Primary files:

- `apps/decision-service/src/decision/decision-store.service.ts`
- `apps/decision-service/src/feedback/watchlist.service.ts`
- `apps/case-service/src/cases/case.service.ts`

### P0-4: Seed/dev separation is still not hardened enough

Seed and non-production fallback behavior still exists in important paths.

Observed:

- non-production login fallback still uses seed credentials
- E2E helpers use test-scoped OAuth client credentials and remain acceptable for non-dashboard API validation
- screenshot automation still uses `admin123`

This is acceptable for dev/test, but not enough for a clean Level-5 boundary.

Required closure:

- maintain explicit dev/test-only gating
- add one prod-like UAT/E2E profile that runs without seed-login dependency
- document and verify which scripts are dev-only
- ensure production-like validation paths do not require fallback credentials

Primary files:

- `apps/auth-service/src/auth/auth.controller.ts`
- `tests/e2e/scenarios/helpers.ts`
- `scripts/capture-screenshots.ts`
- `docs/uat-tests/uat-plan.md`

### P0-5: Auth surface is improved, but not yet fully normalized

Dashboard login now works against the database-backed user store, but auth still exposes a half-connected password grant path.

Observed:

- `POST /v1/auth/login` is DB-backed first
- OAuth token endpoint password grant still returns `not yet connected`

Required closure:

- either fully implement password grant against the same user model
- or explicitly de-scope and document it as unsupported for Level 5

Primary files:

- `apps/auth-service/src/auth/auth.controller.ts`
- `docs/TECHNICAL.md`
- `docs/USER-GUIDE.md`

## 3. Two-Sprint Final Hardening Plan

The final hardening phase should be short and focused. Do not add new product features in this phase.

## Sprint 40: Trust Chain + Observability

### Goal

Make release status trustworthy.

### Scope

1. Harden `G8`
- validate actual evidence contents
- fail on stale or contradictory release artifacts
- require blocking scenario outcomes and signoff fields

2. Fix evidence generation semantics
- remove `|| true` masking from evidence generation
- record collector failures honestly
- separate `test execution failed` from `report generation failed`

3. Add real Level-5 counters
- `entity_profile_update_errors_total`
- `feature_snapshot_write_errors_total`
- `watchlist_check_timeout_total`
- `entity_type_fallback_total`

4. Make telemetry integration mandatory
- call runtime telemetry from decision and feedback paths
- emit the four Level-5 counters through the shared telemetry package
- integrate decision-level telemetry in the live decision path rather than leaving it as optional follow-up

5. Wire counters into dashboards / release evidence
- update metrics controller or telemetry path
- add evidence section for new counters

### Acceptance

- a failing blocking test produces a failing evidence outcome
- `G8` fails if evidence is incomplete or contradictory
- all 4 Level-5 counters are observable at runtime
- decision-service emits real telemetry for decision outcomes and relevant error paths
- staging evidence includes actual counter values

### Owner workstreams

- WS-Delta: gate runner and CI/release checks
- WS-Foxtrot: evidence and signoff definitions
- WS-Golf: stateful fraud metrics

## Sprint 41: Seed Separation + Pilot Validation

### Goal

Prove the platform behaves correctly in a production-like profile.

### Scope

1. Seed/dev separation audit
- document all dev-only credential and fallback paths
- tag scripts as `dev-only`, `test-only`, or `prod-like compatible`
- remove accidental seed assumptions from production-like validation flows

2. Auth surface normalization
- de-scope password grant for Level 5 unless explicitly funded as a follow-up feature
- replace placeholder behavior with explicit unsupported semantics
- align docs and endpoints accordingly

3. Prod-like UAT rerun
- operator invite -> login -> password change
- RS256 WebSocket tenant isolation
- entityType decision -> case -> label -> watchlist propagation
- FRAUD / LEGITIMATE feedback loop enforcement
- feature snapshot persistence checks

4. Final pilot evidence pack
- rerun blocking UAT and E2E scenarios
- publish final evidence pack with explicit signoff

### Acceptance

- at least one prod-like validation profile runs without seed-login fallback
- all Level-4/5 scenarios have current evidence
- auth documentation matches actual supported flows
- pilot readiness verdict is backed by current runtime evidence, not old reports
- screenshot and operator-support scripts no longer depend on hardcoded fallback credentials

### Owner workstreams

- WS-Bravo: auth surface closure
- WS-Foxtrot: UAT and evidence rerun
- WS-Delta: staging/runtime verification
- WS-Echo: dashboard/operator workflow validation

## 4. Required Doc and Gate Updates

These updates should ship in the same cycle as the remaining hardening work.

### Documentation updates

Update after Sprint 40-41 closure:

- `docs/TECHNICAL.md`
- `docs/USER-GUIDE.md`
- `docs/uat-tests/uat-plan.md`
- `docs/testing/evidence-and-reporting.md`
- `docs/testing/quality-gates.md`
- `docs/architecture/system-overview.md`
- `docs/claude/source-of-truth.md`
- `docs/production-readiness-level4-5-plan.md`
- `docs/level5-signoff-checklist.md`

### Gate updates

`G8` should be expanded to verify:

- latest evidence pack exists and matches current sprint/release target
- blocking scenarios contain explicit pass/fail outcome
- open blockers and waivers are listed
- signoff fields are populated
- no stale “PASS” remains from earlier sprint artifacts
- artifact freshness is evaluated against the current target sprint/release, not only by a fixed age threshold

### UAT / scenario updates

The following scenario groups must be treated as Level-5 blockers:

- DB-backed operator login and password flow
- WebSocket cross-tenant isolation
- feedback loop enforcement
- feature snapshot persistence
- prod-like no-seed validation path

## 5. Level-5 Exit Criteria

SignalRisk can be called Level 5 production-ready only when all of the following are true:

1. Blocking gates fail honestly on bad runtime or bad evidence.
2. Evidence generation no longer masks failed test execution.
3. Closed-loop state and snapshot paths emit real error metrics.
4. Decision-service emits runtime telemetry for decision outcomes and key error paths.
5. Prod-like validation can run without seed-login dependency.
6. Auth documentation matches supported production behavior.
7. Current staging or pilot evidence confirms operator auth, WebSocket isolation, feedback enforcement, and snapshot persistence.

## 6. Final Summary

SignalRisk’s remaining Level-5 gap is no longer architecture depth.

The remaining gap is trust:

- trust in release gates
- trust in evidence
- trust in operational visibility
- trust that production-like validation is really production-like

That is a strong place to be. It means the platform does not need a new core design pass. It needs a disciplined final hardening cycle.
