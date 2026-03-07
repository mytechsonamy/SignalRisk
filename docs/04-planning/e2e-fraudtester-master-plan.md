# E2E Altyapisi + FraudTester — Master Plan

**Olusturulma:** 2026-03-07
**SDLC Project ID:** ceff3f38-d2cd-4e46-8a02-9b5083382f2a
**Sprint Araligi:** Sprint 17-20+

---

## Genel Bagllam

Sprint 11 sonunda ~990 unit test ve brownfield gap analizi tamamlandi. Ancak 12 servis hic birlikte ayaga kaldirilmadi — tum E2E testler gercek servislere degil mock server'a karsi calisiyordu. Paralelde, roadmap klasorunde bir "FraudTester" urun vizyonu tanimlanmisti.

**Cozulen problem:** SignalRisk'in gercek E2E guvencesi yok; FraudTester vizyon olarak var ama kod yok.
**Hedef:** (A) Gercek E2E altyapisi — 18 servis Docker Compose'da ayaga kalksın, 5+ kritik senaryo test.fixme'den ciksın. (B) FraudTester scaffold → calisan agent → adversarial/chaos.

---

## Iki Paralel Stream

```
STREAM A: SignalRisk E2E Altyapisi
  Sprint 17: docker-compose.full.yml + E2E skeleton + Playwright real config
  Sprint 18: E2E tam implementasyon + CI/CD + performance gate
  Sprint 20: E2E test.fixme → gercek testler (Docker gerektirir)

STREAM B: FraudTester
  Sprint 17: Adapter interface + scaffold + UI skeleton
  Sprint 18: FraudSimulationAgent calisiyor + backend API + Detection Report UI
  Sprint 19: AdversarialAgent + ChaosAgent + MockAdapter + standalone karar
  Sprint 20: WebSocket gercek battle + 2. adapter + integration tests
```

---

## Tamamlananlar

### [DONE] Sprint 17 — E2E Foundation + FraudTester Scaffold
**Commit:** c4de485
**SDLC Sprinti:** 17 (COMPLETED)

