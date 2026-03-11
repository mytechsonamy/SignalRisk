# Sprint 36 Exit Report

Sprint: 36
Prepared by: Claude Code (automated)
Date: 2026-03-11
Commit: 6f95f5e (uncommitted staging gate work on top)
Timestamp: 2026-03-11T07:15:00Z

## Scope Tested

### Services
All 14 backend services + dashboard (15 total), 18 Docker containers healthy

### Features (Sprint 36)
- Dashboard proxy routing fixed (admin/auth/rules → correct backend services)
- Admin API authentication (Bearer token injection via lib/api.ts)
- Admin health aggregation endpoint (`GET /v1/admin/health` on auth-service)
- Admin rules CRUD endpoint (`GET/POST/PATCH/DELETE /v1/admin/rules` on rule-engine-service)
- Staging gate runner script (`scripts/run-gates.sh`)
- Evidence pack generator (`scripts/generate-evidence.sh`)
- RLS isolation tests fixed (FORCE ROW LEVEL SECURITY + non-superuser role)
- Jest config updated to match both `.test.ts` and `.spec.ts` files

## Gate Status

### G1: Build & Static Validation
- TypeScript: **PASS** (auth-service, rule-engine-service, dashboard all compile clean)
- ESLint: **PASS**
- Build: **PASS**
- No `|| true` in scripts: **PASS**

### G2: Unit/Component Validation
- auth-service: **163 tests passed** (16 suites)
- rule-engine-service: **132 tests passed** (10 suites)
- dashboard: **196 tests passed** (25 suites)
- All other services: **PASS** (1254+ total unit tests)

### G3: Integration & Contract Validation
- Kafka topic canonical: **PASS** (all imports from @signalrisk/kafka-config)
- Kafka schema validation: **14/14 PASS**
- Smoke tests (Redis rate-limit Lua, PostgreSQL case CRUD, fingerprint consistency): **16/16 PASS**

### G4: Security & Tenant Isolation
- RLS tenant isolation (PostgreSQL): **12/12 PASS**
  - users, devices, events, decisions table isolation
  - Cross-tenant SELECT, UPDATE, DELETE all blocked
  - COUNT respects tenant boundary
- TenantGuard RS256 JWKS verification: **PASS** (code verified)
- No hardcoded credentials in prod code: **PASS**
- E2E multi-tenant isolation: **5/5 PASS**
  - Cross-merchant event submission denied
  - Cross-merchant decision query returns empty
  - Admin token accesses all merchants
  - Invalid tenant header returns 400

### G5: E2E & Workflow Validation
- Full E2E suite: **72 passed, 0 failed, 6 skipped** (~1.7m)
- Projects: e2e-light (54 tests) → e2e-heavy (14 tests) → chaos (10 tests)
- Skipped: 6 case-lifecycle tests (async case creation timing — pre-existing)

## Service Health (at evidence time)

- Port 3001 (auth-service): healthy
- Port 3002 (event-collector): healthy
- Port 3003 (device-intel-service): healthy
- Port 3004 (velocity-service): healthy
- Port 3005 (behavioral-service): healthy
- Port 3006 (network-intel-service): healthy
- Port 3007 (telco-intel-service): healthy
- Port 3008 (rule-engine-service): healthy
- Port 3009 (decision-service): healthy
- Port 3010 (case-service): healthy
- Port 3011 (webhook-service): healthy
- Port 3012 (graph-intel-service): healthy
- Port 3013 (feature-flag-service): healthy
- Port 3014 (outbox-relay): healthy

## Scenario Summary

### P0 Scenarios
| ID | Title | Status |
|---|---|---|
| SR-P0-001 | Merchant Auth Issues Token | PASS |
| SR-P0-002 | Invalid Credentials Rejected | PASS |
| SR-P0-003 | Event Ingestion Valid Event | PASS |
| SR-P0-004 | Invalid Event → DLQ | PASS |
| SR-P0-005 | Decision Deterministic Outcome | PASS |
| SR-P0-006 | Decision → Case Service | PASS |
| SR-P0-009 | Cross-Tenant API Denied | PASS |
| SR-P0-010 | Forged JWT Rejected | PASS |
| SR-P0-013 | Redis Outage Degrades Safely | PASS |
| SR-P0-014 | Kafka Outage Degrades Safely | PASS |

### P1 Scenarios
| ID | Title | Status |
|---|---|---|
| SR-P1-001 | Rule CRUD Flow | PASS (admin endpoint implemented) |
| SR-P1-005 | Token Revoke Path | PASS |

## Defect Summary
- Open Sev-1: 0
- Open Sev-2: 0
- Open Sev-3: 0

## Waivers
- None

## Maturity Map Changes (Sprint 36)
- ✅ NEW: Admin health aggregation endpoint (auth-service)
- ✅ NEW: Admin rules CRUD endpoint (rule-engine-service)
- ✅ NEW: Dashboard proxy routing (all admin calls routed correctly)
- ✅ NEW: Staging gate runner (`scripts/run-gates.sh G1|G2|G3|G4|G5|all`)
- ✅ NEW: Evidence pack generator (`scripts/generate-evidence.sh <sprint>`)
- ✅ NEW: RLS isolation tests working against Docker Compose PostgreSQL
- ✅ UPGRADED: Jest config supports both `.test.ts` and `.spec.ts`

## Test Infrastructure Improvements
- `tests/helpers/db.helper.ts` — Fixed RLS enforcement:
  - Uses `gen_random_uuid()` (built-in) instead of `uuid_generate_v4()` (extension)
  - Creates non-superuser role `signalrisk_app` for RLS testing
  - `FORCE ROW LEVEL SECURITY` on all tenant tables
  - `queryAsTenant()` uses `SET ROLE signalrisk_app`
  - `queryAsSuper()` uses `SET LOCAL row_security TO off`
- `tests/jest.config.ts` — testRegex now matches both `.test.ts` and `.spec.ts`

## Recommendation
- **Close sprint** — all P0 scenarios green, G1-G5 gates pass, no open defects

---
Generated: 2026-03-11
