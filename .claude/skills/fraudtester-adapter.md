# Skill: fraudtester-adapter

## Metadata
| Key | Value |
|-----|-------|
| **Agent Types** | FRAUD_TESTER_BACKEND |
| **Category** | integration |
| **Dependencies** | fraud-simulation |

## Description
The `IFraudSystemAdapter` contract decouples the FraudTester framework from any specific fraud detection system. Each adapter normalises a target system's HTTP API into the common `FraudTestEvent` → `FraudDecision` flow. Adapters are responsible for: authentication, request shaping, response normalisation (risk score 0–1, decision enum), and the submit+poll retry loop.

Use Node 18+ built-in `fetch` — do not import `node-fetch` or `axios`. This ensures zero extra runtime dependencies for adapter implementations.

## Patterns

### submitEvent + poll pattern
Most fraud systems are async: the event is accepted (202) and the decision is computed asynchronously. The canonical pattern is:
1. `POST /ingest-endpoint` — accept the event
2. Poll `GET /decision-endpoint/{id}` with exponential or fixed backoff
3. Return on first non-null decision; throw after `MAX_POLL_ATTEMPTS`
4. Record `latencyMs = Date.now() - start` covering the full round-trip

```typescript
async submitEvent(event: FraudTestEvent): Promise<FraudDecision> {
  const start = Date.now();
  await fetch(`${this.baseUrl}/ingest`, { method: 'POST', body: JSON.stringify(event) });

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(POLL_INTERVAL_MS);
    const decision = await this.getDecision(event.eventId);
    if (decision !== null) return { ...decision, latencyMs: Date.now() - start };
  }
  throw new Error(`Decision not available after ${MAX_POLL_ATTEMPTS} polls`);
}
```

### healthCheck contract
`healthCheck()` must return `true` only when the system is fully operational and can process events. It must never throw — catch all errors and return `false`. The ScenarioRunner checks health before starting a run.

```typescript
async healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${this.baseUrl}/health`);
    return res.status === 200;
  } catch {
    return false;
  }
}
```

### reset contract
`reset()` clears test state (velocity counters, device reputation cache) to ensure scenario isolation. If the target system does not support reset, implement as a no-op with a `// TODO` comment. Never throw from `reset()`.

### fetch with Node 18+ built-in
```typescript
// Correct — uses Node 18+ built-in fetch
const res = await fetch(url, { headers: { 'Authorization': `Bearer ${apiKey}` } });

// Wrong — do not use node-fetch or axios
import fetch from 'node-fetch'; // NOT allowed
```

### Risk score normalisation
Always normalise the target system's score to the 0–1 range before setting `FraudDecision.riskScore`. If the system returns 0–100, divide by 100. If it returns 0–1000, divide by 1000. Document the normalisation in the adapter's JSDoc.

## Code Examples

### IFraudSystemAdapter interface
```typescript
export interface IFraudSystemAdapter {
  readonly name: string;
  submitEvent(event: FraudTestEvent): Promise<FraudDecision>;
  getDecision(eventId: string): Promise<FraudDecision | null>;
  reset(): Promise<void>;
  healthCheck(): Promise<boolean>;
}
```

### SignalRiskAdapter — minimal example
```typescript
import type { IFraudSystemAdapter, FraudTestEvent, FraudDecision } from '@signalrisk/fraud-tester';

export class SignalRiskAdapter implements IFraudSystemAdapter {
  readonly name = 'SignalRisk';

  constructor(private readonly config: {
    baseUrl: string;    // event-collector, e.g. http://localhost:3002
    apiKey: string;     // sk_test_<32hex>
    merchantId: string;
    decisionUrl?: string; // decision-service, e.g. http://localhost:3009
  }) {}

  async submitEvent(event: FraudTestEvent): Promise<FraudDecision> {
    const start = Date.now();
    await fetch(`${this.config.baseUrl}/v1/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
        'X-Merchant-ID': this.config.merchantId,
      },
      body: JSON.stringify({ events: [event] }),
    });
    // ... poll loop ...
    return { eventId: event.eventId, decision: 'ALLOW', riskScore: 0, latencyMs: Date.now() - start };
  }

  async getDecision(eventId: string): Promise<FraudDecision | null> {
    const base = this.config.decisionUrl ?? this.config.baseUrl;
    const res = await fetch(`${base}/v1/decisions/${eventId}`, {
      headers: { 'Authorization': `Bearer ${this.config.apiKey}` },
    });
    if (res.status === 404) return null;
    const data = await res.json();
    return { eventId, decision: data.action, riskScore: data.riskScore, latencyMs: 0 };
  }

  async reset(): Promise<void> { /* no-op */ }

  async healthCheck(): Promise<boolean> {
    try {
      return (await fetch(`${this.config.baseUrl}/health`)).status === 200;
    } catch { return false; }
  }
}
```

## Constraints
- Adapters must use Node 18+ built-in `fetch` — no `node-fetch`, `axios`, or `got`
- `getDecision()` must return `null` on 404 (never throw)
- `healthCheck()` must never throw — always return boolean
- `FraudDecision.riskScore` must be in 0–1 range — normalise before returning
- SignalRisk-specific logic (HMAC signing, X-Merchant-ID, event wrapping) stays inside `SignalRiskAdapter` — never leaks into scenarios or the orchestrator
- Adapter `name` property must be a stable string — used as the `targetAdapter` key in `BattleReport`
