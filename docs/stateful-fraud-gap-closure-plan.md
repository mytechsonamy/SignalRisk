# SignalRisk Stateful Fraud Gap Closure Plan

> Version 1.0 | Date: 11 March 2026

## 1. Purpose

This document defines the remaining work required to move the stateful fraud implementation from "implemented foundation" to "fully integrated and production-credible."

It focuses on the gaps identified during code review after the stateful fraud delivery work was reported complete.

This is not the original delivery roadmap.

This is the closure plan for the remaining integration, correctness, and operability gaps.

## 2. Current Verdict

Current state:

- typed counters, sequence state, graph features, feedback tables, and feature governance artifacts exist
- the foundation is real
- the three original P0 closure gaps have now been implemented in code
- remaining work is concentrated in P1 hardening, explainability, snapshot validation, and feedback enforcement

Current label:

- core P0 closure implemented
- stateful live decisioning now integrated
- not yet fully closed overall

## 3. Verified Remaining Gaps

### 3.1 P0-1 Status: Closed in Code Review

The live decision path now routes through `fetchAllSignals()` and evaluates DSL rules in the orchestrator.

Evidence:

- [apps/decision-service/src/decision/decision-orchestrator.service.ts](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/apps/decision-service/src/decision/decision-orchestrator.service.ts#L154)
- [apps/decision-service/src/decision/decision-orchestrator.service.ts](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/apps/decision-service/src/decision/decision-orchestrator.service.ts#L246)

Verified outcome:

- orchestrator no longer relies on the previous hardcoded `matchRules(...)` approach
- `fetchAllSignals()` is used, which brings stateful context into the decision path
- DSL evaluation now applies override behavior: BLOCK overrides everything, REVIEW upgrades ALLOW

Residual note:

- explainability and snapshot discipline still need follow-up hardening
- reported test counts were not re-run in this review; only code integration was verified

### 3.2 P0-2 Status: Closed in Code Review

Prior-decision memory is now backed by typed entity columns in the `decisions` table.

Evidence:

- [database/migrations/013_decisions_entity_columns.sql](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/database/migrations/013_decisions_entity_columns.sql#L1)
- [apps/decision-service/src/decision/decision-store.service.ts](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/apps/decision-service/src/decision/decision-store.service.ts#L63)
- [apps/decision-service/src/decision/decision-store.service.ts](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/apps/decision-service/src/decision/decision-store.service.ts#L138)

Verified outcome:

- `entity_id` and `entity_type` are added and backfilled for prior-memory queries
- store writes typed entity metadata on save
- prior-memory query now filters by `entity_id` and `entity_type`

Residual note:

- backward compatibility and migration rollout still need staging validation on upgraded datasets

### 3.3 P0-3 Status: Closed in Code Review

Feature registry parity has been corrected for the previously verified P0 naming mismatches.

Evidence:

- [database/migrations/014_fix_feature_definitions.sql](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/database/migrations/014_fix_feature_definitions.sql#L1)
- [docs/claude/source-of-truth.md](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/docs/claude/source-of-truth.md#L52)

Verified outcome:

- missing DSL-referenced features were added to the registry
- features not produced at runtime were marked inactive
- source-of-truth documentation now differentiates DSL usage from runtime production

## 4. Closure Strategy

The correct remaining order is:

1. standardize explainability and snapshot validation
2. enforce analyst feedback in online decisioning
3. re-run full stateful fraud acceptance scenarios in staging

Do not start with more advanced stateful features until these gaps are closed.

## 5. P0 Backlog

### P0-1: Connect Rule Engine to Live Decisioning

Status:

- implemented

Goal:

- make DSL evaluation authoritative for stateful decision logic

Primary files:

- [apps/decision-service/src/decision/decision-orchestrator.service.ts](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/apps/decision-service/src/decision/decision-orchestrator.service.ts)
- [apps/rule-engine-service/src/dsl/evaluator.ts](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/apps/rule-engine-service/src/dsl/evaluator.ts)
- [apps/rule-engine-service/src/rules/default.rules](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/apps/rule-engine-service/src/rules/default.rules)

Required changes:

- replace or downgrade `matchRules(...)` to a fallback-only path
- evaluate rules using the actual `StatefulContext`
- derive `appliedRules` from rule-engine output
- ensure stateful, sequence, and graph rules can change the final action

Acceptance criteria:

- editing a stateful DSL rule changes the live decision result for the same request payload
- `appliedRules` contains only matched DSL rules
- if rule-engine evaluation fails, fallback behavior is explicit and observable

### P0-2: Fix Prior-Decision Memory Semantics

Status:

- implemented

Goal:

- make prior memory correct for typed entities

Primary files:

- [apps/decision-service/src/decision/decision-store.service.ts](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/apps/decision-service/src/decision/decision-store.service.ts)
- [apps/decision-service/src/decision/decision-orchestrator.service.ts](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/apps/decision-service/src/decision/decision-orchestrator.service.ts)
- [apps/decision-service/src/decision/signal-fetchers.ts](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/apps/decision-service/src/decision/signal-fetchers.ts)

Required changes:

- introduce `entityType` into prior-memory lookup
- define supported semantics for `customer`, `device`, and `ip`
- remove silent device-only behavior from generic paths
- preserve the current 50ms timeout budget

Decision policy to freeze:

- `customer`: prior decisions are keyed to the canonical customer/account identifier
- `device`: prior decisions are keyed to device identity
- `ip`: either define explicit prior-decision behavior or return a documented unsupported/default response

Acceptance criteria:

- repeated BLOCK decisions for the same customer are reflected in `stateful.customer.previousBlockCount30d`
- repeated REVIEW decisions for the same customer are reflected in `stateful.customer.previousReviewCount7d`
- unsupported entity types do not silently reuse device semantics
- tenant isolation remains enforced

### P0-3: Make Feature Catalog the Single Source of Truth

Status:

- implemented for the original verified naming mismatches

Goal:

- align feature registry, runtime production, and DSL usage

Primary files:

- [database/migrations/012_feature_definitions.sql](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/database/migrations/012_feature_definitions.sql)
- [apps/rule-engine-service/src/rules/default.rules](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/apps/rule-engine-service/src/rules/default.rules)
- [apps/velocity-service/src/velocity/velocity.service.ts](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/apps/velocity-service/src/velocity/velocity.service.ts)
- [apps/decision-service/src/decision/signal-fetchers.ts](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/apps/decision-service/src/decision/signal-fetchers.ts)

Required changes:

- freeze the canonical feature namespace
- remove or implement mismatched feature names
- ensure DSL field names are backed by real runtime values
- mark inactive features explicitly instead of leaving ghost definitions

Acceptance criteria:

- every active DSL feature exists in `feature_definitions`
- every active registry feature is either produced at runtime or explicitly marked inactive
- no duplicate semantic names remain for the same concept

## 6. P1 Backlog

### P1-1: Standardize Stateful Explainability

Goal:

- produce one explanation model for velocity, prior-memory, sequence, graph, and analyst feedback factors

Primary files:

- [apps/decision-service/src/decision/decision-orchestrator.service.ts](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/apps/decision-service/src/decision/decision-orchestrator.service.ts)

Required changes:

- convert ad hoc risk factor pushes to a consistent explanation builder
- include rule id, feature name, observed value, contribution, and explanation text

Acceptance criteria:

- every applied stateful rule has a user-facing explanation
- explanations are structurally consistent across feature classes

### P1-2: Validate Decision Feature Snapshots

Goal:

- keep snapshot data aligned with the feature registry

Primary files:

- [database/migrations/009_decision_feature_snapshots.sql](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/database/migrations/009_decision_feature_snapshots.sql)
- [apps/decision-service/src/decision/signal-fetchers.ts](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/apps/decision-service/src/decision/signal-fetchers.ts)

Required changes:

- validate feature names before snapshot persistence
- reject or warn on unknown features
- surface registry mismatches in logs and evidence

Acceptance criteria:

- no unknown feature names are written to snapshots
- snapshot export is registry-clean

### P1-3: Enforce Analyst Feedback in Online Decisions

Goal:

- make analyst-confirmed labels influence future decisions deterministically

Primary files:

- [database/migrations/010_analyst_labels.sql](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/database/migrations/010_analyst_labels.sql)
- [database/migrations/011_watchlist_entries.sql](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/database/migrations/011_watchlist_entries.sql)
- [apps/case-service/src/kafka/label-publisher.service.ts](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/apps/case-service/src/kafka/label-publisher.service.ts)

Required changes:

- freeze label semantics for `confirmed_fraud`, `legitimate`, `watchlist`, and `denylist`
- define how each label affects online scoring or action
- make the effect testable and observable

Acceptance criteria:

- denylist status changes the decision outcome deterministically
- confirmed fraud labels increase future decision risk in a documented way
- legitimate labels do not silently suppress unrelated high-risk signals

## 7. File-by-File Fix Plan

### 7.1 Decision Service

Required work:

- pass `entityType` through the stateful decision path
- integrate rule-engine evaluation
- remove duplicated logic between risk boosts and DSL behavior
- centralize explainability generation

Primary files:

- [apps/decision-service/src/decision/decision-orchestrator.service.ts](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/apps/decision-service/src/decision/decision-orchestrator.service.ts)
- [apps/decision-service/src/decision/decision-store.service.ts](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/apps/decision-service/src/decision/decision-store.service.ts)
- [apps/decision-service/src/decision/signal-fetchers.ts](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/apps/decision-service/src/decision/signal-fetchers.ts)

### 7.2 Rule Engine Service

Required work:

- freeze the `StatefulContext` namespace
- align `default.rules` with runtime feature production
- return rule evaluation results in a structure directly usable by decision-service

Primary files:

- [apps/rule-engine-service/src/dsl/evaluator.ts](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/apps/rule-engine-service/src/dsl/evaluator.ts)
- [apps/rule-engine-service/src/rules/default.rules](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/apps/rule-engine-service/src/rules/default.rules)

### 7.3 Velocity Service

Required work:

- confirm which typed features are actually produced
- implement missing active features or remove them from the active catalog
- align sequence and counter outputs under one namespace policy

Primary files:

- [apps/velocity-service/src/velocity/velocity.service.ts](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/apps/velocity-service/src/velocity/velocity.service.ts)
- [apps/velocity-service/src/velocity/velocity.types.ts](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/apps/velocity-service/src/velocity/velocity.types.ts)
- [apps/velocity-service/src/sequence/sequence.service.ts](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/apps/velocity-service/src/sequence/sequence.service.ts)

### 7.4 Database and Migrations

Required work:

- align feature seed data with actual feature production
- add indexes or entity references if prior-memory lookups need them
- ensure snapshot and label tables match the enforced runtime policy

Primary files:

- [database/migrations/009_decision_feature_snapshots.sql](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/database/migrations/009_decision_feature_snapshots.sql)
- [database/migrations/010_analyst_labels.sql](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/database/migrations/010_analyst_labels.sql)
- [database/migrations/011_watchlist_entries.sql](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/database/migrations/011_watchlist_entries.sql)
- [database/migrations/012_feature_definitions.sql](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/database/migrations/012_feature_definitions.sql)

## 8. Acceptance Test Scenarios

### SR-SF-P0-001 Live DSL Control

Goal:

- prove that DSL rules control live decisions

Scenario:

- send a request that triggers one stateful DSL rule
- verify action is `REVIEW` or `BLOCK`
- modify or disable the DSL rule
- resend the same request
- verify the decision changes as expected

Pass criteria:

- live outcome changes because DSL logic changed
- `appliedRules` reflects the exact matched rule set

### SR-SF-P0-002 Typed Prior Memory

Goal:

- prove prior memory is correct per entity type

Scenario:

- create historical decisions for the same customer
- evaluate a new decision for that customer
- verify `previousBlockCount30d` and `previousReviewCount7d`
- repeat with device-specific history
- repeat with IP semantics according to the frozen policy

Pass criteria:

- customer and device values are correct
- unsupported or defaulted entity types are explicit
- no device-only leakage remains in generic paths

### SR-SF-P0-003 Feature Registry Parity

Goal:

- prove feature governance matches runtime behavior

Scenario:

- enumerate active feature definitions
- compare them against runtime-produced stateful features
- compare them against DSL field usage

Pass criteria:

- no active DSL field is missing from the registry
- no active registry field is missing at runtime
- no conflicting names remain for the same feature

### SR-SF-P0-004 Stateful Explainability

Goal:

- prove stateful reasoning is explainable

Scenario:

- trigger one prior-memory rule
- trigger one sequence rule
- trigger one graph rule
- inspect decision response or persisted explanation payload

Pass criteria:

- each matched rule has a structured explanation
- explanation fields are consistent across feature types

### SR-SF-P1-005 Analyst Feedback Enforcement

Goal:

- prove analyst feedback affects future decisions

Scenario:

- mark an entity as `confirmed_fraud`
- evaluate a new request for the same entity
- add a denylist entry
- evaluate another request

Pass criteria:

- confirmed fraud changes risk or action according to policy
- denylist produces deterministic decision behavior

## 9. Definition of Done for Closure

Stateful fraud closure is complete only when all of the following are true:

- live decisions are controlled by the rule engine for stateful logic
- prior-memory semantics are correct for supported entity types
- feature registry, runtime state, and DSL names are aligned
- stateful explanations are consistent and observable
- analyst feedback changes future decisions according to policy
- acceptance scenarios `SR-SF-P0-001` through `SR-SF-P1-005` pass

## 10. Recommended Execution Order

1. P0-1 rule-engine integration
2. P0-2 typed prior-memory fix
3. P0-3 feature catalog parity
4. P1-1 explainability
5. P1-2 snapshot validation
6. P1-3 analyst feedback enforcement

## 11. Reporting Guidance

For each closure item, produce:

- changed files
- acceptance evidence
- residual risk
- explicit statement of whether the gap is closed or partially closed

Do not report "stateful fraud complete" until Section 9 is fully satisfied.
