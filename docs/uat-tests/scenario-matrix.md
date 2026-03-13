# SignalRisk Synthetic UAT Scenario Matrix

## 1. Purpose

This matrix defines the minimum scenario inventory for production-like UAT without a real customer.

Target baseline:

- 20 legitimate scenarios
- 20 fraud scenarios
- 10 closed-loop scenarios

Each scenario must map to:

- merchant profile
- expected truth
- expected decision
- expected downstream actions
- expected explanation signals

## 2. Scenario Fields

| Field | Meaning |
|---|---|
| `scenario_id` | Stable scenario identifier |
| `profile_id` | Synthetic merchant profile (`M1`, `M2`, `M3`) |
| `class` | `legitimate`, `fraud`, `closed-loop` |
| `expected_truth` | `legitimate`, `suspicious`, `fraud` |
| `expected_action` | `ALLOW`, `REVIEW`, `BLOCK` |
| `case_expected` | Whether a case should be created |
| `webhook_expected` | Whether webhook should be delivered |
| `feedback_expected` | Whether analyst feedback should alter later decisions |
| `required_signals` | Signals or risk factors that should appear |

## 3. Legitimate Scenarios

| Scenario ID | Title | Profile | Expected Truth | Expected Action | Case | Webhook | Required Signals |
|---|---|---|---|---|---|---|---|
| SYN-L-001 | First-time normal signup | M1 | legitimate | ALLOW | No | Yes | none dominant |
| SYN-L-002 | Repeat normal login | M1 | legitimate | ALLOW | No | Yes | low network/device risk |
| SYN-L-003 | Low-value normal payment | M1 | legitimate | ALLOW | No | Yes | no burst |
| SYN-L-004 | Same customer two payments in 1h | M1 | legitimate | ALLOW | No | Yes | stateful counters present, low risk |
| SYN-L-005 | Session continuation checkout | M1 | legitimate | ALLOW | No | Yes | consistent session/device |
| SYN-L-006 | Returning trusted device | M1 | legitimate | ALLOW | No | Yes | good device trust |
| SYN-L-007 | Known good customer high balance top-up | M2 | legitimate | ALLOW | No | Yes | normal baseline |
| SYN-L-008 | Campaign spike but good users | M2 | legitimate | ALLOW or REVIEW | Optional | Yes | burst tolerated |
| SYN-L-009 | Same IP family household traffic | M2 | legitimate | ALLOW | No | Yes | no fraud ring |
| SYN-L-010 | Mobile wallet re-authentication | M2 | legitimate | ALLOW | No | Yes | low behavior risk |
| SYN-L-011 | Cross-session same customer day reuse | M2 | legitimate | ALLOW | No | Yes | txCount24h visible, low contribution |
| SYN-L-012 | Legitimate review-worthy high amount | M2 | suspicious | REVIEW | Yes | Yes | amount / newness |
| SYN-L-013 | New but clean device | M2 | legitimate | ALLOW | No | Yes | no emulator/proxy |
| SYN-L-014 | Late-night but normal user activity | M2 | legitimate | ALLOW | No | Yes | no anomaly over-threshold |
| SYN-L-015 | Stable prepaid telco user | M3 | legitimate | ALLOW | No | Yes | telco not dominant |
| SYN-L-016 | Frequent but legitimate wallet usage | M3 | legitimate | ALLOW or REVIEW | Optional | Yes | moderate velocity only |
| SYN-L-017 | Analyst-cleared false positive retry | M3 | legitimate | ALLOW or REVIEW | Optional | Yes | allowlist suppression present |
| SYN-L-018 | Shared office IP legitimate batch | M2 | legitimate | ALLOW | No | Yes | IP reuse not over-triggered |
| SYN-L-019 | Password reset then login | M1 | legitimate | ALLOW | No | Yes | no bot / no sequence abuse |
| SYN-L-020 | Snapshot-only analytics candidate | M2 | legitimate | ALLOW | No | Yes | feature snapshot written |

## 4. Fraud Scenarios

