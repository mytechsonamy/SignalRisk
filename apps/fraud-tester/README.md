# @signalrisk/fraud-tester

An AI-driven framework for stress-testing fraud detection systems with realistic synthetic attack scenarios. The framework is adapter-based: any fraud detection system can be connected by implementing a single `IFraudSystemAdapter` interface, keeping test scenarios and reporting completely system-agnostic.

The framework ships with five built-in attack scenarios covering the most common fraud patterns observed in e-commerce and financial services: device farm attacks, bot-driven checkouts, velocity-evasion rings, Android emulator spoofing, and SIM-swap identity fraud. Each scenario is fully deterministic via an optional seed parameter, enabling reproducible CI runs and regression comparisons across system versions.

Detection quality is measured with TP/FP/FN/TN classification, per-scenario detection rate (TPR), and false-positive rate (FPR). Results are aggregated into a `BattleReport` that can be logged, stored, or used to gate a CI pipeline.

## Quick Start

### Connect an adapter and run all scenarios

```typescript
import {
  SignalRiskAdapter,
  FraudSimulationAgent,
} from '@signalrisk/fraud-tester';

const adapter = new SignalRiskAdapter({
  baseUrl: 'http://localhost:3002',   // event-collector
  decisionUrl: 'http://localhost:3009', // decision-service
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

### Run a single scenario with the low-level runner

```typescript
import {
  SignalRiskAdapter,
  ScenarioRunner,
  deviceFarmScenario,
} from '@signalrisk/fraud-tester';

const adapter = new SignalRiskAdapter({ /* ... */ });
const runner = new ScenarioRunner();

runner.on('result', (result) => {
  console.log(`${result.event.eventId} → ${result.decision.decision} (detected: ${result.detected})`);
});

const report = await runner.run([deviceFarmScenario], adapter);
```

## Writing a New Adapter

Implement `IFraudSystemAdapter` to connect any fraud detection system:

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
      body: JSON.stringify({ id: event.eventId, device: event.deviceFingerprint }),
    });
    const data = await res.json();
    return {
      eventId: event.eventId,
      decision: data.verdict,   // must be 'ALLOW' | 'REVIEW' | 'BLOCK'
      riskScore: data.score,    // must be 0–1
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

## Writing a New Scenario

Implement `FraudScenario` with an async generator:

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
        metadata: { scenarioId: 'account-takeover', eventIndex: i },
      };
    }
  },
};
```
