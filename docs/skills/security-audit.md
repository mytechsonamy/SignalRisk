# Skill: Security Audit

G4 gate icin guvenlik denetimi yap.

## Kullanim

```
/security-audit           — tam denetim
/security-audit --quick   — sadece kritik kontroller
```

## Denetim Adimlari

### 1. Cross-Tenant Erisim Negatif Testi
- Farkli merchantId ile istek gonder
- Beklenen: 403 Forbidden
- Test servisleri: case-service, decision-service, webhook-service
- Senaryo: `docs/testing/scenario-catalog.md` SR-P0-009

### 2. JWT Forge Testi
- Sahte/gecersiz token ile istek gonder
- Beklenen: 401 Unauthorized
- Expired token testi
- Yanlis secret ile imzalanmis token testi
- Senaryo: SR-P0-010

### 3. API Key Format + Hash Kontrolu
- event-collector API key validation
- `sk_test_` prefix kontrolu
- SHA-256 hash karsilastirmasi (timing-safe)
- Gecersiz API key → 401

### 4. npm Audit
```bash
npm audit --audit-level=high
```
- Tum workspace'lerde calistir
- high/critical vulnerability → blocker

### 5. Ek Kontroller
- TenantGuard decode-only durumu (P0 #5 — bilinen sorun)
- Hardcoded credential'lar (P0 #4)
- In-memory auth store riskleri
- CORS konfigurasyonu
- Rate limiting aktif mi?
- OTEL_SDK_DISABLED=true — prod'da acilmali

## Cikti Formati

```
## Security Audit Report — [tarih]

### Sev-1 (Blocker)
| # | Bulgu | Servis | Fix Onerisi |
|---|---|---|---|

### Sev-2 (High)
| # | Bulgu | Servis | Fix Onerisi |
|---|---|---|---|

### Sev-3 (Medium)
| # | Bulgu | Servis | Fix Onerisi |
|---|---|---|---|

### Bilinen Sorunlar (P0 fix hedefi)
- P0 #4: Hardcoded credentials — Sprint 5
- P0 #5: JWT decode-only — Sprint 6

### Sonuc: PASS / FAIL (N sev-1, M sev-2)
```

## Defect Lifecycle
Detay: `docs/testing/evidence-and-reporting.md`
1. detect → 2. record → 3. classify → 4. assign → 5. fix → 6. rerun → 7. close

## Referanslar
- `docs/testing/scenario-catalog.md` — SR-P0-009, SR-P0-010
- `docs/testing/quality-gates.md` — G4 tanimi
- CLAUDE.md §6 R1-R3 (auth kurallari)
