# Skill: jest-testing

## Metadata
| Key | Value |
|-----|-------|
| **Agent Types** | BACKEND_NODE, QA |
| **Category** | testing |

## Description
Testing patterns for SignalRisk backend services using Jest + Supertest. Covers unit tests, integration tests, cross-tenant isolation tests, and performance benchmarks.

## Patterns
- Jest for unit tests, Supertest for HTTP integration tests
- Cross-tenant isolation tests: verify RLS prevents data leakage between merchants
- Performance benchmarks: track p99 latency per sprint exit criteria
- Test databases: separate PostgreSQL schema per test suite (parallel-safe)
- Redis mock or test instance per suite
- Coverage targets: >80% lines overall, >90% branch on decision/auth/isolation paths

## Code Examples
```typescript
// Unit test (service layer)
describe('VelocityService', () => {
  let service: VelocityService;
  let redis: MockRedisService;

  beforeEach(() => {
    redis = new MockRedisService();
    service = new VelocityService(redis);
  });

  it('should detect burst when count exceeds 3x baseline', async () => {
    redis.mockZcount('m1:vel:tx:user1', 35); // 35 tx in 1h
    redis.mockGet('m1:vel:baseline:user1', '10'); // baseline = 10

    const result = await service.detectBurst('m1', 'user1');
    expect(result).toBe(true);
  });
});

// Cross-tenant isolation test
describe('Cross-Tenant Isolation', () => {
  it('merchant A cannot access merchant B devices', async () => {
    // Create device for merchant A
    await request(app).post('/devices')
      .set('Authorization', `Bearer ${merchantAToken}`)
      .send({ fingerprint: 'fp-123' })
      .expect(201);

    // Merchant B should not see it
    const res = await request(app).get('/devices/fp-123')
      .set('Authorization', `Bearer ${merchantBToken}`)
      .expect(404);
  });
});

// Integration test (E2E flow)
describe('Decision API E2E', () => {
  it('should return risk score within 200ms', async () => {
    const start = Date.now();
    const res = await request(app).post('/v1/decisions')
      .set('Authorization', `Bearer ${token}`)
      .send(validDecisionRequest)
      .expect(200);

    expect(Date.now() - start).toBeLessThan(200);
    expect(res.body).toHaveProperty('decision');
    expect(res.body).toHaveProperty('risk_score');
    expect(res.body).toHaveProperty('risk_factors');
  });
});
```

## Constraints
- Cross-tenant isolation tests MUST run every sprint for all new endpoints
- Coverage: >80% lines, >90% branch on decision/auth/isolation code paths
- Performance tests: track p99 against sprint exit criteria thresholds
- Test data: use factories, never hardcoded UUIDs
- Parallel test execution: each suite gets isolated DB schema + Redis namespace
- Never test against production data -- use labeled test dataset (10K decisions)
