# SignalRisk Evidence and Reporting

## 1. Purpose

This document defines the evidence that must exist for sprint closure, release signoff, and incident-ready auditability.

## 2. Required Evidence Pack

Every sprint and release must produce a pack containing:

- test scope summary
- executed scenario list
- pass/fail matrix
- defect summary
- waived risk summary
- performance summary
- resilience summary
- deployment/readiness summary when applicable

## 3. Minimum Artifacts

| Artifact | Required for |
|---|---|
| CI run link or id | every gate |
| commit or image reference | every gate |
| scenario execution log | every blocking scenario |
| screenshots/video/trace | UI failures and selected UI passes |
| request/response captures | API blocking scenarios |
| broker evidence | contract/integration scenarios |
| metric snapshot | performance/resilience gates |
| defect references | all failures |
| waiver references | any accepted exception |

## 4. Scenario Run Record Template

```md
Scenario ID: SR-P0-00X
Title:
Environment:
Build/Commit:
Executed By:
Timestamp:

Preconditions:
- ...

Steps Executed:
1. ...
2. ...

Observed Result:
- ...

Success Criteria Check:
- [ ] Criterion 1
- [ ] Criterion 2

Verdict:
- PASS / FAIL

Evidence:
- CI run:
- Logs:
- Screenshots:
- Metrics:

Defects / Waivers:
- ...
```

## 5. Daily Test Status Report Template

```md
# Daily Test Status

Date:
Release/Sprint:

## Overall
- Blocking scenarios total:
- Passed:
- Failed:
- Not run:

## Current blockers
- ID / title / owner / next action

## New defects
- severity / summary / owner

## Risks
- ...

## Recommendation
- proceed / hold / rollback / escalate
```

## 6. Sprint Exit Report Template

```md
# Sprint Exit Report

Sprint:
Prepared by:
Date:

## Scope tested
- services:
- features:
- risks:

## Gate status
- G1:
- G2:
- G3:
- G4:
- G5:

## Scenario summary
- P0:
- P1:

## Defect summary
- open sev-1:
- open sev-2:
- open sev-3:

## Documentation review
- drift review completed:
- docs updated:
- stale docs found:
- follow-up owner/date:

## Waivers
- none / list

## Recommendation
- close sprint / hold sprint
```

## 7. Release Signoff Report Template

```md
# Release Signoff

Release:
Candidate:
Environment:
Date:

## Mandatory result summary
- P0 scenarios:
- P1 scenarios:
- isolation suite:
- performance gate:
- resilience gate:
- smoke:
- rollback:

## Blocking defects
- ...

## Accepted risks
- ...

## Final recommendation
- approve release / hold release
```

## 8. Defect Lifecycle

Failure handling must follow:

1. detect
2. record
3. classify
4. assign
5. fix
6. rerun originating scenario
7. close only after verified pass

Closing a defect without rerunning the originating blocking scenario is not allowed.

## 9. Evidence Retention

Keep evidence long enough to support:

- sprint retrospectives
- release audits
- incident investigation
- compliance review

At minimum, retain:

- blocking scenario reports
- performance reports
- security/isolation reports
- deploy and rollback signoff evidence

## 10. Naming Convention

Suggested artifact naming:

- `test-report-sprint-XX.md`
- `release-signoff-vX.Y.Z.md`
- `scenario-SR-P0-001-<date>.md`
- `perf-gate-<env>-<date>.md`
- `resilience-drill-<scenario>-<date>.md`

## 11. Documentation Evidence Rule

Sprint and release evidence must explicitly state:

- whether drift review was performed
- which docs were updated
- whether any known stale document remains
- who owns the remaining correction and by when

Use:

- [docs/testing/docs-drift-checklist.md](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/docs/testing/docs-drift-checklist.md)
