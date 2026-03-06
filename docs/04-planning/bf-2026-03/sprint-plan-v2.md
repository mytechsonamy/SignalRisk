# SignalRisk v2 — Brownfield Gap Analysis: Sprint Plan (v2)
# STATUS: IN REVIEW

**Date:** 2026-03-06
**Requirements ref:** docs/01-requirements/bf-2026-03/gap-analysis-v7.md
**Architecture ref:** docs/03-architecture/bf-2026-03/architecture-v1.md
**Design ref:** docs/02-design/bf-2026-03/design-v1.md

> Changes from v1: Tests bundled with feature tasks (not deferred to Sprint 2),
> T7a/T7b clarified as tests-only (implementations already exist), agent roles added,
> estimates per task, AdminGuard hot-path note added.

---

## Context: Already Implemented vs Needs Work

| Item | Status |
|------|--------|
| ApiKeyService (P0.1) | ✅ Implemented — tests only needed |
| AdminGuard RS256 + role check | ✅ Implemented — jti Redis lookup NOT yet done |
| AdminGuard jti denylist + logout | ❌ Not implemented |
| Refresh token role lookup | ✅ Implemented — deleted user fallback needs fix |
| Velocity merchant ID (P3.1) | ✅ Implemented |
| DLQ reprocess (P3.2) | ✅ Implemented — exhausted Kafka topic NOT yet done |
| VPN detection / ProxyDetector (P3.3) | ✅ Implemented — tests only needed |
| Dashboard KPI wiring (P1.1) | ✅ Wired — stale badge/sequential poll NOT yet done |
| Evidence timeline (P2.2) | ✅ Implemented |
| Rules page (P2.1) | ✅ Implemented |
| Settings form (P2.3) | ✅ Implemented |
| Case search (P2.4) | ✅ Implemented — AbortController/whitespace NOT yet done |
| Feature toggles (BC-002) | ❌ Not implemented |

---

## Sprint 1 — Security & Backend (with bundled tests)

**Goal:** Complete P0.2, P0.3, P3.2, BC-002 — all with tests bundled.
**Parallelism:** 4 agents (T1, T2, T3, T4 fully independent)

---

### T1 — AdminGuard jti Redis Denylist (3h)
**Agent role:** Backend Engineer
**Files:**
- `apps/auth-service/src/merchants/guards/admin.guard.ts`
- `apps/auth-service/src/auth/auth.controller.ts`
- `apps/auth-service/src/merchants/guards/__tests__/admin.guard.spec.ts`

**Implementation:**
```typescript
// admin.guard.ts — inject RedisService (already @Global)
const jtiKey = `jwt:revoked:${payload.jti}`;
try {
  const revoked = await this.redis.get(jtiKey);
  if (revoked) throw new UnauthorizedException('Token revoked');
} catch (e) {
  if (e instanceof UnauthorizedException) throw e;
  this.logger.error('jti denylist unreachable — blocking admin access');
  throw new ServiceUnavailableException({ error: 'auth_unavailable', message: '...' });
}

// auth.controller.ts — POST /v1/auth/logout
const ttl = payload.exp - Math.floor(Date.now() / 1000);
await this.redis.set(`jwt:revoked:${payload.jti}`, '1', 'EX', ttl);
```

**Performance note:** AdminGuard applies only to admin endpoints (not user-facing hot path). Redis GET p99 < 2ms on LAN — within the 10ms p99 NFR.

**Bundled unit tests (6 cases):**
- AC1: expired token → 401
- AC2: non-admin role → 401
- AC3: tampered RS256 → 401
- AC4: revoked jti in Redis → 401
- AC5: Redis unavailable → 503 with `auth_unavailable`
- AC6: valid admin token, jti not in Redis → 200

**Done criteria:** All 6 tests green, `pnpm test` passes in auth-service

---

### T2 — Refresh Token: Deleted User + Role Precedence (1.5h)
**Agent role:** Backend Engineer
**Files:**
- `apps/auth-service/src/auth/auth.service.ts`
- `apps/auth-service/src/auth/__tests__/auth.service.refresh.spec.ts`

**Implementation:**
```typescript
const merchant = await this.merchantsService.findById(stored.userId);
if (!merchant) throw new UnauthorizedException('Account not found');

const ROLE_PRIORITY = ['admin', 'analyst', 'merchant'];
const role = ROLE_PRIORITY.find(r => merchant.roles.includes(r)) ?? 'merchant';
```

**Bundled unit tests (3 cases):**
- Admin merchant → role: 'admin'
- Merchant-only → role: 'merchant'
- Deleted user (null) → 401 'Account not found'

