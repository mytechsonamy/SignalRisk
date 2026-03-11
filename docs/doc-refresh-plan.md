# SignalRisk Documentation Refresh Plan

## 1. Purpose

This document defines how to refresh outdated user-facing and technical documentation without introducing new drift.

The current problem is not only that some docs are outdated.

The larger problem is that product behavior, stateful fraud evolution, and operator workflows are changing faster than the docs.

## 2. Documents in Scope

Primary refresh targets:

- [docs/TECHNICAL.md](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/docs/TECHNICAL.md)
- [docs/USER-GUIDE.md](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/docs/USER-GUIDE.md)
- [docs/testing/scenario-catalog.md](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/docs/testing/scenario-catalog.md)
- [docs/testing/master-test-strategy.md](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/docs/testing/master-test-strategy.md)
- stateful fraud docs under `docs/stateful-fraud-*.md`

## 3. Refresh Strategy

Update docs in this order:

1. technical truth
2. operator workflows
3. test and acceptance guidance
4. roadmap and gap-closure references

Do not update the user guide before the technical behaviors it depends on are confirmed.

## 4. Technical Documentation Refresh

`docs/TECHNICAL.md` should be refreshed using verified runtime behavior only.

Must be reviewed section by section:

- service count and container count
- request lifecycle
- decision flow
- rule-engine integration status
- stateful fraud status
- auth model
- test isolation
- FraudTester status
- deployment and quality gate claims

Must be corrected where needed:

- remove outdated hard guarantees if they are not yet verified
- label demo/partial/production-ready areas honestly
- add stateful fraud section showing current status and remaining gaps

## 5. User Guide Refresh

`docs/USER-GUIDE.md` should match real UI and real workflow behavior.

Must be verified through walkthrough:

- login flow
- overview widgets
- case queue behavior
- rules management
- fraud ops labeling
- analytics tabs
- graph intelligence views
- live feed
- settings
- admin panel
- FraudTester pages if user-facing

Must be corrected where needed:

- outdated credentials or role descriptions
- pages that no longer exist or changed behavior
- actions that are not yet implemented
- terminology drift between product and backend

## 6. Documentation Acceptance Criteria

The refresh is complete only if:

- TECHNICAL reflects current verified architecture and behavior
- USER-GUIDE reflects current verified UI and workflows
- UAT and test docs reference the same scenario ids and terminology
- outdated claims are removed or clearly marked as planned

## 7. Recommended Work Plan

### Phase 1: Reality check

- walk through current dashboard manually
- verify service behavior against code
- identify stale sections in TECHNICAL and USER-GUIDE

### Phase 2: Update technical guide

- rewrite inaccurate architecture and maturity claims
- add stateful fraud current status
- align test and simulation references

### Phase 3: Update user guide

- rewrite flows based on current UI
- add screenshots only after behavior is stable

### Phase 4: Bind docs to UAT

- make UAT packs reference USER-GUIDE pages and TECHNICAL sections
- use UAT failures to drive doc corrections

## 8. Suggested Ownership

- TECHNICAL.md: engineering owner
- USER-GUIDE.md: product + QA + fraud operations owner
- testing docs: QA owner
- stateful fraud docs: platform core owner

## 9. Change Control Rule

Any change in the following must trigger a doc review:

- auth flow
- dashboard workflow
- rule behavior
- stateful fraud signals or decisions
- webhook behavior
- test isolation behavior
- deployment or gate procedure

## 10. Documentation Maintenance Protocol

Documentation must be maintained continuously, not as a cleanup task at the end.

The required operating rule is:

- code change and doc change should close in the same work cycle whenever the user-visible or operator-visible behavior changed

Minimum maintenance checkpoints:

- PR close: update affected technical, user, or testing docs
- sprint exit: review `TECHNICAL.md`, `USER-GUIDE.md`, and testing docs for drift
- UAT exit: correct all workflow and wording mismatches discovered during walkthroughs
- release candidate: verify all "current behavior" statements still match staging

Required review questions for every completed work item:

- did any route, UI control, or workflow change
- did any auth, rule, decision, webhook, or stateful fraud behavior change
- did any environment/setup/runbook step change
- did any scenario id, gate, or acceptance criterion change

If the answer is yes, the corresponding docs must be updated before the work item is considered closed.

## 11. Required Living Documents

These documents should be treated as living documents and reviewed continuously:

- [docs/TECHNICAL.md](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/docs/TECHNICAL.md)
- [docs/USER-GUIDE.md](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/docs/USER-GUIDE.md)
- [docs/testing/README.md](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/docs/testing/README.md)
- [docs/testing/scenario-catalog.md](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/docs/testing/scenario-catalog.md)
- [docs/testing/uat-plan.md](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/docs/testing/uat-plan.md)
- stateful fraud docs under `docs/stateful-fraud-*.md`
