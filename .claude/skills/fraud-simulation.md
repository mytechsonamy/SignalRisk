# Skill: fraud-simulation

## Metadata
| Key | Value |
|-----|-------|
| **Agent Types** | FRAUD_TESTER_BACKEND |
| **Category** | testing |
| **Dependencies** | fraudtester-adapter |

## Description
Synthetic fraud pattern generation for evaluating fraud detection systems. Scenarios are deterministic (seed-based), self-describing, and categorised by attack vector. Each scenario defines its own quality threshold via `expectedOutcome.minDetectionRate`. The framework measures TP/FP/FN/TN per scenario and aggregates to TPR/FPR in a `BattleReport`.

Built-in scenario categories:
- **device** — device farm attacks, emulator spoofing (repeated fingerprint reuse, GPU renderer indicators)
- **velocity** — velocity-evasion rings (IP /24 rotation, per-user threshold bypass)
- **identity** — SIM-swap, account takeover (attacker device + victim identity mismatch)
- **bot** — headless browser checkouts (zero mouse/scroll events, webdriver flag)
- **network** — VPN/proxy-masked origin attacks

## Patterns

### Seed-based deterministic generator
Use `seed` to make scenarios reproducible across CI runs. Derive `eventId` as `evt-{scenarioShortId}-{seed}-{i}` so results can be correlated back to specific runs.

### TP/FP/FN/TN classification
- **TP**: system returned BLOCK or REVIEW; scenario expectedOutcome is BLOCK or REVIEW
- **FP**: system returned BLOCK or REVIEW; scenario expectedOutcome is ALLOW
- **FN**: system returned ALLOW; scenario expectedOutcome is BLOCK or REVIEW
- **TN**: system returned ALLOW; scenario expectedOutcome is ALLOW
- `detectionRate = TP / (TP + FN)` — the primary quality metric
- `fpr = FP / (FP + TN)` — tracks false alarm rate

### Scenario categories and minDetectionRate
Set `minDetectionRate` conservatively for noisy categories (velocity: 0.70) and aggressively for high-signal categories (bot/device: 0.80–0.85). This prevents CI from requiring perfect detection where the system legitimately has gaps.

### minRiskScore contract
The `minRiskScore` in `expectedOutcome` uses the 0–1 range (not 0–100). Adapters normalise the target system's score to this range before returning a `FraudDecision`.

## Code Examples

### Implementing FraudScenario
```typescript
import type { FraudScenario, FraudTestEvent } from '@signalrisk/fraud-tester';

export const cardTestingScenario: FraudScenario = {
  id: 'card-testing',
  name: 'Card Testing Attack',
  description: 'Attacker probes micro-amounts to validate stolen card numbers.',
  category: 'velocity',
  expectedOutcome: {
    minRiskScore: 0.70,
    decision: 'REVIEW',
    minDetectionRate: 0.70,
  },

  async *generate(seed = 0): AsyncGenerator<FraudTestEvent> {
    for (let i = 0; i < 50; i++) {
      yield {
        eventId: `evt-card-testing-${seed}-${i}`,
        merchantId: 'merchant-test-001',
        deviceFingerprint: `ct-device-${seed}`,
        userId: `ct-user-${seed}-${i % 5}`,
        amount: 0.01 + (i % 5) * 0.01,
        currency: 'USD',
        metadata: { scenarioId: 'card-testing', eventIndex: i, probeAmount: true },
      };
    }
  },
};
```

### AsyncGenerator pattern
```typescript
// Consuming a scenario generator
for await (const event of scenario.generate(42)) {
  const decision = await adapter.submitEvent(event);
  // process result...
}
```

### Computing ScenarioResult
```typescript
import { DetectionReporter } from '@signalrisk/fraud-tester';

const reporter = new DetectionReporter();
const scenarioResult = reporter.compute(attackResults, scenario);

console.log(`Detection rate: ${(scenarioResult.detectionRate * 100).toFixed(1)}%`);
console.log(`Passed: ${scenarioResult.passed}`);
```

## Constraints
- Scenario `id` values must be globally unique — use kebab-case slugs
- `eventId` format: `evt-{scenarioId}-{seed}-{index}` for traceability
- `minRiskScore` must be in 0–1 range (never 0–100)
- `generate()` must be a true `AsyncGenerator<FraudTestEvent>` (use `async function*` or `async *generate()`)
- Do not embed adapter-specific logic in scenario files — scenarios must remain system-agnostic
