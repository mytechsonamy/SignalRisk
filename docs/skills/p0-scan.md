# Skill: P0 Scan

Codebase'i P0 anti-pattern icin tara. Her bulgu icin dosya:satir, severity, fix onerisi raporla.

## Taranacak Pattern'ler

### 1. `|| true` iceren npm scripts (P0 #1)
- `package.json` dosyalarinda `|| true` pattern'i
- Severity: P0
- Fix: `|| true` kaldirip gercek hata cikisini sagla

### 2. Hardcoded credential string'ler (P0 #4)
- `admin123`, `test-secret`, `sk_test_` literal kullanimlari prod path'inde
- `signalrisk-local-dev-secret` gibi JWT secret'lar kod icinde
- Dashboard'da hardcoded login credential'lar
- Severity: P0
- Fix: Environment variable'a tasi, dev seed'leri NODE_ENV guard'i arkasina al

### 3. Kafka topic string literal'lari (P0 #3)
- `packages/kafka-config` disinda Kafka topic string'i (`signalrisk.events.raw` vb.)
- Severity: P0
- Fix: `@signalrisk/kafka-config` TOPICS import'u kullan

### 4. JWT decode-only (P0 #5)
- `jose.decodeJwt` veya manual Base64 decode kullanimi (verify olmadan)
- `Buffer.from(parts[1], 'base64url')` pattern'i
- Severity: P0
- Fix: `jsonwebtoken.verify()` veya `jose.jwtVerify()` ile signature dogrulama ekle

### 5. In-memory Map auth kritik path'inde (P0 #4)
- `new Map()` kullanimi merchant/user store olarak
- Severity: P0 (production icin)
- Fix: PostgreSQL-backed repository'ye gecis plani

## Cikti Formati

```
## P0 Scan Sonuclari — [tarih]

### P0 Bulgular
| # | Dosya:Satir | Pattern | Severity | Fix Onerisi |
|---|---|---|---|---|

### Ozet
- Toplam bulgu: X
- P0: Y
- P1: Z
```

## Referanslar
- CLAUDE.md §5 (P0 Critical Fixes)
- `docs/testing/scenario-catalog.md` — SR-P0-010 (JWT), SR-P0-008 (test isolation)
