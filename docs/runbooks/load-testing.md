# Load Testing Runbook — SignalRisk

## Overview

This runbook describes how to run the SignalRisk full-stack load test, interpret results, and escalate if SLA thresholds are breached.

---

## Prerequisites

### Tools
- **k6** >= 0.46.0: Install via `brew install k6` (macOS) or `https://k6.io/docs/get-started/installation/`
- **bash** >= 5.0
- Access to target environment (staging or production-equivalent cluster)

### Environment
- Staging cluster running and healthy (all 13 services up)
- Redis, Kafka, and PostgreSQL reachable from the test runner host
- Valid API keys pre-provisioned for test merchants (`test-key-merchant-1` through `test-key-merchant-100`)
- Results directory writable: `scripts/load-test/results/` (created automatically by the script)

### Verify cluster health before running
```bash
./scripts/dr/health-check.sh https://staging.signalrisk.internal
```
All 13 services must show PASS before proceeding.

---

## How to Run

### Standard staging run
```bash
BASE_URL=https://staging.signalrisk.internal bash scripts/load-test/run-load-test.sh
```

### Local development run (against localhost)
```bash
bash scripts/load-test/run-load-test.sh
```

### Custom environment
```bash
BASE_URL=https://your-target-host k6 run \
  --env BASE_URL=https://your-target-host \
  --out json=scripts/load-test/results/raw-custom.json \
  scripts/load-test/full-stack-load-test.js
```

### Test profile
| Phase | Duration | Target req/sec |
|-------|----------|---------------|
| Ramp up | 1 min | 100 → 5000 |
| Sustain | 3 min | 5000 |
| Ramp down | 1 min | 5000 → 0 |
| **Total** | **5 min** | — |

---

## SLA Thresholds

The test will **fail** (exit code 99) if any of the following thresholds are breached:

| Metric | Threshold | What it means |
|--------|-----------|---------------|
| `http_req_duration p(99)` | < 100ms | 99th-percentile latency under full load |
| `http_req_duration p(95)` | < 50ms | 95th-percentile latency must stay fast |
| `http_req_failed` rate | < 0.5% | Less than 1 in 200 requests may fail |
| `decisions_total` count | > 270,000 | Minimum throughput during sustain phase |

---

## Interpreting Results

### Summary output
After the test completes, a summary is printed to stdout and saved to `scripts/load-test/results/summary.json`.

```
=== SignalRisk Load Test Summary ===
Throughput:  4872 req/sec
p95 latency: 38.4ms
p99 latency: 82.1ms
Error rate:  0.021%
SLA target:  p99 < 100ms | p95 < 50ms | errors < 0.5%
```

### Expected decision distribution
Under normal conditions, the test sends a realistic fraud distribution:
- 70% normal payments (low-risk, small amounts)
- 20% high-risk payments (large amounts, Tor-like IPs, flagged devices)
- 10% edge cases (TOPUP with minimal data)

**Expected block rate: 5–15%** of all requests. A block rate significantly above 20% or below 2% may indicate rule engine misconfiguration.

### Raw JSON results
The raw k6 output is saved to `scripts/load-test/results/raw-YYYYMMDD_HHMMSS.json` and contains per-metric time-series data for detailed analysis.

### Interpreting latency percentiles
- **p95 < 50ms**: Normal — event-collector is processing fast, Kafka is healthy
- **p95 50–80ms**: Warning — check Redis latency, Kafka consumer lag
- **p95 > 80ms**: Critical — likely backpressure or resource exhaustion
- **p99 > 100ms**: SLA breach — escalate immediately

---

## Escalation Procedures

### If SLA is breached during load test

1. **Stop the test** immediately to avoid overwhelming production systems:
   ```bash
   # Press Ctrl+C to interrupt k6
   ```

2. **Capture current metrics** from Grafana dashboard:
   - `SignalRisk / Service Overview` — check CPU, memory, connection pool saturation
   - `SignalRisk / Kafka` — check consumer lag on `events` topic
   - `SignalRisk / Redis` — check latency and memory usage

3. **Identify the bottleneck**:
   - High p99 + low error rate → latency bottleneck, likely DB or Redis
   - High error rate → likely Kafka backpressure or connection exhaustion
   - Throughput < 4500/sec → check event-collector HPA settings

4. **Page the on-call engineer** if the breach occurs on staging with a configuration that mirrors production:
   - PagerDuty: `signalrisk-load-test` escalation policy
   - Slack: `#signalrisk-oncall` with tag `@oncall-eng`

5. **File a postmortem ticket** in Linear with label `load-test-regression` if:
   - p99 exceeds 100ms at < 3000 req/sec
   - Error rate exceeds 1% at any throughput level

---

## Baseline Metrics (Initial Run)

The following baselines were established during initial capacity testing. Update these after each quarterly load test.

| Metric | Baseline | Date | Notes |
|--------|----------|------|-------|
| Peak throughput | TBD req/sec | — | To be filled after first run |
| p99 at 5K req/sec | TBD ms | — | Target < 100ms |
| p95 at 5K req/sec | TBD ms | — | Target < 50ms |
| Error rate at 5K | TBD % | — | Target < 0.5% |
| Block rate | TBD % | — | Expected 5–15% |
| Max sustainable VUs | TBD | — | k6 preAllocatedVUs=200, maxVUs=500 |

---

## Cleanup After Test

1. Remove large raw JSON files if no longer needed:
   ```bash
   ls -lh scripts/load-test/results/
   # Raw files can be several hundred MB for a full 5-minute run
   rm scripts/load-test/results/raw-*.json
   ```

2. Retain `summary.json` for trend tracking.

3. If test generated load against staging, verify Kafka consumer lag has returned to 0:
   ```bash
   kubectl exec -n signalrisk deploy/event-collector -- \
     kafka-consumer-groups.sh --bootstrap-server kafka:9092 \
     --describe --group event-collector-group
   ```

4. Check Redis memory usage returned to baseline after test:
   ```bash
   kubectl exec -n signalrisk deploy/velocity-engine -- \
     redis-cli -h $REDIS_HOST info memory | grep used_memory_human
   ```

---

## Related Runbooks

- [Disaster Recovery](./disaster-recovery.md)
- [On-Call Playbook](./on-call-playbook.md)
