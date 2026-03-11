# SignalRisk Production Readiness Plan — Level 4/5 Hardening

> Version 1.0 | Date: 11 March 2026

## 1. Context

SignalRisk is currently at Maturity Level 3:

- Stateful Fraud Engine

Stateful fraud gap closure for the original P0 set is complete:

- P0-1: live DSL control
- P0-2: typed prior-decision memory
- P0-3: feature registry / DSL / runtime naming parity

Current overall state:

- strong staging candidate
- pilot-prep platform
- not fully production-ready

This plan defines the remaining work to reach:

- Level 4: Closed-Loop Fraud System
- Level 5: Production Fraud Platform

## 2. Remaining Production Blockers

The current blocking gaps are:

1. dashboard login is disabled in production and still relies on seed-only behavior
2. WebSocket auth is inconsistent with the canonical JWT model and tenant room isolation is missing
3. gate runner still contains synthetic PASS behavior
4. analyst feedback does not yet affect live decisioning

## 3. Execution Order

The correct order is:

1. auth consistency
2. WebSocket auth and tenant isolation
3. entityType schema preparation for feedback
4. closed-loop fraud enforcement
5. operational gate hardening
6. explainability
7. feature snapshot writing
8. seed/dev separation audit

Do not start closed-loop feedback enforcement before the entityType chain is ready end to end.

## 4. Sprint 36 — Auth Consistency + entityType Schema Decision

### P0-1 Dashboard Auth → Production Login

#### Problem

`POST /v1/auth/login` currently uses hardcoded seed users and throws `401` in production.

The platform already has:

- PostgreSQL-backed `UsersService`
- bcrypt password hashing
- `AuthService.issueTokenForUser()`
- JWT + refresh token infrastructure

But the login endpoint is not wired to that user store.

#### Additional issue

`UsersService.invite()` creates a temporary password but does not return it in a usable way for an invite-to-login workflow.

#### Reuse targets

- `UsersService`
- `AuthService.issueTokenForUser()`
- `users` table with `id`, `merchant_id`, `email`, `password_hash`, `role`, `created_at`
- existing bcrypt usage in auth-service

#### Changes

| File | Change |
|---|---|
| `apps/auth-service/src/users/users.service.ts` | add `findByEmail(email)` returning `id`, `email`, `role`, `merchant_id`, `password_hash` |
| `apps/auth-service/src/users/users.service.ts` | add `setPassword(merchantId, userId, newPassword)` |
| `apps/auth-service/src/users/users.service.ts` | expand `invite()` response to include `tempPassword` for one-time invite flow |
| `apps/auth-service/src/users/users.controller.ts` | return `tempPassword` from `POST /v1/admin/users/invite` |
| `apps/auth-service/src/users/users.controller.ts` | add `PATCH /v1/admin/users/:id/password` |
| `apps/auth-service/src/auth/auth.module.ts` | import `UsersModule` |
| `apps/auth-service/src/auth/auth.service.ts` | add `loginWithPassword(email, password)` |
| `apps/auth-service/src/auth/auth.controller.ts` | use DB-backed login first; allow seed fallback only outside production |

#### Invite → Login flow

1. admin calls `POST /v1/admin/users/invite`
2. response includes `tempPassword`
3. temp password is communicated out of band
4. invited user logs in via `POST /v1/auth/login`
5. user or admin rotates password with `PATCH /v1/admin/users/:id/password`

#### Acceptance

- valid DB-backed user can log in in production mode
- wrong password returns `401`
- seed fallback only works outside production
- password change works with correct authorization rules
- admin can change passwords only within the same tenant
- non-admin user can change only their own password
- cross-tenant and cross-user password changes return `403`

### P0-2 WebSocket Auth Fix

#### Problem

Current WebSocket auth has three issues:

1. `WsJwtGuard` uses HS256/shared secret assumptions instead of the RS256/JWKS model
2. the guard is not applied to the gateway
3. decision broadcasts are emitted globally instead of tenant-scoped

#### Canonical decisions

- JWKS path must be `/.well-known/jwks.json`
- no `/v1/auth/` prefix is used for JWKS
- `merchant_id` from JWT is the authoritative tenant value
- admin users receive all decision events
- analyst and non-admin users receive only their merchant-scoped events

#### Changes

| File | Change |
|---|---|
| `apps/decision-service/src/decision/decision.gateway.ts` | rewrite `WsJwtGuard` using RS256/JWKS, apply `@UseGuards(WsJwtGuard)`, add room-based broadcasting |

#### Access model

- `admin` role joins `admin`
- non-admin joins `merchant:{merchantId}`
- `broadcastDecision()` emits to `merchant:{event.merchantId}`
- `broadcastDecision()` also emits to `admin`

#### Acceptance

