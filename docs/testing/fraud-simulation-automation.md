# SignalRisk Fraud Simulation and Automation Plan

## 1. Purpose

This document defines how to automate fraud mechanism validation using transaction simulation, repeated-event patterns, and controlled synthetic attacks.

The goal is not just to test whether APIs respond.

The goal is to prove that:

- fraud controls trigger under realistic patterns
- stateful fraud features evolve over time as expected
- frontend and backend surfaces reflect those outcomes correctly
- test traffic does not pollute normal merchant metrics

## 2. Principles

- start with deterministic, low-volume scenario simulation
- add volume only after correctness is proven
- isolate all simulation traffic
- capture evidence for every scenario family
- keep "clean traffic" baselines alongside fraud traffic for comparison

## 3. Simulation Layers

### Layer 1: Deterministic Scenario Runs

Purpose:

- validate single known patterns and expected decisions

Examples:

- emulator payment
- VPN + geo mismatch
- repeated customer transactions in 10 minutes
- prior-BLOCK escalation

Primary tools:

- integration specs
- seeded fixtures
- fraud-tester single-scenario runs

### Layer 2: Stateful Pattern Runs

Purpose:

- validate counters, windows, sequence state, and repeated behavior

Examples:

- same customer 6 payments in 10 minutes
- same device 8 accounts in 24h
- same IP 20 signups in 10 minutes
- login then payment within 15 minutes

Primary tools:

- scripted API runners
- fraud-tester scenario packs
- Kafka-aware integration suites

### Layer 3: Burst and Mixed Traffic Runs

Purpose:

- validate signal quality under noisy, mixed, production-like traffic

Examples:

- 90% clean traffic + 10% fraud burst
- multi-merchant fraud bursts
- staggered repeat offenders across time windows

Primary tools:

- k6
- fraud-tester batch orchestration
- staging metrics and evidence collection

## 4. Scenario Families

### Clean baseline

Goal:

- confirm legitimate users are not over-blocked

Expected:

- mostly ALLOW
- low false positive rate

### Velocity abuse

Goal:

- validate same-customer or same-IP repeated activity

Expected:

- thresholds trigger REVIEW/BLOCK
- counters match simulated volume

### Repeat offender

Goal:

- validate prior-memory escalation

Expected:

- future decisions reflect earlier BLOCK/REVIEW history

### Sequence fraud

Goal:

- validate ordered event pattern detection

Expected:

- sequence flags appear
- sequence rules influence action

### Shared infrastructure abuse

Goal:

- validate device-sharing, IP-sharing, and graph-linked detection

Expected:

- graph/stateful signals appear
- entity spread causes escalation

### Feedback-driven fraud

Goal:

- validate analyst-confirmed fraud affects later decisions

Expected:

- labels change future risk or action according to policy

## 5. Automation Architecture

Use four automation tracks together:

### Track A: Scenario fixture generator

Responsibilities:

- generate merchants, accounts, devices, IPs, sessions, and event streams
- create clean and fraud personas
- output deterministic ids for traceability

Suggested output dimensions:

- merchant id
- customer id
- device id
- ip
- session id
- event type
- amount/currency
- timestamp offset
- expected rule or feature trigger

### Track B: Event submission runner

Responsibilities:

- send events through the real ingestion path
- support pacing, bursts, and sequences
- tag all simulation traffic

Suggested targets:

- `POST /v1/events`
- batch event endpoint if present

### Track C: Assertion runner

Responsibilities:

- verify decisions
- verify stateful counters and sequences
- verify case creation
- verify webhook behavior
- verify analytics/test isolation

Suggested assertion sources:

- decision API responses
- database records
- Kafka messages
- dashboard/API analytics views

### Track D: Evidence collector

Responsibilities:

- store request ids and correlation ids
- collect screenshots and payload samples
- summarize decision distributions
- flag mismatches between expected and observed outcomes

## 6. Recommended Repo Structure

Recommended additions:

- `tests/integration/stateful/`
- `tests/e2e/scenarios/stateful-fraud/`
- `tests/fixtures/fraud-scenarios/`
- `tests/helpers/simulation/`

Suggested categories:

- `clean-traffic.spec.ts`
- `velocity-abuse.spec.ts`
- `prior-memory.spec.ts`
- `sequence-fraud.spec.ts`
- `graph-enrichment.spec.ts`
- `feedback-enforcement.spec.ts`
- `test-isolation.spec.ts`

## 7. Minimum Automations to Build First

### A. Clean vs Fraud comparison suite

Purpose:

- prove that normal users are mostly allowed while known bad patterns escalate

### B. Stateful repeated transaction suite

Purpose:

- send repeated events for the same customer/device/IP over short windows

Assertions:

- counters increment
- action changes over time
- explanation includes stateful fields

### C. Prior-memory suite

Purpose:

- pre-seed prior BLOCK/REVIEW decisions, then evaluate new requests

Assertions:

- prior-memory features appear correctly
- action escalates according to policy

### D. Sequence suite

Purpose:

- simulate ordered event behavior

Assertions:

- sequence flags become true
- corresponding rule impacts decision

### E. Simulation isolation suite

Purpose:

- prove that `is_test` traffic does not leak into normal merchant surfaces

Assertions:

- analytics exclusion
- webhook suppression or separate routing
- no contamination of normal KPI views

## 8. Example Simulation Cycles

### Cycle 1: Functional smoke

- 10 clean events
- 5 obvious fraud events
- verify deterministic ALLOW/REVIEW/BLOCK expectations

### Cycle 2: Stateful escalation

- one customer performs 6 similar payments in 10 minutes
- one device reused across 5 accounts
- one IP sends 20 signup events

### Cycle 3: Mixed traffic

- 500 clean events
- 50 fraud-pattern events
- 3 repeated offender personas

### Cycle 4: Analyst feedback loop

- resolve selected cases as confirmed fraud
- replay same entities
- verify escalated decisions

## 9. Success Metrics

Simulation runs should report:

- total events submitted
- clean vs fraud split
- expected vs actual decision distribution
- false positive count
- false negative count
- case creation count
- webhook deliveries
- stateful rule trigger counts
- sequence trigger counts
- graph trigger counts
- test isolation status

## 10. Operational Guardrails

- all simulation traffic must use test merchants or explicit `is_test`
- all runs must be replayable from fixtures
- every run must generate an evidence artifact
- no simulation run should be marked complete until expected success criteria are observed

## 11. Integration with Existing Test Program

This automation plan should connect to:

- [docs/testing/master-test-strategy.md](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/docs/testing/master-test-strategy.md)
- [docs/testing/scenario-catalog.md](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/docs/testing/scenario-catalog.md)
- [docs/testing/test-agent-operations.md](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/docs/testing/test-agent-operations.md)
- [docs/testing/uat-plan.md](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/docs/testing/uat-plan.md)
