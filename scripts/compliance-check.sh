#!/usr/bin/env bash
# Validates that all files referenced in compliance docs actually exist in the repo.
# Usage: ./scripts/compliance-check.sh [REPO_ROOT]
set -euo pipefail

ROOT="${1:-.}"
FAILED=0

check_file() {
  local file="$ROOT/$1"
  if [[ -f "$file" ]]; then
    echo "  PASS  $1"
  else
    echo "  FAIL  MISSING: $1"
    FAILED=$((FAILED + 1))
  fi
}

echo "=== SignalRisk Compliance Cross-Reference Check ==="
echo "Root: $ROOT"
echo ""

echo "--- Security controls ---"
check_file ".github/workflows/security.yml"
check_file "apps/auth-service/src/auth/key-rotation.service.ts"
check_file "apps/auth-service/src/rate-limit/merchant-rate-limit.service.ts"
check_file "apps/event-collector/src/backpressure/ip-rate-limit.service.ts"
check_file "apps/decision-service/src/decision/signal-fetchers.ts"
check_file "apps/decision-service/src/decision/decision.gateway.ts"

echo ""
echo "--- GDPR erasure & retention ---"
check_file "apps/auth-service/src/merchants/purge.service.ts"
check_file "apps/case-service/src/retention/data-retention.service.ts"
check_file "apps/device-intel-service/src/retention/device-retention.service.ts"

echo ""
echo "--- Observability ---"
check_file "infrastructure/observability/jaeger.yaml"
check_file "apps/auth-service/src/merchants/api-key-audit.service.ts"

echo ""
echo "--- Webhook integrity ---"
check_file "apps/webhook-service/src/webhook/webhook.service.ts"

echo ""
echo "--- Compliance docs ---"
check_file "docs/compliance/pci-dss-scoping.md"
check_file "docs/compliance/gdpr-data-flow.md"
check_file "docs/compliance/security-controls-matrix.md"

echo ""
echo "--- DR & resilience ---"
check_file "docs/runbooks/disaster-recovery.md"
check_file "infrastructure/k8s/poddisruptionbudget.yaml"
check_file "scripts/dr/health-check.sh"

echo ""
echo "==="
if [[ $FAILED -eq 0 ]]; then
  echo "All referenced files exist. Compliance cross-reference PASSED."
  exit 0
else
  echo "$FAILED referenced file(s) missing. Compliance cross-reference FAILED."
  exit 1
fi
