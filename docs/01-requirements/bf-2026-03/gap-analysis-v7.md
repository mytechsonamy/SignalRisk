# SignalRisk v2 — Brownfield Gap Analysis Requirements (Revision 7)
# STATUS: APPROVED (AI Consensus — ChatGPT + Gemini, iteration 8)

## Document Scope
This document specifies requirements for **backend service improvements and dashboard wiring** only — improvements to the existing SignalRisk codebase (Sprint 1-9 output). Frontend UX behaviors triggered by HTTP error responses (401, 403, 503) are **standard HTTP error handling** and are outside this document's scope. Refer to the frontend implementation guide for UX error states.

**Existing Codebase:** `/Users/musti/Documents/Projects/signalrisk`
**Stack:** NestJS, TypeScript, React, PostgreSQL (RLS), Redis, Kafka, Neo4j
**Existing tests:** ~840 across 14 services

---

## Backward Compatibility

| Constraint | Rule |
|-----------|------|
| BC-001 No breaking API changes | New response fields are optional; existing consumers work unchanged |
| BC-002 Independent deployability | Per-feature env var toggles with explicit defaults: `ENABLE_JTI_DENYLIST` (default: `true` in staging/prod, `false` in local dev), `ENABLE_VPN_DETECTION` (default: `true` in staging/prod, `false` in local dev), `ENABLE_API_KEY_VALIDATION` (default: `true` in staging/prod, `false` in local dev). Separate toggles ensure a bug in one feature does not block rollback of others. Toggle state is logged at application startup. |
| BC-003 One-commit rollback | Every change is revertable with a single `git revert` |
| BC-004 Green test suite gate | All ~840 existing tests must pass in CI (`pnpm test` exit 0); new tests are additive; flaky tests tagged `@flaky` excluded from gate; flaky test count capped at 5 (any beyond must be fixed before merge) |

---

## P0 — Security

### P0.1 — API Key Validation [IMPLEMENTED]
- `ApiKeyService` validates `sk_test_[0-9a-f]{32}` format + `ALLOWED_API_KEYS` env var lookup
- SHA-256 hash, timing-safe compare, prefix-indexed Map
- Dev mode (no env var): format-valid keys accepted with warning logged
- `ALLOWED_API_KEYS` value is never logged — only the count is

**Production path (out of scope):** Vault/AWS Secrets Manager injection replaces env var.

**AC:**
- AC1: Invalid format → HTTP 401
- AC2: Unknown key (format valid, key not in store) → HTTP 401
- AC3: Timing-safe comparison — no early exit path in hash comparison
- AC4: No secret value appears in application logs (only key count logged)

### P0.2 — AdminGuard JWT Verification + Replay Protection [THIS CYCLE]
**RS256 verify + role check:** IMPLEMENTED.

**jti Replay Protection:**

**Storage — Redis (durable, shared):**
- Redis key: `jwt:revoked:{jti}` with TTL = token remaining validity (`exp - now`)
- Redis is a shared, persistent store that survives application restarts and deployments
- All service instances share the same Redis, so revocation is cluster-wide and consistent
- Set on explicit logout (`POST /v1/auth/logout`) and on admin token revocation
- `AdminGuard.canActivate()` checks Redis for `jti`; presence = HTTP 401

**Failure mode — FAIL-CLOSED:**
- Redis unavailable → return HTTP **503** with body `{"error":"auth_unavailable","message":"Authentication service temporarily unavailable. Retry shortly."}`
- Log at `CRITICAL` level: `jti denylist unreachable — blocking admin access`
- **Out-of-scope note:** How the admin frontend surfaces 503 to the operator is a frontend implementation concern outside this document.

**AC:**
- AC1: Expired token → HTTP 401
- AC2: `role !== 'admin'` → HTTP 401
- AC3: Tampered RS256 signature → HTTP 401
- AC4: Valid revoked `jti` in Redis denylist → HTTP 401
- AC5: Redis unavailable → HTTP 503 with body containing `auth_unavailable`; CRITICAL log emitted
- AC6: Unit test covers paths AC1 through AC5 (5 test cases total)

