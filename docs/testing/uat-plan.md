# SignalRisk User Acceptance Test Plan

## 1. Purpose

This document defines how SignalRisk user acceptance testing must be executed for:

- analyst-facing frontend workflows
- merchant-facing and admin-facing workflows
- core fraud decision functions
- fraud operation and review flows
- staged transaction simulation runs

It is intended to answer:

- what UAT covers
- who participates
- which environments are required
- what must pass before pilot rollout

## 2. UAT Objectives

UAT must prove that:

- analysts can operate the dashboard without workflow blockers
- admins can manage rules, users, merchants, and controls safely
- fraud decisions behave correctly on realistic traffic
- stateful fraud controls behave correctly across repeated same-day activity
- Sprint 36-39 hardening flows behave as documented: DB-backed login, RS256 WebSocket isolation, typed `entityType` propagation, label-driven feedback enforcement, and feature snapshot persistence
- test and simulation traffic remains isolated
- documentation is sufficient for operators to use the platform without relying on tribal knowledge

## 3. Participants

Recommended roles:

- product owner: approves business behavior
- fraud analyst: validates queue, review, labeling, and investigation UX
- operations/admin user: validates admin, settings, and control surfaces
- QA lead: runs scenario traceability and evidence collection
- engineering owner: supports debugging, fixes, and environment readiness

## 4. UAT Environments

### UAT-Staging

Used for:

- frontend walkthroughs
- backend workflow validation
- realistic multi-service integration
- seeded merchant and analyst accounts

Requirements:

- production-like topology
- Kafka, PostgreSQL, Redis, Neo4j available
- webhook test endpoint available
- seeded test merchants and users
- isolated namespace for simulation traffic

### UAT-Simulation

Used for:

- repeated transaction patterns
- fraud-tester and scripted simulation runs
- stateful fraud behavior validation

Requirements:

- separate merchant ids or explicit `is_test` isolation
- metrics visibility
- resettable fixtures

## 5. UAT Scope

### In scope

- dashboard login and session lifecycle
- overview, analytics, live feed, graph intelligence
- cases queue, detail panel, assignment, resolution, escalation
- rules CRUD, activation, disable/rollback
- fraud ops labeling and feedback loop
- admin user management and merchant controls
- webhook subscription and delivery validation
- end-to-end event ingestion to decision outcome
- repeated transaction and stateful fraud behavior
- test traffic isolation from production analytics and customer-facing actions

### Out of scope unless explicitly approved

- unsupported roles or hidden features
- exploratory production testing
- non-production experimental flags

## 6. UAT Entry Criteria

UAT may start only if:

- baseline P0 platform scenarios are green
- environment health is green
- test accounts and seed merchants exist
- latest decision, case, webhook, and auth flows are deployable in staging
- known critical defects are either fixed or explicitly accepted
- user guide and technical guide have an identified owner and refresh plan
- current hardening changes for Sprint 36-39 are deployed to the UAT environment intended for verification

## 7. UAT Workstreams

### Workstream A: Frontend Workflow UAT

Primary surfaces:

- dashboard login
- overview
- cases
- rules
- fraud ops
- analytics
- graph intelligence
- live feed
- settings
- admin

Business acceptance questions:

- can an analyst complete daily review work without leaving the product?
- can an admin manage controls without confusing or dangerous behavior?
- are decision explanations understandable enough for investigation?

### Workstream B: Functional Decisioning UAT

Primary surfaces:

- event ingestion
- decision generation
- case creation
- webhook delivery
- rule changes
- analyst feedback impact

Business acceptance questions:

- does the platform return the expected decision for known good and known bad samples?
- do BLOCK and REVIEW paths create the correct downstream actions?
- do rule changes behave predictably?

### Workstream C: Stateful Fraud UAT

Primary surfaces:

- repeated same-day customer actions
- device-sharing behavior
- IP burst behavior
- sequence-based fraud patterns
- prior-decision memory
- graph enrichment

Business acceptance questions:

- do repeated suspicious actions escalate correctly?
- are stateful risk explanations present and believable?
- does feedback from prior cases affect future decisions as intended?
- do Sprint 36-39 hardening changes preserve tenant isolation and operator usability while adding closed-loop enforcement?

## 8. UAT Scenario Packs

### Pack 1: Analyst Daily Operations

Scenarios:

- login as analyst
- inspect overview KPIs and live feed
- open case queue
- filter by status, priority, entity
- review case evidence
- resolve as FRAUD / LEGITIMATE / INCONCLUSIVE
- verify case status and queue updates

Success criteria:

- no blocking UI defects
- actions persist correctly
- status changes are visible without manual workaround

### Pack 2: Admin and Controls

Scenarios:

- login as admin
- create, edit, disable, and re-enable rules
- manage users
- verify role-based page access
- inspect merchant-level settings

Success criteria:

- admin flows complete successfully
- unsafe role escalation is blocked
- rule changes can be validated and rolled back

### Pack 3: Merchant Event to Decision Flow

Scenarios:

