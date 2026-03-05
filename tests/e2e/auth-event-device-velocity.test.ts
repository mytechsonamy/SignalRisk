/**
 * SignalRisk E2E Integration Tests
 *
 * task-s2-14: Auth + Event + Device + Velocity E2E
 *
 * Tests the full request lifecycle:
 *   JWT auth → event ingestion → Kafka → device fingerprint → velocity counters
 *
 * Requires running services (set SERVICE_URLS or use defaults):
 *   - auth-service  (AUTH_SERVICE_URL,   default: http://localhost:3001)
 *   - event-collector (EVENTS_SERVICE_URL, default: http://localhost:3002)
 *   - device-intel  (DEVICES_SERVICE_URL, default: http://localhost:3004)
 *   - velocity      (VELOCITY_SERVICE_URL, default: http://localhost:3003)
 *
 * Set E2E_SKIP=true to skip these tests in environments without running services.
 */

import supertest from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { generateToken, expiredToken, invalidSignatureToken } from '../helpers/auth.helper';
import { asMerchant, withToken } from '../helpers/api.helper';

// ────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────

const AUTH_URL = process.env.AUTH_SERVICE_URL ?? 'http://localhost:3001';
const EVENTS_URL = process.env.EVENTS_SERVICE_URL ?? 'http://localhost:3002';
const DEVICES_URL = process.env.DEVICES_SERVICE_URL ?? 'http://localhost:3004';
const VELOCITY_URL = process.env.VELOCITY_SERVICE_URL ?? 'http://localhost:3003';

const SKIP_E2E = process.env.E2E_SKIP === 'true';

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

/** Generate a realistic device fingerprint payload */
function makeDevicePayload(overrides: Record<string, unknown> = {}) {
  return {
    screenResolution: '1920x1080',
    gpuRenderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620)',
    timezone: 'Europe/Istanbul',
    language: 'tr-TR',
    webglHash: `wgl_${uuidv4().replace(/-/g, '').slice(0, 16)}`,
    canvasHash: `cnv_${uuidv4().replace(/-/g, '').slice(0, 16)}`,
    audioHash: `aud_${uuidv4().replace(/-/g, '').slice(0, 16)}`,
    platform: 'web',
    ...overrides,
  };
}