### P0.3 — Refresh Token Role Lookup [IMPLEMENTED]
- `merchantsService.findById(stored.userId)` → role resolution
- **Role precedence (deterministic):** `admin > analyst > merchant`; take highest-privilege role from `merchant.roles[]` array
- **Deleted user:** If `findById()` returns `null`, throw `UnauthorizedException('Account not found')` → HTTP 401. No role fallback.

**AC:**
- AC1: Admin merchant refreshes with `role: 'admin'`
- AC2: Deleted user (`findById` returns null) → HTTP 401 `Account not found`
- AC3: User with `roles: ['merchant']` → refreshes with `role: 'merchant'`

---

## P1 — Dashboard Live Data

### P1.1 — KPI Metrics [IMPLEMENTED]
- `fetchKpiStats()` → `/v1/analytics/kpi`, stale-data fallback on error

**Polling behavior:**
- Sequential polling: next poll starts **30 seconds after the previous poll completes** (`setTimeout` in `finally` block, not `setInterval`)
- On browser tab becoming visible (`visibilitychange` event, `document.visibilityState === 'visible'`): trigger immediate poll if last completed poll was >30s ago

**Stale data UX:**
- KPI cards display `lastUpdated` timestamp below metric values
- Stale badge appears **immediately when a poll fails** (same-tick `catch` block state update):
  - Network/offline failure: amber badge "Offline — last updated Xm ago"
  - Server error (5xx): amber badge "Stale — last updated Xm ago"
- Badge clears when the next successful poll completes

**AC:**
- AC1: KPI fetched on mount
- AC2: Timer cleared on unmount (no memory leak)
- AC3: Stale badge appears immediately on failed poll; clears on next success
- AC4: Tab-focus triggers immediate poll if data is stale >30s (component test with `visibilitychange` mock)

### P1.2 — Trend Chart [IMPLEMENTED]
- `fetchMinuteTrend()` → `/v1/analytics/minute-trend`

### P1.3 — Labeling Stats [IMPLEMENTED]
- `fetchLabelingStats()` → `/v1/cases/stats`

---

## P2 — Missing Features [ALL IMPLEMENTED]

### P2.1 — Rules Page
- `RulesTab` + `fetchRules()` on mount

### P2.2 — Evidence Timeline
- `EvidenceItem[]` type; renders ordered list; empty → "No evidence recorded"

### P2.3 — Settings Form
- Editable inputs; `localStorage` save; "Saved" confirmation for 2s
- localStorage errors → "Settings could not be saved"

### P2.4 — Case Search Filter
- Case-insensitive partial match on `entityId`, `merchantId`, `id`
- **Request handling:** `AbortController` cancels in-flight search on new input (prevents out-of-order results)
- Whitespace-only input → no API call, no "Searching…", full list shown
- 300ms debounce; "Searching…" only for active in-flight requests
- Empty results → "No cases match your search"
- Search change or clear → reset to page 1

**AC:**
- AC1: Partial case-insensitive match works
- AC2: Whitespace-only → full list, no API call, no loading indicator
- AC3: Empty results message shown (not loading indicator)
- AC4: Old in-flight request cancelled before new one fires (AbortController)
- AC5: Clear search → full list at page 1

---

## P3 — Backend Stubs

### P3.1 — Velocity Merchant ID [IMPLEMENTED]
- `X-Merchant-ID` header → `merchantId`; fallback `'default'`

### P3.2 — DLQ Reprocess [IMPLEMENTED — with poison-pill safeguard]
- `DlqConsumerService` injects `KafkaService`; `reprocessEvent()` re-publishes to `signalrisk.events.raw`
- Headers: `dlq-retry-count` (= `retryCount + 1`), `dlq-original-topic`

**Exhaust path:**
`exhaustRetries()` does:
1. Publishes to **`signalrisk.events.dlq.exhausted`** Kafka topic (durable)
2. Appends to in-memory `exhaustedEventCache` (session-scoped, capped at 1000 FIFO)
3. Emits WARN log: event ID, original topic, final retry count

