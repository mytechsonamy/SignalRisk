# CLAUDE.md — SignalRisk

## 1. Bu Dosya Ne Icin

Bu dosya, SignalRisk kod tabanina dokunmadan once bilmen gereken kurallari ve durum tespitlerini icerir.
Dokuman guclu gorunuyor diye sistem calisiyordur sanma — her etiketin ne anlama geldigini oku.

**Durum:** Functional prototype → production-ready gecis asamasinda (34 sprint, sifirdan).
**Detaylar:** `docs/claude/` klasorune bak. Bu dosya kisa tutuluyor, detay orada.

Kurallar (§6) degismez — mimari kararlardir.
Durum tespiti (§3, §5) degisir — her sprint guncelle.

---

## 2. Quick Start

```bash
# Tum stack (19 container): 4 infra + 15 app
docker compose -f docker-compose.full.yml up --wait

# E2E testler (78 test, 3 project, ~38s)
npx playwright test --config tests/e2e/playwright.config.real.ts
```

Dev credential'lar: `.env.local` dosyasina bak — CLAUDE.md'de inline yazilmaz.
> **Uyari:** Dev credential'lar Sprint 5 hedefinde kaldirilacak. Production'da kesinlikle yok.

---

## 3. Production Maturity Map

> Detay tablo: `docs/claude/service-map.md`

**Etiket aciklamasi:**
- ✅ **Verified** — Kod ve E2E test ile dogrulanmis
- ⚠ **Observed risk** — Yapi incelenerek tespit edilmis, test edilmemis
- ❌ **Known demo / broken** — Bilincli gecici karar veya dogrulanmis sorun
- ? **Assumption** — Henuz dogrulanmamis

| Durum | Alanlar |
|---|---|
| ✅ Verified functional | event pipeline, case (entityType typed), velocity (typed entities: customer/device/IP), graph, feature-flag, health checks, RLS (11 tablo), webhook (contract fixed), decision, all Kafka topics canonical, auth store (PostgreSQL), schema_migrations tracking (015), users CRUD + invite + password, admin health aggregation, admin rules CRUD, dashboard proxy routing, stateful context (ADR-009/010), DSL rule evaluation live (21 rules in decision path), prior-decision memory typed (ADR-011 + entity_type), analyst labels + watchlist (ADR-012), sequence detection (3 patterns), graph enrichment, feature governance aligned, 21 DSL rules (10 base + 5 stateful + 3 sequence + 3 graph), dashboard login DB-backed (ADR-013), WebSocket RS256 JWKS + tenant rooms (ADR-014), feedback consumer (STATE_LABELS → watchlist enforcement), watchlist decision-time check (denylist/watchlist/allowlist per FD-2), entity profiles (auto-update on decision), feature snapshots (decision_feature_snapshots), gate runner G7.3/G7.4 real tests |
| ⚠ Observed risk | outbox-relay topic routing (canonical ama test yok) |
| ✅ Verified | FraudTester analytics isolation (is_test column + X-SignalRisk-Test header + analytics 6 query filter + webhook skip) |

---

## 4. Source of Truth Map

Her contract tipi icin tek sahip dosya/paket. Baska yerden alma.

| Ne | Tek Kaynak |
|---|---|
| Kafka topic adlari | `packages/kafka-config/src/index.ts` (TOPICS object) |
| Kafka consumer groups | `packages/kafka-config/src/index.ts` (CONSUMER_GROUPS object) |
| Event payload schema | `packages/event-schemas/` |
| Signal contracts | `packages/signal-contracts/` |
| Auth claims (JWT) | `apps/auth-service/src/auth/strategies/jwt.strategy.ts` |
| DB schema (source) | `database/migrations/` + `packages/db-migrations/` |
| Port / env map | `docker-compose.full.yml` → pointer: `docs/claude/service-map.md` |
| Quality gates | `docs/testing/quality-gates.md` |
| Scenario catalog | `docs/testing/scenario-catalog.md` |
| Evidence format | `docs/testing/evidence-and-reporting.md` |
| Skill tanimlari | `docs/skills/` (local `~/.claude/skills/` sadece wrapper) |
| Stateful context namespace | `docs/claude/source-of-truth.md#stateful-namespace` |
| Entity identity standard | `docs/claude/decision-log.md` ADR-009 |
| Stateful fraud architecture | `docs/stateful-fraud-architecture.md` |
| Stateful fraud roadmap | `docs/stateful-fraud-roadmap.md` |
| Analyst feedback policy | `docs/stateful-fraud-architecture.md` §7.3 |
| Data model reference | `docs/DATA-MODEL.md` |
| Integration guide | `docs/INTEGRATION-GUIDE.md` |

