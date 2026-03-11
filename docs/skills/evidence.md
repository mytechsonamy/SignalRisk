# Skill: Evidence

Sprint veya release closure artifact uret.

## Kullanim

```
/evidence sprint 35                — Sprint 35 evidence pack
/evidence release v1.0             — Release v1.0 evidence pack
/evidence scenario SR-P0-001       — Tek senaryo evidence
```

## Artifact Kategorileri

Format detayi: `docs/testing/evidence-and-reporting.md`

### 1. Test Scope
- Hangi servisler test edildi
- Hangi SR-xxx senaryolari calistirildi
- Test ortami (Docker Compose local / staging)

### 2. Pass/Fail Matrix
- Gate bazinda: G1-G8 sonuclari
- Senaryo bazinda: P0, P1 pass/fail sayilari
- Toplam: test sayisi, gecen, kalan, calistirilmayan

### 3. Defect Listesi
- Severity (Sev-1 → Sev-4)
- Her defect: ID, baslik, servis, durum, owner
- Defect lifecycle: `docs/testing/evidence-and-reporting.md`

### 4. Performance Olcum
- Evidenced, env-specific (hardcode deger yok)
- Decision latency (p50, p95, p99)
- Event throughput (events/sec)
- Error rate
- Webhook retry/failure rate

### 5. Waiver Log
- Waive edilen senaryo/defect ID
- Severity, rationale, compensating control
- Owner, expiry date
- P0 senaryolar agent tarafindan waive edilemez

### 6. Signoff Checklist
- [ ] Tum P0 senaryolar PASS
- [ ] High/critical defect yok (veya waiver var)
- [ ] Performance target karsilandi
- [ ] Maturity map guncellendi
- [ ] Docs guncellendi

## Cikti Dosya Konvansiyonu

| Tip | Dosya Adi | Konum |
|---|---|---|
| Sprint exit | `sprint-N-exit.md` | `docs/testing/evidence/` |
| Release signoff | `release-vX.Y-evidence.md` | `docs/testing/evidence/` |
| Senaryo raporu | `scenario-SR-P0-XXX-YYYY-MM-DD.md` | `docs/testing/evidence/` |
| Performance raporu | `perf-gate-ENV-YYYY-MM-DD.md` | `docs/testing/evidence/` |

## Referanslar
- `docs/testing/evidence-and-reporting.md` (canonical format)
- `docs/testing/quality-gates.md` (gate tanimlari)
- `docs/testing/scenario-catalog.md` (senaryo katalogu)