- HS256 token is rejected
- valid RS256 token is accepted
- correct merchant room join occurs
- cross-tenant WebSocket leakage is blocked
- admin receives all events
- admin receives all merchant events through the admin room
- merchant-scoped clients receive only their own tenant events

### Sprint 36 Schema Preparation — entityType End-to-End

#### Problem

Sprint 37 feedback enforcement needs typed entity semantics, but:

- label events currently do not carry `entityType`
- cases currently carry `entityId` but not `entityType`

`watchlist_entries` and `entity_profiles` already use typed entity modeling.

#### Changes

| File | Change |
|---|---|
| `apps/case-service/src/cases/case.types.ts` | add `entityType?: 'customer' | 'device' | 'ip'` |
| `apps/case-service/src/cases/case.repository.ts` | persist and map `entityType` |
| `apps/case-service/src/kafka/label-publisher.service.ts` | add `entityType` to label event schema |
| `apps/case-service/src/cases/case.service.ts` | pass `entityType` from decision event into case + label publish |
| `apps/case-service/src/kafka/decision-consumer.service.ts` | parse `entityType` from decision event |
| `database/migrations/015_cases_entity_type.sql` | add `entity_type` to `cases` with allowed values |

#### Backfill policy

Existing historical cases default to `entity_type = 'customer'`.

This is a compatibility default, not the desired long-term behavior for newly created cases.

New case creation paths should pass `entityType` explicitly.

#### Acceptance

- case records persist `entityType`
- label events publish `entityType`
- decision event to case path preserves typed entity semantics
- fallback to `customer` for missing `entityType` produces structured warning logs
- fallback to `customer` for missing `entityType` increments `entity_type_fallback_total`

## 5. Sprint 37 — Closed-Loop Fraud

### P0-4 Feedback Loop → Live Decision Enforcement

#### Problem

Analyst labels are published, but no consumer enforces them in decision-time logic.

The platform already has:

- `TOPICS.STATE_LABELS`
- `CONSUMER_GROUPS.STATE_LABELS`
- `watchlist_entries`
- `entity_profiles`
- decision-service database access

#### New files

| File | Purpose |
|---|---|
| `apps/decision-service/src/feedback/state-feedback.consumer.ts` | consume labels and update watchlist + entity profile state |
| `apps/decision-service/src/feedback/watchlist.service.ts` | decision-time watchlist lookup with timeout |
| `apps/decision-service/src/feedback/feedback.module.ts` | register feedback services |

#### Existing files to change

| File | Change |
|---|---|
| `apps/decision-service/src/decision/decision-orchestrator.service.ts` | check watchlist before normal decision flow |
| `apps/decision-service/src/decision/decision.module.ts` | import `FeedbackModule` |
| `apps/decision-service/src/decision/decision-store.service.ts` | add `updateEntityProfile()` |

#### Enforcement policy

`FRAUD` label:

- upsert denylist entry
- update entity profile to reflect confirmed fraud state

`LEGITIMATE` label:

- deactivate denylist for that entity
- add allowlist cooldown entry with expiry
- update entity profile to reflect non-fraud confirmation

`INCONCLUSIVE` label:

- log only
- no enforcement action

#### Decision-time watchlist behavior

- denylisted entity → instant `BLOCK`
- watchlisted entity → score boost and explicit risk factor
- allowlisted entity → score suppression only, without bypassing normal scoring
- timeout or lookup failure → safe fallback with no enforcement

Precedence rule:

- `denylist > watchlist > allowlist`

#### Acceptance

- resolving a case as `FRAUD` creates enforceable denylist state
- same entity blocks on next decision
- resolving as `LEGITIMATE` removes denylist effect and applies cooldown policy
- no cross-tenant feedback leakage
- allowlisted entity can still be blocked by strong rule or threshold conditions
- entity profile update failures emit structured logs and increment an error counter

## 6. Sprint 38 — Operational Readiness

### P0-3 Gate Runner Fixes

#### Problem

`run-gates.sh` still contains synthetic PASS behavior and permissive no-test behavior.

#### Changes

| File | Change |
|---|---|
| `scripts/run-gates.sh` | replace hardcoded G7.3 startup PASS with real restart + health verification |
| `scripts/run-gates.sh` | replace hardcoded G7.4 rollback PASS with real stop/start recovery check |
| `scripts/run-gates.sh` | remove `--passWithNoTests` shortcuts where blocking suites are expected |

#### Acceptance

- G7.3 runs a real startup/recovery validation
- G7.4 runs a real recovery sequence
- missing required test suites fail the gate

### P1-1 Explainability Standard

#### Problem

Graph and sequence features are computed but not consistently surfaced in `riskFactors`.

#### Change

| File | Change |
|---|---|
| `apps/decision-service/src/decision/decision-orchestrator.service.ts` | extend `extractRiskFactors()` to include graph, sequence, and feedback-driven factors |

#### Acceptance

