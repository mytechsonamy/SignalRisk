import {
  createIsolatedSchema,
  dropSchema,
  queryAsTenant,
  closePool,
} from '../helpers/db.helper';
import {
  createMerchant,
  createUser,
  createDevice,
  createEvent,
  createDecision,
  createFullMerchantData,
} from '../helpers/factory';

/**
 * Cross-Tenant Isolation Tests
 *
 * These tests verify that PostgreSQL RLS policies prevent data leakage
 * between merchants. Each test creates data for Merchant A and attempts
 * to access it as Merchant B to confirm isolation.
 */
describe('Tenant Isolation (RLS)', () => {
  let schema: string;
  let merchantA: { id: string };
  let merchantB: { id: string };

  beforeAll(async () => {
    schema = await createIsolatedSchema('tenant_isolation');

    // Create two merchants
    merchantA = await createMerchant(schema, { name: 'Merchant Alpha' });
    merchantB = await createMerchant(schema, { name: 'Merchant Beta' });
  });

  afterAll(async () => {
    await dropSchema(schema);
    await closePool();
  });

  // ──────────────────────────────────────────────────────────
  // Users table isolation
  // ──────────────────────────────────────────────────────────

  describe('users table', () => {
    it('merchant A can see only its own users', async () => {
      await createUser(schema, merchantA.id, { email: 'alice@alpha.com' });
      await createUser(schema, merchantB.id, { email: 'bob@beta.com' });

      const result = await queryAsTenant(schema, merchantA.id, 'SELECT * FROM users');
      expect(result.rows.length).toBeGreaterThanOrEqual(1);
      expect(result.rows.every((r) => r.merchant_id === merchantA.id)).toBe(true);
    });

    it('merchant B cannot see merchant A users', async () => {
      const result = await queryAsTenant(schema, merchantB.id, 'SELECT * FROM users');
      expect(result.rows.every((r) => r.merchant_id === merchantB.id)).toBe(true);
      expect(result.rows.some((r) => r.merchant_id === merchantA.id)).toBe(false);
    });
  });

  // ──────────────────────────────────────────────────────────
  // Devices table isolation
  // ──────────────────────────────────────────────────────────

  describe('devices table', () => {
    it('merchant A can see only its own devices', async () => {
      await createDevice(schema, merchantA.id, { fingerprint: 'fp_alpha_001' });
      await createDevice(schema, merchantB.id, { fingerprint: 'fp_beta_001' });

      const result = await queryAsTenant(schema, merchantA.id, 'SELECT * FROM devices');
      expect(result.rows.length).toBeGreaterThanOrEqual(1);
      expect(result.rows.every((r) => r.merchant_id === merchantA.id)).toBe(true);
    });

    it('merchant B cannot see merchant A devices', async () => {
      const result = await queryAsTenant(schema, merchantB.id, 'SELECT * FROM devices');
      expect(result.rows.every((r) => r.merchant_id === merchantB.id)).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────
  // Events table isolation
  // ──────────────────────────────────────────────────────────

  describe('events table', () => {
    it('merchant A can see only its own events', async () => {
      await createEvent(schema, merchantA.id, { event_type: 'payment', risk_score: 0.8 });
      await createEvent(schema, merchantB.id, { event_type: 'login', risk_score: 0.2 });

      const result = await queryAsTenant(schema, merchantA.id, 'SELECT * FROM events');
      expect(result.rows.length).toBeGreaterThanOrEqual(1);
      expect(result.rows.every((r) => r.merchant_id === merchantA.id)).toBe(true);
    });

    it('merchant B cannot see merchant A events', async () => {
      const result = await queryAsTenant(schema, merchantB.id, 'SELECT * FROM events');
      expect(result.rows.every((r) => r.merchant_id === merchantB.id)).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────
  // Decisions table isolation
  // ──────────────────────────────────────────────────────────

  describe('decisions table', () => {
    it('merchant A can see only its own decisions', async () => {
      const eventA = await createEvent(schema, merchantA.id);
      const eventB = await createEvent(schema, merchantB.id);

      await createDecision(schema, merchantA.id, eventA.id, { verdict: 'reject' });
      await createDecision(schema, merchantB.id, eventB.id, { verdict: 'approve' });

      const result = await queryAsTenant(schema, merchantA.id, 'SELECT * FROM decisions');
      expect(result.rows.length).toBeGreaterThanOrEqual(1);
      expect(result.rows.every((r) => r.merchant_id === merchantA.id)).toBe(true);
    });

    it('merchant B cannot see merchant A decisions', async () => {
      const result = await queryAsTenant(schema, merchantB.id, 'SELECT * FROM decisions');
      expect(result.rows.every((r) => r.merchant_id === merchantB.id)).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────
  // Cross-cutting isolation scenarios
  // ──────────────────────────────────────────────────────────

  describe('cross-cutting scenarios', () => {
    it('full merchant data set is invisible to other tenant', async () => {
      const dataA = await createFullMerchantData(schema);

      // Query each table as merchant B
      const tables = ['users', 'devices', 'events', 'decisions'] as const;

      for (const table of tables) {
        const result = await queryAsTenant(schema, merchantB.id, `SELECT * FROM ${table}`);
        const leakedRows = result.rows.filter((r) => r.merchant_id === dataA.merchant.id);
        expect(leakedRows).toHaveLength(0);
      }
    });

    it('tenant cannot update another tenant data via RLS', async () => {
      const userA = await createUser(schema, merchantA.id, { email: 'protected@alpha.com' });

      // Attempt to update merchant A's user while acting as merchant B
      const result = await queryAsTenant(
        schema,
        merchantB.id,
        `UPDATE users SET email = 'hacked@evil.com' WHERE id = $1`,
        [userA.id],
      );

      // RLS should prevent the update (0 rows affected)
      expect(result.rowCount).toBe(0);

      // Verify original data is intact
      const check = await queryAsTenant(schema, merchantA.id, 'SELECT email FROM users WHERE id = $1', [userA.id]);
      expect(check.rows[0]?.email).toBe('protected@alpha.com');
    });

    it('tenant cannot delete another tenant data via RLS', async () => {
      const deviceA = await createDevice(schema, merchantA.id, { fingerprint: 'fp_nodelete' });

      // Attempt to delete merchant A's device while acting as merchant B
      const result = await queryAsTenant(
        schema,
        merchantB.id,
        `DELETE FROM devices WHERE id = $1`,
        [deviceA.id],
      );

      expect(result.rowCount).toBe(0);

      // Verify device still exists
      const check = await queryAsTenant(schema, merchantA.id, 'SELECT id FROM devices WHERE id = $1', [deviceA.id]);
      expect(check.rows).toHaveLength(1);
    });

    it('COUNT queries respect tenant boundary', async () => {
      // Create known quantity for a fresh merchant
      const freshMerchant = await createMerchant(schema, { name: 'Fresh Merchant' });
      await createEvent(schema, freshMerchant.id, { event_type: 'payment' });
      await createEvent(schema, freshMerchant.id, { event_type: 'login' });

      const countResult = await queryAsTenant(
        schema,
        freshMerchant.id,
        'SELECT COUNT(*)::int as total FROM events',
      );

      // Should see exactly 2 events, not any from other merchants
      expect(countResult.rows[0]?.total).toBe(2);
    });
  });
});
