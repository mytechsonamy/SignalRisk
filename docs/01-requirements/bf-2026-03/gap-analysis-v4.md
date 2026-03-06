# SignalRisk v2 — Brownfield Gap Analysis Requirements (Revision 4)

## Document Scope
This document covers **only** the brownfield gap analysis work for the SignalRisk codebase (Sprint 1-9 output). It does not restate the original v4 product requirements. All requirements here are improvements to existing working code.

**Existing Codebase:** `/Users/musti/Documents/Projects/signalrisk`
**Stack:** NestJS, TypeScript, React, PostgreSQL (RLS), Redis, Kafka, Neo4j
**Existing tests:** ~840 across 14 services

---

## Backward Compatibility

| Constraint | Rule |
|-----------|------|
| BC-001 No breaking API changes | New response fields are optional; existing consumers work unchanged |
| BC-002 Independent deployability | Each service fix has its **own** env var toggle: `ENABLE_JTI_DENYLIST`, `ENABLE_VPN_DETECTION`, `ENABLE_API_KEY_VALIDATION`. A bug in VPN detection does not block rollback of the jti security fix. |
| BC-003 One-commit rollback | Every change is revertable with a single `git revert` |
| BC-004 Green test suite gate | All ~840 existing tests must pass in CI (`pnpm test` exit 0); new tests are additive; flaky tests tagged `@flaky` excluded from gate |

---

## P0 — Security

### P0.1 — API Key Validation [IMPLEMENTED]
- `ApiKeyService` validates `sk_test_[0-9a-f]{32}` format + `ALLOWED_API_KEYS` env var lookup
- SHA-256 hash, timing-safe compare, prefix-indexed Map
- Dev mode (no env var): format-valid keys accepted with warning logged
- `ALLOWED_API_KEYS` value is never logged — only the count is; AC4 covers this

**Production path (out of scope):** Vault/AWS Secrets Manager injection replaces env var. `ApiKeyService.validate()` signature is stable; only backing store changes.

**AC:**
- AC1: Invalid format → HTTP 401
- AC2: Unknown key (format valid, key not in store) → HTTP 401
- AC3: Timing-safe comparison — no early exit path in hash comparison
- AC4: No secret value appears in application logs (only key count logged)

### P0.2 — AdminGuard JWT Verification + Replay Protection [THIS CYCLE]
**RS256 verify + role check:** IMPLEMENTED.

**jti Replay Protection — included in this cycle:**

Rationale: Admin endpoints are live. A captured, unexpired admin JWT could be replayed by an attacker. The 15-minute token validity window is unacceptably long without revocation.

**Implementation spec for jti denylist:**
- Redis key: `jwt:revoked:{jti}` with TTL = token remaining validity (`exp - now`)
- Set on explicit logout (`POST /v1/auth/logout`) and on admin token revocation
- `AdminGuard.canActivate()` checks Redis for `jti`; presence = HTTP 401

**Failure mode — FAIL-CLOSED:**
- Redis unavailable → return HTTP **503** `{"error":"auth_unavailable","message":"Authentication service temporarily unavailable. Retry shortly."}`
- Log at `CRITICAL` level: `jti denylist unreachable — blocking admin access`
- Rationale: security controls must not fail-open; admin operations are non-time-critical and Redis restart is typically <60s; 503 is distinguishable from auth failure (401)

**AC:**
- AC1: Expired token → HTTP 401
- AC2: `role !== 'admin'` → HTTP 401
- AC3: Tampered RS256 signature → HTTP 401
- AC4: Valid revoked `jti` in Redis denylist → HTTP 401
- AC5: Redis unavailable → HTTP 503 with body `auth_unavailable`; CRITICAL log emitted
- AC6: Unit test covers all 5 paths above (expired, wrong role, tampered, revoked, Redis down)

### P0.3 — Refresh Token Role Lookup [IMPLEMENTED]
- `merchantsService.findById(stored.userId)` → role resolution
- **Role precedence (deterministic):** `admin > analyst > merchant`; take highest-privilege role from `merchant.roles[]` array
- **AC:** Admin merchant refreshes with `role: 'admin'`; deleted merchant falls back to `'merchant'` gracefully

---

## P1 — Dashboard Live Data

