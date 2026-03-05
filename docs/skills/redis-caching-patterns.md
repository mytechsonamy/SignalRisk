# Skill: redis-caching-patterns

## Metadata
| Key | Value |
|-----|-------|
| **Agent Types** | BACKEND_NODE |
| **Category** | backend |

## Description
Redis caching patterns for SignalRisk: velocity counters (sorted sets), feature store caching, idempotency checks, and session features. All keys prefixed with merchant ID for tenant isolation.

## Patterns
- Redis Cluster (7.x) for <10ms p95 feature retrieval
- Velocity counters: Redis sorted sets with ZRANGEBYSCORE for time-windowed counts
- Feature store: Pipelined MGET for parallel feature retrieval
- Idempotency: Hot check in Redis (`req:{request_id}`), cold check in PostgreSQL
- All keys MUST be prefixed with `{merchantId}:` for tenant isolation
- Exponential decay for velocity half-life
- Compact timestamps (seconds, not milliseconds) for memory efficiency
- HyperLogLog for high-cardinality counters (unique devices)

## Architecture Reference
architecture-v3.md#2.3-latency-budget-allocation

## Code Examples
```typescript
// Velocity counter (sorted set)
@Injectable()
export class VelocityService {
  constructor(private readonly redis: RedisService) {}

  async incrementCounter(merchantId: string, dimension: string, entityId: string, amount: number): Promise<void> {
    const key = `${merchantId}:vel:${dimension}:${entityId}`;
    const now = Math.floor(Date.now() / 1000); // compact timestamp
    await this.redis.zadd(key, now, `${now}:${amount}`);
    await this.redis.expire(key, 86400); // 24h TTL
  }

  async getCount(merchantId: string, dimension: string, entityId: string, windowSeconds: number): Promise<number> {
    const key = `${merchantId}:vel:${dimension}:${entityId}`;
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - windowSeconds;
    return this.redis.zcount(key, windowStart, now);
  }

  async detectBurst(merchantId: string, entityId: string): Promise<boolean> {
    const count1h = await this.getCount(merchantId, 'tx', entityId, 3600);
    const baseline = await this.getBaseline(merchantId, entityId);
    return count1h > baseline * 3; // 3x baseline = burst
  }
}

// Feature store cache (pipelined)
async getFeatures(merchantId: string, entityId: string): Promise<FeatureSet> {
  const keys = [
    `${merchantId}:feat:device:${entityId}`,
    `${merchantId}:feat:vel:${entityId}`,
    `${merchantId}:feat:behav:${entityId}`,
  ];
  const results = await this.redis.pipeline()
    .mget(keys)
    .exec();
  // Parse and merge feature sets
}

// Idempotency check (hot path)
async checkIdempotency(requestId: string): Promise<CachedResponse | null> {
  const cached = await this.redis.get(`req:${requestId}`);
  return cached ? JSON.parse(cached) : null;
}
```

## Constraints
- ALL Redis keys MUST be prefixed with `{merchantId}:` for tenant isolation
- Use compact timestamps (seconds) not milliseconds to save memory
- Set TTL on ALL keys -- no unbounded growth
- Use pipelined MGET for parallel feature retrieval (never sequential GET calls)
- Velocity sorted sets: prune entries older than 24h on read
- If Redis is down: degrade gracefully (score without velocity, idempotency from PG)
- Key scheme: `{merchantId}:{type}:{dimension}:{entityId}` (e.g., `m123:vel:tx:user456`)
