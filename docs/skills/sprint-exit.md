# Skill: Sprint Exit

Sprint kapanis islemlerini yap, evidence pack uret.

## Kullanim

```
/sprint-exit 35    — Sprint 35 kapanis
```

## Adimlar

### 1. Quality Gate Calistir (G1-G5)
- `/quality-gate G1 G2 G3 G4 G5` calistir
- Her gate PASS/FAIL sonucunu kaydet

### 2. Sprint Is Kalemi Durumu
- Sprint icinde planlanan P0/P1 is kalemleri listele
- Her birinin durumu: DONE / IN PROGRESS / BLOCKED / NOT STARTED
- P0 fix'lerden hangisi tamamlandi?

### 3. Maturity Map Degisiklikleri
- `docs/claude/service-map.md` incelye
- Sprint icinde degisen maturity etiketleri:
  - Yeni ✅ (ilk kez verified)
  - ❌ → ✅ gecisleri
  - Yeni ⚠ veya ❌ tespitleri
  - ? → ✅/⚠/❌ gecisleri (assumption dogrulandi)

### 4. Evidence Pack Olustur
Format: `docs/testing/evidence-and-reporting.md#sprint-exit`

Dosya: `docs/testing/evidence/sprint-N-exit.md`

### 5. Rapor Icerik Sablonu

```markdown
# Sprint N Exit Report

**Tarih:** [ISO-8601]
**Hazirlayan:** Claude Code

## Scope
- Servisleler: [degisiklik yapilan servisler]
- Ozellikler: [yeni/degisen ozellikler]
- Riskler: [bilinen riskler]

## Quality Gate Sonuclari

| Gate | Durum | Notlar |
|---|---|---|
| G1 Build | PASS/FAIL | |
| G2 Unit | PASS/FAIL | |
| G3 Integration | PASS/FAIL | |
| G4 Security | PASS/FAIL | |
| G5 E2E | PASS/FAIL | |

## Senaryo Ozeti

| Oncelik | Toplam | Gecti | Kaldi | Calistirilmadi |
|---|---|---|---|---|
| P0 | | | | |
| P1 | | | | |

## P0 Fix Durumu
| # | Aciklama | Durum |
|---|---|---|
| 1 | || true kaldir | |
| 2 | Webhook contract | |
| ... | | |

## Maturity Map Degisiklikleri
- [servis]: [eski etiket] → [yeni etiket]

## Defect Ozeti
- Open Sev-1: X
- Open Sev-2: Y
- Open Sev-3: Z

## Waiver'lar
- [varsa: ID, severity, rationale, expiry]

## Oneri
- [ ] Sprint'i kapat / [ ] Sprint'i tut
- Neden: [aciklama]
```

## Referanslar
- `docs/testing/quality-gates.md` (gate tanimlari)
- `docs/testing/evidence-and-reporting.md` (evidence formati)
- `docs/claude/service-map.md` (maturity map)
- CLAUDE.md §9 (Definition of Done)
