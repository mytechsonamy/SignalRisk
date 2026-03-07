SignalRisk E2E + FraudTester — Master Plan                                                                                                                                                                                                                      
                                                                                                                                                                                                                                                               
 Context

 Sprint 11 sonunda ~990 unit test ve brownfield gap analizi tamamlandı. Ancak 12 servis hiç birlikte ayağa kaldırılmadı — Playwright E2E ve k6 load testleri gerçek servislere değil mock server'a karşı çalışıyor. Paralelde, Roadmap klasöründe 3 doküman (AI
 Test Framework Architecture, AI Test Agent Strategy, Consolidated Architecture) bir "FraudTester" ürün vizyonunu ortaya koyuyor.

 Çözülen problem: SignalRisk'in gerçek E2E güvencesi yok; FraudTester vizyon olarak var ama kod yok.

 Hedef: (A) Gerçek E2E altyapısını kur — 12 servis Docker Compose'da ayağa kalksın, 5 kritik senaryo geçsin. (B) FraudTester'ı paralelde scaffold et — mimari olarak ayrılmış ama şimdilik aynı monorepo'da.

 ---
 Paralel Strateji — İki Stream, Bir Kesişim

 Sprint 12                    Sprint 13                    Sprint 14
 ──────────────────────────────────────────────────────────────────

 STREAM A: SignalRisk E2E
 ┌─────────────────────┐    ┌─────────────────────┐
 │ Docker Compose Full │    │ 5 E2E Senaryo Yeşil │
 │ Stack (12 servis)   │───►│ CI/CD Entegrasyon   │
 │ Health checks       │    │ Chaos tests         │
 └─────────────────────┘    └─────────────────────┘

 STREAM B: FraudTester                                 ┌──────────────┐
 ┌─────────────────────┐    ┌─────────────────────┐   │ Battle Arena │
 │ Scaffold + Adapter  │    │ İlk Çalışan Agent   │──►│ UI Complete  │
 │ Interface + UI      │───►│ Fraud Senaryo Lib.  │   │ Standalone   │
 │ Skeleton Pages      │    │ Detection Raporlama │   │ Karar Noktası│
 └─────────────────────┘    └─────────────────────┘   └──────────────┘
         │                          │
         └──────────────────────────┘
         Kesişim: Fraud Senaryo Kütüphanesi
         (E2E testlerini ve FraudTester'ı besler)

 ---
 Yeni Skill Dosyaları (docs/skills/)

 Sprint'lere başlamadan önce 5 skill.md üretilecek:

 1. docs/skills/e2e-real-services.md

 - Docker Compose full stack orchestration (depends_on, healthcheck, wait-for)
 - Playwright test konfigürasyonu gerçek servislere karşı (baseURL, auth flow)
 - TestContainers ile servis başlatma alternatifi
 - Servis teardown sonrası database sıfırlama pattern'ı
 - Flaky test önleme: retry + poll-wait yerine event-driven assertions

 2. docs/skills/fraud-simulation.md

 - Synthetic fraud pattern library (device farm, bot checkout, SIM swap, velocity evasion, emulator spoof)
 - Deterministik fraud üretimi: seed-based random, tekrarlanabilir sonuçlar
 - FPR/TPR ölçüm metodolojisi (Wilson score CI, N minimum gereksinimleri)
 - Fraud senaryo DSL: senaryo tanımlama, parametre şeması, beklenti spec'leri
 - Adversarial pattern: yavaş fraud (12h spread), cross-device fraud ring

 3. docs/skills/fraudtester-adapter.md

 - Adapter interface tasarımı (IFraudSystemAdapter)
 - SignalRisk adapter implementasyonu (API key, endpoint mapping)
 - Generic adapter extension: yeni sisteme bağlama kılavuzu
 - Request/response normalization (farklı fraud sistemleri → ortak format)
 - Circuit breaker: hedef sistem yanıt vermezse test graceful exit

 4. docs/skills/fraudtester-ui.md

 - Battle Arena sayfa mimarisi (real-time feed + detection gauge + trend chart)
 - Scenario Library sayfa pattern'ı (filterable card grid + side config panel)
 - Detection Report visualization (FPR/TPR gauge, latency histogram, run comparison)
 - Mevcut design tokens kullanımı: risk renkleri, chart series, typography
 - Gerçek zamanlı güncelleme: Socket.io vs polling karar ağacı
 - Accessibility: attack/defense state'leri renk + ikon + metin üçlüsüyle

 5. docs/skills/docker-compose-e2e.md

 - 12 servis + 4 infra (Kafka, Redis, PostgreSQL, Neo4j) compose dosyası
 - Sağlık kontrolleri: her servis için healthcheck + condition: service_healthy
 - Startup ordering: infra → auth-service → event-collector → diğerleri
 - Test database fixtures: her test run öncesi seed data
 - CI/CD entegrasyon: GitHub Actions'ta docker compose up --wait pattern'ı

 ---
 Yeni Agent Tanımları (docs/agents/)

 6. docs/agents/e2e-engineer.md

 E2E Test Engineer Agent
 - Model: claude-sonnet-4-6
 - Sorumluluk: Docker Compose full stack, Playwright E2E (gerçek servislere), k6 (gerçek servislere), CI/CD entegrasyon
 - Skill'ler: e2e-real-services.md, docker-compose-e2e.md
 - Kısıtlar: testler mock server'a yazılamaz; her test kendi izole DB state'inde başlar; test parallelism için worker isolation
 - Kabul kriterleri: docker compose up --wait 2 dakikada tamamlanmalı; 5 kritik senaryo %0 flakiness

 7. docs/agents/fraudtester-backend.md

 FraudTester Backend Engineer Agent
 - Model: claude-sonnet-4-6
 - Sorumluluk: apps/fraud-tester/ servisi — adapter interface, fraud senaryo library, agent runtime, detection reporting
 - Skill'ler: fraud-simulation.md, fraudtester-adapter.md
 - Kısıtlar: adapter interface değiştirilemez sonra geriye dönük uyumluluk bozulur; senaryo sonuçları deterministik + tekrarlanabilir olmalı; SignalRisk'e spesifik kod adapter katmanının dışına çıkamaz
 - Kabul kriterleri: FraudSimulationAgent çalışır, detection rate raporlanır, 80%+ test coverage

 8. docs/agents/fraudtester-ui.md

 FraudTester UI Engineer Agent
 - Model: claude-sonnet-4-6
 - Sorumluluk: FraudTester UI sayfaları (Battle Arena, Scenario Library, Detection Report, Agent Config, Target Management)
 - Skill'ler: fraudtester-ui.md, mevcut react-dashboard patterns
 - Tech: React 18, Tailwind CSS, Recharts, Zustand, socket.io-client
 - Kısıtlar: mevcut design tokens'tan sapılamaz; WCAG 2.1 AA zorunlu; her risk/detection state renk+ikon+metin üçlüsü
 - Strateji: FraudTester sayfaları mevcut dashboard'a entegre başlar (/fraud-tester/* routes), mimari sınırlar net tutulur

 ---
 Sprint 12 — "E2E Temeli + FraudTester Scaffold" (4 Agent × 2 Takım)

 Hedef: docker compose up ile tüm servisler ayağa kalkar; FraudTester skeleton commit'lendi
 Paralelizm: 8 bağımsız görev (2 ekip × 4 agent)

 ---
 TAKIM A — SignalRisk E2E Altyapısı

 T1 — Docker Compose Full Stack (4h) — E2E Engineer

 Yeni dosya: docker-compose.full.yml

 Tüm servisler + bağımlılıklar:
 services:
   postgres:
     image: postgres:16-alpine
     healthcheck: pg_isready -U signalrisk
   redis:
     image: redis:7-alpine
     healthcheck: redis-cli ping
   kafka + zookeeper: (docker-compose.kafka.yml'dan devşirilir)
   neo4j:
     image: neo4j:5-community
     healthcheck: wget -q neo4j:7474/browser
   auth-service:
     depends_on: { postgres: healthy, redis: healthy }
   event-collector:
     depends_on: { auth-service: healthy, kafka: healthy }
   # ... 10 diğer servis

 Done kriterleri:
 - docker compose -f docker-compose.full.yml up --wait 120s içinde tamamlanır
 - Tüm servislerin /health endpoint'leri 200 döner
 - PostgreSQL migrations otomatik çalışır

 T2 — E2E Senaryo Skeleton'ları (3h) — E2E Engineer

 Yeni dosyalar:
 - tests/e2e/scenarios/happy-path.spec.ts
 - tests/e2e/scenarios/fraud-blast.spec.ts
 - tests/e2e/scenarios/jwt-revoke.spec.ts
 - tests/e2e/scenarios/multi-tenant-isolation.spec.ts
 - tests/e2e/scenarios/chaos-redis-down.spec.ts

 Her senaryo: baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3002'
 Şimdilik test.todo() veya kısmi implementasyon — Sprint 13'te tamamlanacak

 T3 — Playwright Konfigürasyonu Gerçek Servise (2h) — E2E Engineer

 Değiştirilecek: tests/e2e/playwright.config.ts (veya oluşturulacak)

 export default defineConfig({
   testDir: './scenarios',  // yeni real-service senaryoları
   use: {
     baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3002',
   },
   webServer: {
     command: 'docker compose -f ../../docker-compose.full.yml up --wait',
     url: 'http://localhost:3001/health',
     timeout: 120_000,
     reuseExistingServer: !process.env.CI,
   },
 });

 T4 — Multi-Tenant Isolation E2E Test (2h) — Security Agent

 Yeni dosya: tests/e2e/scenarios/multi-tenant-isolation.spec.ts

 5 isolation test case:
 1. Merchant A JWT ile Merchant B case'leri → 403
 2. Merchant A API key ile Merchant B event gönderme → 401
 3. Decision query cross-merchant → boş sonuç (veri sızıntısı yok)
 4. Admin token ile tüm merchant'lar → 200 (admin hakları)
 5. Invalid tenant header → 400

 ---
 TAKIM B — FraudTester Foundation

 T5 — FraudTester Backend Scaffold (3h) — FraudTester Backend

 Yeni dizin: apps/fraud-tester/

 apps/fraud-tester/
   src/
     adapters/
       base.adapter.ts          ← IFraudSystemAdapter interface
       signalrisk.adapter.ts    ← SignalRisk implementasyonu
     agents/
       base.agent.ts            ← IFraudTestAgent interface
       fraud-simulation.agent.ts ← stub (Sprint 13'te dolar)
       adversarial.agent.ts     ← stub
       chaos.agent.ts           ← stub
     scenarios/
       types.ts                 ← FraudScenario, ScenarioResult, DetectionReport types
       catalog/
         device-farm.scenario.ts
         bot-checkout.scenario.ts
         velocity-evasion.scenario.ts
         emulator-spoof.scenario.ts
         sim-swap.scenario.ts
     orchestrator/
       orchestrator.ts          ← ScenarioRunner (sıralı, şimdilik sync)
     reporter/
       detection-reporter.ts    ← FPR/TPR hesaplama
   package.json
   README.md                    ← Ürün vizyonu + adapter geliştirme kılavuzu

 Core interface:
 interface IFraudSystemAdapter {
   name: string;
   submitEvent(event: FraudTestEvent): Promise<FraudDecision>;
   getDecision(eventId: string): Promise<FraudDecision>;
   reset(): Promise<void>;  // test run sonrası temizlik
 }

 interface FraudScenario {
   id: string;
   name: string;
   category: 'device' | 'velocity' | 'identity' | 'bot' | 'network';
   generate(): AsyncGenerator<FraudTestEvent>;
   expectedOutcome: { minRiskScore: number; decision: 'BLOCK' | 'REVIEW' };
 }

 Bundled tests (6 case):
 - Adapter interface type checking
 - SignalRisk adapter event mapping
 - ScenarioRunner senaryo sıralama
 - DetectionReporter FPR/TPR hesaplama
 - Catalog import (5 senaryo yüklenir)
 - README dokümentasyonu (link kontrolü)

 T6 — FraudTester UI Scaffold (3h) — FraudTester UI

 Entegrasyon stratejisi: Mevcut dashboard'a /fraud-tester/* routes eklenir

 apps/dashboard/src/App.tsx'e eklenecek routes:
 <Route path="/fraud-tester" element={<FraudTesterLayout />}>
   <Route index element={<FraudTesterOverviewPage />} />
   <Route path="battle-arena" element={<BattleArenaPage />} />
   <Route path="scenarios" element={<ScenarioLibraryPage />} />
   <Route path="reports" element={<DetectionReportPage />} />
   <Route path="agents" element={<AgentConfigPage />} />
   <Route path="targets" element={<TargetManagementPage />} />
 </Route>

 Sidebar'a eklenecek nav section:
 ── FRAUD TESTER ──
   Battle Arena    /fraud-tester/battle-arena
   Scenarios       /fraud-tester/scenarios
   Reports         /fraud-tester/reports
   Configuration   /fraud-tester/agents

 İlk skeleton sayfalar (placeholder içerik, sprint 13'te dolar):
 - FraudTesterOverviewPage.tsx — stat cards + "Start New Battle" CTA
 - BattleArenaPage.tsx — layout skeleton (3 panel: attack team, live feed, trend)
 - ScenarioLibraryPage.tsx — card grid skeleton

 T7 — Battle Arena UI Tasarımı (3h) — FraudTester UI

 BattleArenaPage tam implementasyonu:

 Layout (3 sütun):
 ┌──────────────────────────────────────────────────────────┐
 │  🎯 Battle Arena              [▶ Start Battle] [⏹ Stop]  │
 ├────────────┬───────────────────────────┬─────────────────┤
 │ ATTACK     │   DETECTION SCORE         │  CONFIGURATION  │
 │            │                           │                 │
 │ 🤖 Fraud   │  ████████████░░  72%      │  Target:        │
 │    Sim     │                           │  SignalRisk     │
 │            │  TPR: 89%  FPR: 1.2%      │  [Change]       │
 │ 🦠 Adversar│  Latency: 145ms avg       │                 │
 │    ial     │                           │  Duration:      │
 │            │  ─────────────────────    │  [5 min    ▼]   │
 │ ⚡ Velocity│   LIVE ATTACK FEED        │                 │
 │    Evasion │                           │  Intensity:     │
 │            │  ● Device Farm  BLOCK 0.94│  [Medium   ▼]   │
 │ 💤 Idle:   │  ● Emultr Spf   DETC 0.87│                 │
 │  SIM Swap  │  ● Slow Fraud   MISS 0.31 │  Scenarios:     │
 │  Bot Chkout│  ● Bot Checkout BLOCK 0.91│  ☑ Device Farm  │
 │            │  ● SIM Swap     DETC 0.78 │  ☑ Adversarial  │
 │            │                           │  ☑ Velocity     │
 │            │  TREND (last 5 battles)   │  ☐ SIM Swap     │
 │            │  [Recharts Line Chart]    │  ☐ Bot Checkout │
 └────────────┴───────────────────────────┴─────────────────┘

 Renk semantiği (mevcut design tokens):
 - BLOCKED/DETECTED: risk.critical (#E02424) + ⛔
 - MISSED: state.warning (#FACA15) + ⚠️
 - Gauge fill: brand.primary → risk.critical (gradient 0%→100%)

 Zustand store: fraud-tester.store.ts
 interface FraudTesterStore {
   battleStatus: 'idle' | 'running' | 'paused' | 'completed';
   detectionRate: number;  // 0-1
   tpr: number; fpr: number; avgLatency: number;
   liveFeed: AttackResult[];  // son 50 sonuç
   battleHistory: BattleReport[];
   startBattle(config: BattleConfig): void;
   stopBattle(): void;
 }

 Socket.io entegrasyonu: FraudTester backend'den battle:result event'leri dinlenir

 T8 — Scenario Library UI + Yeni Skill Dosyaları (2h) — FraudTester UI + Tech Writer

 ScenarioLibraryPage tam implementasyonu:
 ┌─────────────────────────────────────────────────────────┐
 │  📚 Scenario Library                    [+ New Scenario] │
 ├──────────────────────────────────────────────────────────┤
 │ [All] [Device] [Velocity] [Identity] [Bot] [Network]     │
 │ Sort: ▼ Detection Rate  Search: [_________________________]│
 ├──────────────────────────────────────────────────────────┤
 │  ┌───────────────────────────────────────────────────┐   │
 │  │ 🔴 Device Farm          Category: Device          │   │
 │  │ 100 accounts aynı fingerprint → risk>0.8, BLOCK   │   │
 │  │ Son çalıştırma: 2h önce  Algılama: ████████ 94%   │   │
 │  │ [▶ Çalıştır] [⚙ Yapılandır] [📊 Geçmiş]          │   │
 │  └───────────────────────────────────────────────────┘   │
 │  ┌───────────────────────────────────────────────────┐   │
 │  │ 🟡 Velocity Evasion     Category: Velocity        │   │
 │  │ 12 saate yayılmış tx → behavioral detection       │   │
 │  │ Son çalıştırma: 1g önce  Algılama: █████░░░ 67% ⚠ │   │
 │  │ [▶ Çalıştır] [⚙ Yapılandır] [📊 Geçmiş]          │   │
 │  └───────────────────────────────────────────────────┘   │
 └─────────────────────────────────────────────────────────┘

 Ayrıca bu task'ta 5 skill.md dosyası yazılır (T8 çıktısı = skill dosyaları).

 ---
 Sprint 13 — "E2E Yeşil + FraudTester İlk Agent" (4 Agent × 2 Takım)

 Ön koşul: Sprint 12 tamamlandı, Docker Compose ayakta, FraudTester scaffold hazır

 ---
 TAKIM A — E2E Çalışır Hale Getirme

 T9 — Happy Path + Fraud Blast E2E (3h) — E2E Engineer

 Değiştirilecek: tests/e2e/scenarios/happy-path.spec.ts, fraud-blast.spec.ts

 Happy Path:
 1. POST /v1/events — geçerli event
 2. Kafka consumer'ın işlemesini bekle (poll → decision topic)
 3. GET /v1/decisions/{id} → ALLOW
 4. Webhook teslimini doğrula (mock webhook receiver)

 Fraud Blast:
 1. Aynı device fingerprint'le 50 event gönder (paralel)
 2. Velocity counter Redis'te birikir
   ay. event → velocity rule tetiklenir → BLOCK
 4. GET /v1/cases → yeni case oluşturulmuş

 Done kriterleri: Her iki senaryo 0 flakiness ile 5/5 geçer

 T10 — JWT Revoke + Chaos E2E (3h) — Security + E2E Engineer

 Değiştirilecek: tests/e2e/scenarios/jwt-revoke.spec.ts, chaos-redis-down.spec.ts

 JWT Revoke:
 1. Login → token al
 2. POST /v1/auth/logout (jti Redis'e yazılır)
 3. Aynı token ile admin endpoint → 503 (Redis'te denylist sorgusu fail-closed)
 4. Redis'i sıfırla, token yine geçersiz olmalı (TTL expire beklenir)

 Chaos (Redis Down):
 1. Docker Compose'da Redis'i dur
 2. Admin endpoint → 503 {"error":"auth_unavailable"}
 3. Normal event ingestion → hala çalışmalı (Redis sadece admin auth için zorunlu)
 4. Redis'i başlat → 30s içinde recovery

 T11 — CI/CD Pipeline Entegrasyonu (2h) — DevOps/SRE

 Değiştirilecek: .github/workflows/ (yeni workflow dosyası)

 # .github/workflows/e2e.yml
 on: [push, pull_request]
 jobs:
   e2e:
     runs-on: ubuntu-latest
     steps:
       - docker compose -f docker-compose.full.yml up --wait
       - pnpm playwright test tests/e2e/scenarios/
       - docker compose down

 Cache stratejisi: Docker layer cache, npm dependencies cache
 Paralel test execution: --workers=4

 T12 — Performance Gate E2E (2h) — QA Agent

 Yeni dosya: tests/e2e/scenarios/performance-gate.spec.ts

 - 100 concurrent event → p99 < 200ms (Decision API latency)
 - 1000 event burst → p99 < 500ms
 - Velocity check → Redis p99 < 20ms
 - Rule evaluation → p99 < 5ms

 ---
 TAKIM B — FraudTester İlk Çalışan Agent

 T13 — FraudSimulationAgent Implementasyonu (4h) — FraudTester Backend

 Değiştirilecek: apps/fraud-tester/src/agents/fraud-simulation.agent.ts

 Device Farm senaryosu tam implementasyonu:
 class FraudSimulationAgent implements IFraudTestAgent {
   async run(scenario: FraudScenario, adapter: IFraudSystemAdapter): Promise<ScenarioResult> {
     const events = scenario.generate();
     const results: AttackResult[] = [];
     for await (const event of events) {
       const decision = await adapter.submitEvent(event);
       results.push({ event, decision, detected: this.evaluate(decision, scenario) });
     }
     return this.reporter.compute(results, scenario.expectedOutcome);
   }
 }

 Bundled tests (8 case):
 - Device farm: 100 event → algılama oranı hesaplanır
 - Velocity evasion: 24h'e yayılmış → timeout yönetimi (simüle edilmiş zaman)
 - Adapter mock: SignalRisk adapter stub ile
 - Kısmi algılama: %60 BLOCK → raporda "Partially Detected"
 - Sıfır algılama: %0 BLOCK → "Undetected" ⚠️  flag
 - Network hatası: adapter timeout → graceful exit
 - Deterministik: aynı seed → aynı sonuç
 - Reporter FPR/TPR: TP/FP/FN/TN sayımı doğruluğu

 T14 — Detection Report UI (3h) — FraudTester UI

 Yeni dosya: apps/dashboard/src/pages/DetectionReportPage.tsx

 ┌──────────────────────────────────────────────────────────┐
 │  📊 Detection Report                   [Export PDF]       │
 │  Battle #47 — 2026-03-07 14:23                           │
 ├──────────────────────────────────────────────────────────┤
 │  ÖZET                                                     │
 │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐ │
 │  │TPR: 89%  │ │FPR: 1.2% │ │Latency   │ │ Scenarios   │ │
 │  │↑3% prev  │ │↓0.3% prev│ │145ms avg │ │ 5/5 run     │ │
 │  └──────────┘ └──────────┘ └──────────┘ └─────────────┘ │
 ├──────────────────────────────────────────────────────────┤
 │  SENARYO DETAYI                                           │
 │  Senaryo          Algılama  Gizli Kalanlar  Ort. Latency │
 │  Device Farm      94%       3/50            112ms         │
 │  Velocity Evasion 67% ⚠     16/50           189ms         │
 │  Emulator Spoof   98%       1/50            98ms          │
 │  Bot Checkout     91%       5/55            134ms         │
 │  SIM Swap         88%       6/50            201ms         │
 ├──────────────────────────────────────────────────────────┤
 │  ÖNCEKI 5 BATTLE KARŞILAŞTIRMASI                         │
 │  [Recharts grouped bar + line overlay]                    │
 └──────────────────────────────────────────────────────────┘

 T15 — Agent Config + Target Management UI (2h) — FraudTester UI

 Yeni dosya: apps/dashboard/src/pages/AgentConfigPage.tsx, TargetManagementPage.tsx

 Agent Config:
 - Her agent için enable/disable toggle + parametre formu
 - "Intensity" slider (1-10): event üretim hızını kontrol eder
 - Schedule seçeneği (manual / hourly / daily)

 Target Management:
 - SignalRisk (pre-configured, default)
 - Custom adapter (URL + API key + endpoint mapping formu)
 - Bağlantı testi: "Test Connection" → latency + version

 T16 — FraudTester Integration Test Suite (2h) — QA + FraudTester Backend

 Yeni dosya: apps/fraud-tester/src/__tests__/integration.spec.ts

 SignalRisk adapter + gerçek Docker Compose servislerine karşı:
 - Device farm senaryosu → BLOCK oranı > %80
 - Emulator spoof senaryosu → detection > %90
 - Normal traffic → FPR < %5
 - Adapter error handling: service down → graceful failure

 ---
 Sprint 14 — "FraudTester Battle Arena + Standalone Karar" (4 Agent)

 Ön koşul: Sprint 13 tamamlandı — E2E yeşil, FraudTester ilk agent çalışıyor

 T17 — Adversarial + Chaos Agent (4h) — FraudTester Backend

 - AdversarialAgent: emulator spoofing (fake GPU/sensor), bot evasion (headless detection bypass), slow fraud (12h spread)
 - ChaosAgent: servis failure injection, recovery testi

 T18 — Battle Arena Backend API (3h) — FraudTester Backend

 - WebSocket event stream: battle:start, battle:result, battle:complete
 - HTTP endpoints: POST /battles, GET /battles/:id, GET /battles
 - ScenarioRunner → Socket.io broadcast

 T19 — Battle Arena UI Real-time (3h) — FraudTester UI

 - Socket.io bağlantısı → live feed güncelleme
 - Detection gauge animasyon (Recharts <RadialBarChart>)
 - Attack feed son 50 sonuç (virtualized list, performans)
 - "Start Battle" → konfigürasyon modal → backend API çağrısı

 T20 — Standalone Karar Analizi (1h) — Orchestrator

 - Gate kriterleri değerlendirmesi:
   - ≥2 adapter yazıldı mı? (SignalRisk + 1 custom)
   - Detection rate karşılaştırma raporu çıkıyor mu?
   - Dış kullanıcı ilgisi var mı?
 - Karar: Entegre kal / Ayrı repo'ya taşı
 - Eğer taşınacaksa: apps/fraud-tester/ → yeni repo, adapter paket olarak yayınlanır

 ---
 Kabul Kriterleri — Sprint Bazlı

 Sprint 12 Tamamlanma Kriterleri

 - docker compose -f docker-compose.full.yml up --wait 120s içinde geçer
 - Tüm 12 servisin /health endpoint'i 200 döner
 - FraudTester scaffold commit'lendi, TypeScript compile edilir, unit testler geçer
 - BattleArenaPage + ScenarioLibraryPage skeleton olarak tarayıcıda render olur
 - Sidebar'da "FRAUD TESTER" nav section görünür
 - 5 skill.md dosyası docs/skills/'te yerleşti

 Sprint 13 Tamamlanma Kriterleri

 - 5 E2E senaryo 5/5 geçer (gerçek servislere karşı)
 - CI/CD: PR'da otomatik E2E çalışır
 - FraudSimulationAgent device farm senaryosu çalışır
 - Detection raporu UI ekranında görünür (gerçek veriler)
 - Integration test: device farm → BLOCK oranı > %80

 Sprint 14 Tamamlanma Kriterleri

 - Battle Arena gerçek zamanlı güncelleme çalışır
 - Adversarial agent 3 senaryo koşturuyor
 - Standalone karar belgesi hazır (geç ya da taşı kararı verilmiş)

 ---
 Test Stratejisi — Katman Katman

 ┌─────────────────────────┬───────────────────────────────┬──────────────────────────┬───────────┐
 │         Katman          │             Araç              │          Hedef           │  Sprint   │
 ├─────────────────────────┼───────────────────────────────┼──────────────────────────┼───────────┤
 │ Unit (FraudTester)      │ Jest                          │ %80+ coverage            │ Sprint 12 │
 ├─────────────────────────┼───────────────────────────────┼──────────────────────────┼───────────┤
 │ Integration (Adapter)   │ Jest + TestContainers         │ SignalRisk API uyumu     │ Sprint 13 │
 ├─────────────────────────┼───────────────────────────────┼──────────────────────────┼───────────┤
 │ E2E (5 kritik senaryo)  │ Playwright → gerçek servisler │ Sıfır flakiness          │ Sprint 13 │
 ├─────────────────────────┼───────────────────────────────┼──────────────────────────┼───────────┤
 │ Fraud Simulation        │ FraudTester agents            │ TPR>%85, FPR<%5          │ Sprint 13 │
 ├─────────────────────────┼───────────────────────────────┼──────────────────────────┼───────────┤
 │ Adversarial             │ AdversarialAgent              │ %90+ emulator detection  │ Sprint 14 │
 ├─────────────────────────┼───────────────────────────────┼──────────────────────────┼───────────┤
 │ Chaos                   │ ChaosAgent                    │ Fail-closed + recovery   │ Sprint 14 │
 ├─────────────────────────┼───────────────────────────────┼──────────────────────────┼───────────┤
 │ Load (gerçek servisler) │ k6 → Docker Compose stack     │ p99<200ms @1K concurrent │ Sprint 14 │
 └─────────────────────────┴───────────────────────────────┴──────────────────────────┴───────────┘

 ---
 Üretilecek Dosyaların Tam Listesi

 Skill Dosyaları (Sprint 12, T8)

 - docs/skills/e2e-real-services.md
 - docs/skills/fraud-simulation.md
 - docs/skills/fraudtester-adapter.md
 - docs/skills/fraudtester-ui.md
 - docs/skills/docker-compose-e2e.md

 Agent Tanımları (Sprint 12, T5/T6)

 - docs/agents/e2e-engineer.md
 - docs/agents/fraudtester-backend.md
 - docs/agents/fraudtester-ui.md

 Altyapı (Sprint 12)

 - docker-compose.full.yml
 - tests/e2e/scenarios/happy-path.spec.ts
 - tests/e2e/scenarios/fraud-blast.spec.ts
 - tests/e2e/scenarios/jwt-revoke.spec.ts
 - tests/e2e/scenarios/multi-tenant-isolation.spec.ts
 - tests/e2e/scenarios/chaos-redis-down.spec.ts
 - tests/e2e/playwright.config.real.ts
 - .github/workflows/e2e.yml

 FraudTester Backend (Sprint 12-13)

 - apps/fraud-tester/src/adapters/base.adapter.ts
 - apps/fraud-tester/src/adapters/signalrisk.adapter.ts
 - apps/fraud-tester/src/agents/base.agent.ts
 - apps/fraud-tester/src/agents/fraud-simulation.agent.ts
 - apps/fraud-tester/src/agents/adversarial.agent.ts (stub→full Sprint 14)
 - apps/fraud-tester/src/agents/chaos.agent.ts (stub→full Sprint 14)
 - apps/fraud-tester/src/scenarios/types.ts
 - apps/fraud-tester/src/scenarios/catalog/*.scenario.ts (5 senaryo)
 - apps/fraud-tester/src/orchestrator/orchestrator.ts
 - apps/fraud-tester/src/reporter/detection-reporter.ts
 - apps/fraud-tester/README.md
 - apps/fraud-tester/package.json

 FraudTester UI (Sprint 12-14)

 - apps/dashboard/src/pages/FraudTesterOverviewPage.tsx
 - apps/dashboard/src/pages/BattleArenaPage.tsx
 - apps/dashboard/src/pages/ScenarioLibraryPage.tsx
 - apps/dashboard/src/pages/DetectionReportPage.tsx
 - apps/dashboard/src/pages/AgentConfigPage.tsx
 - apps/dashboard/src/pages/TargetManagementPage.tsx
 - apps/dashboard/src/store/fraud-tester.store.ts
 - apps/dashboard/src/api/fraud-tester.api.ts
 - apps/dashboard/src/types/fraud-tester.types.ts

 Güncellenecek Dosyalar

 - apps/dashboard/src/App.tsx — yeni routes
 - apps/dashboard/src/components/layout/Sidebar.tsx — yeni nav section

 ---
 SDLC Entegrasyonu

 SDLC Project ID: ceff3f38-d2cd-4e46-8a02-9b5083382f2a

 Sprint oluşturma sırası:
 1. Sprint 12 oluştur → 8 task (T1-T8) → 8 paralel agent başlat (2 team × 4)
 2. Sprint 12 tamamlanınca sprint 13 oluştur
 3. Sprint 13 tamamlanınca standalone karar analizi → Sprint 14

 Her sprint: state_create_sprint → state_start_sprint → agent'lar → state_complete_sprint