| Scenario ID | Title | Profile | Expected Truth | Expected Action | Case | Webhook | Required Signals |
|---|---|---|---|---|---|---|---|
| SYN-F-001 | Device farm signup burst | M3 | fraud | BLOCK | Yes | Yes | velocity burst, device reuse |
| SYN-F-002 | Emulator + proxy payment | M3 | fraud | BLOCK | Yes | Yes | emulator, proxy |
| SYN-F-003 | Bot checkout | M3 | fraud | BLOCK | Yes | Yes | behavioral bot |
| SYN-F-004 | Same customer rapid retry abuse | M3 | fraud | REVIEW or BLOCK | Yes | Yes | txCount10m |
| SYN-F-005 | Same device many accounts | M3 | fraud | BLOCK | Yes | Yes | stateful.device, graph sharing |
| SYN-F-006 | Same IP signup burst | M3 | fraud | BLOCK | Yes | Yes | IP velocity |
| SYN-F-007 | Fraud ring linked entity | M3 | fraud | BLOCK | Yes | Yes | stateful.graph.fraudRingDetected |
| SYN-F-008 | Tor + geo mismatch login | M2 | fraud | REVIEW or BLOCK | Yes | Yes | isTor, geo mismatch |
| SYN-F-009 | SIM-swap risk pattern | M3 | fraud | REVIEW | Yes | Yes | telco anomaly |
| SYN-F-010 | Headless browser purchase flow | M3 | fraud | BLOCK | Yes | Yes | bot / device anomaly |
| SYN-F-011 | New device + high amount + burst | M2 | fraud | BLOCK | Yes | Yes | combined scoring |
| SYN-F-012 | Repeated blocked customer retry | M3 | fraud | BLOCK | Yes | Yes | previousBlockCount30d |
| SYN-F-013 | Shared payment instrument abuse | M3 | fraud | REVIEW or BLOCK | Yes | Yes | graph / entity correlation |
| SYN-F-014 | Promo abuse multi-account creation | M3 | fraud | BLOCK | Yes | Yes | device + velocity |
| SYN-F-015 | Stolen MSISDN purchase | M3 | fraud | REVIEW or BLOCK | Yes | Yes | telco + device mismatch |
| SYN-F-016 | Slow fraud evasion sequence | M2 | fraud | REVIEW | Yes | Yes | sequence pattern |
| SYN-F-017 | VPN wallet drain attempt | M3 | fraud | BLOCK | Yes | Yes | VPN + amount risk |
| SYN-F-018 | Cross-entity graph cluster retry | M3 | fraud | BLOCK | Yes | Yes | graph enrichment |
| SYN-F-019 | Fraud after previous legitimate disguise | M2 | fraud | REVIEW or BLOCK | Yes | Yes | state change visible |
| SYN-F-020 | Snapshot persistence on fraud path | M3 | fraud | BLOCK | Yes | Yes | snapshot + blocking factors |

## 5. Closed-Loop Scenarios

| Scenario ID | Title | Profile | Expected Truth | Expected Action | Feedback Expected | Required Assertions |
|---|---|---|---|---|---|---|
| SYN-C-001 | FRAUD label -> denylist retry block | M3 | fraud | BLOCK | Yes | second event short-circuits BLOCK |
| SYN-C-002 | LEGITIMATE label -> cooldown suppression | M2 | legitimate | ALLOW or REVIEW | Yes | no hard bypass, score reduced |
| SYN-C-003 | entityType customer propagation | M2 | fraud | REVIEW or BLOCK | Yes | decision -> case -> label -> watchlist preserves `customer` |
| SYN-C-004 | entityType device propagation | M3 | fraud | BLOCK | Yes | typed device path preserved |
| SYN-C-005 | entityType ip propagation | M3 | fraud | REVIEW or BLOCK | Yes | typed ip path preserved |
| SYN-C-006 | Watchlist score boost | M2 | suspicious | REVIEW | Yes | `watchlist.watchlist` risk factor present |
| SYN-C-007 | Allowlist does not bypass hard block | M3 | fraud | BLOCK | Yes | allowlist present but strong signals still block |
| SYN-C-008 | Analyst feedback updates entity profile | M2 | legitimate or fraud | n/a | Yes | entity_profiles updated |
| SYN-C-009 | Snapshot persists after feedback-altered decision | M3 | fraud | BLOCK | Yes | feature snapshot stored with updated context |
| SYN-C-010 | WebSocket and dashboard reflect feedback-altered path | M2 | fraud | BLOCK or REVIEW | Yes | live feed and case state aligned |

