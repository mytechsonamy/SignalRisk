# SignalRisk v2 — Brownfield Gap Analysis: Architecture Decisions (v1)
# STATUS: APPROVED — ADR records for all major gap analysis decisions

**Date:** 2026-03-06
**Scope:** Architecture Decision Records (ADRs) for brownfield gap analysis changes

> Per framework policy: Architecture documents are NEVER auto-archived.
> All ADRs (including rejected alternatives) remain accessible throughout the project lifecycle
> and inform future brownfield work and sprint decisions.

---

## ADR-001: jti Denylist — Fail-Closed vs Fail-Open

**Status:** ACCEPTED
**Component:** `apps/auth-service/src/merchants/guards/admin.guard.ts`

### Context
Admin JWT tokens have a 15-minute validity window. A compromised token can be replayed until expiry. Redis stores the revocation list. What happens when Redis is unavailable?

### Decision
**Fail-closed:** Redis unavailable → HTTP 503 `{"error":"auth_unavailable"}` + CRITICAL log.

### Alternatives Rejected
| Alternative | Reason Rejected |
|-------------|----------------|
| Fail-open (pass the request) | Security controls must not degrade on dependency failure; 15-min window too large for attacker exploitation |
| Bounded grace window (30s pass-through) | Introduces time-based attack window; complexity exceeds benefit for low-traffic admin path |
| Local memory cache of revoked jtis | Stale on multi-instance deploy; cluster-wide revocation requires shared store |

### Consequences
- Redis becomes a critical dependency for admin authentication
- Redis HA + alerting are required operational prerequisites (out of scope here; ops team responsibility)
- 503 is distinguishable from 401 (auth failure) — clients can implement retry logic
- AdminGuard is admin-only (low traffic); 503 impact is limited to ops staff, not end users

---

## ADR-002: DLQ Exhausted Events — Kafka Topic vs In-Memory vs DB

**Status:** ACCEPTED
**Component:** `apps/event-collector/src/dlq/dlq-consumer.service.ts`

### Context
Events that exhaust `maxRetries` need durable storage for audit and potential manual replay. Prior v3 used in-memory only (volatile on restart). Gemini raised this as CRITICAL.

### Decision
Dual storage:
1. **Kafka topic `signalrisk.events.dlq.exhausted`** — durable, uses existing infrastructure
2. **In-memory `exhaustedEventCache`** (capped at 1000 FIFO) — current-session access

### Alternatives Rejected
| Alternative | Reason Rejected |
|-------------|----------------|
| In-memory only | Volatile on restart — data loss; misleading name "permanent" |
| PostgreSQL table | New schema migration, new dependency injection for DLQ consumer; Kafka already in stack |
| Redis list | TTL risk (eviction deletes evidence); Kafka provides better retention and consumer replay semantics |
| S3/object storage | Overkill for current scale; adds new infrastructure dependency |

### Consequences
- Kafka topic `signalrisk.events.dlq.exhausted` is created (auto-create via KafkaModule config)
- No consumer implemented yet (consumer deferred — topic exists for future processing)
- `exhaustedEventCache` size capped at 1000 to prevent OOM under sustained failure

---

## ADR-003: Feature Toggles — Per-Feature vs Global Toggle

**Status:** ACCEPTED
**Components:** `auth-service`, `event-collector`, `network-intel-service`

### Context
BC-002 requires independent deployability so a bug in one feature (e.g., VPN detection) doesn't block rollback of a critical security fix (e.g., jti denylist).

### Decision
Per-feature env var toggles:
- `ENABLE_JTI_DENYLIST` (default: `true` in staging/prod, `false` in local dev)
- `ENABLE_VPN_DETECTION` (default: `true` in staging/prod, `false` in local dev)
- `ENABLE_API_KEY_VALIDATION` (default: `true` in staging/prod, `false` in local dev)

Toggle state logged at startup: `Feature flags: jti=true vpn=true apiKey=true`

### Alternatives Rejected
| Alternative | Reason Rejected |
|-------------|----------------|
| Single `ENABLE_GAP_FIXES` toggle | Couples unrelated features — VPN bug forces rollback of jti security fix |
| Feature flags via Redis/DB | Adds runtime dependency; env vars are simpler and fail-safe |
| LaunchDarkly / feature flag SaaS | Overkill for 3 flags; new external dependency |

