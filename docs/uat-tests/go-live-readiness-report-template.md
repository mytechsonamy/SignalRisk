# SignalRisk Go-Live Readiness Report

Date:
Prepared by:
Release / Sprint:
Environment:
Candidate version:
Commit / Image:

## 1. Executive Verdict

- Verdict: `READY` / `NOT READY`
- Recommendation: `pilot go-live` / `hold` / `retest`
- Confidence level: `high` / `medium` / `low`

## 2. Scope Reviewed

- services in scope:
- UI surfaces in scope:
- scenario packs executed:
- merchant profiles executed:
- excluded items:

## 3. Build and Environment Baseline

- Docker / cluster baseline:
- health status:
- readiness status:
- migrations applied:
- canonical config verified:

## 4. UAT Result Summary

| Area | Result | Notes |
|---|---|---|
| Operator login flow | PASS / FAIL | |
| Merchant event -> decision flow | PASS / FAIL | |
| Case creation and review | PASS / FAIL | |
| Webhook delivery | PASS / FAIL | |
| WebSocket tenant isolation | PASS / FAIL | |
| Stateful fraud scenarios | PASS / FAIL | |
| Closed-loop feedback | PASS / FAIL | |
| Snapshot persistence | PASS / FAIL | |
| Seed-free prod-like profile | PASS / FAIL | |

## 5. Scenario Coverage

| Scenario ID | Title | Expected | Observed | Verdict |
|---|---|---|---|---|
| | | | | |

## 6. KPI Evidence

Record observed values and attach measurement source.

| KPI | Target | Observed | Source | Verdict |
|---|---|---|---|---|
| Decision latency p95 | | | | |
| Decision latency p99 | | | | |
| Event throughput | | | | |
| Error rate | | | | |
| Webhook success rate | | | | |
| Case creation success rate | | | | |
| Feedback enforcement success rate | | | | |
| Snapshot persistence success rate | | | | |

## 7. Fraud Detection Quality

| Metric | Value | Notes |
|---|---|---|
| True positive rate | | |
| False positive rate | | |
| Review rate | | |
| Block precision | | |
| Watchlist hit rate | | |
| Denylist repeat-block success | | |

## 8. Operational Evidence

- dashboards reviewed:
- alerts reviewed:
- telemetry counters reviewed:
- evidence artifacts attached:

## 9. Defects and Risks

### Open blockers

- ID / severity / owner / next step

### Accepted risks

- risk / rationale / compensating control / expiry

## 10. Documentation Status

- technical docs current:
- user docs current:
- UAT docs current:
- known drift:

## 11. Signoff

- Prepared by:
- Reviewed by:
- Product owner:
- Engineering owner:
- QA owner:
- Date:

## 12. Final Decision

- `Approve pilot go-live`
- `Approve controlled production candidate`
- `Hold release`

