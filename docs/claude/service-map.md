# SignalRisk Service Map

> Reality Verification sonrasi guncellendi.
> Son guncelleme: Sprint 34 sonrasi Reality Verification (2026-03-10)

## Infrastructure (4 container)

| Service | Image | Port | Sorumluluk |
|---|---|---|---|
| postgres | postgres:16-alpine | 15432 (host) / 5432 (internal) | Multi-tenant DB, RLS (7 tablo) |
| redis | redis:7-alpine | 16379 (host) / 6379 (internal) | Cache, rate limit, JTI, velocity |
| kafka | confluentinc/cp-kafka:7.6.0 | 9094 (host) / 9092 (internal) | KRaft mode, gzip compression |
| neo4j | neo4j:5-community | 7474 (HTTP) / 7687 (Bolt) | Graph intelligence |

## Application Services (15 container)

### Port Reality Check

> ⚠ Cogu servisin main.ts default port'u docker-compose.full.yml ile UYUSMUYOR.
> Docker PORT env override ile calisiyor — ama env olmadan calistirilirsa port cakismasi olur.

| Service | Docker PORT | main.ts Default | Uyumlu? | Health |
|---|---|---|---|---|
| auth-service | 3001 | 3015 | ❌ | GET /health |
| event-collector | 3002 | 3001 | ❌ | GET /health |
| device-intel-service | 3003 | 3002 | ❌ | GET /health |
| velocity-service | 3004 | 3003 | ❌ | GET /health + /health/ready |
| behavioral-service | 3005 | 3004 | ❌ | GET /health |
| network-intel-service | 3006 | 3006 | ✅ | GET /health |
| telco-intel-service | 3007 | 3007 | ✅ | GET /health |
| rule-engine-service | 3008 | 3006 | ❌ | GET /health |
| decision-service | 3009 | 3007 | ❌ | GET /health |
| case-service | 3010 | 3010 | ✅ | GET /health |
| webhook-service | 3011 | 3011 | ✅ | GET /health |
| graph-intel-service | 3012 | 3012 | ✅ | GET /health |
| feature-flag-service | 3013 | 3013 | ✅ | GET /health |
| outbox-relay | 3014 (HEALTH_PORT) | 3014 | ✅ | GET /health |
| dashboard | 5173 (Vite) | - | ✅ | - |

**7 servis port uyumsuz (Docker env override ile calisiyor):** auth, event-collector, device-intel, velocity, behavioral, rule-engine, decision

### Maturity Assessment (Verified)

