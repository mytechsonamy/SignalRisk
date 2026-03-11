# SignalRisk Stateful Fraud Delivery Roadmap

> Version 1.0 | Date: 11 March 2026

## 1. Purpose

This document turns the stateful fraud scope into an executable delivery roadmap.

It is designed to answer:

- what should be built first
- which epics are required
- what each sprint should produce
- what the acceptance criteria are

## 2. Delivery Strategy

The correct order is:

1. hot online counters and state access
2. durable entity memory
3. stateful rules
4. analyst feedback state
5. graph-backed state
6. ML-ready feature logging

Do not start with advanced ML or complex graph scoring before the online and durable state foundations exist.

## 3. Proposed Epics

## Epic SF-1: Online Stateful Feature Foundation

Goal:

- establish low-latency state reads for decisioning

Scope:

- Redis key model
- temporal counters
- online state fetch interface
- entity type normalization
- feature freshness metadata

Acceptance criteria:

- decision-service can read customer/device/IP counters in real time
- state fetch stays inside latency budget
- hot state is tenant-scoped and test-covered

## Epic SF-2: Durable Entity Memory

Goal:

- introduce durable fraud memory beyond live counters

Scope:

- `entity_profiles`
- `entity_state_snapshots`
- `decision_feature_snapshots`
- previous REVIEW/BLOCK memory
- first-seen / last-seen tracking

Acceptance criteria:

- entity profile survives Redis reset
- analysts and services can retrieve durable entity risk memory
- feature snapshots exist for every decision

## Epic SF-3: Stateful Rule Engine

Goal:

- evaluate rules that use temporal and historical context

Scope:

- rule context expansion
- stateful DSL fields
- cumulative risk rules
- repeat-pattern rules
- sequence markers

Acceptance criteria:

- rule-engine can evaluate stateful feature keys
- at least 5 production-relevant stateful rules active in staging

## Epic SF-4: Analyst Feedback State

Goal:

- turn case outcomes into future fraud memory

Scope:

- `analyst_labels`
- watchlist / allowlist / denylist
- feedback event propagation
- linked-entity risk adjustments

Acceptance criteria:

- analyst-confirmed fraud changes future decisions for the same entity
- explicit watchlist/denylist entries affect online decisioning

## Epic SF-5: Graph-Backed Stateful Risk

Goal:

- include relational fraud memory in online scoring

Scope:

- graph feature extraction
- cluster risk score
- linked fraud count
- device sharing and IP sharing online indicators

Acceptance criteria:

- graph-derived features appear in decision context
- graph outage degrades safely

## Epic SF-6: Feature Governance and ML Readiness

Goal:

- make stateful features reusable, explainable, and trainable

Scope:

- feature definitions
- feature versioning
- training export path
- label joins
- feature observability

Acceptance criteria:

- every stateful feature has definition and owner
- feature snapshots can be exported for training

## 4. Suggested Sprint Plan

Assumption:

- 6 sprints
- 2 weeks each
- parallel execution only where dependencies allow

## Sprint 1: Online State Foundation

Primary epics:

- SF-1

Scope:

- define entity taxonomy
- define Redis key naming conventions
- add customer/device/IP temporal counters
- expose internal feature fetch interface
- add state fetch instrumentation

Deliverables:

- Redis state key spec
- temporal counter implementation
- basic decision-service integration
- initial tests

Exit criteria:

- customer/device/IP counters available during decisioning
- tenant-scoped Redis behavior validated

## Sprint 2: Durable Memory

Primary epics:

- SF-2

Scope:

- add `entity_profiles`
- add `decision_feature_snapshots`
- write entity profile updater
- persist previous review/block memory
- add entity state API for internal use

Deliverables:

- migrations
- repository layer
- durable state write path
- entity profile read path

Exit criteria:

- decision results produce durable state records
- entity profiles recover after Redis reset

## Sprint 3: Stateful Rules MVP

Primary epics:

- SF-3

Scope:

