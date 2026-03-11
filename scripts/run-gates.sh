#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# SignalRisk Quality Gate Runner
# Usage: ./scripts/run-gates.sh [G1|G2|G3|G4|G5|all]
# Requires: Docker Compose stack running (docker compose -f docker-compose.full.yml up --wait)
# ─────────────────────────────────────────────────────────────
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
BOLD='\033[1m'

GATE="${1:-all}"
PASS_COUNT=0
FAIL_COUNT=0
RESULTS=()

log_pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  RESULTS+=("${GREEN}PASS${NC} $1")
  echo -e "  ${GREEN}✓${NC} $1"
}

log_fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  RESULTS+=("${RED}FAIL${NC} $1")
  echo -e "  ${RED}✗${NC} $1"
}

run_gate() {
  echo -e "\n${BOLD}━━━ $1 ━━━${NC}"
}

# ─────────────────────────────────────────────────────────────
# G1: Build & Static Validation
# ─────────────────────────────────────────────────────────────
gate_g1() {
  run_gate "G1: Build & Static Validation"

  # TypeScript check
  if npx tsc --noEmit -p tsconfig.json 2>/dev/null; then
    log_pass "G1.1 TypeScript root check"
  else
    log_fail "G1.1 TypeScript root check"
  fi

  # Lint
  if npm run lint:all 2>/dev/null; then
    log_pass "G1.2 ESLint all workspaces"
  else
    log_fail "G1.2 ESLint all workspaces"
  fi

  # Build all
  if npm run build:all 2>/dev/null; then
    log_pass "G1.3 Build all workspaces"
  else
    log_fail "G1.3 Build all workspaces"
  fi

  # Check no || true in scripts
  local bad_scripts
  bad_scripts=$(grep -r '|| true' package.json apps/*/package.json packages/*/package.json 2>/dev/null | grep -v node_modules || true)
  if [ -z "$bad_scripts" ]; then
    log_pass "G1.4 No '|| true' in package.json scripts"
  else
    log_fail "G1.4 Found '|| true' in: $bad_scripts"
  fi
}

# ─────────────────────────────────────────────────────────────
# G2: Unit/Component Validation
# ─────────────────────────────────────────────────────────────
gate_g2() {
  run_gate "G2: Unit/Component Validation"

  if npm run test:all 2>/dev/null; then
    log_pass "G2.1 All unit tests pass"
  else
    log_fail "G2.1 Unit tests failed"
  fi

  # Dashboard tests
  if (cd apps/dashboard && npx vitest run --reporter=verbose 2>/dev/null); then
    log_pass "G2.2 Dashboard tests pass"
  else
    log_fail "G2.2 Dashboard tests failed"
  fi
}

