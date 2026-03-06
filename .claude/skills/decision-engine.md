# Skill: decision-engine

## Metadata
| Key | Value |
|-----|-------|
| **Agent Types** | BACKEND_NODE |
| **Category** | backend |
| **Dependencies** | nestjs-service-creation, redis-caching-patterns, rule-engine-dsl |

## Description
The Decision Engine orchestrates all intelligence modules in parallel, evaluates rules, and produces a risk score with explanation. It is the core service of SignalRisk, handling the hot path with <200ms p99 latency.

## Patterns
- Parallel intelligence lookups via Promise.all() (device, velocity, behavioral, network, telco)
- Score aggregation: weighted sum of matched rule weights
- Risk factors: array of human-readable explanations for the decision
- Idempotency: Redis hot check + PostgreSQL cold check
- Graceful degradation: partial scoring when some intelligence modules are unavailable
- Decision outcomes: ALLOW, REVIEW, BLOCK
- Async post-decision: publish to Kafka for case creation, webhook, feature store update

## Architecture Reference
architecture-v3.md#2.2-service-interaction-flow

## Code Examples
```typescript
@Injectable()
export class DecisionEngine {
  constructor(
    private readonly deviceIntel: DeviceIntelClient,
    private readonly velocityEngine: VelocityClient,
    private readonly behavioralIntel: BehavioralClient,
    private readonly networkIntel: NetworkClient,
    private readonly telcoIntel: TelcoClient,
    private readonly ruleEngine: RuleEvaluator,
    private readonly redis: RedisService,
  ) {}

  async evaluate(request: DecisionRequest): Promise<DecisionResponse> {
    // 1. Idempotency check
    const cached = await this.redis.get(`req:${request.requestId}`);
    if (cached) return JSON.parse(cached);

    // 2. Parallel intelligence lookups
    const [device, velocity, behavioral, network, telco] = await Promise.allSettled([
      this.deviceIntel.getSignals(request),
      this.velocityEngine.getSignals(request),
      this.behavioralIntel.getSignals(request),
      this.networkIntel.getSignals(request),
      this.telcoIntel.getSignals(request),
    ]);

    // 3. Build signal set (graceful degradation for failed modules)
    const signals = this.buildSignalSet(device, velocity, behavioral, network, telco);

    // 4. Rule evaluation (in-memory, <5ms)
    const ruleResults = this.ruleEngine.evaluate(signals);

    // 5. Score aggregation
    const riskScore = this.aggregateScore(ruleResults);
    const decision = this.determineOutcome(riskScore);
    const riskFactors = this.explainDecision(ruleResults, signals);

    // 6. Cache response + async publish
    const response = { decision, riskScore, riskFactors, signals: signals.available };
    await this.redis.setex(`req:${request.requestId}`, 3600, JSON.stringify(response));
    await this.publishDecisionEvent(request, response);

    return response;
  }

  private buildSignalSet(...results: PromiseSettledResult<any>[]): AllSignals {
    // Use fulfilled results, mark rejected as unavailable
    // Graceful degradation: score with available signals only
  }
}
```

## Constraints
- Decision API p99 < 200ms (warm cache), < 300ms (cold cache)
- All intelligence lookups MUST run in parallel via Promise.all/allSettled
- Graceful degradation: if an intelligence module fails, score with remaining signals (flag partial)
- Idempotency: same request_id always returns same response (Redis + PG)
- Post-decision Kafka publish is ASYNC (do not block response)
- Replay attack protection: validate X-Timestamp (within 5 min) + X-Signature (HMAC)