### Consequences
- 3 env vars added to deployment manifests (K8s ConfigMap / Helm values)
- Each toggle is backward-compatible: default `true` in prod means no action needed for rollout
- Startup log provides observability — feature state visible in pod logs

---

## ADR-004: KPI Polling — Sequential setTimeout vs setInterval

**Status:** ACCEPTED
**Component:** `apps/dashboard/src/pages/OverviewPage.tsx`

### Context
Dashboard polls `/v1/analytics/kpi` every 30 seconds. `setInterval` fires at fixed intervals regardless of whether previous request completed, risking request piling on slow networks.

### Decision
Sequential polling: `setTimeout(poll, 30000)` rescheduled in the `finally` block. Next poll starts 30s after previous completes (success or failure).

Additionally: `visibilitychange` event triggers immediate poll when tab becomes visible if last poll was >30s ago.

### Alternatives Rejected
| Alternative | Reason Rejected |
|-------------|----------------|
| `setInterval` | Request piling risk when network is slow; concurrent in-flight requests |
| SWR / React Query `refreshInterval` | Library not in current stack; adding dependency for one use case is overengineering |
| WebSocket push | WebSocket upgrade deferred (out of scope) — polling sufficient for <10 concurrent sessions |

### Consequences
- Effective refresh rate is ≥30s (may be longer if poll takes time) — acceptable for KPI display
- `setTimeout` ref must be stored and cleared in `useEffect` cleanup to prevent memory leaks

---

## ADR-005: Refresh Token Role Precedence — Array Order vs Explicit Priority

**Status:** ACCEPTED
**Component:** `apps/auth-service/src/auth/auth.service.ts`

### Context
`merchant.roles[]` is an array. Prior code used `roles[0]` which is non-deterministic (depends on insertion order). If a user has both `merchant` and `admin` roles, which wins?

### Decision
Explicit priority: `admin > analyst > merchant`. `resolveRole(roles)` returns the highest-privilege role present.

Deleted user (null from `findById`): throw `UnauthorizedException('Account not found')` — no fallback role. A deleted identity must receive zero permissions.

### Alternatives Rejected
| Alternative | Reason Rejected |
|-------------|----------------|
| `roles[0]` (insertion order) | Non-deterministic; depends on DB insertion order; silent privilege escalation risk |
| `roles[roles.length - 1]` (last element) | Same problem as `roles[0]` |
| Fall back to `'merchant'` on null | Security flaw (Gemini iteration 6 CRITICAL) — deleted accounts must not receive any role |

### Consequences
- Admin users with `['merchant', 'admin']` roles correctly get `role: 'admin'` on refresh
- `resolveRole()` is a pure function — easily unit testable

---

## ADR-006: AbortController for Search — Cancel vs Ignore

**Status:** ACCEPTED
**Component:** `apps/dashboard/src/pages/FraudOpsPage.tsx`

### Context
Users may type quickly, triggering multiple in-flight search requests. Without cancellation, older requests may resolve after newer ones, showing stale results.

### Decision
`AbortController` pattern: cancel previous in-flight request when new input fires.

### Alternatives Rejected
| Alternative | Reason Rejected |
|-------------|----------------|
| Request ID tagging (ignore stale responses) | Leaves stale requests running — wastes server resources |
| Debounce alone (no cancel) | 300ms debounce reduces requests but doesn't prevent overlap on slow network |
| Synchronous state tracking (last-wins) | More complex implementation for same outcome as AbortController |

### Consequences
- Native browser `AbortController` — no new dependencies
- `AbortError` must be caught and ignored (not shown as an error state to user)

---

## Architecture Impact Summary

| ADR | Service | Risk Level | Rollback |
|-----|---------|-----------|---------|
| ADR-001 jti fail-closed | auth-service | Medium (Redis SPOF for admin) | `ENABLE_JTI_DENYLIST=false` |
| ADR-002 DLQ Kafka topic | event-collector | Low (Kafka already in stack) | `git revert` single commit |
| ADR-003 feature toggles | 3 services | Low | Toggle env var off |
| ADR-004 sequential polling | dashboard | Low | `git revert` |
| ADR-005 role precedence | auth-service | Low | `git revert` |
| ADR-006 AbortController | dashboard | Low | `git revert` |