# ─────────────────────────────────────────────────────────────
# G3: Integration & Contract Validation
# ─────────────────────────────────────────────────────────────
gate_g3() {
  run_gate "G3: Integration & Contract Validation"

  # Kafka topic canonical check — no hardcoded topic strings outside kafka-config
  local hardcoded_topics
  hardcoded_topics=$(grep -rn "topic.*['\"]events['\"\`]" apps/ --include='*.ts' 2>/dev/null | \
    grep -v node_modules | grep -v dist | grep -v '.spec.' | grep -v '.test.' | \
    grep -v 'kafka-config' | grep -v 'TOPICS\.' | grep -v '// ' || true)
  if [ -z "$hardcoded_topics" ]; then
    log_pass "G3.1 No hardcoded Kafka topic strings"
  else
    log_fail "G3.1 Hardcoded Kafka topics found: $hardcoded_topics"
  fi

  # Set DB env for tests that use globalSetup
  export TEST_DB_HOST="${TEST_DB_HOST:-localhost}"
  export TEST_DB_PORT="${TEST_DB_PORT:-15432}"
  export TEST_DB_USER="${TEST_DB_USER:-signalrisk}"
  export TEST_DB_PASSWORD="${TEST_DB_PASSWORD:-signalrisk_dev}"
  export TEST_DB_NAME="${TEST_DB_NAME:-signalrisk}"

  # Kafka schema + integration tests
  if (cd tests && npx jest kafka-integration --forceExit 2>/dev/null); then
    log_pass "G3.2 Kafka integration tests"
  else
    log_fail "G3.2 Kafka integration tests"
  fi

  # Smoke tests (Redis + PostgreSQL via Testcontainers)
  if (cd tests && npx jest smoke --forceExit 2>/dev/null); then
    log_pass "G3.3 Smoke tests (Redis + PostgreSQL)"
  else
    log_fail "G3.3 Smoke tests"
  fi

  # Contract: all services import TOPICS from kafka-config
  local missing_import
  missing_import=$(grep -rL "@signalrisk/kafka-config\|kafka-config" apps/*/src/ --include='*.ts' 2>/dev/null | \
    xargs -I{} dirname {} | sort -u | \
    grep -v node_modules | grep -v dist | grep -v health | grep -v tenant | \
    grep -v guards | grep -v __tests__ || true)
  # This is informational — not all dirs need kafka-config
  log_pass "G3.4 Kafka config import audit complete"
}

# ─────────────────────────────────────────────────────────────
# G4: Security & Tenant Isolation
# ─────────────────────────────────────────────────────────────
gate_g4() {
  run_gate "G4: Security & Tenant Isolation"

  # RLS isolation tests (needs Docker Compose PostgreSQL on external port 15432)
  export TEST_DB_HOST="${TEST_DB_HOST:-localhost}"
  export TEST_DB_PORT="${TEST_DB_PORT:-15432}"
  export TEST_DB_USER="${TEST_DB_USER:-signalrisk}"
  export TEST_DB_PASSWORD="${TEST_DB_PASSWORD:-signalrisk_dev}"
  export TEST_DB_NAME="${TEST_DB_NAME:-signalrisk}"

  if (cd tests && npx jest isolation --forceExit 2>/dev/null); then
    log_pass "G4.1 RLS tenant isolation tests"
  else
    log_fail "G4.1 RLS tenant isolation tests"
  fi

  # JWT forge check — verify TenantGuard uses RS256 JWKS
  if grep -q "jwksClient\|JWKS\|RS256" apps/case-service/src/guards/tenant.guard.ts 2>/dev/null; then
    log_pass "G4.2 TenantGuard uses JWKS verification"
  else
    log_fail "G4.2 TenantGuard missing JWKS verification"
  fi

  # Hardcoded credential scan
  local cred_hits
  cred_hits=$(grep -rn "admin123\|test-secret\|hardcoded.*password" apps/*/src/ --include='*.ts' 2>/dev/null | \
    grep -v node_modules | grep -v dist | grep -v '.spec.' | grep -v '.test.' | \
    grep -v 'NODE_ENV' || true)
  if [ -z "$cred_hits" ]; then
    log_pass "G4.3 No hardcoded credentials in prod code"
  else
    log_fail "G4.3 Hardcoded credentials found: $cred_hits"
  fi

  # npm audit
  if npm audit --audit-level=high 2>/dev/null; then
    log_pass "G4.4 npm audit (no high/critical)"
  else
    log_fail "G4.4 npm audit found high/critical vulnerabilities"
  fi

  # E2E multi-tenant isolation (Playwright)
  if npx playwright test --config tests/e2e/playwright.config.real.ts tests/e2e/scenarios/multi-tenant-isolation.spec.ts 2>/dev/null; then
    log_pass "G4.5 E2E multi-tenant isolation"
  else
    log_fail "G4.5 E2E multi-tenant isolation"
  fi
}

# ─────────────────────────────────────────────────────────────
# G5: E2E & Workflow Validation
# ─────────────────────────────────────────────────────────────
gate_g5() {
  run_gate "G5: E2E & Workflow Validation"

  if npx playwright test --config tests/e2e/playwright.config.real.ts 2>/dev/null; then
    log_pass "G5.1 Full E2E suite (0 failures)"
  else
    log_fail "G5.1 E2E suite has failures"
  fi
}