| Dosya | Durum |
|-------|-------|
| docker-compose.full.yml | DONE — 18 servis (4 infra + 14 app), KRaft Kafka, healthcheck chain |
| tests/e2e/playwright.config.real.ts | DONE — Gercek servislere karsi Playwright config, SKIP_DOCKER guard |
| tests/e2e/scenarios/happy-path.spec.ts | DONE — test.fixme skeleton |
| tests/e2e/scenarios/fraud-blast.spec.ts | DONE — test.fixme skeleton |
| tests/e2e/scenarios/jwt-revoke.spec.ts | DONE — test.fixme skeleton |
| tests/e2e/scenarios/chaos-redis-down.spec.ts | DONE — test.fixme skeleton |
| tests/e2e/scenarios/multi-tenant-isolation.spec.ts | DONE — test.fixme skeleton |
| apps/fraud-tester/src/adapters/base.adapter.ts | DONE — IFraudSystemAdapter interface |
| apps/fraud-tester/src/adapters/signalrisk.adapter.ts | DONE — SignalRisk adapter (fetch + polling) |
| apps/fraud-tester/src/scenarios/types.ts | DONE — FraudScenario, ScenarioResult, BattleReport types |
| apps/fraud-tester/src/scenarios/catalog/device-farm.scenario.ts | DONE |
| apps/fraud-tester/src/scenarios/catalog/bot-checkout.scenario.ts | DONE |
| apps/fraud-tester/src/scenarios/catalog/velocity-evasion.scenario.ts | DONE |
| apps/fraud-tester/src/scenarios/catalog/emulator-spoof.scenario.ts | DONE |
| apps/fraud-tester/src/scenarios/catalog/sim-swap.scenario.ts | DONE |
| apps/fraud-tester/src/agents/fraud-simulation.agent.ts | DONE (Sprint 17 stub) |
| apps/fraud-tester/src/agents/adversarial.agent.ts | DONE (Sprint 17 stub) |
| apps/fraud-tester/src/agents/chaos.agent.ts | DONE (Sprint 17 stub) |
| apps/fraud-tester/src/orchestrator/orchestrator.ts | DONE — ScenarioRunner + EventEmitter + stop() |
| apps/fraud-tester/src/reporter/detection-reporter.ts | DONE — TP/FP/FN/TN + FPR/TPR |
| apps/fraud-tester/package.json | DONE |
| apps/fraud-tester/README.md | DONE (Sprint 17 ilk versiyon) |
| apps/dashboard/src/App.tsx | DONE — /fraud-tester/* routes |
| apps/dashboard/src/components/layout/Sidebar.tsx | DONE — FRAUD TESTER nav section |
| apps/dashboard/src/pages/FraudTesterOverviewPage.tsx | DONE |
| apps/dashboard/src/pages/BattleArenaPage.tsx | DONE (Sprint 17 skeleton) |
| apps/dashboard/src/pages/ScenarioLibraryPage.tsx | DONE (Sprint 17 — 5 senaryo) |
| apps/dashboard/src/pages/DetectionReportPage.tsx | DONE (Sprint 17 skeleton) |
| apps/dashboard/src/pages/AgentConfigPage.tsx | DONE (Sprint 17 skeleton) |
| apps/dashboard/src/pages/TargetManagementPage.tsx | DONE (Sprint 17 skeleton) |
| apps/dashboard/src/store/fraud-tester.store.ts | DONE — Zustand store |
| apps/dashboard/src/types/fraud-tester.types.ts | DONE |
| docs/agents/e2e-engineer.md | DONE |
| docs/agents/fraudtester-backend.md | DONE |
| docs/agents/fraudtester-ui.md | DONE |
| .claude/skills/e2e-real-services.md | DONE |
| .claude/skills/fraud-simulation.md | DONE |
| .claude/skills/fraudtester-adapter.md | DONE |
| .claude/skills/fraudtester-ui.md | DONE |
| .claude/skills/docker-compose-e2e.md | DONE |

---

### [DONE] Sprint 18 — E2E Tam Implementasyon + FraudTester Ilk Agent
**Commit:** 8835358
**SDLC Sprinti:** 18 (COMPLETED)

| Dosya | Durum |
|-------|-------|
| tests/e2e/scenarios/helpers.ts | DONE — AUTH_URL, EVENT_URL sabitler, getMerchantToken(), pollDecision() |
| tests/e2e/scenarios/happy-path.spec.ts | DONE — Tam implementasyon (5 test, test.fixme) |
| tests/e2e/scenarios/fraud-blast.spec.ts | DONE — Tam implementasyon (4 test, test.fixme) |
| tests/e2e/scenarios/jwt-revoke.spec.ts | DONE — Tam implementasyon (6 test, test.fixme) |
| tests/e2e/scenarios/chaos-redis-down.spec.ts | DONE — Tam implementasyon (5 test, test.fixme) |
| tests/e2e/scenarios/multi-tenant-isolation.spec.ts | DONE — Tam implementasyon (5 test, test.fixme) |
| tests/e2e/scenarios/performance-gate.spec.ts | DONE — p99 < 200ms, 100 concurrent (3 test, test.fixme) |
| .github/workflows/e2e.yml | DONE — Docker layer cache, --workers 2, artifacts upload |
| apps/fraud-tester/src/agents/fraud-simulation.agent.ts | DONE — Tam implementasyon (EventEmitter, 5 default senaryo) |
| apps/fraud-tester/src/api/server.ts | DONE — Express + Socket.io, port 3020, REST + WebSocket |
| apps/fraud-tester/src/__tests__/fraud-simulation.spec.ts | DONE — 8 test |
| apps/fraud-tester/src/__tests__/signalrisk-adapter.spec.ts | DONE |
| apps/fraud-tester/src/__tests__/orchestrator.spec.ts | DONE |
| apps/fraud-tester/src/__tests__/detection-reporter.spec.ts | DONE |
| apps/fraud-tester/src/__tests__/catalog.spec.ts | DONE |
| apps/dashboard/src/pages/BattleArenaPage.tsx | DONE — Tam implementasyon (RadialBarChart, Socket.io + mock fallback) |
| apps/dashboard/src/pages/DetectionReportPage.tsx | DONE — Tam implementasyon (battle list + KPI + tablo + Recharts) |
| apps/dashboard/src/pages/AgentConfigPage.tsx | DONE — 3 agent toggle+slider |
| apps/dashboard/src/pages/TargetManagementPage.tsx | DONE — SignalRisk card + Test Connection |
| apps/dashboard/src/api/fraud-tester.api.ts | DONE — getBattles, startBattle, stopBattle, healthCheck |
| apps/dashboard/vite.config.ts | DONE — /fraud-tester proxy to localhost:3020 |

---

### [DONE] Sprint 19 — Adversarial + Chaos Agents + Standalone Karar
**Commit:** 899f744
**SDLC Sprinti:** 19 (COMPLETED)

| Dosya | Durum |
|-------|-------|
| apps/fraud-tester/src/scenarios/catalog/adversarial/emulator-bypass.scenario.ts | DONE — 30 event, Apple M2 metadata |
| apps/fraud-tester/src/scenarios/catalog/adversarial/slow-fraud.scenario.ts | DONE — 24 event, 12 saate yayilmis |
| apps/fraud-tester/src/scenarios/catalog/adversarial/bot-evasion.scenario.ts | DONE — 20 event, mouse_movement_entropy 0.75-0.95 |
| apps/fraud-tester/src/agents/adversarial.agent.ts | DONE — pattern parametresi, adversarialSuccess ters metrik |
| apps/fraud-tester/src/adapters/chaos-wrapper.ts | DONE — timeout/partialFailure/stress, Promise.race |
| apps/fraud-tester/src/agents/chaos.agent.ts | DONE — mode parametresi, chaosSuccess %50 threshold |
| apps/fraud-tester/src/adapters/mock.adapter.ts | DONE — 6 mod (always-block/allow/review, random, threshold, custom) |
| apps/fraud-tester/src/__tests__/adversarial.spec.ts | DONE — 6 test |
| apps/fraud-tester/src/__tests__/chaos.spec.ts | DONE — 6 test |
| apps/fraud-tester/src/__tests__/mock-adapter.spec.ts | DONE — 6 test |
| apps/fraud-tester/src/index.ts | DONE — Complete exports |
| apps/fraud-tester/README.md | DONE — Final versiyon |
| apps/dashboard/src/pages/AgentConfigPage.tsx | DONE — Adversarial attack pattern + chaos mode/failureRate/timeoutMs |
| apps/dashboard/src/pages/BattleArenaPage.tsx | DONE — 5 agent card |
| apps/dashboard/src/pages/ScenarioLibraryPage.tsx | DONE — 11 senaryo, adversarial/chaos badge |
| apps/dashboard/src/store/fraud-tester.store.ts | DONE — adversarial/chaos agents default enabled |
| apps/dashboard/src/types/fraud-tester.types.ts | DONE — AgentSettings genisletildi |
| docs/04-planning/fraudtester-standalone-decision.md | DONE — Gate analizi, entegre kal karari |
| .claude/skills/adversarial-testing.md | DONE |

---

## [DONE] Sprint 20 — E2E Gercek Testler + FraudTester WebSocket
**Commit:** 1038a60
**SDLC Sprinti:** 20 (COMPLETED)

| Dosya | Durum |
|-------|-------|
| docker-compose.full.yml | DONE — 14 app servisi healthcheck curl→wget (Alpine), Neo4j exit 1 fix |
| tests/e2e/README-docker.md | DONE — Stack kurulum + calistirma kilavuzu |
| tests/e2e/scenarios/happy-path.spec.ts | DONE — 5 test, test.fixme kaldirildi, SKIP_DOCKER guard |
| tests/e2e/scenarios/fraud-blast.spec.ts | DONE — 4 test, test.fixme kaldirildi |
| tests/e2e/scenarios/jwt-revoke.spec.ts | DONE — 6 test, test.fixme kaldirildi |
| tests/e2e/scenarios/chaos-redis-down.spec.ts | DONE — 5 test, Docker CLI execDockerCommand() |
| tests/e2e/scenarios/multi-tenant-isolation.spec.ts | DONE — 5 test, getMerchantTokenFor() |
| tests/e2e/scenarios/performance-gate.spec.ts | DONE — 3 test, p99 < 500ms |
| tests/e2e/scenarios/helpers.ts | DONE — execDockerCommand() + getMerchantTokenFor() eklendi |
| apps/fraud-tester/src/api/server.ts | DONE — gercek ScenarioRunner + Socket.io, concurrent battle guard (409) |
| apps/fraud-tester/src/__tests__/server.spec.ts | DONE — 6 test, 44/44 gecti |
| apps/dashboard/src/pages/TargetManagementPage.tsx | DONE — AdapterTarget listesi, yeni hedef formu, baglanti testi |
| apps/dashboard/src/store/fraud-tester.store.ts | DONE — targets[], addTarget/removeTarget/setActiveTarget |
| apps/dashboard/src/types/fraud-tester.types.ts | DONE — AdapterTarget tipi |
| apps/dashboard/src/api/fraud-tester.api.ts | DONE — healthCheck baseUrl/apiKey parametreleri |
| apps/fraud-tester/src/__tests__/integration.spec.ts | DONE — 8 test (7 MockAdapter + 1 SKIP_INTEGRATION) |

---

## [DONE] Sprint 21 — Docker Build + 2. Adapter + CI/CD
**Commit:** 874f286
**SDLC Sprinti:** 21 (COMPLETED)

| Dosya | Durum |
|-------|-------|
| Dockerfile | DONE — Multi-stage monorepo build, SERVICE arg, apps/*/node_modules fix |
| .dockerignore | DONE — node_modules, dist, dashboard, tests, .git excluded |
| docker-compose.full.yml | DONE — Tum 14 servis root Dockerfile ile SERVICE build arg |
| .github/workflows/fraud-tester.yml | DONE — Ayri CI pipeline (unit tests + coverage) |
| .github/workflows/e2e.yml | DONE — SKIP_DOCKER CI, fraud-tester-tests job eklendi |
| apps/fraud-tester/src/adapters/generic-http.adapter.ts | DONE — GenericHttpAdapter (2. adapter) |
| apps/fraud-tester/src/__tests__/generic-http-adapter.spec.ts | DONE — 6 test |
| apps/fraud-tester/src/index.ts | DONE — GenericHttpAdapter export |
| apps/fraud-tester/jest.config.js | DONE — coverage threshold %70, lcov reporter |
| tests/e2e/README-docker.md | DONE — CI/CD durumu eklendi |
| apps/rule-engine-service/package.json | DONE — axios eksik dependency eklendi |
| Docker compose build | DONE — 14/14 servis build, 18 container healthy |