> Detay: `docs/claude/source-of-truth.md`

---

## 5. P0 Critical Fixes

P0 fix'lerin tumu tamamlandi:

1. ~~`|| true` kaldir~~ — ✅ FIXED (package.json, Dockerfile, ci.yml)
2. ~~Webhook contract FIX~~ — ✅ FIXED (topic + field + kafka-config import)
3. ~~Kafka topic hardcode kaldir~~ — ✅ FIXED (10 dosya, 6 servis, tumu `TOPICS.*` import ediyor)
4. ~~Hardcoded credential guard~~ — ✅ FIXED (JWT_SECRET fallback kaldirildi, dashboard login NODE_ENV guarded)
5. ~~JWT signature verification~~ — ✅ FIXED (`tenant.guard.ts` → RS256 JWKS verification, auth-service'den public key alir)
6. ~~Cases table TEXT→UUID~~ — ✅ FIXED (`006_cases_text_to_uuid.sql` migration + `06_cases.sql` init updated)
7. ~~Single source of truth audit~~ — ✅ FIXED (3 undocumented topic kafka-config'e eklendi)
8. ~~Port default standardization~~ — ✅ FIXED (7 servis main.ts default port'u docker-compose ile eslestirildi)

---

## 6. Architecture Rules

**R1: Iki auth sistemi — ASLA karistirma**
- event-collector: `Bearer sk_test_<32hex>` (API key)
- Diger tum servisler: `Bearer <jwt>` (RS256 asymmetric via KeyManager)

**R2: Auth store — PostgreSQL-backed**
- `MerchantsService` PostgreSQL (`merchants` tablosu). `@Inject(PG_POOL)` ile `pg.Pool` kullanir.
- Dev seed'ler `onModuleInit()` icinde (NODE_ENV !== production guard'li).
- Seed merchant UUID'leri: `00000000-0000-0000-0000-00000000000{1-4}`.

**R3: TenantGuard — RS256 JWKS verification aktif**
- `apps/case-service/src/guards/tenant.guard.ts` auth-service'den JWKS alip RS256 public key ile verify ediyor.
- `AUTH_SERVICE_URL` env var (default: `http://auth-service:3001`) — JWKS cache 5 dakika.
- Admin role bypass: `payload.role === 'admin'` → tum merchant'lara erisim.

**R4: Kafka kurallari**
- Topic adlari: `packages/kafka-config/src/index.ts` — hardcode yasak
- Compression: `gzip` — LZ4 yok (KafkaJS), snappy test edilmedi
- Timeout wrapper'lar (Sprint 34): DLQ 5s, producer 10s, lag poll 10s — kaldirma

**R5: Signal fetch davranisi**
- `SIGNAL_TIMEOUT_MS=2000` Docker'da zorunlu — 150ms inter-container latency
- Timeout/hata = null → karar devam eder (graceful degradation)
- Circuit breaker: 3 fail → 30s OPEN

**R6: Velocity ↔ Decision mapping**
- velocity-service cikisi: snake_case (`tx_count_1h`)
- decision-service bekler: camelCase (`txCount1h`)
- `signal-fetchers.ts` map eder — her iki tarafi senkron tut

**R7: Redis key namespace'leri**
> Detay: `docs/claude/service-map.md#redis-key-namespaces`
- Decision cache: `decision:cache:{mId}:{eId}` TTL=5s
- JTI denylist: `jti:{jti}` TTL=token TTL
- Velocity: `velocity:{mId}:{eId}:{dim}:{win}` sliding
- Rule weight: `rule:weight:{ruleId}`
- Rate limit: Redis Lua script (event-collector)

**R8: Event payload zorunluluklari**
- `eventId`: UUID (strict `@IsUUID()`)
- `currency`: ISO-4217
- `paymentMethod`: enum (card_present, card_not_present, mobile, web, api)
- Batch: `{ events: [] }` → 202, `rejected > 0` her zaman kontrol et

**R9: Idempotency iki katmanli**
- `IdempotencyService`: requestId+merchantId — kalici
- `DecisionCacheService`: merchantId+entityId — 5s TTL
- Redis flush → pollDecision timeout yapabilir

**R10: outbox-relay HEALTH_PORT degil PORT**
- Docker: `HEALTH_PORT: "3014"` — `PORT` env var'i okumaz

**R11: NestJS conventions**
- `main.ts`: `initTracing()` once, NestFactory sonra
- `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`
- Redis: `@Inject(REDIS_CLIENT)` token — `new Redis()` direkt yasak
- `GET /health` her servis icin zorunlu

**R12: Entity-type convention**
- entityType enum: `'customer' | 'device' | 'ip'`
- Redis key'lerde entityType zorunlu: `{merchantId}:vel:{dim}:{entityType}:{entityId}`
- customer ID → `payload.customerId || entityId`
- device ID → `deviceId` (authoritative: device-intel-service)
- ip → `ipAddress` (raw, normalize lowercase)

**R13: Stateful context namespace**
- Stateful feature'lar decision context'te `stateful.{entityType}.{featureName}` path'inde
- Feature adlari camelCase: txCount10m, amountSum24h, previousBlockCount30d
- Tum feature'lar `docs/claude/source-of-truth.md#stateful-namespace`'de kayitli olmali
- Kayitsiz feature rule'da kullanilamaz

**R14: Prior-decision memory guardrails**
- Sync DB query ile basla, sonra Redis cache'e tasi
- MAX 30 gun geriye bakis
- Zorunlu index: `(merchant_id, entity_id, created_at)`
- 50ms timeout + circuit breaker
- Timeout → fallback: `{previousBlockCount: 0, previousReviewCount: 0}`

---

## 7. Execution Order

Production gecisi bu sirayi takip eder — adim gecmeden sonraki acilmaz:

```
1. REALITY VERIFICATION
   Servis/topic/port/env/DB tablo envanteri.
   Cikti: docs/claude/service-map.md guncellendi

2. CONTRACT STABILIZATION
   Tum payload/topic/claim/ID tipleri icin single source of truth kuruldu.
   P0 #7 tamamlandi.

3. CI FAIL-FAST
   || true kaldirildi. Build/test/lint pipeline gercek sonuc veriyor.
   G1 gate her PR'da calisiyor.

4. AUTH & TENANT FIX
   Hardcoded credential kaldirildi. JWT signature verify eklendi.
   Tenant isolation negatif testleri yesil.

5. SCHEMA & ID ALIGNMENT
   DTO ↔ DB kolon uyumu. Migration clean-room test.
   RLS enforcement test suite eklendi.

6. STAGING GATES ✅
   G3-G5 sprint exit zorunlu. Evidence pack uretiliyor.
   scripts/run-gates.sh G3|G4|G5|all — tek komutla calistir.
   RLS isolation 12/12, smoke 16/16, E2E 72/72 pass.

7. PERFORMANCE & RESILIENCE ✅
   G6 gate olculdu: p99<500ms, rate limit aktif, decision<15s.
   Chaos: Redis down/recovery 5/5, Kafka down/recovery 4/4 pass.

8. COMPLIANCE & GO-LIVE ✅
   G7: 14/14 services healthy, DR tests pass, rollback plan ready.
   G8: Evidence pack, quality gates, scenario catalog, decision log — all present.

9. STATEFUL FRAUD DETECTION
   Sprint 0: Entity identity + namespace + feedback politikasi donduruldu.
   Sprint 1-8: docs/stateful-fraud-roadmap.md sirasi takip edilir.
   Her sprint: G3-G5 gate + yeni SR-SF-xxx senaryolari.
```

---

## 8. Test Strategy Integration

> Detay: `docs/testing/` klasoru

**Calisma prensibi:**
- G1-G2: Her PR'da zorunlu
- G3-G5: Sprint exit'te zorunlu
- G6-G7: Release oncesi blocker
- G8: Release closure evidence

**Stop-the-line kosullari (bir tanesi yeterli, deploy durur):**
- Cross-tenant veri sizintisi
- Token bypass basarili
- Webhook test isolation kirik
- Contract mismatch

**Performance threshold policy:**
Degerler `CLAUDE.md`'de hardcode yok. Her release icin `docs/testing/quality-gates.md` icinde evidenced hedef tanimlanir.

**Scenario execution:** `docs/testing/scenario-catalog.md` → SR-P0-xxx, SR-P1-xxx ID'leri

---

## 9. Definition of Done

**Her PR icin:**
- [ ] CI yesil (build + lint + unit test — `|| true` yok)
- [ ] Yeni env var → `docker-compose.full.yml` + `.env.example` guncellendi
- [ ] Yeni Kafka topic/payload → `packages/kafka-config` veya `packages/event-schemas` guncellendi
- [ ] Demo/mock kod prod path'inde birakilmadi
- [ ] Security etkisi varsa `docs/claude/decision-log.md`'ye threat notu eklendi

**Her sprint exit icin:**
- [ ] G3-G5 quality gate calistirildi, sonuc `docs/testing/evidence/sprint-N-exit.md`'de
- [ ] Maturity Map guncellendi (yeni ✅ veya ❌ → ✅ gecisleri)

---

## 10. Workstreams & Skills

> Detay: `docs/claude/workstreams.md`

**Workstream'ler (takim degil — bir kisi birden fazla owner olabilir):**
- **WS-Alpha Platform Core** — Epic 1-2, P0 fix'ler → `/p0-scan`, `/simplify`
- **WS-Bravo Security** — Epic 3, G4 gate sahibi → `/security-audit`
- **WS-Charlie Data** — Epic 4, schema/RLS → `/test-run`
- **WS-Delta Infra** — Epic 5+7, Docker/CI → `/quality-gate`, `/loop`
- **WS-Echo Product** — Epic 8-9, fraud intel + dashboard → `/simplify`, `/test-run`
- **WS-Foxtrot QA** — G1-G8 surekli, evidence → `/quality-gate`, `/evidence`, `/sprint-exit`
- **WS-Golf Stateful Fraud** — SF-1 → SF-6, velocity genisleme, stateful rules → `/stateful-check`, `/velocity-test`, `/state-migrate`

**Skills dizini:** `docs/skills/` (kaynak) → `~/.claude/skills/` (opsiyonel local wrapper)

---

## 11. Decision Log

> Detay: `docs/claude/decision-log.md` (ADR formati)

| ADR | Karar | Neden |
|---|---|---|
| ADR-001 | Kafka timeout Promise.race wrappers (Sprint 34) | timeout hang'e karsi |
| ADR-002 | SIGNAL_TIMEOUT_MS=2000ms Docker'da | inter-container latency |
| ADR-003 | E2E sequential projects, 1 worker | race condition onleme |
| ADR-004 | entityId=deviceId velocity polling'de | velocity entity tracking |
| ADR-005 | KAFKA_COMPRESSION=gzip | LZ4 yok KafkaJS'de |
| ADR-006 | Decision cache TTL=5s | freshness/perf dengesi |
| ADR-007 | Case SLA BLOCK=4h, REVIEW=24h | fraud ops SLA |
| ADR-008 | TenantGuard RS256 JWKS verification | auth-service public key ile dogrulama |
| ADR-009 | Entity identity standard: customer/device/ip typed entities | multi-entity-type counter temeli |
| ADR-010 | Stateful context namespace: stateful.{type}.{feature} | DSL + explainability standardi |
| ADR-011 | Prior-decision memory: sync DB + 50ms timeout guardrail | decision latency korumasi |
| ADR-012 | Analyst feedback etki politikasi: fraud→denylist, fp→cooldown | urun davranisi netligi |
| ADR-013 | Dashboard login DB-backed (UsersService + bcrypt) | production auth hazir, seed fallback dev-only |
| ADR-014 | WebSocket RS256 JWKS + room-based tenant isolation | HS256 guvenlik acigi kapatildi, cross-tenant broadcast onlendi |
| ADR-015 | Watchlist decision-time enforcement (denylist/watchlist/allowlist) | closed-loop fraud: analyst feedback → live decision impact |
| ADR-016 | Feature snapshot structured columns (f_* mapping) | ML-ready export, migration 009 schema uyumu |
