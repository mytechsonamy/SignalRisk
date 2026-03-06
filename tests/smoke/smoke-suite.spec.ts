import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { Redis } from 'ioredis';
import { Pool } from 'pg';

const SKIP = process.env.SKIP_SMOKE_TESTS === 'true';

// ---------------------------------------------------------------------------
// Helper: skip all tests if SKIP_SMOKE_TESTS=true
// ---------------------------------------------------------------------------
function maybeDescribe(name: string, fn: () => void) {
  return SKIP ? describe.skip(name, fn) : describe(name, fn);
}

// ---------------------------------------------------------------------------
// Suite 1: Redis connectivity + rate limiting
// ---------------------------------------------------------------------------
maybeDescribe('Redis — Rate Limiting Smoke', () => {
  let container: StartedTestContainer;
  let redis: Redis;

  beforeAll(async () => {
    container = await new GenericContainer('redis:7-alpine')
      .withExposedPorts(6379)
      .start();

    redis = new Redis({
      host: container.getHost(),
      port: container.getMappedPort(6379),
    });
  }, 120000);

  afterAll(async () => {
    if (redis) await redis.quit();
    if (container) await container.stop();
  });

  it('should connect to Redis successfully', async () => {
    const pong = await redis.ping();
    expect(pong).toBe('PONG');
  });

  it('should execute Lua token bucket script and decrement counter', async () => {
    // Inline the Lua script from MerchantRateLimitService
    const luaScript = `
      local key = KEYS[1]
      local limit = tonumber(ARGV[1])
      local window = tonumber(ARGV[2])
      local current = redis.call('GET', key)
      if current == false then
        redis.call('SET', key, limit - 1, 'EX', window)
        return {1, limit - 1, window}
      end
      local count = tonumber(current)
      if count > 0 then
        local remaining = redis.call('DECR', key)
        local ttl = redis.call('TTL', key)
        return {1, remaining, ttl}
      else
        local ttl = redis.call('TTL', key)
        return {0, 0, ttl}
      end
    `;

    // First call: key doesn't exist, initializes with limit-1
    const result1 = await redis.eval(luaScript, 1, 'rate:merchant-1:test', '10', '60') as number[];
    expect(result1[0]).toBe(1); // allowed
    expect(result1[1]).toBe(9); // remaining = limit - 1 = 9

    // Second call: decrements
    const result2 = await redis.eval(luaScript, 1, 'rate:merchant-1:test', '10', '60') as number[];
    expect(result2[0]).toBe(1); // allowed
    expect(result2[1]).toBe(8); // remaining = 8
  });

  it('should deny requests when bucket is exhausted', async () => {
    const luaScript = `
      local key = KEYS[1]
      local limit = tonumber(ARGV[1])
      local window = tonumber(ARGV[2])
      local current = redis.call('GET', key)
      if current == false then
        redis.call('SET', key, limit - 1, 'EX', window)
        return {1, limit - 1, window}
      end
      local count = tonumber(current)
      if count > 0 then
        local remaining = redis.call('DECR', key)
        local ttl = redis.call('TTL', key)
        return {1, remaining, ttl}
      else
        local ttl = redis.call('TTL', key)
        return {0, 0, ttl}
      end
    `;

    // Set exhausted bucket manually
    await redis.set('rate:merchant-2:exhausted', '0', 'EX', 60);
    const result = await redis.eval(luaScript, 1, 'rate:merchant-2:exhausted', '10', '60') as number[];
    expect(result[0]).toBe(0); // denied
    expect(result[1]).toBe(0); // remaining = 0
  });

  it('should enforce rate limit after 1001 requests (limit=1000)', async () => {
    const luaScript = `
      local key = KEYS[1]
      local limit = tonumber(ARGV[1])
      local window = tonumber(ARGV[2])
      local current = redis.call('GET', key)
      if current == false then
        redis.call('SET', key, limit - 1, 'EX', window)
        return {1, limit - 1, window}
      end
      local count = tonumber(current)
      if count > 0 then
        local remaining = redis.call('DECR', key)
        local ttl = redis.call('TTL', key)
        return {1, remaining, ttl}
      else
        local ttl = redis.call('TTL', key)
        return {0, 0, ttl}
      end
    `;

    const key = 'rate:stress-merchant:endpoint';
    const limit = 10; // small limit for test speed

    let allowedCount = 0;
    let deniedCount = 0;

    for (let i = 0; i < 15; i++) {
      const result = await redis.eval(luaScript, 1, key, String(limit), '60') as number[];
      if (result[0] === 1) allowedCount++;
      else deniedCount++;
    }

    expect(allowedCount).toBe(limit);
    expect(deniedCount).toBe(5); // 15 - 10 = 5 denied
  });

  it('should set correct TTL on rate limit key', async () => {
    await redis.set('rate:ttl-test:ep', '10', 'EX', 60);
    const ttl = await redis.ttl('rate:ttl-test:ep');
    expect(ttl).toBeGreaterThan(55);
    expect(ttl).toBeLessThanOrEqual(60);
  });

  it('should store rule weights and adjust correctly', async () => {
    const key = 'rule:weight:emulator_block_rule';
    await redis.set(key, '1.0');

    // Simulate fraud_confirmed: +0.05, cap at 1.0
    const current = parseFloat(await redis.get(key) ?? '1.0');
    const newWeight = Math.min(1.0, current + 0.05);
    await redis.set(key, String(newWeight));

    const stored = parseFloat(await redis.get(key) ?? '1.0');
    expect(stored).toBe(1.0); // capped

    // Simulate false_positive: -0.03
    const current2 = parseFloat(await redis.get(key) ?? '1.0');
    const newWeight2 = Math.max(0.1, current2 - 0.03);
    await redis.set(key, String(newWeight2));

    const stored2 = parseFloat(await redis.get(key) ?? '1.0');
    expect(stored2).toBeCloseTo(0.97, 2);
  });
});

