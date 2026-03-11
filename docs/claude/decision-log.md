# SignalRisk — Decision Log (ADR Format)

> Mimari kararlar burada belgelenir. CLAUDE.md §11 ozet verir, detay burada.

---

## ADR-001: Kafka Timeout Promise.race Wrappers

**Durum:** Kabul edildi (Sprint 34)
**Baglam:** KafkaJS consumer/producer call'lari hang yaparak E2E testleri timeout'a dusuruyordu.
**Karar:** Tum Kafka islemlerini `Promise.race([operation, timeoutPromise])` ile sarmala.
- DLQ islemleri: 5s timeout
- Producer.send: 10s timeout
- Consumer lag poll: 10s timeout
**Sonuclar:** E2E testler stabil (78/78 pass). Timeout durumunda islem skip edilir, veri kaybi olmaz (DLQ'ya duser).
**Gecerlilik:** KafkaJS kullanildigi surece gecerli. Alternatif client'a geciste yeniden degerlendir.

---

## ADR-002: SIGNAL_TIMEOUT_MS=2000ms Docker'da

**Durum:** Kabul edildi (Sprint 20)
**Baglam:** Signal fetch AbortController timeout'u 150ms idi. Docker inter-container latency nedeniyle signal'lar surekli timeout oluyordu.
**Karar:** Docker ortaminda `SIGNAL_TIMEOUT_MS=2000` zorunlu. Graceful degradation: timeout = null signal → karar devam eder.
**Sonuclar:** Signal'lar Docker'da stabil geliyor. Production'da daha dusuk deger test edilmeli.
**Gecerlilik:** Docker Compose dev ortaminda gecerli. K8s/prod icin benchmark gerekir.

---

## ADR-003: E2E Sequential Projects, 1 Worker

**Durum:** Kabul edildi (Sprint 33)
**Baglam:** Paralel E2E testler shared state (Kafka topics, Redis keys, DB rows) nedeniyle race condition uretiyordu.
**Karar:** Playwright config: 3 sequential project (e2e-light → e2e-heavy → chaos), workers=1.
**Sonuclar:** Testler deterministik. Seri calisma suresi ~38s (kabul edilebilir).
**Gecerlilik:** Test izolasyonu saglanana kadar gecerli. Test-per-tenant isolation kurulursa paralel denenebilir.

---

## ADR-004: entityId=deviceId Velocity Polling'de

**Durum:** Kabul edildi (Sprint 30)
**Baglam:** Velocity-service sliding window counter'lari entity bazli. Decision-service hangi entity ID'yi gondermeli?
**Karar:** `entityId = deviceFingerprint || eventId` — device fingerprint varsa onu kullan, yoksa eventId fallback.
**Sonuclar:** Velocity counter'lar device bazli agrege edilir. Device fingerprint olmayan event'ler tek basina sayilir.
**Gecerlilik:** Device fingerprinting aktif oldugu surece gecerli.

---

## ADR-005: KAFKA_COMPRESSION=gzip

**Durum:** Kabul edildi (Sprint 28)
**Baglam:** Kafka message boyutunu kucultp throughput artirmak icin compression secimi.
**Karar:** gzip. LZ4 KafkaJS'de desteklenmiyor. Snappy test edilmedi.
**Sonuclar:** ~40% message boyut azalmasi. CPU overhead kabul edilebilir (dev ortaminda olculdu).
**Gecerlilik:** KafkaJS kullanildigi surece. confluent-kafka-js veya librdkafka'ya geciste LZ4 degerlendirilmeli.

---

## ADR-006: Decision Cache TTL=5s

**Durum:** Kabul edildi (Sprint 25)
**Baglam:** Ayni merchantId+entityId icin tekrar eden decision request'leri onlemek.
**Karar:** Redis-backed decision cache, TTL=5s. Freshness ile performance arasinda denge.
**Sonuclar:** Duplicate request'ler 5s icinde cache'ten donuyor. TTL sonrasi yeniden hesaplama. Redis flush durumunda pollDecision timeout yapabilir.
**Gecerlilik:** Real-time fraud detection use case'inde gecerli. Batch processing icin TTL uzatilmali.

---

## ADR-007: Case SLA — BLOCK=4h, REVIEW=24h

**Durum:** Kabul edildi (Sprint 26)
**Baglam:** Fraud ops ekibi icin case review SLA tanimlama.
**Karar:** BLOCK kararli case'ler 4 saat, REVIEW kararli case'ler 24 saat icinde incelenmeli. 5 dakikalik cron ile SLA monitoring.
**Sonuclar:** SLA ihlali durumunda case priority arttirilir. Dashboard'da SLA widget gosterilir.
**Gecerlilik:** Fraud ops operasyonel SLA'si degisene kadar gecerli.

---

## ADR-008: TenantGuard RS256 JWKS Verification

**Durum:** Kabul edildi (Sprint 35)
**Baglam:** case-service TenantGuard baslangicta JWT decode-only kullaniyordu (imza dogrulamasi yok). Sprint 35'te jwt.verify() eklendi ancak HS256 + JWT_SECRET ile — oysa auth-service RS256 (asimetrik RSA) ile imzaliyor. Bu uyumsuzluk E2E testlerinde 401 hatasina yol acti.
**Karar:** TenantGuard, auth-service'in `/.well-known/jwks.json` endpoint'inden public key'leri fetch edip RS256 ile dogrulama yapacak. JWKS 5 dakika cache'lenir. Key rotation durumunda kid mismatch'te otomatik refresh yapilir.
**Sonuclar:** JWT_SECRET env var artik case-service icin gerekli degil. AUTH_SERVICE_URL env var (default: http://auth-service:3001) kullanilir. Auth-service ayakta olmali ki case-service JWT dogrulayabilsin.
**Gecerlilik:** Auth-service RS256 kullandigi surece gecerli. HS256'ya donulurse bu guard guncellenmeli.

---

## ADR-009: Entity Identity Standard

**Durum:** Kabul edildi (Sprint 0 — Stateful Fraud)
**Baglam:** Velocity-service tek `entityId` izliyor (`transactionId || deviceId || eventId`). Stateful fraud detection icin customer, device ve IP ayri entity type'lar olarak tracked olmali.
**Karar:** Typed entity modeli:
- `customer`: odeme yapan son kullanici. Kaynak: `payload.customerId || entityId`
- `device`: cihaz fingerprint'i. Kaynak: `deviceId` — authoritative sahip: device-intel-service
- `ip`: IPv4/IPv6 normalize edilmis (lowercase, trimmed). Kaynak: `ipAddress`
- Redis key pattern: `{merchantId}:vel:{dim}:{entityType}:{entityId}`
- entityType enum: `'customer' | 'device' | 'ip'`
**Sonuclar:** Velocity consumer tek event'ten 3 ayri entity type icin counter guncellemesi yapacak. Mevcut tek-entityId davranisi backward-compatible kalacak (entityType belirtilmezse `customer` varsayilir).
**Gecerlilik:** Stateful fraud detection aktif oldugu surece gecerli. Yeni entity type eklemek icin bu ADR guncellenmeli.

---

## ADR-010: Stateful Context Namespace

**Durum:** Kabul edildi (Sprint 0 — Stateful Fraud)
**Baglam:** Rule DSL ve decision explanation icin stateful feature'larin standardize edilmis bir namespace'e ihtiyaci var.
**Karar:** `stateful.{entityType}.{featureName}` path convention:
- Ornekler: `stateful.customer.txCount10m`, `stateful.device.distinctAccounts24h`, `stateful.ip.signupCount10m`
- Feature adlari camelCase
- Tum feature'lar `docs/claude/source-of-truth.md#stateful-namespace`'de kayitli olmali
- Kayitsiz feature rule'da kullanilamaz
- `evaluator.ts:resolveField()` generic dot-path resolution kullandigi icin ek kod degisikligi gerektirmez — sadece TypeScript interface genisletilmeli
**Sonuclar:** Rule tanimlari `stateful.customer.txCount10m > 5` seklinde yazilabilir. Decision explanation'da ayni namespace kullanilir.
**Gecerlilik:** Rule DSL aktif oldugu surece gecerli. Yeni feature eklemek icin source-of-truth guncellenmeli.

---

## ADR-011: Prior-Decision Memory Guardrails

**Durum:** Kabul edildi (Sprint 0 — Stateful Fraud)
**Baglam:** Karar aninda onceki BLOCK/REVIEW sayilarini bilmek fraud detection'i guclendirir. Ancak decisions tablosundan canlı sorgu decision latency'yi artirabilir.
**Karar:** Sync DB query ile basla, su guardrail'ler zorunlu:
- Zaman siniri: Son 30 gun MAX
- Index zorunlu: `(merchant_id, entity_id, created_at)` — full table scan'i onle
- Timeout: 50ms circuit breaker
- Fallback: timeout → `{previousBlockCount: 0, previousReviewCount: 0}` (graceful degradation)
- Evrim plani: Sprint 5'te Redis cache veya materialized state'e tasinacak
**Sonuclar:** Decision latency butcesi korunur. Index olmadan production'a cikilmaz. Timeout durumunda karar devam eder (sifir sayaclarla).
**Gecerlilik:** Prior-decision memory aktif oldugu surece gecerli. Redis cache'e tasindiktan sonra DB query devre disi birakilabilir.

---

## ADR-012: Analyst Feedback Etki Politikasi

**Durum:** Kabul edildi (Sprint 0 — Stateful Fraud)
**Baglam:** Case resolution (FRAUD/LEGITIMATE/INCONCLUSIVE) entity duzeyinde state degisikligi yapmali. Politika belirsizligi teknik uygulamayi bloklar.
**Karar:** Resolution bazli etki:
- `FRAUD` (confirmed): Entity denylist'e eklenir + `stateful.customer.previousFraudCount` artirilir + linked device/IP'ye risk bonus (+20)
- `LEGITIMATE` (false positive): Risk suppression — entity'nin sonraki 7 gun icinde ayni rule'dan REVIEW almasi engellenir (cooldown)
- `INCONCLUSIVE`: Hicbir state degisimi yok. Sadece case kapanir.
**Sonuclar:** Analyst kararlari otomatik olarak fraud detection'i iyilestirir. False positive cooldown operasyonel yuku azaltir.
**Gecerlilik:** Case resolution workflow'u aktif oldugu surece gecerli. Yeni resolution type'lari eklenirse bu politika guncellenmeli.

---

## ADR-013: Dashboard Login DB-Backed

**Durum:** Kabul edildi (Sprint 36)
**Baglam:** `POST /v1/auth/login` hardcoded seed user'lar kullaniyordu, `NODE_ENV=production`'da 401 firlatiyor.
PostgreSQL-backed `UsersService` (bcrypt, UUID, CRUD) zaten vardi — login endpoint bunu kullanmiyordu.
**Karar:** Login endpoint once `UsersService.findByEmail()` + `bcrypt.compare()` dener. Basarisiz ve `NODE_ENV !== production` ise seed user fallback.
- `invite()` tempPassword donuyor (tek seferlik, loglanmaz)
- `PATCH /v1/admin/users/:id/password` ile password degistirme (JWT sub claim yetkilendirmesi)
- `users.email` global unique constraint (FD-1)
**Sonuclar:** Production'da DB-backed auth calisiyor. Dev/test ortaminda seed user'lar korunuyor.
**Gecerlilik:** Auth-service aktif oldugu surece gecerli.

---

## ADR-014: WebSocket RS256 JWKS + Room-Based Tenant Isolation

**Durum:** Kabul edildi (Sprint 36)
**Baglam:** WsJwtGuard HS256 kullaniyordu (RS256 yerine), `@UseGuards` uygulanmamisti, `broadcastDecision()` tum client'lara yayin yapiyordu.
**Karar:** WsJwtGuard → RS256 JWKS rewrite (TenantGuard pattern):
- JWKS fetch: `AUTH_SERVICE_URL` + `/.well-known/jwks.json` (5dk cache)
- Room assignment: `admin` role → 'admin' room, diger roller → `merchant:{merchantId}`
- Broadcast: `this.server.to(\`merchant:${merchantId}\`).emit()` + `this.server.to('admin').emit()`
**Sonuclar:** Cross-tenant WS izolasyonu saglanmis. Admin tum decision'lari goruyor, merchant sadece kendi tenant'ini.
**Gecerlilik:** WebSocket gateway aktif oldugu surece gecerli.

---

## ADR-015: Watchlist Decision-Time Enforcement

**Durum:** Kabul edildi (Sprint 36-37)
**Baglam:** Analyst feedback (FRAUD/LEGITIMATE) ile watchlist_entries dolduruluyor ama decision-time'da okunmuyordu.
**Karar:** Decision-time watchlist check (FD-2 uyumlu):
- `denylist` → deterministic BLOCK (short-circuit, scoring skip)
- `watchlist` → score boost +20 (additive)
- `allowlist` → score suppression -15 (reductive, threshold aktif)
- Precedence: denylist > watchlist > allowlist
- 50ms timeout + fallback `{isDenylisted: false, isWatchlisted: false}` (R14 pattern)
- Feedback consumer: FRAUD → denylist UPSERT, LEGITIMATE → denylist deactivate + allowlist 30-day cooldown
- Entity profiles: UPSERT on each decision (fire-and-forget)
**Sonuclar:** Closed-loop fraud: analyst FRAUD label → denylist → next event BLOCK.
**Gecerlilik:** Decision pipeline aktif oldugu surece gecerli.

---

## ADR-016: Feature Snapshot Structured Columns

**Durum:** Kabul edildi (Sprint 36)
**Baglam:** `decision_feature_snapshots` tablosu (migration 009) `f_*` structured columns ile tanimlanmis ama hicbir kod bu tabloya yazmiyor.
**Karar:** `DecisionStoreService.saveFeatureSnapshot()` SignalBundle'dan f_* column'lara explicit mapping yapar.
- Fire-and-forget: try/catch, decision flow'u bloklamaz
- Hata durumunda: warn log + `feature_snapshot_write_errors_total` metric
- signals_raw: tam SignalBundle JSON (ML pipeline icin)
**Sonuclar:** ML-ready feature export hazir. Decision basina ~20 feature kaydediliyor.
**Gecerlilik:** Feature snapshot kullanildigi surece gecerli.
