# SignalRisk Scenario Catalog

## 1. Purpose

This catalog defines the scenarios that must be executed for sprint closure, release closure, and production readiness.

Priority levels:

- `P0`: release-blocking
- `P1`: must pass before pilot or beta release
- `P2`: important regression coverage
- `P3`: exploratory or extended coverage

## 2. Scenario Template

Each scenario in this catalog includes:

- ID
- priority
- objective
- preconditions
- execution steps
- expected result
- success criteria
- owning agent
- automation target

## 3. P0 Core Platform Scenarios

### SR-P0-001 Merchant Auth Issues Access Token

- Objective: verify valid merchant credentials produce a usable token.
- Preconditions: auth-service healthy; merchant exists; signing config loaded.
- Steps:
  1. request token with valid credentials
  2. decode and verify token
  3. call a protected downstream endpoint
- Expected result: token issued and accepted downstream.
- Success criteria:
  - status `200`
  - token contains expected merchant identity and role claims
  - protected route accepts token
- Owner: `qa`, `security`
- Automation: API integration

### SR-P0-002 Invalid Credentials Are Rejected

- Success criteria:
  - invalid client secret returns `401`
  - malformed auth request returns `400`
  - no token issued
- Owner: `security`
- Automation: API integration

### SR-P0-003 Event Ingestion Accepts Valid Event

- Success criteria:
  - `POST /v1/events` returns accepted response
  - event reaches raw topic with required headers
  - correlation data preserved
- Owner: `qa`
- Automation: integration + Kafka validation

### SR-P0-004 Invalid Event Routes to DLQ

- Success criteria:
  - invalid payload is rejected or marked rejected
  - DLQ record is produced or stored per design
  - request does not hang beyond timeout policy
- Owner: `qa`
- Automation: integration

### SR-P0-005 Decision Flow Produces Deterministic Outcome

- Success criteria:
  - valid input triggers decision generation
  - decision record is persisted
  - response contains action, score, latency, and request id
- Owner: `qa`
- Automation: integration

### SR-P0-006 Decision Event Reaches Case Service

- Success criteria:
  - BLOCK/REVIEW decision produces downstream message
  - case-service consumes it
  - case is created exactly once for the request
- Owner: `qa`
- Automation: integration

### SR-P0-007 Decision Event Reaches Webhook Service

- Success criteria:
  - BLOCK/REVIEW decision reaches webhook pipeline
  - configured merchant webhook receives signed payload
  - retries occur on transient failure
- Owner: `qa`
- Automation: integration/E2E

### SR-P0-008 Test Traffic Is Isolated

- Success criteria:
  - test-marked traffic is excluded from analytics
  - test-marked traffic does not trigger merchant webhook
  - isolated counters or storage markers are present
- Owner: `qa`
- Automation: integration

### SR-P0-009 Cross-Tenant API Access Is Denied

- Success criteria:
  - tenant A token cannot read or mutate tenant B resources
  - denial is consistent across auth, cases, exports, analytics, and admin-sensitive paths
- Owner: `security`
- Automation: API isolation suite

### SR-P0-010 Forged or Tampered JWT Is Rejected

- Success criteria:
  - modified signature token rejected
  - modified merchant claim rejected
  - expired token rejected
- Owner: `security`
- Automation: API security suite

### SR-P0-011 Dashboard Login and Session Flow

- Success criteria:
  - valid user logs in
  - protected pages render
  - logout or revoke invalidates session
- Owner: `qa`
- Automation: Playwright

### SR-P0-012 Case Review Workflow

- Success criteria:
  - analyst opens case
  - resolution action persists
  - queue state reflects update
- Owner: `qa`
- Automation: Playwright + API validation

## 4. P0 Resilience and Runtime Scenarios

### SR-P0-013 Redis Outage Degrades Safely

- Success criteria:
  - system behavior matches degraded design
  - no unsafe allow/block due to silent null path
  - error and metric signals are emitted