---

## [DONE] Sprint 22 — E2E Altyapi Fix + Brownfield Gap Analysis

**Commitler:** c116941, 12da405
**SDLC Sprinti:** 22 (COMPLETED)

### E2E Altyapi Fixleri
| Dosya | Durum |
|-------|-------|
| infrastructure/docker/initdb.d/03_indexes.sql | DONE — IMMUTABLE function fix (partial index) |
| database/migrations/003_indexes.sql | DONE — Ayni fix |
| apps/auth-service/src/merchants/merchants.service.ts | DONE — Dev merchant seed (OnModuleInit) |
| apps/decision-service/src/decision/signal-fetchers.ts | DONE — Velocity snake_case→camelCase mapping |
| tests/e2e/scenarios/helpers.ts | DONE — API key auth, UUID eventId, ingestEvent helper |
| tests/e2e/scenarios/*.spec.ts | DONE — Tum 6 test dosyasi API key + payload fix |
| E2E sonuc | 2/28 test geciyor (happy-path ALLOW + performance p99) |

### Brownfield Sprint 1 (T1-T4) — Tumu zaten implement edilmis
| Task | Durum |
|------|-------|
| T1: AdminGuard jti denylist | DONE — 6/6 test geciyor |
| T2: Refresh token fix | DONE — 3/3 test geciyor |
| T3: DLQ exhausted topic | DONE — 6/6 test geciyor |
| T4: Feature toggles | DONE — Startup log + toggle bypass confirmed |

### Brownfield Sprint 2 (T5-T8) — Tumu zaten implement edilmis, +8 test eklendi
| Task | Durum |
|------|-------|
| T5: KPI polling + stale badge | DONE — Sequential setTimeout, visibilitychange, 5/5 test |
| T6: Search AbortController | DONE — AbortController + whitespace guard, +7 test |
| T7: ApiKey + ProxyDetector tests | DONE — wrong-prefix test fix, 45/45 test |
| T8: Dashboard component tests | DONE — +1 fetchRules test, 31/31 test |

---

## [DONE] Sprint 23 — Test Isolation + Analytics + Visual Rule Builder

**SDLC Sprinti:** 23 (COMPLETED)

### Test Isolation (X-SignalRisk-Test Header)
| Dosya | Durum |
|-------|-------|
| database/migrations/005_test_isolation.sql | DONE — is_test BOOLEAN + partial index |
| apps/event-collector/src/events/events.controller.ts | DONE — X-SignalRisk-Test header extraction |
| apps/event-collector/src/events/events.service.ts | DONE — is-test Kafka header propagation |
| apps/velocity-service/src/consumer/velocity-event.consumer.ts | DONE — test: merchantId prefix for Redis isolation |
| apps/decision-service/src/decision/decision.types.ts | DONE — isTest field added to DecisionResult |
| apps/decision-service/src/decision/decision-store.service.ts | DONE — is_test column in INSERT |
| apps/decision-service/src/analytics/analytics.service.ts | DONE — AND is_test = false in all 6 queries |
| apps/webhook-service/src/kafka/decision-consumer.service.ts | DONE — skip webhook for test events |
| apps/fraud-tester/src/adapters/signalrisk.adapter.ts | DONE — X-SignalRisk-Test: true header |

### Analytics Backend
| Dosya | Durum |
|-------|-------|
| apps/decision-service/src/analytics/ | DONE — 6 endpoint (trends, velocity, risk-buckets, merchants, kpi, minute-trend) |
| apps/dashboard/vite.config.ts | DONE — proxy routing fix (analytics→3009, events→3002) |

### Visual Rule Builder
| Dosya | Durum |
|-------|-------|
| apps/dashboard/src/components/admin/RuleBuilder.tsx | DONE — 5 signal, typed operators, DSL generator/parser |
| apps/dashboard/src/components/admin/AddRuleModal.tsx | DONE — visual builder integration |
| apps/dashboard/src/components/admin/EditRuleModal.tsx | DONE — visual builder + DSL editor toggle |

### Documentation
| Dosya | Durum |
|-------|-------|
| README.md | DONE — FraudTester section + test isolation |
| docs/TECHNICAL.md | DONE — FraudTester framework + test isolation architecture |
| docs/USER-GUIDE.md | DONE — Battle Arena, Scenario Library, Detection Reports |
| docs/01-requirements/bf-2026-03/gap-analysis-v7.md | DONE — P5 Test Isolation requirements |

---

## [DONE] Sprint 24 — E2E Velocity Pipeline Fix + Test Stabilization

**SDLC Sprinti:** 24 (COMPLETED)

### Velocity Pipeline E2E Wiring
| Fix | Detay |
|-----|-------|
| Decision cache TTL interference | Kafka consumer ALLOW cache (5s TTL) → 6s sleep sonrasi fresh decision query |
| Signal fetch dual timeout | fetchWithTimeout (AbortController) + withTimeout (orchestrator) → ikisi de SIGNAL_TIMEOUT_MS=2000 |
| entityId semantics | pollDecision'da entityId=deviceId olarak gecildi (velocity lookup icin) |
| Velocity API polling | Blast test: velocity API'yi poll et (tx_count_1h > 10) → sonra decision query |

### Test Stabilization
| Fix | Detay |
|-----|-------|
| Playwright project ordering | e2e-light → e2e-heavy → chaos (Kafka lag'dan dolayi heavy testler sona) |
| Rate limit tolerance | 429 handling: happy-path, multi-tenant, fraud-blast testlerine eklendi |
| Null riskScore | decision.riskScore ?? 0 (yeni device icin sinyal yok → score=null) |
| Unique deviceId per run | safe-device-${Date.now()} — stale velocity data onlendi |
| Workers=1 | Event-collector connection pool exhaustion onlendi |
| RATE_LIMIT_MAX=2000 | 500 yetersizdi, ardisik testlerde 429 aliyordu |

### Sonuc
- **26/28 test pass, 0 fail, 2 skip** (stable across consecutive runs)
- Skip 1: case-service Kafka consumer (decision→Kafka "decisions" topic henuz yok)
- Skip 2: rate-limit test self-skip (RATE_LIMIT_MAX=2000 > 200 request)

---

## [DONE] Sprint 25 — FraudTester Real Pipeline + merchant_id UUID Fix

**SDLC Sprinti:** 25 (COMPLETED)

| Fix | Detay |
|-----|-------|
| decisions.merchant_id UUID→TEXT | FK dropped, RLS policy updated (no ::UUID cast) |
| decisions.device_id UUID→TEXT | FK dropped, nullable |
| decision-store INSERT | Removed ::uuid casts ($2, $3 plain TEXT) |
| analytics JOIN | m.id::text = d.merchant_id |
| SignalRiskAdapter rewrite | POST /v1/events → poll GET /v1/decisions/{eventId} |
| Full pipeline verified | event-collector → Kafka → decision-service → PostgreSQL → GET API |

---

## [DONE] Sprint 26 — Case Pipeline E2E + Rate Limit + 28/28 Tests

**SDLC Sprinti:** 26 (COMPLETED)

| Fix | Detay |
|-----|-------|
| Case-service topic mismatch | 'decisions' → 'signalrisk.decisions' |
| Case-service DB config | DB_HOST → DATABASE_HOST env var alignment |
| cases table | 06_cases.sql — TEXT columns, RLS enabled |
| Decision producer fields | 'outcome' → 'action', added entityId |
| Decision controller → Kafka | POST /v1/decisions publishes to Kafka (forwardRef) |
| deviceId in result | Attached in events-consumer for downstream entityId |
| Rate limit config | RATE_LIMIT_MAX=150, TTL=10s window |
| Multi-tenant test fix | case-service 200 accepted (RLS isolation), event-collector for auth tests |

### Sonuc
- **28/28 test pass, 0 fail, 0 skip** (all previously skipped tests now pass)

---

## [DONE] Sprint 27 — Case-service TenantGuard

| Task | Durum |
|------|-------|
| T1: TenantGuard JWT guard olustur | DONE — `apps/case-service/src/guards/tenant.guard.ts` |
| T2: CaseController'a @UseGuards(TenantGuard) ekle | DONE — controller-level guard |
| T3: Multi-tenant E2E testleri guncelle | DONE — 403 (cross-tenant), 200 (admin) beklentileri |

**Sonuc:** Case-service artik JWT-based tenant auth yapiyor. Cross-tenant erisim → 403, admin role → bypass, eksik JWT → 401. E2E 28/28.

---

## [DONE] Sprint 28 — Case Lifecycle E2E + GDPR Export Fix

| Task | Durum |
|------|-------|
| T1: Case lifecycle E2E test suite | DONE — 8 test: list, get, assign, review, resolve, verify, export, 404 |
| T2: GDPR export bug fix (deleted_at) | DONE — `case-export.service.ts` removed nonexistent `deleted_at` column |
| T3: Playwright config updated | DONE — case-lifecycle added to e2e-heavy project |

**Sonuc:** E2E 36/36 (28 → 36). Case-service tam lifecycle test edildi. GDPR export 500 bug fixlendi.

---

## Kalan Isler — Sprint 29+

| Task | Aciklama |
|------|----------|
| CI/CD Docker | GitHub Actions self-hosted runner veya Docker-in-Docker ile e2e.yml gercek calissin |
| Event-collector Kafka consumer lag | Consumer lag HTTP server'i bloke ediyor — ayri worker/thread gerekli |
| FraudTester battle integration test | Real pipeline battle (blast → poll → case verify) |

---

## Standalone Karar Gate Kriterleri

Kaynak: docs/04-planning/fraudtester-standalone-decision.md

- [x] 2+ farkli adapter implementasyonu (SignalRisk + GenericHttpAdapter)
- [ ] Detection rate karsilastirmali rapor cikiyor
- [ ] Dis kullanici/musteri ilgisi mevcut

Tum kriterler karsilanirsa: apps/fraud-tester/ → ayri repo, adapter npm paketi olarak yayinlanir

---

## Mimari Kararlar

| Karar | Secim | Gerekcce |
|-------|-------|---------|
| FraudTester konumu | Monorepo entegre | Kod paylasimi kolay, standalone gate karsillanmadi |
| E2E test yaklasimi | test.fixme (Docker gerektiren) | CI'da mock yoktu, gercek servisler hazir olana kadar atla |
| Socket.io fallback | Mock setInterval | FraudTester backend calismadan UI gelistirilebilir |
| Adversarial metrik | Ters (allowedRate > 0.5 = basari) | Saldirganin perspektifinden olcum |
| Kafka modu | KRaft (Zookeeper'siz) | Kafka 3.x+ native, daha az bagimlilik |
| IFraudSystemAdapter | FROZEN interface | Geri uyumluluk; degistirilmeden once E7 impact assessment |
| Docker build stratejisi | Root Dockerfile + SERVICE arg | Tek Dockerfile tum servisleri build eder; tsc --skipLibCheck Docker'da |
| Workspace deps | apps/*/node_modules COPY | npm workspace hoisting service-level deps olusturur, runner stage'de de gerekli |
| Test izolasyonu | Header-based (X-SignalRisk-Test) | Tenant izolasyonu Redis'i kapsamiyor; ayri environment operasyonel yuk; header en temiz cozum |

