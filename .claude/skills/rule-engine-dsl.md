# Skill: rule-engine-dsl

## Metadata
| Key | Value |
|-----|-------|
| **Agent Types** | BACKEND_NODE |
| **Category** | backend |

## Description
Rule Engine with custom DSL for SignalRisk fraud detection. Parses EBNF grammar into AST, evaluates rules against signal contracts from all intelligence modules. Supports threshold randomization, missing signal handling, staged rollout, and hot-reload via Kafka.

## Patterns
- DSL parser: EBNF grammar -> AST (recursive descent parser)
- In-memory evaluation pipeline (no I/O during evaluation)
- Threshold randomization with deterministic seed (prevents gaming)
- Missing signal handling: configurable per rule (skip / default_high / default_low)
- Rule lifecycle: Draft -> Simulate -> Approve -> Shadow -> Staged (10/50/100%) -> Active
- Hot-reload: Kafka-driven cache invalidation when rules change
- Rule versioning with full diff history
- Simulation endpoint: replay N-day events through candidate rule

## Architecture Reference
architecture-v3.md (Rule Engine section)

## Code Examples
```typescript
// DSL example
// WHEN device.trust_score < 30 AND velocity.tx_count_1h > 10 THEN BLOCK weight=0.8
// WHEN network.is_vpn = true AND behavioral.session_risk_score > 70 THEN REVIEW weight=0.6

// Rule interface (matches signal contracts)
interface Rule {
  id: string;
  name: string;
  dsl: string;
  ast: RuleAST;
  version: number;
  status: 'DRAFT' | 'SHADOW' | 'STAGED' | 'ACTIVE' | 'ARCHIVED';
  rolloutPercentage: number; // 0-100
  missingSignalPolicy: 'skip' | 'default_high' | 'default_low';
  weight: number; // 0.0-1.0
}

// Signal contracts (from packages/signal-contracts/)
interface AllSignals {
  device: DeviceSignals;
  velocity: VelocitySignals;
  behavioral: BehavioralSignals;
  network: NetworkSignals;
  telco: TelcoSignals;
}

// Evaluation (in-memory, no I/O)
@Injectable()
export class RuleEvaluator {
  evaluate(rules: Rule[], signals: AllSignals): RuleResult[] {
    return rules
      .filter(r => r.status === 'ACTIVE' || this.isInRollout(r))
      .map(rule => {
        try {
          const match = this.evaluateAST(rule.ast, signals);
          return { ruleId: rule.id, matched: match, weight: rule.weight };
        } catch (e) {
          if (rule.missingSignalPolicy === 'skip') return null;
          if (rule.missingSignalPolicy === 'default_high') return { ruleId: rule.id, matched: true, weight: rule.weight };
          return { ruleId: rule.id, matched: false, weight: rule.weight };
        }
      })
      .filter(Boolean);
  }
}
```

## Constraints
- Rule evaluation MUST be < 5ms p99 for a 50-rule set (no I/O allowed)
- All signal types imported from `packages/signal-contracts/` (typed interfaces)
- Threshold randomization: use deterministic seed per (rule_id, request_id) to prevent probing
- Staged rollout: percentage determined by hash(merchant_id, rule_id) for consistency
- Hot-reload: subscribe to `signalrisk.rules.changes` Kafka topic for cache invalidation
- Auto-rollback trigger: FPR increase > 1% absolute at any rollout stage