### P1.1 — KPI Metrics [IMPLEMENTED]
- `fetchKpiStats()` → `/v1/analytics/kpi`, 30s polling, stale-data fallback on error

**Stale data UX:**
- KPI cards display `lastUpdated` timestamp (e.g., "Updated 2m ago") below metric values
- When API call fails, badge changes to "Stale — last updated Xm ago" in amber
- No error modal; dashboard remains usable with cached values

**AC:**
- AC1: KPI updates on load; refreshes every 30s
- AC2: Interval cleared on unmount (no memory leak)
- AC3: Failure preserves last values in store; `lastUpdated` timestamp shown
- AC4: After 2+ failed polls, "Stale" badge visible in UI (component test)

### P1.2 — Trend Chart [IMPLEMENTED]
- `fetchMinuteTrend()` → `/v1/analytics/minute-trend`, 60 × `{minute, ALLOW, REVIEW, BLOCK}`
- `KpiData`/`TrendBucket` in `analytics.types.ts` (no circular imports)

### P1.3 — Labeling Stats [IMPLEMENTED]
- `fetchLabelingStats()` → `/v1/cases/stats`

---

## P2 — Missing Features [ALL IMPLEMENTED]

### P2.1 — Rules Page
- `RulesTab` + `fetchRules()` on mount; no longer "coming soon"

### P2.2 — Evidence Timeline
- `EvidenceItem[]` type; renders ordered list; empty → "No evidence recorded"

### P2.3 — Settings Form
- Editable inputs; `localStorage` save; "Saved" confirmation
- **Edge cases:** catch `localStorage` errors (private mode, quota exceeded, storage disabled) → show inline error "Settings could not be saved" instead of silently failing

### P2.4 — Case Search Filter
- `?search=` query param filters results in mock server and production handler
- **Search semantics:** case-insensitive partial match against `entityId`, `merchantId`, and `id` fields
- Minimum query length: 1 character (no empty-string search)
- Empty results → display "No cases match your search"
- Search does not reset pagination; page 1 returned when search changes

**AC:**
- AC1: "abc" matches entityId "xyzabc123" (partial, case-insensitive)
- AC2: No results → "No cases match your search" shown
- AC3: Clearing search restores full unfiltered list

---

## P3 — Backend Stubs

### P3.1 — Velocity Merchant ID [IMPLEMENTED]
- `X-Merchant-ID` header → `merchantId`; fallback `'default'`

### P3.2 — DLQ Reprocess [IMPLEMENTED — with poison-pill safeguard]
**Implementation:**
- `DlqConsumerService` injects `KafkaService`; `reprocessEvent()` re-publishes to `signalrisk.events.raw`
- Headers: `dlq-retry-count` (= `retryCount + 1`), `dlq-original-topic`

**Infinite retry loop prevention:**
The existing `processRecord()` method enforces `maxRetries` (default: 3). When `retryCount >= maxRetries`, `exhaustRetries()` is called and the event goes to the permanent in-memory DLQ. `reprocessEvent()` is **never called** for exhausted events. Re-published events carry incremented `dlq-retry-count` so downstream DLQ consumers detect loop depth.

**AC:**
- AC1: Events with `retryCount < maxRetries` → `reprocessEvent()` called → republished to Kafka
- AC2: Events with `retryCount >= maxRetries` → `exhaustRetries()` called → Kafka NOT called
- AC3: Re-published event has `dlq-retry-count` header = `retryCount + 1`
- AC4: Unit test: assert `kafkaService.sendBatch()` is NOT called when `retryCount === maxRetries`
- AC5: Invalid `originalValue` (non-JSON-object) → throws; caught by caller; counts as retry failure

### P3.3 — VPN Detection [IMPLEMENTED]
- `ProxyDetector.isVpnIp(asn)` with 11 known VPN provider ASNs (Mullvad AS210644, Surfshark AS204953, PIA AS35041, etc.)
- Distinct from `isDatacenterIp()`; case-insensitive ASN normalization

**ASN resolution source:**
- `isVpnIp(asn)` receives a pre-resolved ASN string. The calling service (`network-intel-service`) resolves IP→ASN using the existing MaxMind GeoIP2 database already in the stack. No external API call at check time; `isVpnIp` is a pure in-process lookup against the curated Set.
- When the MaxMind lookup returns no ASN, `undefined` is passed and `isVpnIp` returns `false`.

