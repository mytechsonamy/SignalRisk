#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
RESULTS_DIR="scripts/load-test/results"
mkdir -p "$RESULTS_DIR"

echo "=== SignalRisk Full-Stack Load Test ==="
echo "Target: ${BASE_URL}"
echo "Scenario: Ramp 100->5000 req/sec, sustain 3m, ramp down"
echo ""

k6 run \
  --env BASE_URL="${BASE_URL}" \
  --out json="${RESULTS_DIR}/raw-$(date +%Y%m%d_%H%M%S).json" \
  scripts/load-test/full-stack-load-test.js

echo ""
echo "Results saved to ${RESULTS_DIR}/"