- Owner: `devops-sre`, `qa`
- Automation: chaos/integration

### SR-P0-014 Kafka Outage Degrades Safely

- Success criteria:
  - ingestion or downstream publish failure is bounded
  - timeouts/backpressure work as designed
  - no silent message loss is accepted without alert
- Owner: `devops-sre`, `qa`
- Automation: chaos/integration

### SR-P0-015 Readiness Reflects Real Dependency State

- Success criteria:
  - critical dependency unavailable -> readiness fails or degrades per contract
  - liveness and readiness are not falsely green
- Owner: `devops-sre`
- Automation: readiness checks

### SR-P0-016 Deployment Smoke and Rollback

- Success criteria:
  - deployed environment passes smoke checks
  - rollback procedure restores service safely
  - smoke reruns green after rollback
- Owner: `devops-sre`
- Automation: staging runbook execution

## 5. P1 Product and Control Scenarios

### SR-P1-001 Rule Create/Update/Disable Flow

- Success criteria:
  - rule mutation persists
  - next decision reflects intended effect
  - rollback or disable path works

### SR-P1-002 Webhook Signature Validation Contract

- Success criteria:
  - payload signed with expected algorithm
  - replay or invalid signature sample is documented and reproducible

### SR-P1-003 Analytics Excludes Test Data

- Success criteria:
  - dashboards and analytics endpoints ignore `is_test` traffic
  - merchant stats remain clean after fraud tester run

### SR-P1-004 GDPR/Export Flow

- Success criteria:
  - valid tenant can export own entity data
  - cross-tenant export blocked
  - export evidence contains only scoped data

### SR-P1-005 Token Revoke Path

- Success criteria:
  - revoked token denied on subsequent access
  - denylist or equivalent state persists for remaining token life

## 6. P1 Performance and Capacity Scenarios

### SR-P1-006 Decision Latency Gate

- Success criteria:
  - p95 and p99 within approved threshold in staging profile
  - error rate within threshold
- Owner: `qa`, `devops-sre`
- Automation: load/benchmark

### SR-P1-007 Event Throughput Gate

- Success criteria:
  - throughput target sustained for approved duration
  - no uncontrolled error growth
  - lag/backpressure remains within policy

### SR-P1-008 Burst Backpressure Correctness

- Success criteria:
  - overload path returns correct status and retry guidance
  - system remains recoverable after burst ends

## 7. Stateful Fraud Closure Scenarios

These scenarios close the remaining gaps identified in the stateful fraud implementation review.

### SR-SF-P0-001 Live DSL Control

- Objective: prove that live decision outcomes are controlled by DSL evaluation for stateful logic.
- Preconditions: rule-engine reachable; stateful rules loaded; deterministic test fixture prepared.
- Steps:
  1. submit a request that matches a known stateful rule
  2. capture action and `appliedRules`
  3. disable or modify the matching DSL rule
  4. resubmit the same request
- Expected result: decision outcome changes because DSL logic changed.
- Success criteria:
  - decision outcome differs after DSL change
  - `appliedRules` only contains actual matched DSL rules
  - fallback path is explicit if rule-engine evaluation fails
- Owner: `qa`, `platform-core`
- Automation: integration + contract

### SR-SF-P0-002 Typed Prior Memory

- Objective: prove prior-decision memory is correct per supported entity type.
- Preconditions: historical decision fixtures exist for customer and device; entity policy frozen for IP semantics.
- Steps:
  1. create prior BLOCK and REVIEW decisions for a customer
  2. evaluate a new decision for that customer
  3. repeat for device-specific history
  4. verify IP behavior matches documented policy
- Expected result: prior-memory features are correct and do not silently reuse the wrong entity model.
- Success criteria:
  - `stateful.customer.previousBlockCount30d` matches fixture history
  - `stateful.customer.previousReviewCount7d` matches fixture history
  - device history is isolated from customer history
  - unsupported/default IP behavior is explicit
