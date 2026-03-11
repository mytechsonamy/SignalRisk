# SignalRisk Quality Gates

## 1. Gate Model

SignalRisk uses layered gates. A later gate does not override an earlier failed gate.

| Gate | Name | Owner | Blocking |
|---|---|---|---|
| G1 | Build and static validation | engineering | yes |
| G2 | Unit/component validation | engineering + QA | yes |
| G3 | Integration and contract validation | QA | yes |
| G4 | Security and tenant isolation | security | yes |
| G5 | E2E and workflow validation | QA | yes |
| G6 | Performance and resilience | QA + SRE | yes for release |
| G7 | Readiness, smoke, rollback | SRE | yes for deploy |
| G8 | Evidence and signoff completeness | orchestrator + human approver | yes |

## 2. Sprint Exit Criteria

A sprint may close only when:

- all sprint-committed P0 scenarios are green
- all changed surfaces have matching tests
- no unresolved critical or high defect lacks an explicit disposition
- evidence pack is complete
- docs changed with product behavior are updated

## 3. Release Candidate Exit Criteria

A release candidate may be declared only when:

- all P0 scenarios pass in staging or equivalent
- all P1 scenarios pass or are explicitly waived
- tenant isolation suite is 100% green
- contract tests show no schema drift
- build/test pipeline is hard-failing and green
- performance gates meet approved target
- resilience drills complete with evidence
- release notes and runbook are updated

## 4. Production Deploy Gate

Before production deploy:

- staging smoke green
- rollback procedure validated on current release train
- alerts/dashboards available for changed services
- on-call owner identified
- post-deploy smoke checklist prepared

## 5. Post-Deploy Gate

After deploy, the release is not complete until:

- health and readiness checks are green
- synthetic smoke passes
- no critical alert fires within observation window
- rollback decision point is explicitly passed

## 6. Defect Severity Policy

| Severity | Meaning | Release policy |
|---|---|---|
| Sev-1 | security breach, tenant leakage, silent data loss, full outage | absolute blocker |
| Sev-2 | critical workflow broken, major integrity issue | blocker unless formally waived |
| Sev-3 | partial feature regression with workaround | evaluate per release |
| Sev-4 | low-impact defect or cosmetic issue | may ship with backlog |

## 7. Waiver Policy

Waivers require:

- scenario or defect id
- severity
- rationale
- compensating control
- owner
- expiry date

No agent may self-approve a waiver.

## 8. Minimum Performance Gates

These must be set per release train and recorded in the evidence pack.
If a metric is not defined, the release gate is incomplete.

### G6 Targets — Release Train v0.35 (Docker Dev Environment)

| Metric | Target | Measurement Method |
|---|---|---|
| Event ingestion p95 | < 200ms | 100 concurrent POST /v1/events |
| Event ingestion p99 | < 500ms | 100 concurrent POST /v1/events |
| Event ingestion error rate | < 0.1% | Non-429 errors / total requests |
| Decision API e2e latency | < 15s | Event submit → pollDecision response (includes Kafka + signal fetch) |
| Decision API direct latency | < 500ms | Single POST /v1/decisions/evaluate |
| Rate limiting activation | Must trigger | 200 sequential burst → at least 1x 429 |
| Burst backpressure recovery | System recoverable | After burst ends, next request succeeds within 5s |

### G6 Resilience Targets — Release Train v0.35

| Scenario | Target | Test Location |
|---|---|---|
| SR-P0-013 Redis outage | Event ingestion continues (202 or 429), admin 503 fail-closed | chaos-redis-down.spec.ts |
| SR-P0-013 Redis recovery | System recovers within 30s after restart | chaos-redis-down.spec.ts |
| SR-P0-013 Redis flapping | Survives 3 rapid stop/start cycles | chaos-redis-down.spec.ts |
| SR-P0-014 Kafka outage | No 5xx crash, graceful degradation | chaos-kafka-down.spec.ts |
| SR-P0-014 Kafka recovery | Event ingestion resumes within 120s after restart | chaos-kafka-down.spec.ts |
| SR-P0-014 Kafka: auth isolation | Auth-service remains healthy when Kafka is down | chaos-kafka-down.spec.ts |
| SR-P0-014 Kafka: decision isolation | Decision API direct call works when Kafka is down | chaos-kafka-down.spec.ts |

### G7 Readiness Targets

| Check | Target | Test Location |
|---|---|---|
| All 13 app services healthy | GET /health → 200 | tests/dr/health-check.spec.ts |
| Service port uniqueness | No port conflicts | tests/dr/health-check.spec.ts |
| Smoke: Redis rate limit Lua | Token bucket script works correctly | tests/smoke/smoke-suite.spec.ts |
| Smoke: PostgreSQL case CRUD | Insert/update/query cases works | tests/smoke/smoke-suite.spec.ts |
| Smoke: Fingerprint consistency | Same input → same fingerprint (100 iterations) | tests/smoke/smoke-suite.spec.ts |
| Load test tooling ready | k6 script + shell runner validated | tests/load/load-test-validation.spec.ts |
