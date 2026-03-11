# /velocity-test

Velocity-service v2 (typed counters) dogrulama skill'i.

## Kullanim

```
/velocity-test [entityType] [entityId]
```

## Test Adimlari

1. Event gonder (`POST /v1/events`) → Kafka'ya publish edildigini dogrula
2. Velocity counter guncellenmesini bekle (poll, max 5s)
3. Her entityType icin counter'lari sorgula:
   - **customer:** txCount10m, txCount1h, txCount24h, amountSum24h
   - **device:** distinctAccounts24h, distinctAccounts7d
   - **ip:** signupCount10m, paymentCount1h
4. Burst detection: ayni entity icin 5 event gonder → burstDetected=true
5. Tenant isolation: farkli merchantId ile counter sizintisi yok

## Cikti

entityType bazli counter degerleri + PASS/FAIL

## Guardrail

velocity-service `/health` check once calistir

## Kaynak

- `apps/velocity-service/src/velocity/velocity.service.ts`
- `apps/velocity-service/src/consumer/velocity-event.consumer.ts`