**AC:**
- AC1: `retryCount < maxRetries` → re-published to `signalrisk.events.raw`
- AC2: `retryCount >= maxRetries` → published to `signalrisk.events.dlq.exhausted`; `signalrisk.events.raw` NOT called
- AC3: Re-published event has `dlq-retry-count` = `retryCount + 1`
- AC4: Unit test: `sendBatch` called with `dlq.exhausted` topic at maxRetries; `events.raw` NOT called
- AC5: Invalid JSON → throws; caught by caller; counts as retry failure
- AC6: Exhausted events logged at WARN with event ID, original topic, retry count

### P3.3 — VPN Detection [IMPLEMENTED]
- `ProxyDetector.isVpnIp(asn)` — 11 VPN provider ASNs, in-process lookup against MaxMind GeoIP2
- Quarterly ASN review; future upgrade: MaxMind `is_anonymous_vpn` flag (out of scope)

**AC:** Known VPNs → true; residential/mobile → false; undefined → false; case-insensitive

---

## P4 — Test Coverage

### P4.1 — New Service Unit Tests
| Service | Required Test Cases |
|---------|---------------------|
| `ApiKeyService` | valid key, invalid format (5 variants), unknown prefix, wrong key, dev mode |
| `AdminGuard` | valid admin, non-admin role, expired, malformed header, revoked jti → 401, Redis down → 503 |
| `DlqConsumerService` | reprocessEvent called (<maxRetries), exhausted topic published (=maxRetries), raw NOT called, headers, invalid JSON, WARN log |
| `ProxyDetector.isVpnIp()` | ≥5 VPN ASNs, ≥5 non-VPN, undefined, case variants |
| Refresh token handler | deleted user → 401, admin → 'admin', merchant → 'merchant' |

### P4.2 — Dashboard Component Tests
| Component | Required Assertions |
|-----------|---------------------|
| `OverviewPage` | fetch on mount; timer cleared on unmount; stale badge on fail; badge clears on success; tab-focus triggers poll |
| `CaseDetailPanel` | timeline renders; "No evidence recorded" fallback |
| `RulesPage` | fetchRules on mount |
| `SettingsPage` | "Saved" on success; localStorage error → inline error |

### P4.3 — E2E Search Filter
- Filtered count < unfiltered count; matching entity ID visible
- "No cases match your search" for non-matching; whitespace → full list

---

## Graceful Degradation

| Dependency | Failure | Fallback |
|------------|---------|---------|
| `/v1/analytics/kpi` | Timeout/5xx | Preserve last KPI; amber stale badge; clears on recovery |
| Redis jti denylist | Unavailable | **Fail-closed: HTTP 503**; CRITICAL log |
| `KafkaService` (DLQ exhausted) | Error | Log WARN; append to in-memory cache; no crash |
| VPN ASN | `asn === undefined` | Return `false` |
| `localStorage` | Quota/private mode | Show "Settings could not be saved" |
| Refresh token user deleted | null from findById | Throw 401; no fallback role |

---

## NFRs

| NFR | Target |
|-----|--------|
| API key validation | < 1ms |
| JWT + jti check | < 10ms p99 |
| KPI polling | Sequential 30s after completion |
| Search debounce | 300ms |
| VPN false positive | < 5% on 50 IPs (30 residential, 10 mobile, 10 enterprise) |
| Test suite gate | 0 failures (non-flaky); flaky cap: 5 |
| Feature toggle state | Logged at startup |

---

## Out of Scope

**Frontend UX (standard HTTP error handling — frontend implementation concern):**
- Client-side handling of 401/503 responses
- KPI service worker / navigator.onLine detection
- Settings unsaved-change tracking

**Backend (future sprints):**
- Vault/Secrets Manager for API keys
- Refresh token DB persistence
- Outbox relay `FOR UPDATE SKIP LOCKED`
- MaxMind `is_anonymous_vpn` flag integration
- Persistent DLQ consumer for `signalrisk.events.dlq.exhausted`
- Settings backend API
- WebSocket upgrade for KPI dashboard
