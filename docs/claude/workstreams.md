# SignalRisk — Workstreams

> Takim degil workstream — bir kisi birden fazla owner olabilir.
> Son guncelleme: Sprint 34 (2026-03-08)

## Workstream Tanimlari

### WS-Alpha: Platform Core

**Odak:** Event pipeline, decision orchestration, Kafka infra, core servisler
**Epic'ler:** Epic 1 (Reality Verification), Epic 2 (Contract Stabilization)
**P0 fix'ler:** #1 (|| true), #3 (Kafka hardcode), #7 (SoT audit)
**Odak servisler:** event-collector, decision-service, velocity-service, packages/kafka-config, packages/event-schemas
**Skills:** `/p0-scan`, `/simplify`

### WS-Bravo: Security

**Odak:** Auth, tenant isolation, JWT, credential management
**Epic:** Epic 3 (Auth & Tenant Fix)
**P0 fix'ler:** #4 (hardcoded credential), #5 (JWT verify)
**Odak servisler:** auth-service, case-service (TenantGuard), feature-flag-service
**Gate sahibi:** G4 (Security and tenant isolation)
**Skills:** `/security-audit`

### WS-Charlie: Data

**Odak:** DB schema, migrations, RLS enforcement, DTO alignment
**Epic:** Epic 4 (Schema & ID Alignment)
**P0 fix'ler:** #6 (UUID/schema alignment)
**Odak servisler:** database/migrations, packages/db-migrations, tum servis entity'leri
**Skills:** `/test-run`

### WS-Delta: Infra

**Odak:** Docker, CI/CD, monitoring, staging environment
**Epic'ler:** Epic 5 (Staging Gates), Epic 7 (Performance & Resilience)
**Odak:** docker-compose.full.yml, GitHub Actions, OTel, grafana
**Skills:** `/quality-gate`, `/loop`

### WS-Echo: Product

**Odak:** Dashboard, fraud intel, FraudTester, analytics
**Epic'ler:** Epic 8 (Dashboard), Epic 9 (Fraud Intel)
**Odak servisler:** dashboard, graph-intel-service, rule-engine-service
**Skills:** `/simplify`, `/test-run`

### WS-Foxtrot: QA

**Odak:** Test strategy, evidence, quality gates, sprint/release signoff
**Gate sahibi:** G1-G8 tumu
**Sorumluluk:** Surekli — her sprint ve release icin evidence uretimi
**Skills:** `/quality-gate`, `/evidence`, `/sprint-exit`

### WS-Golf: Stateful Fraud Detection

**Odak:** Velocity-service genisleme, stateful context, entity profiles, analyst feedback
**Epic'ler:** SF-1 (Entity-Type Expansion) → SF-6 (Analyst Feedback)
**Odak servisler:** velocity-service, decision-service, rule-engine-service, case-service
**Skills:** `/stateful-check`, `/velocity-test`, `/state-migrate`
**Sprint plani:** `docs/stateful-fraud-roadmap.md`
**Bagimliliklari:**
- WS-Alpha: velocity-service + decision-service core
- WS-Charlie: yeni migration'lar (entity_profiles, decision_feature_snapshots, analyst_labels, watchlist_entries)
- WS-Echo: rule-engine stateful context entegrasyonu

---

## Koordinasyon Kurallari

### Sprint Basi
- Her workstream kendi sprint scope'unu belirler
- P0 fix'ler diger is kalemlerinden once planlanir
- Cross-workstream bagimlilik varsa (ornegin WS-Alpha topic degisikligi → WS-Bravo consumer guncelleme) acikca belirtilir

### Sprint Sonu
- WS-Foxtrot G1-G5 quality gate calistirir
- Her workstream kendi maturity map degisikliklerini raporlar
- Evidence pack `docs/testing/evidence/sprint-N-exit.md`'ye yazilir

### Release Oncesi
- G6-G7 blocker — WS-Delta ve WS-Foxtrot birlikte calisir
- G8 evidence completeness — WS-Foxtrot onaylar
- Stop-the-line koullari (CLAUDE.md §8): herhangi bir workstream tetikleyebilir

### Stop-the-line
Asagidakilerden herhangi biri tespit edildiginde deploy durur, sorumlu workstream fix'i saglar:
- Cross-tenant veri sizintisi → WS-Bravo
- Token bypass basarili → WS-Bravo
- Webhook test isolation kirik → WS-Alpha
- Contract mismatch → WS-Alpha + WS-Charlie

## Skill Haritasi

| Skill | Workstream(ler) | Kaynak |
|---|---|---|
| `/p0-scan` | WS-Alpha, WS-Bravo | `docs/skills/p0-scan.md` |
| `/quality-gate` | WS-Delta, WS-Foxtrot | `docs/skills/quality-gate.md` |
| `/test-run` | WS-Charlie, WS-Echo | `docs/skills/test-run.md` |
| `/sprint-exit` | WS-Foxtrot | `docs/skills/sprint-exit.md` |
| `/security-audit` | WS-Bravo | `docs/skills/security-audit.md` |
| `/evidence` | WS-Foxtrot | `docs/skills/evidence.md` |
| `/stateful-check` | WS-Golf | `docs/skills/stateful-check.md` |
| `/velocity-test` | WS-Golf | `docs/skills/velocity-test.md` |
| `/state-migrate` | WS-Golf | `docs/skills/state-migrate.md` |
