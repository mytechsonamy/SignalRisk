#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://localhost}"
TIMEOUT=5
FAILED=0

declare -A SERVICES=(
  ["auth-service"]="3001"
  ["event-collector"]="3000"
  ["device-intel-service"]="3003"
  ["velocity-service"]="3004"
  ["behavioral-service"]="3005"
  ["network-intel-service"]="3006"
  ["telco-intel-service"]="3007"
  ["decision-service"]="3002"
  ["case-service"]="3010"
  ["webhook-service"]="3011"
  ["graph-intel-service"]="3012"
  ["rule-engine-service"]="3008"
  ["feature-flag-service"]="3013"
)

echo "=== SignalRisk Health Check ==="
echo "Target: $BASE_URL | Timeout: ${TIMEOUT}s"
echo "---"

for SERVICE in "${!SERVICES[@]}"; do
  PORT="${SERVICES[$SERVICE]}"
  URL="${BASE_URL}:${PORT}/health"

  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" "$URL" 2>/dev/null || echo "000")

  if [[ "$HTTP_CODE" == "200" ]]; then
    echo "PASS  $SERVICE (port $PORT)"
  else
    echo "FAIL  $SERVICE (port $PORT) -- HTTP $HTTP_CODE"
    FAILED=$((FAILED + 1))
  fi
done

echo "---"
if [[ $FAILED -eq 0 ]]; then
  echo "All services healthy"
  exit 0
else
  echo "$FAILED service(s) unhealthy"
  exit 1
fi
