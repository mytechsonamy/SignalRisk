# SignalRisk Test Program

This directory defines the production-grade test process for SignalRisk.

It is the canonical reference for:

- what must be tested before release
- which agents own which checks
- which scenarios must run until pass criteria are met
- which evidence must be collected before a sprint, release, or hotfix can close

## Documents

| Document | Purpose |
|---|---|
| `master-test-strategy.md` | End-to-end quality strategy, scope, environments, test layers, ownership |
| `test-agent-operations.md` | Mandatory operating model for test agents and orchestrator |
| `scenario-catalog.md` | Detailed scenario inventory with pass/fail criteria and retry expectations |
| `quality-gates.md` | Sprint, release, and production exit criteria |
| `evidence-and-reporting.md` | Required artifacts, defect workflow, and report templates |
| `uat-plan.md` | User acceptance testing scope, roles, packs, and signoff model |
| `fraud-simulation-automation.md` | Fraud transaction simulation and automation design |
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
| E2E UI/API flows | `tests/e2e` |
| Load tests | `tests/load` |
| Kafka integration | `tests/kafka-integration` |
| Integration tests | `tests/integration` |
| Compliance checks | `tests/compliance` |
| DR / health | `tests/dr` |
| Production readiness | `tests/production-readiness` |
| Smoke checks | `tests/smoke` |
| Documentation checks | `tests/docs` |
| Workspace/package integrity | `tests/workspaces` |

## Intended Use

- Sprint planning: use `quality-gates.md`
- Agent execution: use `test-agent-operations.md`
- Regression planning: use `scenario-catalog.md`
- Release signoff: use `master-test-strategy.md` and `evidence-and-reporting.md`
- UAT planning and signoff: use `uat-plan.md`
- Fraud mechanism automation planning: use `fraud-simulation-automation.md`

## Documentation Maintenance Rule

Testing documentation in this directory is expected to stay current as implementation changes land.

Minimum rule:

- if a change affects acceptance criteria, scenarios, gates, simulation behavior, or evidence expectations, the relevant document in `docs/testing/` must be updated in the same delivery cycle