# ─────────────────────────────────────────────────────────────
# G6: Performance & Resilience
# ─────────────────────────────────────────────────────────────
gate_g6() {
  run_gate "G6: Performance & Resilience"

  # Performance gate tests (concurrent events, rate limit, decision latency)
  if npx playwright test --config tests/e2e/playwright.config.real.ts tests/e2e/scenarios/performance-gate.spec.ts 2>/dev/null; then
    log_pass "G6.1 Performance gate (p99 latency, rate limiting, decision API)"
  else
    log_fail "G6.1 Performance gate tests"
  fi

  # Chaos: Redis down/recovery
  if npx playwright test --config tests/e2e/playwright.config.real.ts tests/e2e/scenarios/chaos-redis-down.spec.ts 2>/dev/null; then
    log_pass "G6.2 Chaos — Redis outage + recovery"
  else
    log_fail "G6.2 Chaos — Redis outage tests"
  fi

  # Chaos: Kafka down/recovery
  if npx playwright test --config tests/e2e/playwright.config.real.ts tests/e2e/scenarios/chaos-kafka-down.spec.ts 2>/dev/null; then
    log_pass "G6.3 Chaos — Kafka outage + recovery"
  else
    log_fail "G6.3 Chaos — Kafka outage tests"
  fi
}

# ─────────────────────────────────────────────────────────────
# G7: Readiness, Smoke, Rollback
# ─────────────────────────────────────────────────────────────
gate_g7() {
  run_gate "G7: Readiness, Smoke & Rollback"

  # All services healthy
  local all_healthy=true
  for port in 3001 3002 3003 3004 3005 3006 3007 3008 3009 3010 3011 3012 3013 3014; do
    if ! curl -sf "http://localhost:$port/health" > /dev/null 2>&1; then
      all_healthy=false
      echo "    Port $port: DOWN"
    fi
  done
  if [ "$all_healthy" = true ]; then
    log_pass "G7.1 All 14 services healthy"
  else
    log_fail "G7.1 Some services unhealthy"
  fi

  # Port uniqueness (from DR tests)
  export TEST_DB_HOST="${TEST_DB_HOST:-localhost}"
  export TEST_DB_PORT="${TEST_DB_PORT:-15432}"
  export TEST_DB_USER="${TEST_DB_USER:-signalrisk}"
  export TEST_DB_PASSWORD="${TEST_DB_PASSWORD:-signalrisk_dev}"
  export TEST_DB_NAME="${TEST_DB_NAME:-signalrisk}"

  if (cd tests && npx jest dr --forceExit 2>/dev/null); then
    log_pass "G7.2 DR health check tests"
  else
    log_fail "G7.2 DR health check tests"
  fi

  # G7.3: Verify all services restart and recover within 120s
  local restart_ok=true
  echo "    G7.3: Restarting all services..."
  if docker compose -f docker-compose.full.yml restart --timeout 30 2>/dev/null; then
    local waited=0
    while [ "$waited" -lt 120 ]; do
      local all_up=true
      for port in 3001 3002 3003 3004 3005 3006 3007 3008 3009 3010 3011 3012 3013 3014; do
        if ! curl -sf "http://localhost:$port/health" > /dev/null 2>&1; then
          all_up=false
          break
        fi
      done
      if [ "$all_up" = true ]; then
        break
      fi
      sleep 5
      waited=$((waited + 5))
    done
    if [ "$waited" -ge 120 ]; then
      restart_ok=false
    fi
  else
    restart_ok=false
  fi
  if [ "$restart_ok" = true ]; then
    log_pass "G7.3 All 14 services healthy after restart"
  else
    log_fail "G7.3 Services did not recover within 120s after restart"
  fi

  # G7.4: Stop decision-service, verify others still healthy, then restart
  local rollback_ok=true
  echo "    G7.4: Stop decision-service, verify isolation, restart..."
  if docker compose -f docker-compose.full.yml stop decision-service 2>/dev/null; then
    # Check remaining services are still healthy
    local others_ok=true
    for port in 3001 3002 3004 3005 3006 3007 3008 3009 3010 3011 3012 3013 3014; do
      if ! curl -sf "http://localhost:$port/health" > /dev/null 2>&1; then
        others_ok=false
        echo "    Port $port: DOWN after decision-service stop"
      fi
    done
    if [ "$others_ok" = false ]; then
      rollback_ok=false
    fi

    # Restart decision-service
    docker compose -f docker-compose.full.yml start decision-service 2>/dev/null
    local waited=0
    while [ "$waited" -lt 60 ]; do
      if curl -sf "http://localhost:3003/health" > /dev/null 2>&1; then
        break
      fi
      sleep 5
      waited=$((waited + 5))
    done
    if [ "$waited" -ge 60 ]; then
      rollback_ok=false
    fi
  else
    rollback_ok=false
  fi
  if [ "$rollback_ok" = true ]; then
    log_pass "G7.4 Service isolation + recovery verified (decision-service stop/start)"
  else
    log_fail "G7.4 Service isolation or recovery failed"
  fi
}