- extend rule context
- add cumulative and repeat-pattern rules
- add lightweight sequence booleans
- test decision changes under repeated same-day behavior

Deliverables:

- rule-engine context extension
- first stateful rules in staging
- scenario catalog additions for repeated fraud behavior

Exit criteria:

- same entity repeated activity changes decision outcomes predictably

## Sprint 4: Analyst Feedback State

Primary epics:

- SF-4

Scope:

- label persistence
- watchlist / denylist / allowlist
- feedback events via Kafka
- case outcome propagation into entity memory

Deliverables:

- analyst label tables
- watchlist APIs
- decision-time list checks
- linked risk memory update hooks

Exit criteria:

- confirmed fraud label influences later decisions
- denylisted entity blocks as expected

## Sprint 5: Graph-Backed Online Risk

Primary epics:

- SF-5

Scope:

- graph feature contract
- cluster risk fetch
- linked fraud count
- device sharing online indicator
- graph fallback behavior

Deliverables:

- graph-derived feature interface
- decision-service graph feature integration
- resilience tests for graph unavailability

Exit criteria:

- graph features visible in decision context and decision explanation

## Sprint 6: Governance and ML Readiness

Primary epics:

- SF-6

Scope:

- feature registry
- feature versioning
- export path for labeled training snapshots
- feature freshness dashboard
- risk and model documentation

Deliverables:

- feature catalog
- training export job
- monitoring for state freshness and lag

Exit criteria:

- stateful feature platform is documented, observable, and reusable

## 5. MVP Feature List

These should be considered mandatory for the first useful stateful release.

### Customer

- tx count 10m
- tx count 1h
- tx count 24h
- amount sum 24h
- previous review count 7d
- previous block count 30d

### Device

- distinct accounts 24h
- distinct accounts 7d
- recent block-linked account count

### IP

- signup count 10m
- payment count 1h
- distinct accounts 24h

### Session / sequence

- failed payment burst
- login then payment
- device change then payment

## 6. Recommended Test Additions

Each epic must add tests to `docs/testing/scenario-catalog.md`.

Mandatory new scenario families:

- repeated same-day transaction behavior
- cumulative amount threshold behavior
- repeated entity after prior block
- analyst-confirmed fraud memory
- denylist and allowlist effects
- graph-linked fraud propagation
- Redis flush recovery of durable state

## 7. Delivery Risks

### Risk 1: State sprawl

If features are added ad hoc across services, the platform becomes inconsistent.

Mitigation:

- single feature catalog
- single key naming convention
- single state ownership map

### Risk 2: Latency blow-up

Too many synchronous reads will hurt decision p99.

Mitigation:

- keep hot reads in Redis
- precompute durable summaries
- add timeouts and partial feature handling

### Risk 3: Tenant isolation regression

State is easy to leak if IDs are not merchant-scoped.

Mitigation:

- merchant ID in all Redis keys
- RLS for durable tables
- explicit negative tests

### Risk 4: Feedback poisoning

Bad analyst labels or adversarial misuse may distort future decisions.

Mitigation:

- audit labels
- require reason and actor
- support reversible labels

## 8. Suggested Ownership Model

| Workstream | Owner |
|---|---|
| Redis state model | platform/velocity team |
| Durable state tables | data/backend team |
| Decision integration | decision-service team |
| Stateful rules | rule-engine team |
| Analyst feedback | case-service + dashboard team |
| Graph-backed features | graph-intel team |
| Test coverage | QA and security |

## 9. Definition of Done Per Epic

Every epic is done only if:

- code path exists
- tests exist
- scenarios added to catalog
- metrics added
- docs updated
- degraded behavior documented
- evidence captured in staging

## 10. Final Recommendation

Stateful fraud should be handled as a formal program, not a loose enhancement list.

Recommended immediate next move:

start Sprint 1 with SF-1 and SF-2 together at design level, but ship SF-1 implementation first.

That gives SignalRisk the fastest path toward meaningful repeated-fraud detection without overloading the current architecture.
