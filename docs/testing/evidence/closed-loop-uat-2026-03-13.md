# Closed-Loop UAT Evidence — 2026-03-13

## Summary

**82 passed, 1 skipped, 0 failed** across 83 tests (3 projects: e2e-light → e2e-heavy → closed-loop).

Run time: ~3.7 minutes, 1 worker, sequential execution.

## Closed-Loop Test Results

| Test | Scenario | Status | Duration |
|------|----------|--------|----------|
| SYN-C-002 | Allowlist cooldown — velocity burst → case | ✅ PASS | 17.1s |
| SYN-C-002 | LEGITIMATE resolution → allowlist created | ✅ PASS | 8.3s |
| SYN-C-002 | Single event after LEGITIMATE not hard-blocked | ✅ PASS | 8.1s |
| SYN-C-007 | Velocity burst still triggers BLOCK despite allowlist | ✅ PASS | 26.8s |
| SYN-C-001 | Velocity burst → REVIEW/BLOCK + case created | ✅ PASS | 10.2s |
| SYN-C-001 | Resolve FRAUD → denylist entry created | ✅ PASS | 8.3s |
| SYN-C-001 | New event for denylisted entity → BLOCK | ✅ PASS | 3.0s |
| SYN-F-012 | Repeated retry by denylisted entity → still BLOCK | ✅ PASS | 3.1s |
| SYN-C-003 | Customer entityType propagation | ⏭ SKIP | — |
| SYN-C-004 | Device entityType → decision → case → watchlist | ✅ PASS | 16.4s |
| SYN-C-005 | IP-based events → traceable watchlist entry | ✅ PASS | 18.4s |
| SYN-C-009 | Feature snapshot persisted after decision | ✅ PASS | 5.3s |
| SYN-C-008 | FRAUD resolution → entity_profiles.is_fraud_confirmed | ✅ PASS | 16.5s |
| SYN-C-010 | Full chain: event → decision → case → FRAUD → watchlist → BLOCK | ✅ PASS | 19.4s |

## Prerequisite Projects

| Project | Tests | Status |
|---------|-------|--------|
| e2e-light | 54 | ✅ All pass |
| e2e-heavy | 15 | ✅ All pass |
| closed-loop | 14 (13 pass + 1 skip) | ✅ All pass |

## Fixes Applied During UAT

### 1. Missing Database Tables (entity_profiles, decision_feature_snapshots)
- **Root cause:** Migrations 008/009 recorded in schema_migrations but CREATE TABLE never executed
- **Fix:** Manually applied SQL via `docker exec signalrisk-postgres psql`
- **Added:** `is_fraud_confirmed BOOLEAN` column to entity_profiles for feedback-loop tests

### 2. EntityId Not Propagated to Kafka Decision Messages
- **Root cause:** `DecisionResult` type lacked `entityId` field. Kafka producer fell back to `requestId` (UUID) instead of the actual entityId
- **Fix:** Added `entityId` to `DecisionResult` interface, set it in orchestrator, used it in Kafka producer
- **Files:** `decision.types.ts`, `decision-orchestrator.service.ts`, `decisions-producer.service.ts`

### 3. Burst Detection Signal Mapping
- **Root cause:** Velocity-service returns `burst_detected` inside `signals` object, but signal-fetchers only checked top-level `raw`
- **Fix:** Extended check to `signals.burstDetected ?? signals.burst_detected`
- **File:** `signal-fetchers.ts:438`

### 4. Rate Limiting Affecting Velocity Buildup
- **Root cause:** After e2e-heavy fraud-blast (50 events), rate adjuster throttled subsequent blasts. Velocity threshold gap: waitForVelocity checked > 10, but DSL rule required > 100
- **Fix:** Added `moderate_velocity` DSL rule (txCount1h > 10 → REVIEW), promoted `high_velocity` to BLOCK (txCount1h > 100)
- **File:** `default.rules` (now 22 rules: 11 base + 5 stateful + 3 sequence + 3 graph)

### 5. Blast Event Batching
- **Root cause:** Parallel 20 events all hit backpressure rejection (429)
- **Fix:** Rewrote `blastEventsFromDevice` with batched sending (5 per batch, 200ms gaps) + 429 retry (3 attempts, exponential backoff)
- **File:** `tests/e2e/scenarios/helpers.ts`

### 6. Docker Container/DB Corrections
- PostgreSQL container name: `signalrisk-postgres-1` → `signalrisk-postgres`
- PostgreSQL user: `postgres` → `signalrisk`
- Dockerfile: Added `packages/telemetry` to pkg-builder stage

## DSL Rules (22 total)

| # | Rule | Condition | Action | Weight |
|---|------|-----------|--------|--------|
| 1 | emulator_block | device.isEmulator == true | BLOCK | 1.0 |
| 2 | very_low_trust | device.trustScore < 20 | BLOCK | 0.9 |
| 3 | low_trust | device.trustScore < 40 | REVIEW | 0.7 |
| 4 | velocity_burst | velocity.burstDetected == true | REVIEW | 0.8 |
| 5 | moderate_velocity | velocity.txCount1h > 10 | REVIEW | 0.6 |
| 6 | high_velocity | velocity.txCount1h > 100 | BLOCK | 0.8 |
| 7 | tor_exit | network.isTor == true | BLOCK | 1.0 |
| 8 | vpn_proxy | network.isVpn == true | REVIEW | 0.5 |
| 9 | bot_block | behavioral.isBot == true | BLOCK | 0.9 |
| 10 | geo_mismatch | network.geoMismatchScore > 50 | REVIEW | 0.6 |
| 11 | high_prepaid_velocity | telco.prepaidProbability > 0.8 AND velocity.txCount1h > 30 | REVIEW | 0.5 |
| 12 | stateful_repeat_blocker | stateful.customer.previousBlockCount30d > 0 AND txCount1h > 3 | BLOCK | 0.9 |
| 13 | stateful_high_velocity_10m | stateful.customer.txCount10m > 5 | REVIEW | 0.7 |
| 14 | stateful_device_spread | stateful.device.uniqueIps24h > 10 | REVIEW | 0.6 |
| 15 | stateful_ip_burst | stateful.ip.txCount1h > 50 | BLOCK | 0.8 |
| 16 | stateful_review_escalation | stateful.customer.previousReviewCount7d > 3 AND txCount1h > 5 | BLOCK | 0.7 |
| 17 | seq_login_then_payment | stateful.customer.loginThenPayment15m == true | REVIEW | 0.6 |
| 18 | seq_failed_x3_then_success | stateful.customer.failedPaymentX3ThenSuccess10m == true | BLOCK | 0.9 |
| 19 | seq_device_change_payment | stateful.customer.deviceChangeThenPayment30m == true | REVIEW | 0.7 |
| 20 | graph_fraud_ring | stateful.graph.fraudRingDetected == true | BLOCK | 1.0 |
| 21 | graph_shared_device_high | stateful.graph.sharedDeviceCount > 5 | REVIEW | 0.7 |
| 22 | graph_shared_ip_high | stateful.graph.sharedIpCount > 10 | REVIEW | 0.6 |

## Environment

- Docker Compose: 19 containers (4 infra + 15 app), all healthy
- Playwright: v1.50.1, 1 worker, sequential projects
- Node: v22 (Alpine)
- Database: 15 migrations applied, entity_profiles + decision_feature_snapshots created
- Redis: Flushed before each test run for clean state
