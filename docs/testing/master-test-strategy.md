# SignalRisk Master Test Strategy

## 1. Purpose

This document defines the full test strategy required to make SignalRisk releaseable as a production fraud platform.

The strategy is built for a system where silent failures are unacceptable:

- fraud decisions must be correct enough to trust
- tenant isolation must be provable
- degraded dependencies must not create unsafe behavior
- documentation and runtime behavior must stay aligned

## 2. Quality Objectives

SignalRisk testing must prove the platform is:

- functionally correct
- secure in multi-tenant operation
- resilient under dependency failure
- observable during incidents
- performant under expected and burst traffic
- safe to deploy and safe to roll back

## 3. Test Principles

### 3.1 Shift-left with hard gates

Every change should be caught at the cheapest possible layer first:

1. unit
2. component
3. integration
4. contract
5. E2E
6. load/resilience
7. release smoke

### 3.2 No blind green

A passing test suite is not sufficient if:

- the relevant scenario was never executed
- mocks hide real integration risk
- known failures were ignored
- evidence was not retained

### 3.3 Multi-tenant safety over feature velocity

For SignalRisk, cross-tenant leakage is a release blocker. Tenant isolation tests are mandatory in every sprint touching auth, data access, dashboard access, analytics, case management, or exports.

### 3.4 Retry only with purpose

When a scenario fails, agents must not close it as flaky. They must classify the failure:

- deterministic product defect
- environment defect
- test defect
- intermittent infrastructure issue

The scenario remains open until the pass condition is observed or a human explicitly waives it.

## 4. Scope

### In scope

- backend services
- dashboard
- SDK-facing APIs
- Kafka event flows
- Redis and PostgreSQL interaction
- Neo4j-dependent graph intelligence flows
- auth and RBAC
- webhook delivery
- fraud tester isolation behavior
- CI quality gates
- deployment and rollback validation

### Out of scope

Only the following may be out of scope, and only with explicit signoff:

- third-party provider correctness beyond contract boundaries
- unsupported browsers or platforms
- non-production experimental features behind disabled flags

## 5. Test Layers

| Layer | Goal | Primary tools | Exit expectation |
|---|---|---|---|
| Unit | Verify logic in isolation | Jest, Vitest | High confidence in core decision/auth/rules logic |
| Component | Verify service/module behavior with local deps | Jest, Nest testing | Service behavior stable before integration |
| Integration | Verify service-to-service and DB/broker flows | Jest, Supertest, TestContainers | Core API and data flows pass |
| Contract | Verify payload and topic compatibility | OpenAPI, schema checks, Kafka schema tests | No producer/consumer drift |
| E2E | Verify operator and user journeys | Playwright | Critical workflows work end to end |
| Isolation | Verify tenant boundaries and auth containment | Jest, API tests, DB checks | 100% pass on protected paths |
| Resilience | Verify failure handling | chaos specs, targeted failure injection | Safe degradation under outage conditions |
| Performance | Verify latency, throughput, backpressure | k6, benchmark specs | SLOs and capacity gates pass |
| Compliance/Readiness | Verify release safety | readiness, compliance, docs checks | Release signoff evidence complete |
| Smoke/Post-deploy | Verify deployed environment | smoke suite, health checks | Environment safe for traffic |

## 6. Test Environments

### Local developer

Used for:

- unit
- component
- targeted integration
- fast regressions

Not sufficient for release signoff.

### CI shared

Used for:

- build/lint/unit/component
- non-browser integration
- docs/workspace/compliance gates

Must fail hard. No `|| true` masking is allowed.

### Ephemeral integration environment

Used for:

- broker/database-backed integration tests
- contract regression
- resilience rehearsal against isolated infra

### Staging

Used for:

- full end-to-end regression
- production-like load tests
- failover, readiness, smoke, and rollback checks

Release signoff must come from staging or an equivalent production-like environment.

### Production

Used only for:

- synthetic smoke
- canary validation
- post-deploy health validation

No exploratory or destructive testing against production unless explicitly approved.

## 7. Coverage Expectations

| Domain | Minimum expectation |
|---|---|
| Decision engine | >80% line, >90% branch on scoring and threshold paths |
| Auth and tenant isolation | >80% line, >90% branch on authn/authz paths |
| Rule engine | >80% line, >90% branch on parser/evaluator |
| All backend services | >80% line and branch where practical |
| Critical integrations | 100% of critical flows represented by tests |
| Tenant-isolated endpoints | 100% negative and positive coverage on exposed paths |

## 8. Critical Business Flows

The following flows are release-blocking and must always pass:

1. Merchant auth -> event ingestion -> decision -> case creation
2. Merchant auth -> event ingestion -> decision -> webhook delivery
3. Dashboard login -> case queue -> case resolution
4. Rule update -> decision impact validation -> rollback path
5. Token revoke -> access denial on protected routes
6. Test traffic ingestion -> analytics/webhook isolation
7. Cross-tenant request attempt -> access denied
8. Kafka slowdown/outage -> safe degradation and alertable behavior
9. Redis slowdown/outage -> safe degradation and bounded impact
10. Deployment -> readiness -> smoke -> rollback validation

## 9. Non-Functional Quality Gates

These are default platform gates and may be tightened over time.

| Area | Gate |
|---|---|
| Decision latency | p99 under release threshold in staging |
| Event ingestion | sustained throughput at target profile |
| Error rate | within defined threshold under normal load |
| Webhook delivery | success and retry behavior verified |
| Kafka lag handling | backpressure or degradation behavior verified |
| Isolation | zero cross-tenant leakage |
| Security | zero unresolved critical findings |
| Observability | logs, metrics, and alerts visible for critical flows |

## 10. Traceability Model

Every requirement or critical risk must map to:

1. at least one test scenario
2. an owning agent
3. an execution environment
4. evidence
5. a pass/fail decision

No release-critical requirement may remain untested or orphaned.

## 11. Release Decision Policy

A release is blocked if any of the following is true:

- any P0 or P1 scenario fails
- any tenant isolation test fails
- any critical auth path fails
- any core producer/consumer contract drifts
- performance gates fail without approved exception
- readiness, smoke, or rollback validation is incomplete
- evidence pack is incomplete

## 12. Deliverables Per Sprint

Each sprint must produce:

- updated scenario execution report
- defect list by severity
- evidence for failed and passed blocking scenarios
- updated risk register
- explicit statement of what remains untested

## 13. Roles

| Role | Responsibility |
|---|---|
| QA agent | Automates and runs tests, records evidence |
| Security agent | Auth, abuse, tenant isolation, secret exposure, control validation |
| DevOps/SRE agent | Readiness, deploy, rollback, observability, resilience |
| Backend/frontend agents | Fix defects, add missing test hooks, maintain local testability |
| Orchestrator agent | Enforces the retry loop and quality gates |
| Human approver | Final waiver/acceptance authority for exceptions |