- send valid event
- receive decision
- create case for REVIEW/BLOCK
- deliver webhook
- confirm signature and payload

Success criteria:

- event-to-decision path completes end to end
- downstream actions match decision outcome

### Pack 4: Stateful Fraud Behavior

Scenarios:

- repeated same-customer transactions across 10m, 1h, and 24h windows
- same device across multiple accounts
- same IP burst of signups or payments
- previous BLOCK history causing escalation
- sequence pattern such as login then payment

Success criteria:

- counters increment correctly
- stateful rules affect outcome
- explanations include the triggering stateful signals

### Pack 5: Test Isolation and Safety

Scenarios:

- run test traffic through fraud simulation
- verify analytics exclusion
- verify webhook suppression or isolation
- verify no contamination of merchant-facing metrics

Success criteria:

- test traffic remains isolated end to end
- no customer-visible side effects occur from simulation runs

## 9. Transaction Simulation Strategy

UAT should not rely only on manual clicking.

Use three simulation modes:

### Mode 1: Guided Manual UAT

Purpose:

- validate frontend UX and operator understanding

Examples:

- analyst reviews a real seeded case
- admin updates a rule and sees impact

### Mode 2: Scripted Functional Simulation

Purpose:

- validate deterministic event patterns and expected decisions

Examples:

- single valid payment
- high-risk emulator payment
- repeated customer transactions in 10 minutes
- cross-account device reuse

Recommended execution:

- API scripts
- integration tests
- seeded fixtures

### Mode 3: Fraud Blast Simulation

Purpose:

- validate higher-volume fraud patterns and stateful behavior

Examples:

- card testing burst
- signup farm from one IP
- device-sharing ring
- prior-BLOCK repeat offender
- sequence fraud patterns

Recommended execution:

- fraud-tester scenarios
- load scripts
- staged scenario batches with evidence collection

## 10. Automation Model

The automation stack should be layered:

### UI automation

Use for:

- login
- navigation
- cases workflow
- rules/admin flows
- analyst labeling

Recommended tool:

- Playwright

### API and integration automation

Use for:

- ingestion
- decision response validation
- case and webhook checks
- stateful fraud verification

Recommended tools:

- Jest integration suites
- Supertest
- Kafka-backed integration specs

### Simulation automation

Use for:

- repeated transaction patterns
- burst traffic
- sequence patterns
- graph-linked entity traffic

Recommended tools:

- fraud-tester
- k6 where load matters
- seeded scenario runners under `tests/integration/stateful` and `tests/e2e/scenarios/stateful-fraud`

## 11. Fraud Simulation Matrix

Minimum simulation families:

| Family | Example pattern | Expected outcome |
|---|---|---|
| Clean traffic | one-off valid user payment | ALLOW |
| Velocity abuse | 6 payments in 10m | REVIEW or BLOCK |
| Repeat offender | new payment after prior BLOCK history | escalated decision |
| Device spread | one device across many accounts | REVIEW or BLOCK |
| IP burst | signup/payment burst from one IP | REVIEW or BLOCK |
| Sequence fraud | login then payment or failed x3 then success | rule-triggered escalation |
| Graph-linked abuse | shared device or fraud ring proximity | escalated decision |
| Analyst feedback | confirmed fraud label followed by new event | higher risk or block |
| Isolation | simulation traffic with `is_test` | excluded from normal analytics/webhook paths |

## 12. Evidence Required for UAT

Each UAT cycle must produce:

- scenario execution sheet
- screenshots or screen recordings for critical UI paths
- API request/response evidence for decision flows
- webhook payload samples
- defect list with severity
- simulation run summary
- decision outcome summary for clean vs fraud traffic
- signoff record by participant role

## 13. Exit Criteria

UAT passes only if:

- all critical packs pass
- no Sev-1 or Sev-2 blocker remains open
- stateful fraud scenarios show expected escalations
- simulation traffic isolation is confirmed
- required user-facing docs are updated
- signoff is recorded from product, QA, and operations/fraud stakeholders

UAT must also produce documentation corrections for any mismatch found between:

- actual UI behavior and `docs/USER-GUIDE.md`
- actual runtime behavior and `docs/TECHNICAL.md`
- actual acceptance flow and `docs/testing/*`

## 14. Recommended Repo Mapping

| UAT area | Suggested location |
|---|---|
| UAT scenarios and evidence templates | `docs/testing` |
| Frontend UAT automation | `tests/e2e/specs` |
| Functional integration UAT | `tests/integration` |
| Stateful fraud automation | `tests/integration/stateful`, `tests/e2e/scenarios/stateful-fraud` |
| Load and burst simulation | `tests/load`, `tests/benchmark`, `docs/runbooks/load-testing.md` |

## 15. Continuous Maintenance Rule

This UAT plan is a living document.

It must be updated when any of the following changes:

- user roles or access model
- frontend workflow or page structure
- decision behavior visible to analysts or admins
- simulation packs, fixtures, or signoff expectations

Do not defer UAT document updates to a later documentation sprint if they affect current acceptance behavior.