**Done criteria:** All 3 tests green

---

### T3 — DLQ Exhausted Kafka Topic + Cache Cap (2h)
**Agent role:** Backend Engineer
**Files:**
- `apps/event-collector/src/dlq/dlq-consumer.service.ts`
- `apps/event-collector/src/dlq/__tests__/dlq-consumer.service.spec.ts`

**Implementation:**
```typescript
// exhaustRetries() — rename permanentDlq → exhaustedEventCache, cap at 1000 FIFO
private readonly EXHAUSTED_TOPIC = 'signalrisk.events.dlq.exhausted';
private exhaustedEventCache: unknown[] = [];

private async exhaustRetries(record: KafkaMessage, retryCount: number): Promise<void> {
  const eventId = record.headers?.['event-id']?.toString() ?? 'unknown';
  // 1. Publish to Kafka (durable)
  await this.kafkaService.sendBatch([{
    topic: this.EXHAUSTED_TOPIC,
    messages: [{ value: record.value, headers: {
      'dlq-event-id': eventId,
      'dlq-original-topic': record.headers?.['dlq-original-topic']?.toString() ?? '',
      'dlq-final-retry-count': String(retryCount),
    }}]
  }]);
  // 2. In-memory cache (session-scoped, capped)
  if (this.exhaustedEventCache.length >= 1000) this.exhaustedEventCache.shift();
  this.exhaustedEventCache.push(record);
  // 3. Log
  this.logger.warn(`DLQ exhausted: event=${eventId} retries=${retryCount}`);
}
```

**Bundled unit tests (6 cases):**
- retryCount < maxRetries → reprocessEvent called → published to events.raw
- retryCount === maxRetries → exhaustRetries called → events.dlq.exhausted published
- retryCount === maxRetries → events.raw NOT called
- Re-published event has dlq-retry-count = retryCount + 1
- Invalid JSON originalValue → throws
- exhaustedEventCache WARN log emitted

**Done criteria:** All 6 tests green

---

### T4 — Feature Toggles + Startup Log (1h)
**Agent role:** Backend Engineer
**Files:**
- `apps/auth-service/src/app.module.ts` (or bootstrap)
- `apps/event-collector/src/app.module.ts`
- `apps/network-intel-service/src/app.module.ts`

**Implementation:**
```typescript
// Startup log (each service)
const flags = {
  jti: process.env.ENABLE_JTI_DENYLIST !== 'false',      // default true
  vpn: process.env.ENABLE_VPN_DETECTION !== 'false',     // default true
  apiKey: process.env.ENABLE_API_KEY_VALIDATION !== 'false', // default true
};
logger.log(`Feature flags: jti=${flags.jti} vpn=${flags.vpn} apiKey=${flags.apiKey}`);

// AdminGuard: skip Redis check if toggle off
if (process.env.ENABLE_JTI_DENYLIST === 'false') return true; // after role check

// ApiKeyService: skip validation if toggle off
if (process.env.ENABLE_API_KEY_VALIDATION === 'false') return; // dev bypass

// ProxyDetector: skip VPN check if toggle off
if (process.env.ENABLE_VPN_DETECTION === 'false') return { vpnDetected: false };
```

**No unit tests required** — startup log is observable in integration smoke test
**Done criteria:** Each service logs feature flags on startup; toggle-off disables respective guard

---

## Sprint 2 — Dashboard Improvements & Remaining Tests

**Goal:** P1.1 stale badge, P2.4 AbortController, P4 tests for existing implementations.
**Parallelism:** 4 agents (T5, T6, T7, T8 independent)

---

### T5 — KPI Sequential Polling + Stale Badge + visibilityChange (3h)
**Agent role:** Frontend Engineer
**Files:**
- `apps/dashboard/src/store/dashboard.store.ts` (add `isStale`, `lastUpdated`)
- `apps/dashboard/src/pages/OverviewPage.tsx`
- `apps/dashboard/src/pages/__tests__/OverviewPage.test.tsx`

**Store changes:**
```typescript
interface DashboardState {
  // ...existing...
  isStale: boolean;
  lastUpdated: number; // timestamp ms
  setStale: (isStale: boolean, lastUpdated?: number) => void;
}
```

**Polling implementation:**
```typescript
// Sequential: setTimeout in finally — not setInterval
const poll = async () => {
  try {
    await fetchOverviewData();
    store.setStale(false, Date.now());
  } catch {
    store.setStale(true); // lastUpdated unchanged
  } finally {
    timer = setTimeout(poll, 30_000);
  }
};

// visibilitychange trigger
const onVisible = () => {
  if (document.visibilityState === 'visible' && Date.now() - store.lastUpdated > 30_000) {
    clearTimeout(timer);
    poll();
  }
};
document.addEventListener('visibilitychange', onVisible);
// cleanup: clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible);
```