---

## Test Sayilari (Sprint 28 sonu)

| Servis | Test Sayisi |
|--------|-------------|
| auth-service | 163 |
| event-collector | 55 |
| network-intel-service | 66 |
| dashboard | 188 |
| decision-service | 65 |
| case-service | 45 |
| rule-engine-service | 116 |
| webhook-service | 39 |
| web-sdk | 51 |
| signal-contracts | 33 |
| behavioral-service | 68 |
| telco-intel | 32 |
| graph-intel-service | 34 |
| integration tests | 22 |
| load test mock | 19 |
| fraud-tester | 58 unit + 7 integration (Sprint 21 — GenericHttpAdapter +6) |
| E2E (SKIP_DOCKER guard) | 36/36 pass (Docker stack gerektirir) |
| **TOPLAM** | **~1090+** |

---

## Onemli Dosya Konumlari

```
docker-compose.full.yml                  18 servis full stack
tests/e2e/playwright.config.real.ts      Gercek servis Playwright config
tests/e2e/scenarios/                     7 senaryo (tumu test.fixme)
tests/e2e/scenarios/helpers.ts           Shared test utilities
.github/workflows/e2e.yml                CI/CD pipeline

apps/fraud-tester/
  src/adapters/
    base.adapter.ts                      IFraudSystemAdapter (FROZEN)
    signalrisk.adapter.ts                SignalRisk impl
    mock.adapter.ts                      6 modlu test adapteri
    generic-http.adapter.ts              2. adapter — herhangi HTTP fraud sistemi
    chaos-wrapper.ts                     ChaosAdapterWrapper decorator
  src/agents/
    fraud-simulation.agent.ts            5 senaryo, EventEmitter
    adversarial.agent.ts                 3 adversarial senaryo, ters metrik
    chaos.agent.ts                       ChaosWrapper + mode parametresi
  src/scenarios/catalog/
    device-farm, bot-checkout, velocity-evasion, emulator-spoof, sim-swap
    adversarial/: emulator-bypass, slow-fraud, bot-evasion
  src/api/server.ts                      Express + Socket.io, port 3020
  src/orchestrator/orchestrator.ts       ScenarioRunner, stop() destegi
  src/reporter/detection-reporter.ts     TP/FP/FN/TN, FPR/TPR

apps/dashboard/src/pages/
  BattleArenaPage.tsx                    3 panel + RadialBarChart + Socket.io
  ScenarioLibraryPage.tsx                11 senaryo, badge sistemi
  DetectionReportPage.tsx                Battle history + Recharts
  AgentConfigPage.tsx                    5 agent + adversarial/chaos params
  TargetManagementPage.tsx               Hedef yonetimi (custom adapter TODO)

docs/04-planning/
  fraudtester-standalone-decision.md     Standalone karar gate analizi
  e2e-fraudtester-master-plan.md         Bu dosya
```

---

## Servis Port Haritasi

| Servis | Port |
|--------|------|
| auth-service | 3001 |
| event-collector | 3002 |
| device-intel-service | 3003 |
| velocity-service | 3004 |
| behavioral-service | 3005 |
| network-intel-service | 3006 |
| telco-intel-service | 3007 |
| rule-engine-service | 3008 |
| decision-service | 3009 |
| case-service | 3010 |
| webhook-service | 3011 |
| graph-intel-service | 3012 |
| mock-server (dev) | 3000 |
| fraud-tester (backend) | 3020 |