- graph, sequence, and feedback effects appear in explainability output
- analysts can see why the decision was upgraded or blocked
- allowlist suppression appears explicitly in explainability when applied

## 7. Sprint 39 — Pilot Prep

### P1-2 Feature Snapshot Writing

#### Change

| File | Change |
|---|---|
| `apps/decision-service/src/decision/decision-store.service.ts` | add `saveFeatureSnapshot()` |
| `apps/decision-service/src/decision/decision-orchestrator.service.ts` | call `saveFeatureSnapshot()` at the end of decision flow |

#### Acceptance

- decisions generate `decision_feature_snapshots`
- snapshot writes do not block decision flow

### P1-3 Seed/Dev Separation Audit

#### Scope

- audit all `NODE_ENV` guards
- grep for hardcoded credentials and test secrets
- run production-mode checks to ensure seed-dependent behavior fails where expected
- confirm CI uses `NODE_ENV=test` appropriately

#### Acceptance

- dev-only behaviors are guarded consistently
- production mode does not rely on seed login or seed credentials
- CI behavior remains stable

## 8. Frozen Decisions

These decisions are frozen and should be treated as implementation constraints.

### FD-1 Email Identity Model

`users.email` is globally unique.

Rationale:

- dashboard/operator identity should map to one user record
- login does not require `merchantId`
- `findByEmail()` remains unambiguous

Implementation implications:

- add unique constraint on `users.email`
- invite duplicate checks should use email uniqueness, not only `(merchant_id, email)`

### FD-2 Allowlist Enforcement Policy

Allowlist is suppression only, not full bypass.

Decision-time precedence:

1. denylist
2. watchlist
3. allowlist

Decision behavior:

- denylist → deterministic `BLOCK`
- watchlist → `+20` score boost
- allowlist → `-15` score suppression

Rationale:

- legitimate confirmation should reduce unnecessary friction
- legitimate confirmation must not create a false-negative hole

Cooldown:

- allowlist entries expire after 30 days

### FD-3 entityType Default Behavior

`entity_type = 'customer'` is allowed only for historical compatibility and controlled fallback paths.

Rules:

- migration backfill may default historical rows to `customer`
- new decision-to-case-to-label paths should pass `entityType` explicitly
- if fallback is used in a new path, emit a structured warning log
- fallback usage should also increment a metric

Recommended metric:

- `entity_type_fallback_total`

## 9. Validation Plan

### Sprint 36

- invite user
- receive temp password
- login with temp password
- rotate password
- connect two WebSocket clients from different merchants
- verify tenant room isolation
- verify `entityType` is preserved from decision to case to label event
- verify admin room receives all decision events
- verify merchant room receives only tenant-scoped events

### Sprint 37

- event → decision → case
- resolve as `FRAUD`
- verify denylist row exists
- send same entity again → `BLOCK`
- resolve later as `LEGITIMATE`
- verify denylist deactivated and cooldown behavior applied
- verify allowlist suppression reduces score but does not bypass strong BLOCK conditions

### Sprint 38

- run G7 with real recovery behavior
- run G3 with missing-test failure behavior

### Sprint 39

- verify snapshot rows exist
- run production-mode checks for seed/dev separation
- verify `entity_type_fallback_total` does not grow unexpectedly in new-path traffic

## 10. Risk Table

| Risk | Impact | Mitigation |
|---|---|---|
| `findByEmail()` returns ambiguous identity | cross-tenant login confusion | freeze email identity model; prefer global unique email |
| temp password handling leaks | credential exposure | return once, never log, require HTTPS |
| WS RS256 switch breaks clients | live feed outage | deploy auth/JWKS readiness first, then gateway change |
| wrong JWKS path | complete WS auth failure | use `/.well-known/jwks.json` only |
| entityType backfill assumption is imperfect | incorrect historical semantics | treat default as compatibility-only; require explicit entityType for new paths |
| fallback `entityType` becomes permanent behavior | semantic drift | log and metric every fallback, remove fallback in later hardening |
| watchlist lookup adds latency | p99 regression | 50ms timeout + safe fallback |
| label consumer races | duplicate list rows | rely on UPSERT + unique constraints |
| seed hardening breaks CI | pipeline instability | keep `NODE_ENV=test` behavior explicit |

## 11. Completion Criteria

### Level 4 Closed-Loop Fraud System

Complete when:

- analyst feedback changes future decisions
- watchlist and denylist are enforced at decision time
- entity profiles are updated durably
- graph, sequence, and feedback factors appear in explainability

### Level 5 Production Fraud Platform

Complete when:

- production login is DB-backed
- WebSocket auth uses RS256/JWKS and tenant room isolation
- release gates contain no synthetic PASS behavior
- feature snapshots are written for export and ML preparation
- seed/dev separation is hardened
- entityType is preserved end to end from decision to case to feedback to enforcement
