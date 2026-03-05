# SignalRisk Load Tests

k6 load test scenarios for the SignalRisk platform, targeting the event-collector and decision-service.

## Prerequisites

### Install k6

**macOS:**
```bash
brew install k6
```

**Ubuntu/Debian:**
```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6
```

**Docker:**
```bash
docker pull grafana/k6
```

### Install mock server dependencies

```bash
cd tests/load
npm install
```

## Environment Variables

| Variable   | Default                                        | Description                        |
|------------|------------------------------------------------|------------------------------------|
| `BASE_URL` | `http://localhost:3002` (event-collector)      | Target service base URL            |
| `API_KEY`  | `sk_test_test_key_00000000000000000000000000000000` | Bearer token for Authorization |

Decision-latency scenario defaults to `http://localhost:3009` (decision-service port).

## Running Scenarios

### Against the mock server (local development)

Start the mock server in a separate terminal:
```bash
node tests/load/__mocks__/mock-server.js
```

Then run any scenario:
```bash
k6 run tests/load/scenarios/event-ingestion.js
```

Or combine in one line (macOS/Linux):
```bash
node tests/load/__mocks__/mock-server.js &
k6 run tests/load/scenarios/event-ingestion.js
kill %1  # stop background mock server
```

### Against a real environment

```bash
BASE_URL=https://events.signalrisk.io \
API_KEY=sk_test_your_real_key \
k6 run tests/load/scenarios/event-ingestion.js
```

### Individual scenarios

```bash
# 5 000 events/sec ramp-up (2.5 minutes total)
k6 run tests/load/scenarios/event-ingestion.js

# 100 VUs constant load, p95 decision latency target < 500ms
BASE_URL=http://localhost:3009 k6 run tests/load/scenarios/decision-latency.js

# Rate-limit verification — expects 429s after ~1000 req/min
k6 run tests/load/scenarios/rate-limit.js

# Burst backpressure — 10 000 rps burst to trigger 429 / Retry-After
k6 run tests/load/scenarios/backpressure.js
```

## Mock Server Tests

The mock server has Jest unit tests that verify endpoint behaviour without k6:

```bash
cd tests/load
npm test
```

## Interpreting Results

### Key metrics

| Metric                  | What it measures                              |
|-------------------------|-----------------------------------------------|
| `http_req_duration`     | End-to-end HTTP latency (p50, p90, p95, p99) |
| `http_req_failed`       | Fraction of non-2xx/3xx responses             |
| `http_reqs`             | Throughput in requests/second                 |
| `errors` / `*_errors`   | Custom failure rate per scenario              |
| `rate_limited`          | Count of 429 responses (rate-limit scenario)  |
| `backpressure_triggered`| Count of 429 responses (backpressure scenario)|

### Threshold evaluation

Thresholds are defined per scenario in the `options.thresholds` block and also summarised in `thresholds.json`. k6 exits with a non-zero code if any threshold is breached.

```
✓ http_req_duration.............: avg=84ms  p(95)=142ms p(99)=312ms
✓ errors........................: 0.00%
✗ http_reqs.....................: rate=4821.3/s  < 5000 threshold FAILED
```

### Target SLOs

| Scenario         | SLO                                               |
|------------------|---------------------------------------------------|
| Event ingestion  | Throughput >= 5 000 rps, p95 < 200ms, p99 < 500ms |
| Decision latency | p95 < 500ms, p99 < 1 000ms, error rate < 1%       |
| Rate limiting    | At least one 429 returned (correctness check)      |
| Backpressure     | At least one 429 with `Retry-After` header         |

## k6 Cloud

Run distributed load tests from k6 Cloud:

```bash
k6 cloud tests/load/scenarios/event-ingestion.js
```

Or with environment overrides:
```bash
k6 cloud -e BASE_URL=https://events.signalrisk.io \
         -e API_KEY=sk_test_your_key \
         tests/load/scenarios/event-ingestion.js
```

## File Structure

```
tests/load/
  README.md                          # This file
  thresholds.json                    # SLO threshold definitions (reference)
  package.json                       # Mock server dev dependencies + Jest
  scenarios/
    event-ingestion.js               # Ramp to 5 000 events/sec
    decision-latency.js              # 100 VU constant load, p95 < 500ms
    rate-limit.js                    # Verify 429 at 1 200 req/min
    backpressure.js                  # 10 000 rps burst, verify 429+Retry-After
  __mocks__/
    mock-server.js                   # Node.js HTTP server simulating both services
    mock-server.test.js              # Jest tests for mock server behaviour
```