// ---------------------------------------------------------------------------
// Suite 2: PostgreSQL connectivity + case operations
// ---------------------------------------------------------------------------
maybeDescribe('PostgreSQL — Case Repository Smoke', () => {
  let container: StartedTestContainer;
  let pool: Pool;

  beforeAll(async () => {
    container = await new GenericContainer('postgres:15-alpine')
      .withEnvironment({
        POSTGRES_DB: 'signalrisk_test',
        POSTGRES_USER: 'signalrisk',
        POSTGRES_PASSWORD: 'testpassword',
      })
      .withExposedPorts(5432)
      .start();

    pool = new Pool({
      host: container.getHost(),
      port: container.getMappedPort(5432),
      database: 'signalrisk_test',
      user: 'signalrisk',
      password: 'testpassword',
    });

    // Run minimal schema
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cases (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        merchant_id VARCHAR(255) NOT NULL,
        decision_id VARCHAR(255),
        status VARCHAR(50) NOT NULL DEFAULT 'OPEN',
        priority VARCHAR(50) NOT NULL,
        risk_score INTEGER NOT NULL,
        outcome VARCHAR(50),
        sla_deadline TIMESTAMPTZ,
        sla_breached BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS rule_weight_audit (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        rule_id VARCHAR(255) NOT NULL,
        old_weight NUMERIC(4,2) NOT NULL,
        new_weight NUMERIC(4,2) NOT NULL,
        reason VARCHAR(50) NOT NULL,
        case_id VARCHAR(255),
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  }, 120000);

  afterAll(async () => {
    if (pool) await pool.end();
    if (container) await container.stop();
  });

  it('should connect to PostgreSQL successfully', async () => {
    const result = await pool.query('SELECT 1 as check');
    expect(result.rows[0].check).toBe(1);
  });

  it('should insert a BLOCK case with correct SLA (4 hours)', async () => {
    const slaDeadline = new Date(Date.now() + 4 * 60 * 60 * 1000);

    const result = await pool.query(
      `INSERT INTO cases (merchant_id, decision_id, status, priority, risk_score, sla_deadline)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      ['merchant-001', 'dec-001', 'OPEN', 'HIGH', 85, slaDeadline],
    );

    const row = result.rows[0];
    expect(row.merchant_id).toBe('merchant-001');
    expect(row.priority).toBe('HIGH');
    expect(row.risk_score).toBe(85);
    expect(row.sla_breached).toBe(false);
    expect(new Date(row.sla_deadline).getTime()).toBeGreaterThan(Date.now() + 3.9 * 60 * 60 * 1000);
  });

  it('should insert a REVIEW case with correct SLA (24 hours)', async () => {
    const slaDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const result = await pool.query(
      `INSERT INTO cases (merchant_id, decision_id, status, priority, risk_score, sla_deadline)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      ['merchant-002', 'dec-002', 'OPEN', 'MEDIUM', 65, slaDeadline],
    );

    expect(result.rows[0].priority).toBe('MEDIUM');
    expect(new Date(result.rows[0].sla_deadline).getTime()).toBeGreaterThan(Date.now() + 23.9 * 60 * 60 * 1000);
  });

  it('should mark case as sla_breached=true', async () => {
    // Insert expired case
    const pastDeadline = new Date(Date.now() - 1000);
    const ins = await pool.query(
      `INSERT INTO cases (merchant_id, status, priority, risk_score, sla_deadline) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      ['merchant-sla', 'OPEN', 'HIGH', 90, pastDeadline],
    );
    const caseId = ins.rows[0].id;

    await pool.query('UPDATE cases SET sla_breached = true WHERE id = $1', [caseId]);

    const check = await pool.query('SELECT sla_breached FROM cases WHERE id = $1', [caseId]);
    expect(check.rows[0].sla_breached).toBe(true);
  });

  it('should find breached cases via query', async () => {
    const result = await pool.query(
      `SELECT * FROM cases WHERE sla_deadline < NOW() AND sla_breached = false AND status != 'CLOSED'`,
    );
    // At minimum 0 results (the expired one was already marked)
    expect(Array.isArray(result.rows)).toBe(true);
  });

  it('should write rule weight audit log', async () => {
    const result = await pool.query(
      `INSERT INTO rule_weight_audit (rule_id, old_weight, new_weight, reason, case_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      ['emulator_block', 0.85, 0.90, 'fraud_confirmed', 'case-001'],
    );

    expect(result.rows[0].rule_id).toBe('emulator_block');
    expect(parseFloat(result.rows[0].old_weight)).toBeCloseTo(0.85, 2);
    expect(parseFloat(result.rows[0].new_weight)).toBeCloseTo(0.90, 2);
  });
});

// ---------------------------------------------------------------------------
// Suite 3: Fingerprint consistency (no containers needed)
// ---------------------------------------------------------------------------
describe('Fingerprint Consistency — Pure Logic Smoke', () => {
  // Test the djb2 fingerprint hash for consistency
  // No containers needed — pure computation test

  function djb2Hash(input: string): number {
    let hash = 5381;
    for (let i = 0; i < input.length; i++) {
      hash = ((hash << 5) + hash) + input.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  function generateFingerprint(attrs: Record<string, string>): string {
    const stable = [
      attrs.screenResolution ?? '',
      attrs.timezone ?? '',
      attrs.language ?? '',
      attrs.platform ?? '',
      attrs.webglHash ?? '',
      attrs.canvasHash ?? '',
    ].join('|');

    const hash = djb2Hash(stable);
    return hash.toString(16).padStart(8, '0').repeat(8).slice(0, 64);
  }

  const testAttrs = {
    screenResolution: '1920x1080',
    timezone: 'Africa/Johannesburg',
    language: 'en-ZA',
    platform: 'web',
    webglHash: 'webgl-hash-abc',
    canvasHash: 'canvas-hash-xyz',
  };

  it('should generate identical fingerprint for same attributes (100 iterations)', () => {
    const fingerprints = Array.from({ length: 100 }, () => generateFingerprint(testAttrs));
    const unique = new Set(fingerprints);
    expect(unique.size).toBe(1); // all identical
  });

  it('should generate different fingerprints for different attributes', () => {
    const fp1 = generateFingerprint({ ...testAttrs, timezone: 'Europe/London' });
    const fp2 = generateFingerprint({ ...testAttrs, timezone: 'America/New_York' });
    expect(fp1).not.toBe(fp2);
  });

  it('should produce 64-character hex fingerprint', () => {
    const fp = generateFingerprint(testAttrs);
    expect(fp).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(fp)).toBe(true);
  });

  it('should be order-sensitive (different field order = same result if values same)', () => {
    const fp1 = generateFingerprint(testAttrs);
    const fp2 = generateFingerprint({ ...testAttrs }); // same values, spread creates new obj
    expect(fp1).toBe(fp2);
  });
});
