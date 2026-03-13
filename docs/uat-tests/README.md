# SignalRisk UAT Test Docs

This directory contains UAT-specific planning, simulation, and signoff documents.

Use this directory when the goal is:

- validating the product end to end from an operator or merchant perspective
- simulating production-like traffic without a real customer
- producing go-live evidence and final signoff artifacts

## Documents

| Document | Purpose |
|---|---|
| `uat-plan.md` | Main user acceptance scope, workstreams, scenario packs, and signoff model |
| `fraud-simulation-automation.md` | Fraud mechanism automation and transaction simulation design |
| `synthetic-uat-strategy.md` | Synthetic merchant traffic, truth-labeled scenarios, and ambient traffic model |
| `scenario-matrix.md` | Minimum legitimate, fraud, and closed-loop scenario inventory |
| `merchant-profile-templates.md` | Synthetic merchant profile templates for fixture generation |
| `go-live-readiness-report-template.md` | Final go-live readiness report format for pilot or production candidate review |
| `final-signoff-evidence-template.md` | Final release evidence template for Level 5 signoff |
| `uat-agent-and-skills-blueprint.md` | Required test agents, skills, ownership, and execution model for UAT and signoff |

## Intended Order

1. Plan UAT scope with `uat-plan.md`
2. Define merchant profiles with `merchant-profile-templates.md`
3. Define scenario inventory with `scenario-matrix.md`
4. Design traffic and oracle model with `synthetic-uat-strategy.md`
5. Design automation with `fraud-simulation-automation.md`
6. Execute and collect evidence using `final-signoff-evidence-template.md`
7. Produce the final verdict with `go-live-readiness-report-template.md`

## Rule

No UAT cycle is complete until:

- expected truth and observed behavior are both recorded
- downstream actions are verified
- KPI targets are evidenced
- signoff fields are complete