## 6. Minimum Blocking Set

These scenarios should be treated as release-blocking:

- `SYN-L-001`
- `SYN-L-012`
- `SYN-F-001`
- `SYN-F-002`
- `SYN-F-005`
- `SYN-F-012`
- `SYN-C-001`
- `SYN-C-002`
- `SYN-C-003`
- `SYN-C-007`

### Blocking Scenario → Test File Mapping

| Scenario ID | Title | Test File | Oracle (Expected) | Key Assertions |
|---|---|---|---|---|
| SYN-L-001 | First-time normal signup | `tests/e2e/scenarios/happy-path.spec.ts` | ALLOW, no case | `decision.action === 'ALLOW'`, no case created, webhook delivered |
| SYN-L-012 | Legitimate review-worthy high amount | `tests/e2e/scenarios/happy-path.spec.ts` (extend) | REVIEW, case created | `riskScore >= 40`, `case.status === 'OPEN'`, amount/newness in riskFactors |
| SYN-F-001 | Device farm signup burst | `tests/e2e/scenarios/fraud-blast.spec.ts` | BLOCK, case created | `decision.action in ['BLOCK','REVIEW']`, velocity burst detected, case opened |
| SYN-F-002 | Emulator + proxy payment | `apps/fraud-tester/src/scenarios/catalog/emulator-spoof.scenario.ts` | BLOCK | `device.isEmulator`, proxy signal present, `decision.action === 'BLOCK'` |
| SYN-F-005 | Same device many accounts | `tests/e2e/scenarios/fraud-blast.spec.ts` | BLOCK, graph signal | device reuse detected across accounts, `stateful.device.*` in riskFactors |
| SYN-F-012 | Repeated blocked customer retry | `tests/e2e/scenarios/denylist-enforcement.spec.ts` | BLOCK (immediate) | `previousBlockCount30d > 0`, watchlist hit, `decision.action === 'BLOCK'` |
| SYN-C-001 | FRAUD label → denylist retry block | `tests/e2e/scenarios/denylist-enforcement.spec.ts` | BLOCK after FRAUD label | denylist entry in DB, second event → `decision.action === 'BLOCK'` |
| SYN-C-002 | LEGITIMATE label → cooldown suppression | `tests/e2e/scenarios/allowlist-cooldown.spec.ts` | ALLOW or REVIEW | allowlist entry in DB, single event → not BLOCK, score reduced |
| SYN-C-003 | entityType customer propagation | `tests/e2e/scenarios/entity-type-propagation.spec.ts` | entityType preserved | `case.entityType` set, `watchlist.entity_type` matches, full chain traced |
| SYN-C-007 | Allowlist does not bypass hard block | `tests/e2e/scenarios/allowlist-cooldown.spec.ts` | BLOCK despite allowlist | allowlist present but velocity burst → `decision.action in ['BLOCK','REVIEW']` |

### Run Command

```bash
# Run only the 10 blocking scenarios (closed-loop project includes 4 spec files)
npx playwright test --config tests/e2e/playwright.config.real.ts --project=e2e-light --grep "normal traffic"
npx playwright test --config tests/e2e/playwright.config.real.ts --project=e2e-heavy --grep "fraud-blast"
npx playwright test --config tests/e2e/playwright.config.real.ts --project=closed-loop
```

## 7. Execution Guidance

Recommended order:

1. Run all blocking scenarios deterministically
2. Run all legitimate scenarios under ambient traffic
3. Run all fraud scenarios under ambient traffic
4. Run all closed-loop scenarios with analyst feedback actions
5. Generate KPI and signoff evidence

## 8. Evidence Rule

Each row above must eventually map to:

- test runner / command
- evidence artifact
- final verdict

No matrix row should remain “planned only” at signoff time.
