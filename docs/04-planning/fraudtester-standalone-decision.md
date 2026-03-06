# FraudTester — Standalone Urun Karar Belgesi

**Tarih:** 2026-03-07
**Sprint:** 19

---

## Gate Kriterleri Degerlendirmesi

### Kriter 1: >= 2 adapter yazildi mi?

EVET

- **SignalRiskAdapter** — `apps/fraud-tester/src/adapters/signalrisk.adapter.ts`
  - Canli SignalRisk instance'ina baglanir (event-collector port 3002, decision-service port 3009)
  - POST /v1/events + polling GET /v1/decisions/{eventId}
- **MockAdapter** — `apps/fraud-tester/src/adapters/mock.adapter.ts`
  - Ag baglantisi gerektirmez; CI ortamlarinda ve birim testlerde kullanilir
  - 6 karar modu: always-block, always-allow, always-review, random, threshold, custom
- **ChaosAdapterWrapper** — `apps/fraud-tester/src/adapters/chaos-wrapper.ts`
  - Herhangi bir adapter'i sarar; timeout/partialFailure/stress enjekte eder

**Sonuc:** Adapter interface soyut, yeni sistem icin `IFraudSystemAdapter` implement etmek yeterli.

---

### Kriter 2: Detection rate karsilastirma raporu uretiyor mu?

EVET

- **BattleReport**: `overallTpr`, `overallFpr`, `avgLatencyMs`, senaryo bazli `ScenarioResult[]`
- **DetectionReporter**: TP/FP/FN/TN hesabi, `computeBattleReport()` tum scenaryo sonuclarini birlestiriyor
- **FraudTester HTTP API**:
  - `GET /v1/fraud-tester/battles` — son 100 battle raporu
  - `GET /v1/fraud-tester/battles/:id` — tek battle detayi + tam BattleReport
- **Socket.io real-time streaming**: `battle:result`, `battle:scenarioDone`, `battle:complete` event'leri
- Dashboard entegrasyonu: DetectionReportPage son 5 battle'in karsilastirma grafigini gosteriyor

---

### Kriter 3: Dis kullanici ilgisi var mi?

DEGERLENDIRME ASAMASINDA

- **Potansiyel hedef kitle**: Kendi fraud sistemini test etmek isteyen bankalar, fintech'ler, e-ticaret platformlari
- **Rakip analiz**: Piyasada benzer, adapter tabanli standalone fraud test araci bulunmuyor
- **Mevcut durum**: Hicbir dis musteri gorusmesi yapilmadi; talep dogrulanmadi

**Karar**: Ilk dis musteri gorusmesi yapilana kadar entegre kal.

---

## Karar: Mimari Olarak Ayrilmis, Simdilik Entegre

**Secilen yaklasim:** Entegre kal, mimari sinirlari koru.

### Gerekce

1. **Deger onerisi SignalRisk'e bagli**: FraudTester'in birincil degeri, SignalRisk'in detection kalitesini nesnel olarak kanitlamaktir. Ilk referans musteriler hem urunleri birlikte kullanacak.
2. **Adapter interface hazir**: Ayristirma icin minimum ek is gerekiyor — `IFraudSystemAdapter` zaten implement edilmis durumda.
3. **Belirsiz ROI**: Simdi ayristirmak 3+ hafta ek is demek; dis musteri talebi dogrulanmamis.
4. **Teknik borc yok**: Klasor yapisi (`apps/fraud-tester/`), paket siniri ve public API (`src/index.ts`) zaten izole. Monorepo icinde kalmak mimari kirlilik yaratmiyor.

### Ayristirma Tetikleyicileri (Trigger)

Asagidaki kosullardan biri gerceklestiginde ayristirma kararini yeniden gozden gecir:

| # | Tetikleyici | Aksiyon |
|---|-------------|---------|
| T1 | Ilk dis musteri FraudTester'i kendi sistemine baglamak istiyor | Ayristirma planini baslatirken SignalRisk adapter'ini referans al |
| T2 | SignalRisk musterisi olmayan bir firma FraudTester kullanmak istiyor | Acil ayristirma — npm paketi yayimla |
| T3 | FraudTester MRR > SignalRisk MRR'in %20'si | Ayri urun olarak fiyatlandirma ve branding |
| T4 | FraudTester icin bagimsiz deployment talebi geliyor | Docker imaji + Helm chart ayir |

---

## Ayristirma Plani (Tetikleyici Gerceklesince)

Asagidaki plan, bir tetikleyici gerceklestiginde izlenecek adimlari tanimlar.

**Adim 1 — Kod hazirligi (1-2 gun)**
```
apps/fraud-tester/ → ayri git repo: github.com/signalrisk/fraud-tester
```

**Adim 2 — npm paketleri (2-3 gun)**
```
@signalrisk/fraud-tester-core    # IFraudSystemAdapter + senaryo library
@signalrisk/fraud-tester-sdk     # ScenarioRunner + DetectionReporter
@signalrisk/fraud-tester-signalrisk  # SignalRiskAdapter (core'a bagimli)
```

**Adim 3 — API server ayristir (1 gun)**
```
apps/fraud-tester/src/api/server.ts → ayri Express app
Port: 3020 (SignalRisk portlarindan izole)
```

**Adim 4 — Dashboard UI ayristir (3-5 gun)**
```
apps/fraud-tester-ui/  (yeni React app)
Mevcut dashboard entegrasyonu: iframe veya federated module
```

**Toplam tahmini sure**: 7-11 is gunu

---

## Mevcut Durum Ozeti

| Bilesen | Durum | Konum |
|---------|-------|-------|
| Adapter interface | Uretimde | `src/adapters/base.adapter.ts` |
| SignalRiskAdapter | Uretimde | `src/adapters/signalrisk.adapter.ts` |
| MockAdapter | Yeni (Sprint 19) | `src/adapters/mock.adapter.ts` |
| ChaosAdapterWrapper | Uretimde | `src/adapters/chaos-wrapper.ts` |
| 5 temel senaryo | Uretimde | `src/scenarios/catalog/` |
| 3 adversarial senaryo | Uretimde | `src/scenarios/catalog/adversarial/` |
| HTTP API | Uretimde | `src/api/server.ts` (port 3020) |
| Test suite | ~40 test | `src/__tests__/` |
