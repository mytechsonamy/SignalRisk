# SignalRisk Synthetic UAT Strategy

## 1. Purpose

This document defines how SignalRisk should run end-to-end user acceptance testing without relying on a real production customer or live merchant traffic.

The approach is:

- generate synthetic but realistic merchant traffic
- pre-label that traffic with expected truth
- run the platform end to end
- verify not only the decision, but the full downstream action chain

This is the canonical approach for pre-pilot and pre-production UAT until real customer production traffic is available.

## 2. Core Principle

SignalRisk UAT must not behave like a thin API smoke test.

Each validation run must exercise the full chain:

1. event ingestion
2. signal aggregation
3. decision generation
4. case creation
5. webhook behavior
6. dashboard visibility
7. analyst resolution
8. feedback loop impact on subsequent events

The system is accepted only when the observed platform behavior matches the scenario truth and the expected operational side effects.

## 3. Test Model

Synthetic UAT uses two traffic layers:

### A. Deterministic scenario traffic

Scenario runs with explicit expected outcomes.

Use this for:

- acceptance testing
- regression testing
- release blocking scenarios

### B. Ambient background traffic

Continuous realistic noise that simulates normal merchant production behavior.

Use this for:

- dashboard realism
- velocity/state buildup
- validating fraud detection in non-empty, mixed traffic

SignalRisk should run both at the same time:

- ambient traffic provides production-like context
- deterministic scenarios provide test truth

## 4. Synthetic Merchant Profiles

At minimum, define three merchant profiles.

### Profile M1: Low-Risk Merchant

Characteristics:

- low event volume
- mostly legitimate users
- rare fraud
- small transaction values

Suggested baseline:

- daily events: 10k to 30k
- fraud ratio: 1% to 2%
- review-worthy ratio: 3% to 5%
- main event types: login, signup, low-value payment

### Profile M2: Growth Merchant

Characteristics:

- medium volume
- campaign bursts
- mixed device quality
- occasional abuse spikes

Suggested baseline:

- daily events: 50k to 200k
- fraud ratio: 3% to 6%
- review-worthy ratio: 8% to 12%
- burst windows during campaign or promotion periods

### Profile M3: High-Risk Merchant

Characteristics:

- wallet / gaming / telco-style risk
- device reuse
- bot pressure
- account farming and promo abuse

Suggested baseline:

- daily events: 100k to 500k
- fraud ratio: 8% to 15%
- review-worthy ratio: 12% to 20%
- heavy burst and repeated entity behavior

## 5. Truth-Labeled Event Model

Every generated event must carry test metadata outside the business payload.

Required metadata:

- `scenario_id`
- `profile_id`
- `expected_truth`
- `expected_action`
- `expected_case`
- `expected_webhook`
- `expected_feedback_effect`
- `expected_explanation_signals`
- `is_test`

Recommended truth categories:

- `legitimate`
- `suspicious`
- `fraud`

Recommended expected actions:

- `ALLOW`
- `REVIEW`
- `BLOCK`

Example:

```json
{
  "scenario_id": "SYN-P0-014",
  "profile_id": "M3",
  "expected_truth": "fraud",
  "expected_action": "BLOCK",
  "expected_case": true,
  "expected_webhook": true,
  "expected_feedback_effect": "denylist_on_repeat",
  "expected_explanation_signals": [
    "device.isEmulator",
    "velocity.burstDetected",
    "stateful.customer.previousBlockCount30d"
  ],
  "is_test": true
}
```

## 6. Scenario Classes

Synthetic UAT should cover both normal and fraudulent behavior.

### Normal traffic scenarios

- first-time legitimate signup
- repeat legitimate login
- normal low-value payment
- high-frequency but legitimate campaign spike
- legitimate customer with multiple payments across the day

### Fraud scenarios

- device farm signup burst
- bot checkout / scripted payment
- emulator + proxy + burst combination
- repeated same-entity abuse within 10m and 1h
- multi-account same-device behavior
- shared-IP fraud burst
- graph-linked fraud ring activity
- denylisted entity retry
- previous false positive followed by legitimate repeat activity

### Closed-loop scenarios

- case resolved as `FRAUD` -> next event should block
- case resolved as `LEGITIMATE` -> cooldown/allowlist suppression should apply
- `entityType` preserved across decision -> case -> label -> watchlist

## 7. Fraud Oracle Model

Synthetic UAT needs an oracle, because there is no production customer ground truth.

For each scenario define:

