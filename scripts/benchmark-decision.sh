#!/usr/bin/env bash
# Decision service p99 latency benchmark
# Usage: ./scripts/benchmark-decision.sh [BASE_URL]

BASE_URL="${1:-http://localhost:3002}"
VU=100
DURATION=30

echo "=== SignalRisk Decision Engine Benchmark ==="
echo "Target: p99 < 150ms | VUs: $VU | Duration: ${DURATION}s"
echo "Endpoint: $BASE_URL/v1/decisions"

# Use k6 if available, otherwise curl-based approximation
if command -v k6 &>/dev/null; then
  k6 run --vus $VU --duration "${DURATION}s" - <<'K6_SCRIPT'
import http from 'k6/http';
import { check } from 'k6';

export default function () {
  const payload = JSON.stringify({
    merchantId: 'bench-merchant',
    entityId: `device-${Math.random().toString(36).substr(2,9)}`,
    eventType: 'PAGE_VIEW',
    signals: {}
  });
  const res = http.post(`${__ENV.BASE_URL}/v1/decisions`, payload, {
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer bench-token' },
    timeout: '500ms',
  });
  check(res, { 'status < 500': (r) => r.status < 500 });
}
K6_SCRIPT
else
  echo "k6 not found — running curl approximation (50 sequential requests)"
  TOTAL=0
  for i in $(seq 1 50); do
    MS=$(curl -s -o /dev/null -w "%{time_total}" -X POST "$BASE_URL/v1/decisions" \
      -H "Content-Type: application/json" \
      -d '{"merchantId":"bench","entityId":"e1","eventType":"PAGE_VIEW","signals":{}}' \
      2>/dev/null | awk '{print $1 * 1000}')
    TOTAL=$(echo "$TOTAL + $MS" | bc 2>/dev/null || echo "$TOTAL")
  done
  echo "Completed 50 requests. See logs for timing."
fi