- Owner: `qa`, `platform-core`
- Automation: integration

### SR-SF-P0-003 Feature Registry Parity

- Objective: prove feature governance matches runtime behavior and DSL usage.
- Preconditions: active feature definitions seeded; runtime stateful feature export available.
- Steps:
  1. enumerate active features from the registry
  2. enumerate DSL-referenced stateful fields
  3. enumerate runtime-produced stateful fields
  4. compare all three sets
- Expected result: registry, runtime, and DSL are aligned.
- Success criteria:
  - no active DSL field is missing from the registry
  - no active registry field is missing at runtime
  - no conflicting names remain for the same feature concept
- Owner: `qa`, `data-schema`
- Automation: static + integration

### SR-SF-P0-004 Stateful Explainability

- Objective: prove stateful decisions are explainable across feature classes.
- Preconditions: one prior-memory rule, one sequence rule, and one graph rule can be triggered in test data.
- Steps:
  1. trigger a prior-memory decision
  2. trigger a sequence-based decision
  3. trigger a graph-enriched decision
  4. inspect decision response or persisted explanation payload
- Expected result: matched stateful rules produce structured explanations.
- Success criteria:
  - each matched rule includes feature name, observed value, and explanation text
  - explanation structure is consistent across prior-memory, sequence, and graph rules
- Owner: `qa`, `fraud-ops`
- Automation: integration + API validation

### SR-SF-P1-005 Analyst Feedback Enforcement

- Objective: prove analyst feedback changes future decisions according to policy.
- Preconditions: label publishing active; watchlist and analyst label tables available; policy documented.
- Steps:
  1. mark an entity as `confirmed_fraud`
  2. submit a new request for the same entity
  3. add a denylist entry
  4. submit another request
- Expected result: analyst feedback has deterministic downstream effect.
- Success criteria:
  - confirmed fraud changes risk or action according to policy
  - denylist changes the decision deterministically
  - legitimate labels do not suppress unrelated high-risk signals
- Owner: `qa`, `fraud-ops`, `security`
- Automation: integration + E2E

## 8. P2 Regression Scenarios

- feature flag rollout correctness
- graph intelligence read flow
- merchant CRUD and config lifecycle
- live feed connectivity and reconnect
- fraud ops labeling workflow
- docs validation and workspace integrity
- compliance control assertions
- disaster recovery health checks

## 9. Scenario-to-Repo Mapping

| Scenario family | Suggested automation location |
|---|---|
| Auth/API core | `tests/integration`, `tests/e2e/scenarios`, service integration specs |
| Dashboard flows | `tests/e2e/specs` |
| Isolation | `tests/isolation`, `tests/e2e/scenarios/multi-tenant-isolation.spec.ts` |
| Kafka/contract | `tests/kafka-integration` |
| Load/perf | `tests/load`, `tests/benchmark` |
| Readiness/smoke | `tests/production-readiness`, `tests/smoke`, `tests/dr` |
| Compliance/docs | `tests/compliance`, `tests/docs` |
| Stateful fraud closure | `tests/integration/stateful`, `tests/contracts/stateful`, `tests/e2e/scenarios/stateful-fraud` |

## 10. Mandatory Execution Matrix

| Stage | Must run |
|---|---|
| PR touching business logic | impacted unit/component/integration scenarios |
| PR touching auth/data access | all P0 auth and isolation scenarios |
| PR touching broker contracts | P0 decision/event contract scenarios |
| Sprint close | all P0 plus impacted P1 |
| Release candidate | all P0 and P1 |
| Production deploy | smoke subset of P0 runtime scenarios |

## 11. Scenario Closure Rule

No scenario in sections 3 or 4 may be waived by an agent.

Only a human approver may waive a P0 scenario, and the waiver must include:

- exact scenario id
- business rationale
- risk statement
- expiry date
- mitigation plan
