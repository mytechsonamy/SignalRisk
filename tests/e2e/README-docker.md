# E2E Testleri Calistirma

## Gereksinimler

- Docker Desktop 4.x+
- docker compose v2 (`docker compose` komutu, `docker-compose` degil)
- Node.js 18+
- `npx` veya global Playwright kurulumu

## Full Stack Ayaga Kaldirma

```bash
docker compose -f docker-compose.full.yml up --wait
```

`--wait` flag'i tum servislerin healthcheck'leri gecene kadar bekler.
Tahmini sure: 60-120 saniye (ilk build dahil daha uzun surebilir).

Servisleri durdurmak ve volume'lari silmek icin:

```bash
docker compose -f docker-compose.full.yml down -v
```

## E2E Testleri Calistirma

### Docker ile (gercek servisler ayakta)

```bash
cd tests/e2e
npx playwright test --config=playwright.config.real.ts
```

Belirli bir senaryo dosyasini calistirmak icin:

```bash
cd tests/e2e
npx playwright test --config=playwright.config.real.ts happy-path
npx playwright test --config=playwright.config.real.ts fraud-blast
```

### Docker olmadan (SKIP_DOCKER=true)

`test.skip(SKIP, ...)` ile isaretlenmis testler atlanir. Gelistirme ortaminda
servisleri ayaga kaldirmadan CI validasyonu yapmak icin kullanilir.

```bash
cd tests/e2e
SKIP_DOCKER=true npx playwright test --config=playwright.config.real.ts
```

## Servis Portlari

| Servis                | Port |
|-----------------------|------|
| auth-service          | 3001 |
| event-collector       | 3002 |
| device-intel-service  | 3003 |
| velocity-service      | 3004 |
| behavioral-service    | 3005 |
| network-intel-service | 3006 |
| telco-intel-service   | 3007 |
| rule-engine-service   | 3008 |
| decision-service      | 3009 |
| case-service          | 3010 |
| webhook-service       | 3011 |
| graph-intel-service   | 3012 |
| feature-flag-service  | 3013 |
| outbox-relay          | 3014 |

## Altyapi Portlari

| Servis    | Port  |
|-----------|-------|
| PostgreSQL | 5432 |
| Redis      | 6379 |
| Kafka      | 9092 (internal), 9094 (host) |
| Neo4j HTTP | 7474 |
| Neo4j Bolt | 7687 |

## Ortam Degiskenleri

Servis URL'lerini environment variable'lar ile override edebilirsiniz:

```bash
AUTH_URL=http://localhost:3001 \
EVENT_URL=http://localhost:3002 \
DECISION_URL=http://localhost:3009 \
CASE_URL=http://localhost:3010 \
npx playwright test --config=playwright.config.real.ts
```

## Senaryo Dosyalari

| Dosya | Aciklama |
|-------|----------|
| `scenarios/happy-path.spec.ts` | Altin yol: ALLOW karari, idempotency, validasyon, auth |
| `scenarios/fraud-blast.spec.ts` | Yuksek hacimli saldiri: velocity rule, BLOCK, case olusturma |
| `scenarios/jwt-revoke.spec.ts` | JWT iptal: jti denylist dogrulama |
| `scenarios/multi-tenant-isolation.spec.ts` | RLS tenant izolasyonu |
| `scenarios/performance-gate.spec.ts` | Gecikme ve verim esigi kontrolleri |
| `scenarios/chaos-redis-down.spec.ts` | Redis devre disi senaryosu |

## CI/CD Durumu

E2E testleri CI'da `SKIP_DOCKER=true` ile calisir (28 test atlanir).
Gercek Docker stack dogrulamasi icin lokal ortamda calistirin.

FraudTester unit testleri CI'da her PR'da calisir:
`apps/fraud-tester/npm test` → 45+ test, SKIP_INTEGRATION=true
