# Skill: Quality Gate

Belirtilen quality gate'i calistir ve PASS/FAIL raporla.

## Kullanim

```
/quality-gate G1        — tek gate
/quality-gate G1 G2 G3  — birden fazla gate
/quality-gate all       — tum gate'ler (G1-G8)
```

## Gate Tanimlari

Gate detaylari: `docs/testing/quality-gates.md`

### G1: Build + Static Validation
- `npm run build --workspaces --if-present` (|| true OLMADAN)
- `npm run lint --workspaces --if-present` (|| true OLMADAN)
- `npx tsc --noEmit` (root level)
- PASS: Tum komutlar exit code 0

### G2: Unit/Component Validation
- `npm run test --workspaces --if-present`
- Coverage check: line >= 80%, branch >= 90% kritik path servisleri icin
- Kritik path: decision-service, auth-service, event-collector, velocity-service
- PASS: Tum testler gecti, coverage threshold'lar karsilandi

### G3: Integration + Contract
- Kafka topic import'lari dogrulandi (hardcode yok)
- Event schema uyumu: producer ↔ consumer
- Redis key namespace cakismasi yok
- PASS: Contract mismatch yok

### G4: Security / Tenant Isolation
- Cross-tenant erisim negatif testi
- JWT forge testi (sahte token → 401)
- API key format kontrolu
- `npm audit --audit-level=high`
- PASS: Tum negatif testler beklenen sonucu verdi, high/critical vulnerability yok

### G5: E2E Workflow Validation
- `npx playwright test --config tests/e2e/playwright.config.real.ts`
- 0 failure zorunlu
- PASS: Tum E2E testler gecti

### G6: Performance Gate
- Threshold'lar `docs/testing/quality-gates.md#g6`'dan alinir (hardcode yok)
- Minimum: decision latency, event throughput, error rate, webhook retry
- PASS: Tum metric'ler evidenced target'i karsilar

### G7: Smoke + Rollback
- Staging smoke green
- Rollback procedure validated
- On-call owner identified
- PASS: Smoke gecti, rollback testi basarili

### G8: Evidence Completeness
- Sprint/release evidence pack tamam mi?
- Format: `docs/testing/evidence-and-reporting.md`
- PASS: Tum zorunlu artifact'lar mevcut

## Cikti Formati

```
## Quality Gate Report — [tarih]

| Gate | Durum | Detay |
|---|---|---|
| G1 | PASS/FAIL | ... |

### Blocker Listesi (varsa)
- [Gate]: [sorun aciklamasi]

### Sonuc: PASS / FAIL (N blocker)
```

## Referanslar
- `docs/testing/quality-gates.md` (canonical gate tanimlari)
- CLAUDE.md §8 (Test Strategy Integration)