**VPN NFR testability:**
False positive rate < 5% validated against a fixed set of **50 IPs**, composed of:
- 30 residential ISP ASNs (e.g., Comcast AS7922, BT AS2856, Turkcell AS9121)
- 10 mobile carrier ASNs (e.g., T-Mobile AS21928, Vodafone AS1273)
- 10 enterprise ASNs (e.g., Google AS15169, AWS AS16509 — should not be flagged as VPN)

**AC:**
- AC1: Known VPN ASNs (e.g., AS210644/Mullvad, AS204953/Surfshark) → `isVpn: true`
- AC2: Residential/mobile ASNs → `isVpn: false`
- AC3: `undefined` ASN → `isVpn: false` (no exception)
- AC4: Case-insensitive: `as210644` === `AS210644`
- AC5: Unit test covers ≥5 VPN ASNs and ≥5 non-VPN ASNs

---

## P4 — Test Coverage

### P4.1 — New Service Unit Tests
| Service | Required Test Cases |
|---------|---------------------|
| `ApiKeyService` | valid key, invalid format (5 variants), unknown prefix, wrong key, dev mode |
| `AdminGuard` | valid admin, non-admin role, expired, malformed header, revoked jti (401), Redis down (503) |
| `DlqConsumerService` | `reprocessEvent()` called (<maxRetries), NOT called (=maxRetries), headers present, invalid JSON |
| `ProxyDetector.isVpnIp()` | ≥5 VPN ASNs match, ≥5 non-VPN, undefined input, case variants |

### P4.2 — Dashboard Component Tests
| Component | Required Assertions |
|-----------|---------------------|
| `OverviewPage` | `fetchOverviewData` called on mount; interval set up; cleared on unmount; stale badge shown after failed poll |
| `CaseDetailPanel` | 3 items render when `evidenceTimeline` provided; "No evidence recorded" when empty/undefined |
| `RulesPage` | `fetchRules` called on mount |
| `SettingsPage` | localStorage error caught; inline error message shown |

### P4.3 — E2E Search Filter
After typing search query in `fraud-ops.spec.ts`:
- Assert rendered case count is less than unfiltered count
- Assert matching entity ID is visible in filtered results
- Assert "No cases match your search" shown for non-matching query

---

## Graceful Degradation

| Dependency | Failure | Fallback |
|------------|---------|---------|
| `/v1/analytics/kpi` | Timeout/5xx | Preserve last KPI; show "Stale" badge with age |
| `/v1/analytics/minute-trend` | Timeout/5xx | Preserve existing trend data |
| `/v1/cases/stats` | Timeout/5xx | Show 0s; no fraud decision impact |
| `KafkaService` (DLQ) | Connection error | Log error; mark retry-failed; no crash |
| Redis jti denylist | Unavailable | **Fail-closed: return HTTP 503**; CRITICAL log |
| VPN ASN detection | `asn === undefined` | Return `false`; no exception |
| `localStorage` (Settings) | Quota/private mode | Catch error; show "Settings could not be saved" |

---

## NFRs

| NFR | Target | Measurement |
|-----|--------|-------------|
| API key validation | < 1ms | In-process hash lookup; Jest timer |
| JWT + jti check | < 10ms p99 | RSA verify + Redis GET; unit test mock timing |
| KPI refresh interval | 30s | `setInterval` mock in component test |
| Dashboard failure resilience | No crash, stale data + badge | Store unit test with mocked rejection |
| VPN false positive rate | < 5% on 50 IPs (30 residential, 10 mobile, 10 enterprise) | Fixed IP sample in integration test |
| Test suite gate | 0 failures (non-flaky) | CI: `pnpm test`; flaky tests tagged `@flaky` |

---

## Out of Scope (explicitly deferred)
- Vault/Secrets Manager migration for `ALLOWED_API_KEYS`
- Refresh token DB persistence
- Outbox relay `FOR UPDATE SKIP LOCKED`
- Commercial VPN/IP intelligence feed
- Settings persistence to backend API (`/v1/settings`)
- WebSocket upgrade for KPI dashboard (polling sufficient for current scale)
