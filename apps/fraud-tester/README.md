# @signalrisk/fraud-tester

AI-driven fraud detection testing framework. Kendi fraud sisteminizi simule edilmis saldirilara karsi test edin.

## Ozellikler

- **5 temel fraud senaryosu**: device farm, bot checkout, velocity evasion, emulator spoof, SIM swap
- **3 adversarial senaryo**: emulator bypass, slow fraud, bot evasion
- **3 chaos senaryosu**: timeout injection, partial failure, stress test
- **Plugin adapter sistemi**: herhangi bir fraud API'ye `IFraudSystemAdapter` implement ederek baglanin
- **MockAdapter**: ag baglantisi gerektirmez — CI ve birim testler icin
- **Gercek zamanli battle raporlama**: Socket.io + REST API
- **TPR / FPR / Latency metrikleri**: TP, FP, FN, TN hesabi + senaryo bazli detay

---

## Quick Start

### 1. SignalRisk adapter ile calistir

```typescript
import { SignalRiskAdapter, FraudSimulationAgent } from '@signalrisk/fraud-tester';

const adapter = new SignalRiskAdapter({
  baseUrl: 'http://localhost:3002',       // event-collector
  decisionUrl: 'http://localhost:3009',   // decision-service
  apiKey: 'sk_test_your32hexkeyhere00000000000000',
  merchantId: 'merchant-test-001',
});

const healthy = await adapter.healthCheck();
if (!healthy) throw new Error('Target system is not reachable');

const agent = new FraudSimulationAgent();
const report = await agent.run(adapter);

console.log(`TPR: ${(report.overallTpr * 100).toFixed(1)}%`);
console.log(`FPR: ${(report.overallFpr * 100).toFixed(1)}%`);
console.log(`Avg latency: ${report.avgLatencyMs.toFixed(0)} ms`);

for (const scenario of report.scenarios) {
  const status = scenario.passed ? 'PASS' : 'FAIL';
  console.log(`[${status}] ${scenario.scenarioName}: ${(scenario.detectionRate * 100).toFixed(1)}% detected`);
}
```

### 2. MockAdapter ile ag baglantisi olmadan calistir

```typescript
import { MockAdapter, FraudSimulationAgent } from '@signalrisk/fraud-tester';

// Threshold modu: riskScore > 0.7 = BLOCK, > 0.4 = REVIEW, else = ALLOW
const adapter = new MockAdapter({
  mode: 'threshold',
  fixedRiskScore: 0.85,   // tum eventler icin sabit skor
  fixedLatencyMs: 20,
});

const agent = new FraudSimulationAgent();
const report = await agent.run(adapter);

console.log(`Battle tamamlandi. TPR: ${(report.overallTpr * 100).toFixed(1)}%`);
```

### 3. FraudTester HTTP server baslatir

```typescript
import { createServer } from '@signalrisk/fraud-tester';

const server = createServer(3020);
// POST /v1/fraud-tester/battles  → battle baslatir
// GET  /v1/fraud-tester/battles  → tum battle listesi
// Socket.io → gercek zamanli sonuclar
```

### 4. Battle sonuclarini oku

```bash
# Tum battle'lari listele
curl http://localhost:3020/v1/fraud-tester/battles

# Belirli bir battle'in raporunu al
curl http://localhost:3020/v1/fraud-tester/battles/battle-1234-abcd

# Yeni battle baslatir (SignalRisk adresini override et)
curl -X POST http://localhost:3020/v1/fraud-tester/battles \
  -H "Content-Type: application/json" \
  -d '{"baseUrl":"http://localhost:3002","apiKey":"sk_test_...","merchantId":"test-001"}'
```

---

## Yeni Adapter Yazma

`IFraudSystemAdapter` interface'ini implement ederek herhangi bir fraud sistemine baglanin:

```typescript
import type {
  IFraudSystemAdapter,
  FraudTestEvent,
  FraudDecision,
} from '@signalrisk/fraud-tester';

export class AcmeFraudAdapter implements IFraudSystemAdapter {
  readonly name = 'AcmeFraud';

  constructor(private readonly apiEndpoint: string) {}

  async submitEvent(event: FraudTestEvent): Promise<FraudDecision> {
    const start = Date.now();
    const res = await fetch(`${this.apiEndpoint}/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: event.eventId,
        device: event.deviceFingerprint,
        ip: event.ipAddress,
        amount: event.amount,
      }),
    });
    const data = await res.json();
    return {
      eventId: event.eventId,
      decision: data.verdict,   // 'ALLOW' | 'REVIEW' | 'BLOCK'
      riskScore: data.score,    // 0–1
      latencyMs: Date.now() - start,
    };
  }

  async getDecision(eventId: string): Promise<FraudDecision | null> {
    const res = await fetch(`${this.apiEndpoint}/decisions/${eventId}`);
    if (res.status === 404) return null;
    const data = await res.json();
    return { eventId, decision: data.verdict, riskScore: data.score, latencyMs: 0 };
  }

  async reset(): Promise<void> {
    await fetch(`${this.apiEndpoint}/test/reset`, { method: 'DELETE' });
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.apiEndpoint}/health`);
      return res.status === 200;
    } catch {
      return false;
    }
  }
}
```

---

## Yeni Senaryo Ekleme

`FraudScenario` interface'ini ve `AsyncGenerator` kullanarak ozel saldiri senaryosu tanimlayin:

