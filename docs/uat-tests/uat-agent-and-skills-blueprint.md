# SignalRisk UAT Agent and Skills Blueprint

## 1. Purpose

This document defines the minimum test-agent and skill model required to execute SignalRisk UAT and final production signoff without blind spots.

The goal is:

- every critical test surface has an owner
- every owner has a repeatable operating workflow
- no success claim is accepted without evidence
- KPI proof is produced, not assumed

## 2. Required Agents

### Agent A: UAT Orchestrator

Owns:

- execution order
- dependency tracking
- blocker management
- signoff completeness

Must prove:

- all required packs ran
- blockers are either closed or explicitly waived
- evidence pack is structurally complete

### Agent B: Functional QA

Owns:

- operator flows
- merchant event-to-decision flows
- case lifecycle
- webhook behavior

Must prove:

- expected actions occur
- downstream side effects occur
- UI and API behavior match product expectations

### Agent C: Fraud Simulation

Owns:

- synthetic merchants
- ambient traffic
- truth-labeled fraud scenarios
- oracle mapping

Must prove:

- synthetic traffic is realistic enough
- each scenario has expected truth
- fraud and legitimate flows are both covered

### Agent D: Security / Isolation

Owns:

- JWT auth paths
- tenant isolation
- test traffic isolation
- credential boundary checks

Must prove:

- no cross-tenant leakage
- no auth bypass
- no forbidden test traffic side effects

### Agent E: SRE / Runtime Validation

Owns:

- health and readiness
- rollback and recovery
- metrics and alerts
- KPI measurements

Must prove:

- runtime checks are healthy
- KPIs are measured from evidence
- resilience and readiness hold under test conditions

## 3. Required Skills

The current repo already has foundational skills. Final UAT should explicitly use or add the following capability set.

### Existing core skills

- `/test-run`
- `/quality-gate`
- `/evidence`
- `/security-audit`
- `/sprint-exit`

### Recommended new skills

#### `/uat-run`

Purpose:

- run a defined UAT pack end to end

Inputs:

- merchant profile
- scenario pack
- environment

Outputs:

- UAT run record
- pack pass/fail summary

#### `/synthetic-traffic`

Purpose:

- generate ambient traffic and deterministic fraud scenarios

Inputs:

- profile id
- fraud ratio
- duration
- scenario list

Outputs:

- generated traffic manifest
- truth labels

#### `/oracle-check`

Purpose:

- compare expected truth vs observed behavior

Checks:

- decision
- case creation
- webhook
- analyst feedback effect
- explanation signals

#### `/kpi-proof`

Purpose:

- produce evidence that target KPIs were actually met

Checks:

- latency
- throughput
- error rate
- webhook success
- snapshot persistence
- feedback loop success

#### `/signoff-check`

Purpose:

- validate `docs/level5-signoff-checklist.md`
- verify no required signoff field is missing

## 4. Execution Order

Recommended order for final UAT:

1. `/synthetic-traffic`
2. `/uat-run`
3. `/oracle-check`
4. `/quality-gate`
5. `/kpi-proof`
6. `/evidence`
7. `/signoff-check`

## 5. Minimum No-Gap Coverage

The agent system is incomplete unless all of the following are owned:

- merchant profile setup
- truth-labeled data generation
- event-to-decision assertions
- downstream action assertions
- analyst feedback assertions
- KPI proof
- runtime health validation
- final signoff completeness

## 6. Release Rule

SignalRisk may not claim successful UAT or final readiness unless:

- the fraud simulation agent proves scenario truth
- the QA agent proves observed product behavior
- the SRE agent proves KPI and runtime health
- the orchestrator proves evidence completeness

Any missing owner means the test program is incomplete.
