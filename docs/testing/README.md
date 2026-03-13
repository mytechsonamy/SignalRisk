# SignalRisk Test Program

This directory defines the production-grade test process for SignalRisk.

It is the canonical reference for:

- what must be tested before release
- which agents own which checks
- which scenarios must run until pass criteria are met
- which evidence must be collected before a sprint, release, or hotfix can close

UAT-specific planning and simulation documents live under `docs/uat-tests/`.

## Documents

| Document | Purpose |
|---|---|
| `master-test-strategy.md` | End-to-end quality strategy, scope, environments, test layers, ownership |
| `test-agent-operations.md` | Mandatory operating model for test agents and orchestrator |
| `scenario-catalog.md` | Detailed scenario inventory with pass/fail criteria and retry expectations |
| `quality-gates.md` | Sprint, release, and production exit criteria |
| `evidence-and-reporting.md` | Required artifacts, defect workflow, and report templates |
| `docs-drift-checklist.md` | Checklist for keeping technical, user, and testing docs aligned with implementation |

## Core Rule

No agent may mark a scenario, task, sprint, or release as complete until:

1. the declared success criteria are observed in test evidence
2. all dependent blocking checks are green
3. any failure is either fixed and retested, or explicitly accepted by human decision

## Test Surfaces Covered

- unit tests
- component tests
- integration tests
- contract tests
- API tests
- E2E browser tests
- cross-tenant isolation tests
- resilience and chaos tests
- load and latency tests
- compliance and production-readiness checks
- smoke and rollback validation

## Existing Repo Mapping

| Area | Current location |
|---|---|
| E2E Playwright scenarios (13 specs, 78 tests) | `tests/e2e/scenarios/` |
| E2E legacy Jest specs (7 specs) | `tests/e2e/specs/` |
| FraudTester app (5 scenarios + 3 adversarial agents) | `apps/fraud-tester/src/` |
| Load tests (k6) | `tests/load/` |
| Kafka integration | `tests/kafka-integration/` |
| Integration tests | `tests/integration/` |
| Tenant isolation tests | `tests/isolation/` |
| Compliance checks | `tests/compliance/` |
| DR / health | `tests/dr/` |
| Production readiness | `tests/production-readiness/` |
| Smoke checks | `tests/smoke/` |
| Benchmark / perf | `tests/benchmark/` |
| Documentation checks | `tests/docs/` |
| Workspace/package integrity | `tests/workspaces/` |
| Helm chart tests | `tests/helm/` |
| ArgoCD tests | `tests/argocd/` |
| Build tests | `tests/build/` |

## Test Traffic Isolation

FraudTester and simulation traffic is isolated from production analytics via:

- **Header**: `X-SignalRisk-Test: true` (event-collector reads, propagates to Kafka)
- **DB column**: `decisions.is_test` (migration 005, partial index)
- **Analytics**: all 6 analytics queries filter `WHERE is_test = false`
- **Webhooks**: webhook-service skips delivery for `isTest === true`
- **FraudTester**: always sends `X-SignalRisk-Test: true` automatically (`signalrisk.adapter.ts`)

## Intended Use

- Sprint planning: use `quality-gates.md`
- Agent execution: use `test-agent-operations.md`
- Regression planning: use `scenario-catalog.md`
- Release signoff: use `master-test-strategy.md` and `evidence-and-reporting.md`

## UAT Documents

| Document | Purpose |
|---|---|
| `../uat-tests/uat-plan.md` | User acceptance testing scope, roles, packs, and signoff model |
| `../uat-tests/fraud-simulation-automation.md` | Fraud transaction simulation and automation design |
| `../uat-tests/synthetic-uat-strategy.md` | Synthetic merchant traffic, truth-labeled scenarios, and production-like UAT without real customer data |
| `../uat-tests/go-live-readiness-report-template.md` | Final go-live readiness report template |
| `../uat-tests/final-signoff-evidence-template.md` | Final Level 5 evidence pack template |
| `../uat-tests/uat-agent-and-skills-blueprint.md` | Required agents, skills, ownership, and no-gap execution model |

## Intended Use

- UAT planning and signoff: use `../uat-tests/uat-plan.md`
- Fraud mechanism automation planning: use `../uat-tests/fraud-simulation-automation.md`
- Synthetic production-like UAT planning: use `../uat-tests/synthetic-uat-strategy.md`

## Documentation Maintenance Rule

Testing documentation in this directory is expected to stay current as implementation changes land.

Minimum rule:

- if a change affects acceptance criteria, scenarios, gates, simulation behavior, or evidence expectations, the relevant document in `docs/testing/` must be updated in the same delivery cycle