```typescript
import type { FraudScenario, FraudTestEvent } from '@signalrisk/fraud-tester';

export const accountTakeoverScenario: FraudScenario = {
  id: 'account-takeover',
  name: 'Account Takeover',
  description: 'Attacker reuses stolen credentials from a different device and IP.',
  category: 'identity',
  expectedOutcome: {
    minRiskScore: 0.70,
    decision: 'REVIEW',
    minDetectionRate: 0.75,
  },

  async *generate(seed = 0): AsyncGenerator<FraudTestEvent> {
    for (let i = 0; i < 50; i++) {
      yield {
        eventId: `evt-ato-${seed}-${i}`,
        merchantId: 'merchant-test-001',
        deviceFingerprint: `attacker-device-${seed}`,
        userId: `victim-${seed}`,
        ipAddress: `198.51.100.${i % 254 + 1}`,
        amount: 250 + (i % 750),
        currency: 'USD',
        metadata: { scenarioName: 'Account Takeover', eventIndex: i },
      };
    }
  },
};
```

Senaryoyu `FraudSimulationAgent`'a gecin:

```typescript
import { ScenarioRunner } from '@signalrisk/fraud-tester';
import { accountTakeoverScenario } from './account-takeover.scenario';

const runner = new ScenarioRunner();
runner.on('result', (r) => console.log(r.decision.decision));
const report = await runner.run([accountTakeoverScenario], adapter);
```

---

## MockAdapter Modlari

| Mod | Davranis |
|-----|----------|
| `always-block` | Her event BLOCK doner |
| `always-allow` | Her event ALLOW doner |
| `always-review` | Her event REVIEW doner |
| `random` | Karar rastgele secilir (varsayilan) |
| `threshold` | riskScore > 0.7 → BLOCK, > 0.4 → REVIEW, aksi halde ALLOW |
| `custom` | `customFn(event)` ile tam kontrol |

```typescript
// custom mod ornegi
const adapter = new MockAdapter({
  mode: 'custom',
  fixedLatencyMs: 10,
  customFn: (event) => ({
    decision: event.amount && event.amount > 1000 ? 'BLOCK' : 'ALLOW',
    riskScore: event.amount ? Math.min(event.amount / 2000, 1) : 0.1,
  }),
});
```

---

## HTTP API Referansi

### GET /health

```json
{ "status": "ok", "latencyMs": 0, "timestamp": "2026-03-07T10:00:00.000Z" }
```

### POST /v1/fraud-tester/battles

Battle baslatir. Opsiyonel body:

```json
{
  "baseUrl": "http://localhost:3002",
  "decisionUrl": "http://localhost:3009",
  "apiKey": "sk_test_...",
  "merchantId": "merchant-001"
}
```

Response `201`:

```json
{ "battleId": "battle-1741345200000-a1b2c3d4" }
```

### GET /v1/fraud-tester/battles

```json
[
  {
    "battleId": "battle-...",
    "status": "completed",
    "startedAt": "2026-03-07T10:00:00.000Z",
    "completedAt": "2026-03-07T10:01:30.000Z",
    "report": {
      "overallTpr": 0.87,
      "overallFpr": 0.04,
      "avgLatencyMs": 142,
      "scenarios": [...]
    }
  }
]
```

### GET /v1/fraud-tester/battles/:id

Tek battle, tam BattleReport dahil.

### POST /v1/fraud-tester/battles/:id/stop

```json
{ "ok": true }
```

### Socket.io Events (port 3020, path /socket.io)

| Event | Yon | Payload |
|-------|-----|---------|
| `join:battle` | client → server | `battleId: string` |
| `battle:result` | server → client | `{ id, scenarioName, decision, riskScore, latencyMs, timestamp }` |
| `battle:scenarioDone` | server → client | `ScenarioResult` |
| `battle:complete` | server → client | `BattleReport` |

---

## Mimari

```
apps/fraud-tester/
  src/
    adapters/
      base.adapter.ts         # IFraudSystemAdapter, FraudTestEvent, FraudDecision
      signalrisk.adapter.ts   # Canli SignalRisk instance'ina baglanir
      mock.adapter.ts         # In-memory, ag baglantisi yok (CI/test)
      chaos-wrapper.ts        # Herhangi bir adapter'i chaos ile sarar
    scenarios/
      types.ts                # FraudScenario, BattleReport, ScenarioResult, AttackResult
      catalog/
        device-farm.scenario.ts
        bot-checkout.scenario.ts
        velocity-evasion.scenario.ts
        emulator-spoof.scenario.ts
        sim-swap.scenario.ts
        adversarial/
          emulator-bypass.scenario.ts
          slow-fraud.scenario.ts
          bot-evasion.scenario.ts
    agents/
      base.agent.ts           # IFraudTestAgent interface
      fraud-simulation.agent.ts  # 5 temel senaryo
      adversarial.agent.ts    # 3 kacis senaryosu
      chaos.agent.ts          # 3 chaos konfigurasyonu
    orchestrator/
      orchestrator.ts         # ScenarioRunner (EventEmitter tabanli)
    reporter/
      detection-reporter.ts   # TP/FP/FN/TN + BattleReport hesabi
    api/
      server.ts               # Express + Socket.io server (port 3020)
    index.ts                  # Public API entry point
```

### Veri Akisi

```
FraudTestAgent
    |
    v
ScenarioRunner ──(AsyncGenerator)──> FraudTestEvent
    |
    v (per event)
IFraudSystemAdapter.submitEvent()
    |
    v
FraudDecision { decision, riskScore, latencyMs }
    |
    v
DetectionReporter.compute()
    |
    v
BattleReport { overallTpr, overallFpr, avgLatencyMs, scenarios[] }
```