| Service | Maturity | Aciklama |
|---|---|---|
| auth-service | ❌ Known demo | In-memory Map, hardcoded dashboard login (admin123/analyst123), seed'ler NODE_ENV guarded |
| event-collector | ✅ Verified | API key auth, Kafka publish, rate limiting. Kafka topic'ler hardcoded (P0 #3) |
| device-intel-service | ✅ Verified | Kafka topic hardcoded (P0 #3) |
| velocity-service | ✅ Verified | Kafka topic hardcoded (P0 #3) |
| behavioral-service | ✅ Verified | Fonksiyonel |
| network-intel-service | ✅ Verified | Fonksiyonel |
| telco-intel-service | ✅ Verified | Fonksiyonel |
| rule-engine-service | ✅ Verified | Fonksiyonel |
| graph-intel-service | ✅ Verified | Fonksiyonel |
| decision-service | ⚠ Observed risk | JWT_SECRET fallback `'test-secret'` (NO NODE_ENV guard!), Kafka topic hardcoded |
| case-service | ⚠ Observed risk | TenantGuard decode-only (P0 #5). Topic match OK. Cases table TEXT ID (not UUID) |
| webhook-service | ❌ BROKEN CONTRACT | Topic: `'decisions'` vs producer `'signalrisk.decisions'` — NEVER receives messages. Field: `outcome` vs producer `action` |
| feature-flag-service | ✅ Verified | Fonksiyonel |
| outbox-relay | ⚠ Observed risk | 3 undocumented topics: `signalrisk.merchants`, `signalrisk.events.unrouted`, `signalrisk.events.dlq.exhausted` |
| dashboard | ❌ Known demo | Hardcoded login, Vite dev only |

### Kafka Topic Audit

**17+ hardcoded topic violations across 6 services** — Hicbiri `@signalrisk/kafka-config` import etmiyor:
- event-collector (4 violation)
- decision-service (2 violation)
- case-service (2 violation)
- velocity-service (1 violation)
- device-intel-service (1 violation)
- outbox-relay (7+ violation, 3 undocumented topic)

**Undocumented topics (kafka-config'de YOK):**
- `signalrisk.events.dlq.exhausted` — dlq-consumer.service.ts
- `signalrisk.merchants` — outbox-relay topic-router.ts
- `signalrisk.events.unrouted` — outbox-relay topic-router.ts

### Webhook Contract Mismatch (CRITICAL)

```
decision-service publishes → topic: 'signalrisk.decisions', field: 'action'
webhook-service subscribes → topic: 'decisions', field: 'outcome'
case-service subscribes   → topic: 'signalrisk.decisions', field: 'action' ✅
```

**Sonuc:** Webhook-service hicbir decision mesaji almiyor. Iki hata:
1. Topic adi yanlis (`decisions` vs `signalrisk.decisions`)
2. Field adi yanlis (`outcome` vs `action`)

### Hardcoded Credentials (Verified)

| Bulgu | Severity | Guarded? | Dosya |
|---|---|---|---|
| JWT_SECRET fallback `'test-secret'` | CRITICAL | ❌ NO | decision-service/decision.gateway.ts:54 |
| Dashboard login admin123/analyst123 | CRITICAL | ❌ NO | auth-service/auth.controller.ts:56-57 |
| Merchant seeds (4 account) | CRITICAL | ✅ NODE_ENV | auth-service/merchants.service.ts:35-38 |
| Test credentials export | HIGH | N/A (test) | tests/e2e/scenarios/helpers.ts:27-39 |

### Error Suppression (`|| true`) Audit

| Dosya | Satir | Pattern | Severity |
|---|---|---|---|
| package.json | 15 | `test:all ... \|\| true` | P0 |
| package.json | 16 | `build:all ... \|\| true` | P0 |
| package.json | 17 | `lint:all ... \|\| true` | P0 |
| Dockerfile | 63 | `tsc ... 2>/dev/null \|\| true` | P0 |
| Dockerfile | 56 | `cp ... 2>/dev/null \|\| true` | P1 |
| .github/workflows/ci.yml | 160 | `tsc --noEmit ... \|\| true` | P1 |
| Dockerfile | 32 | `find ... -delete ... \|\| true` | P2 (acceptable) |

## Database Schema (Verified)

**Tool:** Raw SQL (pg library, no ORM)
**Migration versioning:** Manual (no tracking table) ⚠

| Tablo | RLS | ID Tipi | Tenant Scoped |
|---|---|---|---|
| merchants | - | UUID | No (IS tenant) |
| users | ✅ | UUID | Yes |
| devices | ✅ | UUID | Yes |
| events | ✅ | UUID | Yes (partitioned monthly) |
| decisions | ✅ | UUID | Yes |
| refresh_tokens | ✅ | UUID | Yes |
| outbox_events | - | UUID | No |
| idempotency_requests | ✅ | UUID | Yes |
| processed_events | - | composite | No |
| cases | ✅ | TEXT ⚠ | Yes |

**DTO ↔ DB mapping:** ✅ Correct (explicit rowToCase() transformation, camelCase ↔ snake_case)
**SQL injection:** ✅ Safe (parameterized queries throughout)
**Cases table anomali:** TEXT ID (diger tablolar UUID) — P0 #6 scope'unda

**Migration dosyalari:**
- `database/migrations/001-005` (ana schema)
- `infrastructure/docker/initdb.d/06_cases.sql` (ayri — fragmented)
- `packages/db-migrations/008_perf_indexes.sql` (deleted_at kolonu referans ediyor ama kolon yok)

**In-memory store'lar (DB-backed degil):**
- MerchantsService (auth-service) — Map
- RefreshTokenStore (auth-service) — Map (migration 004 tablo olusturmus ama kullanilmiyor)

## Redis Key Namespaces

| Pattern | Servis | TTL | Aciklama |
|---|---|---|---|
| `decision:cache:{merchantId}:{entityId}` | decision-service | 5s | Idempotency cache |
| `jti:{jti}` | auth-service | token TTL | JWT revocation denylist |
| `velocity:{merchantId}:{entityId}:{dimension}:{window}` | velocity-service | sliding | Velocity counters |
| `rule:weight:{ruleId}` | rule-engine-service | - | Chargeback feedback weight |
| Rate limit keys | event-collector | 10s window | Redis Lua script, 150 req/window |

## Startup Sirasi (Docker depends_on)

```
postgres, redis, kafka, neo4j  (infra — paralel)
  → auth-service
  → event-collector
  → device-intel, velocity, behavioral, network-intel, telco-intel  (signal — paralel)
  → rule-engine-service, graph-intel-service
  → decision-service  (tum signal servislere bagimli)
  → case-service, webhook-service
  → feature-flag-service, outbox-relay
  → dashboard
```

## Verified Assumptions (was ?)

| Assumption | Sonuc | Detay |
|---|---|---|
| Webhook topic uyumu | ❌ CONFIRMED BROKEN | Topic + field mismatch — webhook-service mesaj almiyor |
| CI/CD workflow durumu | ⚠ PARTIALLY BROKEN | ci.yml dashboard tsc `\|\| true` ile suppress ediliyor |
| FraudTester analytics isolation | ? STILL UNVERIFIED | Kod incelemesi yapilmadi, E2E test yok |
| DTO ↔ DB uyumsuzlugu | ✅ NOT AN ISSUE | rowToCase() explicit mapping, camelCase ↔ snake_case dogru |
