# Skill: Test Run

Belirtilen senaryo veya test katmanini calistir, run record uret.

## Kullanim

```
/test-run SR-P0-001              — tek senaryo
/test-run SR-P0-001 SR-P0-005    — birden fazla senaryo
/test-run --layer G1             — tum G1 katmani
/test-run --priority P0          — tum P0 senaryolar
```

## Senaryo Katalogu

Senaryo tanimlari: `docs/testing/scenario-catalog.md`

### Senaryo → Test Eslestirme

| Senaryo | Test Dosyasi / Komutu |
|---|---|
| SR-P0-001 | `tests/e2e/scenarios/` — auth/merchant token flow |
| SR-P0-002 | `tests/e2e/scenarios/` — invalid credentials |
| SR-P0-003 | `tests/e2e/scenarios/` — event ingestion |
| SR-P0-004 | `tests/e2e/scenarios/` — DLQ routing |
| SR-P0-005 | `tests/e2e/scenarios/` — decision flow |
| SR-P0-006 | `tests/e2e/scenarios/` — case creation |
| SR-P0-007 | `tests/e2e/scenarios/` — webhook delivery |
| SR-P0-008 | `tests/e2e/scenarios/` — test traffic isolation |
| SR-P0-009 | `tests/e2e/scenarios/multi-tenant-isolation.spec.ts` |
| SR-P0-010 | `tests/e2e/scenarios/` — JWT forge test |
| SR-P0-013 | `tests/e2e/scenarios/chaos-redis.spec.ts` |
| SR-P0-014 | `tests/e2e/scenarios/chaos-kafka.spec.ts` |

## Run Record Formati

Format detayi: `docs/testing/evidence-and-reporting.md`

```
## Scenario Run Record

- **Scenario ID:** SR-P0-XXX
- **Title:** [senaryo basligi]
- **Environment:** Docker Compose (local) / Staging
- **Build/Commit:** [git commit hash]
- **Executed By:** Claude Code
- **Timestamp:** [ISO-8601]

### Preconditions
- [ortam hazirlik adimlari]

### Steps Executed
1. [adim]
2. [adim]

### Observed Result
[gozlem]

### Success Criteria Check
- [ ] [kriter 1]
- [ ] [kriter 2]

### Verdict: PASS / FAIL

### Evidence
- CI run: [link/id]
- Logs: [relevant log lines]
- Defects: [varsa]
```

## Referanslar
- `docs/testing/scenario-catalog.md` (canonical senaryo tanimlari)
- `docs/testing/evidence-and-reporting.md` (run record formati)