- expected truth
- required minimum action
- forbidden action
- required downstream effects
- required explanation signals

Example policy:

### Emulator + proxy + velocity burst

- truth: `fraud`
- required action: `BLOCK`
- forbidden action: `ALLOW`
- required effects: case created, webhook sent
- required explanation: at least one of emulator / proxy / burst present

### Repeat legitimate customer small payments

- truth: `legitimate`
- required action: `ALLOW`
- tolerated alternative: `REVIEW`
- forbidden action: `BLOCK`
- required effects: no case if `ALLOW`

## 8. Acceptance Chain per Scenario

Each scenario must validate all relevant layers.

### Decision assertions

- decision action matches oracle
- risk score within acceptable band
- expected risk factors appear
- forbidden risk factors do not dominate unexpectedly

### Operational assertions

- case created for `REVIEW` / `BLOCK`
- webhook behavior matches expectation
- dashboard live feed receives the event
- analytics isolation is respected for test traffic

### Feedback assertions

- analyst action is accepted
- label is published
- watchlist/entity profile state updates
- subsequent event reflects updated state

## 9. Execution Phases

Synthetic UAT should run in four phases.

### Phase 1: Deterministic acceptance

Run critical scenarios one by one.

Goal:

- prove base correctness

### Phase 2: Mixed traffic simulation

Run deterministic fraud scenarios while ambient traffic is active.

Goal:

- validate detection under production-like noise

### Phase 3: Closed-loop fraud validation

Run analyst resolution and repeated follow-up actions.

Goal:

- prove feedback loop behavior

### Phase 4: Operator UAT

Validate dashboard and admin workflow on top of the same synthetic traffic.

Goal:

- prove real operational usability

## 10. Recommended Data Dimensions

Synthetic traffic should vary at least the following dimensions:

- merchant
- customer/account
- device
- IP
- session
- event type
- amount
- currency
- country
- ASN / network quality
- telco / MSISDN when relevant
- timestamp and burst timing

This matters because stateful fraud behavior is created by sequences and repetition, not just single requests.

## 11. Suggested Distribution

For mixed traffic UAT, start with:

- 85% legitimate
- 10% suspicious / review-worthy
- 5% true fraud

Then run focused specialty batches:

- high-fraud batch
- false-positive regression batch
- closed-loop batch
- tenant-isolation batch

## 12. KPIs for UAT

Do not rely only on pass/fail.

Track:

- true positive rate
- false positive rate
- review rate
- block precision
- webhook success rate
- case creation rate
- feedback loop activation success
- decision latency p95 / p99
- watchlist enforcement hit rate
- snapshot persistence success rate

## 13. Repo Implementation Model

Recommended structure:

| Area | Suggested location |
|---|---|
| Merchant profiles | `tests/simulation/profiles/` |
| Scenario definitions | `tests/simulation/scenarios/` |
| Fixtures | `tests/simulation/fixtures/` |
| Oracles | `tests/simulation/oracles/` |
| Ambient traffic runners | `tests/simulation/runners/` |
| End-to-end assertions | `tests/e2e/scenarios/uat/` |
| Evidence packs | `docs/testing/evidence/` |

## 14. Minimum First Version

The first usable synthetic UAT program should include:

- 3 merchant profiles
- 20 legitimate scenarios
- 20 fraud scenarios
- 10 closed-loop scenarios
- ambient traffic runner
- evidence template with scenario truth vs observed result

## 15. Release Blocking Scenarios

Before declaring pilot or production readiness, the following synthetic UAT scenarios should be blocking:

- operator invite -> login -> password change
- valid merchant event -> decision -> webhook
- repeated suspicious same-entity behavior escalates correctly
- denylist retry blocks immediately
- legitimate cooldown suppresses but does not bypass
- cross-tenant leakage does not occur
- `entityType` survives the full loop
- feature snapshots are written

## 16. Evidence Requirements

Each synthetic UAT run must produce:

- profile used
- scenario IDs executed
- expected truth and action
- observed truth and action
- pass/fail result
- case/webhook/live-feed outcome
- analyst feedback result if applicable
- defects and severity

## 17. Recommendation

SignalRisk should treat synthetic UAT as its primary pre-customer validation method.

Until real production traffic exists, the best available substitute is:

- truth-labeled synthetic traffic
- ambient mixed traffic
- closed-loop analyst simulation
- evidence-driven acceptance

This is sufficient to validate fraud detection behavior, operator workflows, and production-like stateful enforcement before a pilot customer is live.
