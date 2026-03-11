# /stateful-check

Stateful fraud detection altyapisinin saglik kontrolu.

## Kontrol Listesi

1. **Entity-type support:** velocity-service typed counter'lar calisiyor mu?
   - `GET /v1/velocity/{entityId}?entityType=customer` → 200
   - `GET /v1/velocity/{entityId}?entityType=device` → 200
   - `GET /v1/velocity/{entityId}?entityType=ip` → 200

2. **Stateful context:** decision-service `stateful.*` key'lerini compose ediyor mu?
   - Decision response'da `signals.stateful` objesi var mi?

3. **Prior-decision memory:** Redis cache calisiyor mu?
   - `{merchantId}:vel:prior:{entityType}:{entityId}` key mevcut mu?

4. **Namespace compliance:** tum stateful feature'lar kayitli mi?
   - `docs/claude/source-of-truth.md#stateful-namespace` ile karsilastir

5. **Entity identity:** consumer dogru entity type'larla yazdiriyor mu?
   - Kafka consume → 3 ayri Redis key guncellenmeli (customer, device, IP)

## Cikti

PASS/FAIL + eksik/kirik bilesen listesi

## Kaynak

- `docs/testing/scenario-catalog.md` § Stateful patterns
- `docs/claude/source-of-truth.md#stateful-namespace`
