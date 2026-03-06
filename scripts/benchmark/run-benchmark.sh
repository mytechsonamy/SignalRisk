#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
OUTPUT_DIR="scripts/benchmark/results"
mkdir -p "$OUTPUT_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTPUT_FILE="$OUTPUT_DIR/benchmark_${TIMESTAMP}.json"

echo "=== SignalRisk Decision Engine Latency Benchmark ==="
echo "Target: ${BASE_URL}"
echo "Output: ${OUTPUT_FILE}"
echo ""

# Run k6 benchmark
k6 run \
  --env BASE_URL="${BASE_URL}" \
  --out json="${OUTPUT_FILE}" \
  scripts/benchmark/decision-latency.js

echo ""
echo "=== Results saved to ${OUTPUT_FILE} ==="
echo "SLA Targets: p99 < 50ms | p95 < 30ms | error rate < 0.1%"