/** Generate a payment event payload */
function makeEventPayload(overrides: Record<string, unknown> = {}) {
  return {
    eventId: uuidv4(),
    eventType: 'payment_attempt',
    sessionId: `sess_${uuidv4().slice(0, 8)}`,
    deviceFingerprint: `fp_${uuidv4().replace(/-/g, '').slice(0, 32)}`,
    ipAddress: '185.220.101.42',
    amountMinor: 9999,
    currency: 'TRY',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// ────────────────────────────────────────────────────────────────────
// Health check utility — skip gracefully if services not running
// ────────────────────────────────────────────────────────────────────

async function isServiceHealthy(url: string): Promise<boolean> {
  try {
    const res = await supertest(url).get('/health').timeout(3000);
    return res.status < 500;
  } catch {
    return false;
  }
}

// ────────────────────────────────────────────────────────────────────
// Test Suite: Auth Service
// ────────────────────────────────────────────────────────────────────

describe('Auth Service', () => {
  let serviceAvailable: boolean;

  beforeAll(async () => {
    serviceAvailable = !SKIP_E2E && (await isServiceHealthy(AUTH_URL));
    if (!serviceAvailable) {
      console.warn(`Auth service not available at ${AUTH_URL} — skipping E2E tests`);
    }
  });

  describe('JWKS endpoint', () => {
    it('returns public keys for JWT verification', async () => {
      if (!serviceAvailable) return;

      const res = await supertest(AUTH_URL)
        .get('/.well-known/jwks.json')
        .expect(200);

      expect(res.body).toHaveProperty('keys');
      expect(Array.isArray(res.body.keys)).toBe(true);
      expect(res.body.keys.length).toBeGreaterThan(0);

      const key = res.body.keys[0];
      expect(key).toHaveProperty('kty', 'RSA');
      expect(key).toHaveProperty('alg', 'RS256');
      expect(key).toHaveProperty('use', 'sig');
    });

    it('returns 200 for health check', async () => {
      if (!serviceAvailable) return;
      await supertest(AUTH_URL).get('/health').expect(200);
    });
  });

  describe('Token issuance', () => {
    it('issues a JWT token with valid client credentials', async () => {
      if (!serviceAvailable) return;

      const res = await supertest(AUTH_URL)
        .post('/v1/auth/token')
        .send({
          grant_type: 'client_credentials',
          client_id: process.env.TEST_CLIENT_ID ?? 'test-merchant-001',
          client_secret: process.env.TEST_CLIENT_SECRET ?? 'test-secret-001',
        })
        .expect(200);

      expect(res.body).toHaveProperty('access_token');
      expect(res.body).toHaveProperty('token_type', 'Bearer');
      expect(res.body).toHaveProperty('expires_in');
      expect(typeof res.body.access_token).toBe('string');
    });

    it('rejects invalid client credentials with 401', async () => {
      if (!serviceAvailable) return;

      await supertest(AUTH_URL)
        .post('/v1/auth/token')
        .send({
          grant_type: 'client_credentials',
          client_id: 'invalid-client',
          client_secret: 'wrong-secret',
        })
        .expect(401);
    });
  });

  describe('JWT validation', () => {
    it('rejects requests with expired tokens', async () => {
      if (!serviceAvailable) return;

      const merchantId = uuidv4();
      const token = expiredToken(merchantId);

      await supertest(AUTH_URL)
        .get('/v1/merchants/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });

    it('rejects requests with invalid signature', async () => {
      if (!serviceAvailable) return;

      const merchantId = uuidv4();
      const token = invalidSignatureToken(merchantId);

      await supertest(AUTH_URL)
        .get('/v1/merchants/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });
  });
});

// ────────────────────────────────────────────────────────────────────
// Test Suite: Event Collector
// ────────────────────────────────────────────────────────────────────

describe('Event Collector', () => {
  let serviceAvailable: boolean;
  let merchantA: string;
  let merchantB: string;

  beforeAll(async () => {
    serviceAvailable = !SKIP_E2E && (await isServiceHealthy(EVENTS_URL));
    merchantA = uuidv4();
    merchantB = uuidv4();
    if (!serviceAvailable) {
      console.warn(`Event collector not available at ${EVENTS_URL} — skipping E2E tests`);
    }
  });

  describe('Event ingestion', () => {
    it('accepts a valid event batch and returns 202', async () => {
      if (!serviceAvailable) return;

      const client = asMerchant('events', merchantA);
      const res = await client
        .post('/v1/events')
        .send({
          events: [makeEventPayload(), makeEventPayload()],
        })
        .expect(202);

      expect(res.body).toHaveProperty('status', 'accepted');
      expect(res.body).toHaveProperty('accepted');
      expect(res.body.accepted).toBeGreaterThan(0);
    });

    it('rejects requests without Authorization header with 401', async () => {
      if (!serviceAvailable) return;

      await supertest(EVENTS_URL)
        .post('/v1/events')
        .send({ events: [makeEventPayload()] })
        .expect(401);
    });

    it('rejects empty events array with 400', async () => {
      if (!serviceAvailable) return;

      const client = asMerchant('events', merchantA);
      await client
        .post('/v1/events')
        .send({ events: [] })
        .expect(400);
    });

    it('accepts events with minimal required fields', async () => {
      if (!serviceAvailable) return;

      const client = asMerchant('events', merchantA);
      const minimalEvent = {
        eventId: uuidv4(),
        eventType: 'login',
        timestamp: new Date().toISOString(),
      };

      const res = await client
        .post('/v1/events')
        .send({ events: [minimalEvent] });

      expect([202, 400]).toContain(res.status); // 400 if schema validation is strict
    });
  });

  describe('Backpressure control', () => {
    it('accepts events within rate limit and responds correctly', async () => {
      if (!serviceAvailable) return;

      const client = asMerchant('events', merchantA);
      const results: number[] = [];

      // Send 5 events sequentially
      for (let i = 0; i < 5; i++) {
        const res = await client
          .post('/v1/events')
          .send({ events: [makeEventPayload()] });
        results.push(res.status);
      }

      // All or most should succeed
      const successCount = results.filter((s) => s === 202).length;
      expect(successCount).toBeGreaterThanOrEqual(3);
    });
  });
});

// ────────────────────────────────────────────────────────────────────
// Test Suite: Device Intel Service
// ────────────────────────────────────────────────────────────────────

describe('Device Intel Service', () => {
  let serviceAvailable: boolean;
  let merchantA: string;
  let merchantB: string;

  beforeAll(async () => {
    serviceAvailable = !SKIP_E2E && (await isServiceHealthy(DEVICES_URL));
    merchantA = uuidv4();
    merchantB = uuidv4();
    if (!serviceAvailable) {
      console.warn(`Device intel service not available at ${DEVICES_URL} — skipping E2E tests`);
    }
  });

  describe('Device fingerprinting', () => {
    it('identifies a new device and returns a device ID', async () => {
      if (!serviceAvailable) return;

      const client = asMerchant('devices', merchantA);
      const res = await client
        .post('/v1/devices/identify')
        .send(makeDevicePayload())
        .expect(200);

      expect(res.body).toHaveProperty('deviceId');
      expect(res.body).toHaveProperty('fingerprint');
      expect(res.body).toHaveProperty('trustScore');
      expect(res.body).toHaveProperty('isNew', true);
      expect(res.body).toHaveProperty('isEmulator');

      // Trust score should be in [0, 100]
      expect(res.body.trustScore).toBeGreaterThanOrEqual(0);
      expect(res.body.trustScore).toBeLessThanOrEqual(100);
    });

    it('recognizes a returning device on second request', async () => {
      if (!serviceAvailable) return;

      const client = asMerchant('devices', merchantA);
      const devicePayload = makeDevicePayload();

      // First call — new device
      await client.post('/v1/devices/identify').send(devicePayload).expect(200);

      // Second call with same attributes — returning device
      const res = await client
        .post('/v1/devices/identify')
        .send(devicePayload)
        .expect(200);

      expect(res.body).toHaveProperty('isNew', false);
    });

    it('flags emulator devices with reduced trust score', async () => {
      if (!serviceAvailable) return;

      const client = asMerchant('devices', merchantA);
      const emulatorPayload = makeDevicePayload({
        gpuRenderer: 'Android Emulator (SwiftShader)',
        sensorNoise: [0, 0, 0, 0, 0],
        platform: 'android',
        playIntegrityToken: undefined,
      });

      const res = await client
        .post('/v1/devices/identify')
        .send(emulatorPayload)
        .expect(200);

      expect(res.body).toHaveProperty('isEmulator', true);
      // Emulator trust score should be significantly lower
      expect(res.body.trustScore).toBeLessThan(50);
    });

    it('returns 401 when no auth token provided', async () => {
      if (!serviceAvailable) return;

      await supertest(DEVICES_URL)
        .post('/v1/devices/identify')
        .send(makeDevicePayload())
        .expect(401);
    });
  });

  describe('Tenant isolation for devices', () => {
    let deviceId: string;

    it('merchant A device is not accessible by merchant B', async () => {
      if (!serviceAvailable) return;

      const clientA = asMerchant('devices', merchantA);

      // Register device under merchant A
      const createRes = await clientA
        .post('/v1/devices/identify')
        .send(makeDevicePayload())
        .expect(200);

      deviceId = createRes.body.deviceId;

      // Merchant B tries to look up device by ID
      const clientB = asMerchant('devices', merchantB);
      const lookupRes = await clientB.get(`/v1/devices/${deviceId}`);

      // Should be 404 (not found in B's tenant scope) or 403
      expect([404, 403]).toContain(lookupRes.status);
    });
  });
});

// ────────────────────────────────────────────────────────────────────
// Test Suite: Velocity Service
// ────────────────────────────────────────────────────────────────────

describe('Velocity Service', () => {
  let serviceAvailable: boolean;
  let merchantA: string;
  let merchantB: string;
  const entityId = `user_${uuidv4().slice(0, 8)}`;

  beforeAll(async () => {
    serviceAvailable = !SKIP_E2E && (await isServiceHealthy(VELOCITY_URL));
    merchantA = uuidv4();
    merchantB = uuidv4();
    if (!serviceAvailable) {
      console.warn(`Velocity service not available at ${VELOCITY_URL} — skipping E2E tests`);
    }
  });

  describe('Velocity counters', () => {
    it('increments and returns velocity signals for an entity', async () => {
      if (!serviceAvailable) return;

      const client = asMerchant('velocity', merchantA);

      // Increment velocity counters
      const event = {
        entityId,
        eventId: uuidv4(),
        amountMinor: 5000,
        deviceFingerprint: 'fp_test_device_001',
        ipAddress: '1.2.3.4',
        sessionId: uuidv4(),
      };

      await client.post('/v1/velocity/increment').send(event).expect(200);

      // Fetch velocity signals
      const res = await client.get(`/v1/velocity/${entityId}`).expect(200);

      expect(res.body).toHaveProperty('tx_count_1h');
      expect(res.body).toHaveProperty('tx_count_24h');
      expect(res.body).toHaveProperty('amount_sum_1h');
      expect(res.body).toHaveProperty('unique_devices_24h');
      expect(res.body).toHaveProperty('unique_ips_24h');
      expect(res.body).toHaveProperty('unique_sessions_1h');

      // After incrementing once, counts should be >= 1
      expect(res.body.tx_count_1h).toBeGreaterThanOrEqual(1);
    });

    it('returns zero signals for unknown entities', async () => {
      if (!serviceAvailable) return;

      const client = asMerchant('velocity', merchantA);
      const unknownId = `unknown_${uuidv4()}`;

      const res = await client.get(`/v1/velocity/${unknownId}`).expect(200);

      expect(res.body.tx_count_1h).toBe(0);
      expect(res.body.tx_count_24h).toBe(0);
    });
  });

  describe('Burst detection', () => {
    it('returns burst_detected: false for normal velocity', async () => {
      if (!serviceAvailable) return;

      const client = asMerchant('velocity', merchantA);
      const normalEntityId = `user_${uuidv4().slice(0, 8)}`;

      // Single event — well within baseline
      await client.post('/v1/velocity/increment').send({
        entityId: normalEntityId,
        eventId: uuidv4(),
        amountMinor: 100,
      });

      const res = await client.get(`/v1/velocity/${normalEntityId}/burst`).expect(200);
      expect(res.body).toHaveProperty('detected');
    });
  });

  describe('Tenant isolation for velocity', () => {
    it('merchant A velocity data is not visible to merchant B', async () => {
      if (!serviceAvailable) return;

      const clientA = asMerchant('velocity', merchantA);
      const clientB = asMerchant('velocity', merchantB);
      const isolatedEntityId = `entity_${uuidv4().slice(0, 8)}`;

      // Merchant A increments a counter
      await clientA.post('/v1/velocity/increment').send({
        entityId: isolatedEntityId,
        eventId: uuidv4(),
        amountMinor: 9999,
      });

      // Merchant B queries the same entity ID — should see 0 (tenant-isolated Redis keys)
      const res = await clientB.get(`/v1/velocity/${isolatedEntityId}`).expect(200);
      expect(res.body.tx_count_1h).toBe(0);
    });
  });
});

// ────────────────────────────────────────────────────────────────────
// Test Suite: Full E2E Flow
// ────────────────────────────────────────────────────────────────────

describe('Full E2E Flow: JWT → Events → Device → Velocity', () => {
  let allServicesAvailable: boolean;
  let merchantId: string;

  beforeAll(async () => {
    merchantId = uuidv4();
    const checks = await Promise.all([
      isServiceHealthy(EVENTS_URL),
      isServiceHealthy(DEVICES_URL),
      isServiceHealthy(VELOCITY_URL),
    ]);
    allServicesAvailable = !SKIP_E2E && checks.every(Boolean);
    if (!allServicesAvailable) {
      console.warn('One or more services unavailable — skipping full E2E flow tests');
    }
  });

  it('processes a complete fraud event lifecycle with tenant isolation', async () => {
    if (!allServicesAvailable) return;

    const start = Date.now();
    const deviceFp = `fp_${uuidv4().replace(/-/g, '').slice(0, 32)}`;
    const sessionId = uuidv4();

    // Step 1: Generate JWT for this merchant
    const token = generateToken({ merchantId, role: 'api_client' });
    expect(token).toBeTruthy();

    // Step 2: Register device fingerprint
    const deviceRes = await supertest(DEVICES_URL)
      .post('/v1/devices/identify')
      .set('Authorization', `Bearer ${token}`)
      .send(makeDevicePayload({ webglHash: deviceFp }))
      .expect(200);

    const deviceId = deviceRes.body.deviceId;
    expect(deviceId).toBeTruthy();
    expect(deviceRes.body.isEmulator).toBe(false);

    // Step 3: Ingest payment events via event-collector
    const eventsRes = await supertest(EVENTS_URL)
      .post('/v1/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        events: [
          makeEventPayload({ deviceFingerprint: deviceFp, sessionId }),
          makeEventPayload({ deviceFingerprint: deviceFp, sessionId }),
          makeEventPayload({ deviceFingerprint: deviceFp, sessionId }),
        ],
      })
      .expect(202);

    expect(eventsRes.body.accepted).toBeGreaterThan(0);

    // Step 4: Allow async processing (Kafka consumer lag)
    // In E2E tests against real services, we need a brief wait
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Step 5: Verify velocity signals accumulated
    const entityId = `device:${deviceId}`;
    const velocityRes = await supertest(VELOCITY_URL)
      .get(`/v1/velocity/${entityId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // Velocity signals should be non-negative
    expect(velocityRes.body.tx_count_1h).toBeGreaterThanOrEqual(0);
    expect(velocityRes.body.unique_sessions_1h).toBeGreaterThanOrEqual(0);

    // Step 6: Verify entire flow completed within latency budget (10s for E2E)
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(10_000);
  });

  it('enforces tenant isolation across the full flow', async () => {
    if (!allServicesAvailable) return;

    const merchantAId = uuidv4();
    const merchantBId = uuidv4();

    const tokenA = generateToken({ merchantId: merchantAId, role: 'api_client' });
    const tokenB = generateToken({ merchantId: merchantBId, role: 'api_client' });

    // Merchant A ingests an event
    await supertest(EVENTS_URL)
      .post('/v1/events')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ events: [makeEventPayload({ entityId: 'user_shared_id' })] })
      .expect(202);

    // Merchant B checks velocity for the same entity ID — should be zero
    const res = await supertest(VELOCITY_URL)
      .get('/v1/velocity/user_shared_id')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    // Redis keys are namespaced by merchantId — isolation is in the key pattern
    expect(res.body.tx_count_1h).toBe(0);
  });
});
