# SignalRisk Documentation Drift Checklist

## 1. Purpose

This checklist is used to prevent implementation and documentation drift.

Run it:

- before closing a PR
- at sprint exit
- before UAT signoff
- before release candidate signoff

## 2. Core Rule

If a change affects runtime behavior, operator workflow, acceptance criteria, or environment setup, the related documentation must be reviewed in the same delivery cycle.

## 3. Drift Review Checklist

### Product and UI

- [ ] `docs/USER-GUIDE.md` reviewed if any page, route, tab, button, role guard, or workflow changed
- [ ] screenshots or wording updated if visible behavior changed
- [ ] old credentials, roles, labels, or navigation names removed

### Technical behavior

- [ ] `docs/TECHNICAL.md` reviewed if service behavior, architecture, auth, decision flow, Kafka, Redis, DB, or deployment behavior changed
- [ ] stateful fraud sections reviewed if signal names, decision semantics, or feedback behavior changed
- [ ] optimistic claims removed if they are no longer verified

### Testing and acceptance

- [ ] `docs/testing/scenario-catalog.md` reviewed if a new blocking scenario was added, changed, or retired
- [ ] `docs/uat-tests/uat-plan.md` reviewed if user acceptance flows changed
- [ ] `docs/uat-tests/fraud-simulation-automation.md` reviewed if simulation packs or isolation behavior changed
- [ ] `docs/testing/quality-gates.md` reviewed if gate thresholds or blocking rules changed
- [ ] `docs/testing/evidence-and-reporting.md` reviewed if evidence expectations changed

### Stateful fraud

- [ ] `docs/stateful-fraud-scope.md` reviewed if scope changed
- [ ] `docs/stateful-fraud-roadmap.md` reviewed if delivery order changed
- [ ] `docs/stateful-fraud-gap-closure-plan.md` reviewed if any closure item changed status
- [ ] source-of-truth feature references reviewed if feature names or runtime production changed

### Operational docs

- [ ] runbooks reviewed if deployment, rollback, load testing, or incident procedures changed
- [ ] setup instructions reviewed if local/staging bootstrapping changed

## 4. Required Output

Each drift review should produce one of these outcomes:

- no doc changes required
- docs updated in the same work item
- docs follow-up created with explicit owner and due date

For P0, auth, isolation, stateful fraud, or deploy-path changes, "follow-up later" should be treated as an exception, not the default.

## 5. Suggested Evidence Snippet

```md
## Documentation Review

- Drift review completed: yes / no
- Docs updated:
  - docs/TECHNICAL.md
  - docs/USER-GUIDE.md
  - docs/testing/scenario-catalog.md
- Residual doc follow-up:
  - none / owner + due date
```