**Bundled component tests (5 assertions):**
- fetchOverviewData called on mount
- setTimeout cleared on unmount (no leak)
- Stale badge appears on failed poll
- Badge clears on next successful poll
- visibilitychange triggers poll when data is stale >30s

**Done criteria:** All 5 tests green

---

### T6 — Search AbortController + Whitespace Guard + Loading (2h)
**Agent role:** Frontend Engineer
**Files:**
- Case search component (FraudOpsPage.tsx or CasesPage.tsx)
- `tests/e2e/fraud-ops.spec.ts`

**Implementation:**
```typescript
const abortRef = useRef<AbortController | null>(null);

const handleSearch = useMemo(() =>
  debounce((query: string) => {
    const trimmed = query.trim();
    if (!trimmed) { setResults(allCases); setSearching(false); return; }
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setSearching(true);
    fetch(`/api/v1/cases?search=${encodeURIComponent(trimmed)}`,
      { signal: abortRef.current.signal })
      .then(r => r.json())
      .then(data => setResults(data.cases))
      .catch(e => { if (e.name !== 'AbortError') setError(e); })
      .finally(() => setSearching(false));
  }, 300),
[]);
```

**Bundled E2E additions to fraud-ops.spec.ts:**
- Type partial query → assert case count < total
- Matching entity ID visible in filtered results
- Type non-matching query → "No cases match your search"
- Type whitespace → full list, no "Searching…"

**Done criteria:** All E2E assertions pass

---

### T7 — Tests for Already-Implemented Services (2h)
**Agent role:** QA Engineer
**Files:**
- `apps/event-collector/src/events/__tests__/api-key.service.spec.ts` (NEW)
- `apps/network-intel-service/src/proxy/__tests__/proxy-detector.vpn.spec.ts` (NEW)

**Note:** ApiKeyService and ProxyDetector are fully implemented. These are test-only tasks.

**ApiKeyService (8 cases):**
- Valid key accepted
- Invalid format: too short, wrong prefix, uppercase hex, special chars, empty string
- Unknown prefix (format valid, not in store) → 401
- Wrong key (prefix match, hash mismatch) → 401
- Dev mode (no env var) → format-valid keys accepted

**ProxyDetector.isVpnIp() (12 cases):**
- ≥5 known VPN ASNs → true (Mullvad, Surfshark, PIA, NordVPN, ExpressVPN)
- ≥5 non-VPN ASNs → false (Comcast, BT, Turkcell, T-Mobile, Google)
- undefined → false
- null → false
- 'as210644' (lowercase) → true (case-insensitive)
- 'AS210644' (uppercase) → true

**Done criteria:** All 20 tests green

---

### T8 — Remaining Dashboard Component Tests (2h)
**Agent role:** QA Engineer
**Files:**
- `apps/dashboard/src/components/cases/__tests__/CaseDetailPanel.test.tsx`
- `apps/dashboard/src/components/admin/__tests__/RulesPage.test.tsx`
- `apps/dashboard/src/pages/__tests__/SettingsPage.test.tsx`

**CaseDetailPanel (2 cases):**
- evidenceTimeline with 3 items → renders 3 ordered list items
- evidenceTimeline undefined → "No evidence recorded" shown

**RulesPage (1 case):**
- fetchRules called on mount

**SettingsPage (2 cases):**
- Save success → "Saved" text appears for 2s
- localStorage.setItem throws → "Settings could not be saved" shown

**Done criteria:** All 5 tests green

---

## Acceptance Gate

Before marking each sprint complete:
1. `pnpm test` exits 0 in all affected services
2. 0 non-flaky test failures
3. Flaky test count ≤ 5 across all services
4. Feature toggles verified: startup log present in service output

---

## File Outputs Summary

| Sprint | New files | Modified files |
|--------|-----------|---------------|
| Sprint 1 | admin.guard.spec.ts, auth.service.refresh.spec.ts, dlq-consumer.service.spec.ts | admin.guard.ts, auth.controller.ts, auth.service.ts, dlq-consumer.service.ts, 3× app.module.ts |
| Sprint 2 | OverviewPage.test.tsx, api-key.service.spec.ts, proxy-detector.vpn.spec.ts, CaseDetailPanel.test.tsx, RulesPage.test.tsx, SettingsPage.test.tsx | dashboard.store.ts, OverviewPage.tsx, search component, fraud-ops.spec.ts |