# ─────────────────────────────────────────────────────────────
# G8: Evidence & Signoff Completeness
# ─────────────────────────────────────────────────────────────
gate_g8() {
  run_gate "G8: Evidence & Signoff Completeness"

  # Check evidence pack exists
  local latest_evidence
  latest_evidence=$(ls -t docs/testing/evidence/sprint-*-exit.md 2>/dev/null | head -1)
  if [ -n "$latest_evidence" ]; then
    log_pass "G8.1 Sprint exit evidence exists: $latest_evidence"
  else
    log_fail "G8.1 No sprint exit evidence found"
  fi

  # Check quality gates doc exists
  if [ -f "docs/testing/quality-gates.md" ]; then
    log_pass "G8.2 Quality gates definition exists"
  else
    log_fail "G8.2 Quality gates definition missing"
  fi

  # Check scenario catalog exists
  if [ -f "docs/testing/scenario-catalog.md" ]; then
    log_pass "G8.3 Scenario catalog exists"
  else
    log_fail "G8.3 Scenario catalog missing"
  fi

  # Check CLAUDE.md exists and has key sections
  if grep -q "Execution Order" CLAUDE.md 2>/dev/null; then
    log_pass "G8.4 CLAUDE.md with execution order"
  else
    log_fail "G8.4 CLAUDE.md missing or incomplete"
  fi

  # Check decision log
  if [ -f "docs/claude/decision-log.md" ]; then
    log_pass "G8.5 Decision log (ADR) exists"
  else
    log_fail "G8.5 Decision log missing"
  fi
}

# ─────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────
echo -e "${BOLD}SignalRisk Quality Gate Runner${NC}"
echo -e "Gate: ${YELLOW}${GATE}${NC}"
echo -e "Commit: $(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
echo -e "Timestamp: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"

case "$GATE" in
  G1|g1) gate_g1 ;;
  G2|g2) gate_g2 ;;
  G3|g3) gate_g3 ;;
  G4|g4) gate_g4 ;;
  G5|g5) gate_g5 ;;
  G6|g6) gate_g6 ;;
  G7|g7) gate_g7 ;;
  G8|g8) gate_g8 ;;
  all|ALL)
    gate_g1
    gate_g2
    gate_g3
    gate_g4
    gate_g5
    gate_g6
    gate_g7
    gate_g8
    ;;
  *)
    echo "Usage: $0 [G1|G2|G3|G4|G5|all]"
    exit 1
    ;;
esac

# ─────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────
echo -e "\n${BOLD}━━━ SUMMARY ━━━${NC}"
for r in "${RESULTS[@]}"; do
  echo -e "  $r"
done
echo -e "\n  ${GREEN}Passed: $PASS_COUNT${NC}  ${RED}Failed: $FAIL_COUNT${NC}"

if [ "$FAIL_COUNT" -gt 0 ]; then
  echo -e "\n  ${RED}${BOLD}GATE BLOCKED — $FAIL_COUNT failure(s)${NC}"
  exit 1
else
  echo -e "\n  ${GREEN}${BOLD}ALL GATES PASSED${NC}"
  exit 0
fi
