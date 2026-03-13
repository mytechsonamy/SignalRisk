# Skill: Product Owner

Urun perspektifinden dokuman uret — teknik detaydan cok yetenek, deger ve pazar odakli.

## Kullanim

```
/product-owner full      — Tam urun dokumani uret
/product-owner features  — Sadece yetenek matrisi
/product-owner roadmap   — Sadece roadmap ve sonraki adimlar
```

## Adimlar

### 1. Kaynak Okuma
- `docs/architecture/comprehensive-architecture.md` (mimari genel bakis)
- `docs/TECHNICAL.md` (API referans, servis katalogu)
- `docs/USER-GUIDE.md` (dashboard ozellikleri, kullanici akislari)
- `docs/stateful-fraud-architecture.md` (stateful fraud yetenekleri)
- `docs/cto-cio-presentation.md` (latency budget, olceklenme, guvenlik)
- `docs/investor-pitch.md` (pazar, rekabet, deger onerisi)
- `CLAUDE.md` §3 (maturity map — guncel durum)

### 2. Urun Vizyonu Cikar
- Problem statement: hedef pazardaki fraud sorunu
- Target market: emerging market dijital odeme, carrier billing, mobile wallet
- Differentiators: telco + device + behavioral, tek API, <200ms, DSL kurallar

### 3. Yetenek Matrisi Olustur
- 15 servisi kullaniciya gorunen yeteneklere esle
- Her yetenek icin maturity level: ✅ Production-ready / ⚠ Beta / 🔜 Planned
- Kategoriler: Detection, Decision, Ops, Integration, Security, Analytics

### 4. Kullanici Hikayeleri Yaz
- **Fraud Analyst**: case inceleme, label verme, SLA takibi, rule oneri
- **Merchant Admin**: API entegrasyonu, webhook kurulumu, analytics goruntuleme
- **Platform Operator**: servis saglik izleme, kural yonetimi, kullanici yonetimi

### 5. Dokuman Uret
- Ton: is degeri ve yetenek odakli, teknik jargon minimize
- Hedef kitle: CEO, CTO, yatirimci, is gelistirme

## Kontrol Listesi
- [ ] 15 servis → yetenek eslesmesi tamamlandi
- [ ] 3 persona tanimlandi (fraud analyst, merchant admin, platform operator)
- [ ] Feature matrisi maturity level iceriyor
- [ ] Roadmap mevcut durum + gelecek adimlari iceriyor
- [ ] Rekabet farklilastirmasi belirtildi

## Cikti Formati

Target: `docs/product/product-overview.md`

Zorunlu bolumler:
1. Product Vision & Mission
2. Target Market & Personas
3. Key Capabilities (feature matrix)
4. Decision Engine (PO perspective)
5. Integration Model
6. Deployment Model
7. Competitive Differentiation
8. Current Status
9. Roadmap & Next Steps
10. Success Metrics / KPIs

## Referanslar
- `docs/architecture/comprehensive-architecture.md`
- `docs/TECHNICAL.md`
- `docs/USER-GUIDE.md`
- `docs/stateful-fraud-architecture.md`
- `docs/cto-cio-presentation.md`
- `docs/investor-pitch.md`
- `CLAUDE.md` §3 (maturity map)
