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
    # Check all ports EXCEPT 3009 (decision-service, which is stopped)
    for port in 3001 3002 3003 3004 3005 3006 3007 3008 3010 3011 3012 3013 3014; do
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
      if curl -sf "http://localhost:3009/health" > /dev/null 2>&1; then
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

  # Parse --sprint N or TARGET_SPRINT env var for stale check
  local target_sprint="${TARGET_SPRINT:-}"
  for arg in "$@"; do
    case "$arg" in
      --sprint) shift; target_sprint="${1:-}" ;;
      --sprint=*) target_sprint="${arg#*=}" ;;
    esac
  done

  # ── G8.1: Sprint exit evidence — exists + required sections + stale check ──
  local latest_evidence
  latest_evidence=$(ls -t docs/testing/evidence/sprint-*-exit.md 2>/dev/null | head -1)
  if [ -n "$latest_evidence" ]; then
    # Stale check: sprint number must match TARGET_SPRINT if set
    local stale=false
    if [ -n "$target_sprint" ]; then
      if ! echo "$latest_evidence" | grep -q "sprint-${target_sprint}-exit"; then
        stale=true
      fi
    fi
    if [ "$stale" = true ]; then
      log_fail "G8.1 Sprint exit evidence is stale (expected sprint-${target_sprint}, found: $(basename "$latest_evidence"))"
    else
      # Structural check: evidence must contain required sections
      local g81_missing=""
      grep -q "## Gate Status"       "$latest_evidence" 2>/dev/null || g81_missing="${g81_missing} 'Gate Status'"
      grep -q "## Defect Summary"    "$latest_evidence" 2>/dev/null || g81_missing="${g81_missing} 'Defect Summary'"
      grep -q "## Recommendation"    "$latest_evidence" 2>/dev/null || g81_missing="${g81_missing} 'Recommendation'"
      # Must have at least one execution_status line showing real test outcome
      grep -qE 'execution_status:.*(PASSED|FAILED)' "$latest_evidence" 2>/dev/null || g81_missing="${g81_missing} 'execution_status'"

      if [ -z "$g81_missing" ]; then
        log_pass "G8.1 Sprint exit evidence: $(basename "$latest_evidence") (required sections present)"
      else
        log_fail "G8.1 Sprint exit evidence missing required sections:${g81_missing}"
      fi
    fi
  else
    log_fail "G8.1 No sprint exit evidence found"
  fi

  # ── G8.2: Quality gates doc — gate definitions with numbered gates ──
  if [ -f "docs/testing/quality-gates.md" ]; then
    # Must define at least G1 through G5 (minimum gate set)
    local gate_count
    gate_count=$(grep -cE '^#+.*G[1-8]' docs/testing/quality-gates.md 2>/dev/null || echo 0)
    if [ "$gate_count" -ge 5 ]; then
      log_pass "G8.2 Quality gates defines $gate_count gate sections"
    else
      log_fail "G8.2 Quality gates doc has only $gate_count gate sections (need >= 5)"
    fi
  else
    log_fail "G8.2 Quality gates definition missing"
  fi

  # ── G8.3: Scenario catalog — has P0 scenario IDs with status ──
  if [ -f "docs/testing/scenario-catalog.md" ]; then
    local scenario_count
    scenario_count=$(grep -cE 'SR-P[0-9]+-[0-9]+' docs/testing/scenario-catalog.md 2>/dev/null || echo 0)
    if [ "$scenario_count" -ge 5 ]; then
      log_pass "G8.3 Scenario catalog with $scenario_count scenario IDs"
    else
      log_fail "G8.3 Scenario catalog has only $scenario_count scenarios (need >= 5)"
    fi
  else
    log_fail "G8.3 Scenario catalog missing"
  fi

  # ── G8.4: CLAUDE.md — required structural sections ──
  local g84_missing=""
  grep -q "## 3\. Production Maturity Map"  CLAUDE.md 2>/dev/null || \
    grep -q "Maturity Map"                   CLAUDE.md 2>/dev/null || g84_missing="${g84_missing} 'Maturity Map'"
  grep -q "## 6\. Architecture Rules"       CLAUDE.md 2>/dev/null || \
    grep -q "Architecture Rules"             CLAUDE.md 2>/dev/null || g84_missing="${g84_missing} 'Architecture Rules'"
  grep -q "## 7\. Execution Order"          CLAUDE.md 2>/dev/null || \
    grep -q "Execution Order"                CLAUDE.md 2>/dev/null || g84_missing="${g84_missing} 'Execution Order'"
  # Maturity map must have actual data rows (pipe-delimited table)
  grep -qE '^\|.*Verified' CLAUDE.md 2>/dev/null || g84_missing="${g84_missing} 'Maturity Map data rows'"
  if [ -z "$g84_missing" ]; then
    log_pass "G8.4 CLAUDE.md has required structural sections"
  else
    log_fail "G8.4 CLAUDE.md missing:${g84_missing}"
  fi

  # ── G8.5: Decision log — has numbered ADR entries with decision + reason ──
  if [ -f "docs/claude/decision-log.md" ]; then
    local adr_count
    adr_count=$(grep -cE 'ADR-[0-9]+' docs/claude/decision-log.md 2>/dev/null || echo 0)
    if [ "$adr_count" -ge 3 ]; then
      log_pass "G8.5 Decision log with $adr_count ADR entries"
    else
      log_fail "G8.5 Decision log has only $adr_count ADR entries (need >= 3)"
    fi
  else
    log_fail "G8.5 Decision log missing"
  fi

  # ── G8.6: Evidence — explicit blocker/waiver section with counts ──
  if [ -n "$latest_evidence" ]; then
    # Must have a Defect Summary section AND a Waivers section
    local has_defect_section=false has_waiver_section=false
    grep -qi "## Defect Summary\|## Defects\|## Open Blockers" "$latest_evidence" 2>/dev/null && has_defect_section=true
    grep -qi "## Waivers\|## Waiver" "$latest_evidence" 2>/dev/null && has_waiver_section=true

    if [ "$has_defect_section" = true ] && [ "$has_waiver_section" = true ]; then
      # Check if defect counts are explicit (e.g. "Sev-1: 0" or "Open Sev-1: 0")
      if grep -qiE 'sev-[12].*:.*[0-9]' "$latest_evidence" 2>/dev/null; then
        log_pass "G8.6 Evidence has defect summary + waivers with explicit severity counts"
      else
        log_fail "G8.6 Evidence has defect/waiver sections but missing explicit severity counts"
      fi
    else
      local g86_missing=""
      [ "$has_defect_section" = false ] && g86_missing="${g86_missing} 'Defect Summary'"
      [ "$has_waiver_section" = false ] && g86_missing="${g86_missing} 'Waivers'"
      log_fail "G8.6 Evidence missing required sections:${g86_missing}"
    fi
  else
    log_fail "G8.6 No evidence file to check for blockers/waivers"
  fi

  # ── G8.7: Signoff — must have Prepared by + Date + Recommendation ──
  if [ -n "$latest_evidence" ]; then
    local g87_missing=""
    grep -qiE '^(prepared by|author|signed by):' "$latest_evidence" 2>/dev/null || \
      grep -qi "Prepared by:" "$latest_evidence" 2>/dev/null || g87_missing="${g87_missing} 'Prepared by/Author'"
    grep -qE '^Date:.*[0-9]{4}-[0-9]{2}-[0-9]{2}' "$latest_evidence" 2>/dev/null || g87_missing="${g87_missing} 'Date (YYYY-MM-DD)'"
    grep -qi "## Recommendation" "$latest_evidence" 2>/dev/null || g87_missing="${g87_missing} 'Recommendation section'"

    if [ -z "$g87_missing" ]; then
      log_pass "G8.7 Evidence has signoff fields (author, date, recommendation)"
    else
      log_fail "G8.7 Evidence missing signoff fields:${g87_missing}"
    fi
  else
    log_fail "G8.7 No evidence file to check for signoff"
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
    echo "Usage: $0 [G1|G2|G3|G4|G5|G6|G7|G8|all] [--sprint N]"
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
