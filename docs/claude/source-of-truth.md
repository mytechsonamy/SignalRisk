# SignalRisk — Source of Truth Map

> Her contract tipi icin tek sahip dosya/paket. Baska yerden alma.
> Son guncelleme: Sprint 41 (2026-03-12)

## Contract Ownership

| Contract Tipi | Tek Kaynak | Format | Validation |
|---|---|---|---|
| Kafka topic adlari | `packages/kafka-config/src/index.ts` → `TOPICS` | TypeScript const | Import zorunlu, hardcode yasak |
| Kafka consumer groups | `packages/kafka-config/src/index.ts` → `CONSUMER_GROUPS` | TypeScript const | Import zorunlu |
| Kafka client factory | `packages/kafka-config/src/index.ts` → `createKafkaClient()` | Factory function | TLS, SASL, retry config |
| Event payload (raw) | `packages/event-schemas/` | TypeScript types | AJV validation |
| Signal contracts | `packages/signal-contracts/` | Zod schemas | Tum servisler import eder |
| Auth claims (JWT) | `apps/auth-service/src/auth/jwt.strategy.ts` | JWT payload fields | `merchant_id`, `role`, `sub` |
| DB migrations | `database/migrations/` + `packages/db-migrations/` | SQL / TypeORM | App ORM != migration != prod |
| Port / env map | `docker-compose.full.yml` | YAML | `docs/claude/service-map.md` pointer |
| Quality gates | `docs/testing/quality-gates.md` | Markdown | G1-G8 tanimlari |
| Scenario catalog | `docs/testing/scenario-catalog.md` | Markdown | SR-P0/P1/P2 ID'leri |
| Evidence format | `docs/testing/evidence-and-reporting.md` | Markdown template | Sprint/release artifacts |
| Level 5 signoff | `docs/level5-signoff-checklist.md` | Markdown checklist | Final production-ready verdict |
| Skill tanimlari | `docs/skills/` | Markdown | Local wrapper: `~/.claude/skills/` |
| Architecture rules | `CLAUDE.md` §6 | Markdown | R1-R11 kurallari |
| Decision log | `docs/claude/decision-log.md` | ADR format | ADR-001 → ADR-00N |
| Workstream org | `docs/claude/workstreams.md` | Markdown | WS-Alpha → WS-Foxtrot |

## Onemli Kurallar

1. **Tek sahip prensibi:** Her contract tipi icin yukaridaki "Tek Kaynak" sutunundaki dosya/paket canonical'dir. Baska yerde ayni bilgiyi tekrarlama.
2. **Hardcode yasak:** Kafka topic string'leri `packages/kafka-config` disinda literal olarak yazilmaz.
3. **Schema drift:** Event payload degisikligi `packages/event-schemas`'da baslar, tuketici servisler sonra guncellenir.
4. **Migration truth:** PostgreSQL sema degisikligi migration dosyasindan baslar. ORM entity degisikligi yetmez.
5. **JWT field adlari:** `merchant_id` (underscore) auth-service'de. Bazi servisler `merchantId` (camelCase) bekler. Mapping her servisin kendi sorumlulugunda.

---

## Stateful Feature Namespace {#stateful-namespace}

Canonical feature adlari. Rule DSL ve decision explanation bu isimleri kullanir.
Yeni feature eklenmeden once buraya kayit zorunludur.

> Kaynak: ADR-010 (docs/claude/decision-log.md)
> Convention: `stateful.{entityType}.{featureName}` — feature adlari camelCase

### Customer

| Feature | Tip | Pencere | Redis Key Suffix |
|---|---|---|---|
| txCount10m | counter | 10 dakika | vel:tx:customer:{id} |
| txCount1h | counter | 1 saat | vel:tx:customer:{id} |
| txCount24h | counter | 24 saat | vel:tx:customer:{id} |
| amountSum24h | sum | 24 saat | vel:amt:customer:{id} |
| previousBlockCount30d | counter | 30 gun | vel:prior:customer:{id} |
| previousReviewCount7d | counter | 7 gun | vel:prior:customer:{id} |

### Device

| Feature | Tip | Pencere | DSL Kullanimi | Runtime Uretim | Redis Key Suffix |
|---|---|---|---|---|---|
| txCount1h | counter | 1 saat | stateful.device.txCount1h | ✅ velocity-service | vel:tx:device:{id} |
| uniqueIps24h | HLL | 24 saat | stateful.device.uniqueIps24h | ✅ velocity-service | vel:uip:device:{id} |
| distinctAccounts24h | HLL | 24 saat | — (DSL'de yok) | ✅ velocity-service | vel:uacc:device:{id} |
| distinctAccounts7d | HLL | 7 gun | — (DSL'de yok) | ✅ velocity-service | vel:uacc:device:{id} |

### IP

| Feature | Tip | Pencere | DSL Kullanimi | Runtime Uretim | Redis Key Suffix |
|---|---|---|---|---|---|
| txCount1h | counter | 1 saat | stateful.ip.txCount1h | ✅ velocity-service | vel:tx:ip:{id} |
| signupCount10m | counter | 10 dakika | — | ❌ henuz uretilmiyor | vel:signup:ip:{id} |
| paymentCount1h | counter | 1 saat | — | ❌ henuz uretilmiyor | vel:pay:ip:{id} |
| failedLogins30m | counter | 30 dakika | — | ❌ henuz uretilmiyor | vel:fail:ip:{id} |
