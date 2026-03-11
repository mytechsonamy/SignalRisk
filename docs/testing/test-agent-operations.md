# Test Agent Operations

## 1. Purpose

This document defines how SignalRisk test agents must operate.

Its primary rule is strict:

An agent must continue testing until the declared success criteria are observed, or a human explicitly stops the loop.

## 2. Agents in Scope

| Agent | Primary focus |
|---|---|
| `qa` | Functional, integration, E2E, performance |
| `security` | Auth, abuse, isolation, secret and control validation |
| `devops-sre` | Runtime health, deployment, observability, resilience |
| `orchestrator` | Coordination, gate enforcement, retry loop control |

## 3. Mandatory Execution Loop

For every assigned scenario, the agent must execute this loop:

1. Confirm scope, prerequisites, and success criteria.
2. Prepare environment and input data.
3. Run the scenario.
4. Capture output and evidence.
5. Evaluate against explicit pass criteria.
6. If failed, classify the failure.
7. Trigger fix or escalation path.
8. Rerun the same scenario.
9. Close only after a real pass is observed.

## 4. Close Conditions

A scenario may be closed only when all are true:

- the scenario has an explicit expected result
- the expected result was observed in current evidence
- all dependent checks are green
- no open blocking defect remains attached to the scenario

## 5. Failure Classification

Each failed run must be labeled as one of:

| Class | Meaning | Required next action |
|---|---|---|
| Product defect | Actual system bug | Create defect, assign owner, rerun after fix |
| Test defect | Test script/data issue | Fix test, rerun immediately |
| Environment defect | Infra or config problem | Repair env, rerun |
| External dependency | Third-party/system dependency issue | Simulate, isolate, or escalate |
| Known accepted risk | Human-approved exception | Record waiver with expiry |

No failed scenario may be marked "flaky" without evidence and a follow-up action.

## 6. Retry Policy

### Default policy

- deterministic failures: rerun only after fix
- suspected environmental failures: maximum 2 confirmation reruns after repair
- suspected flake: maximum 3 total attempts before escalation

### Escalation rule

The orchestrator must escalate to a human when:

- the same blocking scenario fails 3 times without a credible root cause
- tenant isolation is violated
- auth bypass is observed
- data corruption or silent message loss is suspected
- release gates are at risk

## 7. Evidence Requirements Per Run

Every run must store:

- scenario id
- build or commit reference
- environment
- timestamp
- input payload or test seed
- observed output
- pass/fail decision
- defect reference if failed

Additional evidence by type:

- API: request/response, status, headers, correlation IDs
- Kafka: topic, key, payload, headers, lag symptoms
- DB: relevant before/after state
- UI: screenshot/video/trace if failure affects browser path
- Load: p50/p95/p99, throughput, error rate
- Resilience: failure injection step and observed degradation mode

## 8. Mandatory Stop-the-Line Cases

The agent must stop normal progression and escalate immediately for:

- cross-tenant data exposure
- forged token accepted by protected service
- webhook sent for test traffic when prohibited
- decision dropped silently between services
- contract mismatch between producer and consumer
- readiness green while critical dependency path is broken

## 9. Success Criteria Format

Every scenario must express success criteria in measurable form:

Bad:

- "should work"
- "looks fine"

Good:

- "returns 202 and persists decision within 2 seconds"
- "rejects cross-tenant request with 403"
- "decision p99 remains below gate in staging load profile"

## 10. Agent-Specific Operating Rules

### QA agent

- must run the lowest-cost layer first
- must not sign off core flow changes without integration evidence
- must not sign off release without staging-grade evidence for P0 paths

### Security agent

- must validate both positive and negative auth paths
- must test token tamper, role escalation, tenant spoofing, and export abuse
- must treat any unauthorized access success as release-blocking

### DevOps/SRE agent

- must verify readiness against real dependencies, not static liveness only
- must verify monitoring signals appear during fault injection
- must test rollback before release signoff

### Orchestrator agent

- must not allow a scenario to close on "assumed pass"
- must track retries and blocker state
- must enforce that failed blocking scenarios return to execution after fix

## 11. Minimum Daily Control Rhythm

For active release work:

- opening risk review
- scenario run status refresh
- blocker review
- evidence completeness check
- end-of-day gate summary

## 12. Required Outputs

Every test cycle must produce:

- scenario run log
- blocker list
- defect list by severity
- gate status summary
- explicit recommendation: proceed, hold, or rollback
