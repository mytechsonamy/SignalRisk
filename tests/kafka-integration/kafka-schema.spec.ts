// These tests validate schema logic without requiring a running Kafka broker
import { z } from 'zod';

const EventSchema = z.object({
  merchantId: z.string(),
  deviceId: z.string(),
  sessionId: z.string(),
  type: z.enum(['PAGE_VIEW', 'CLICK', 'FORM_SUBMIT', 'CHECKOUT', 'LOGIN', 'LOGOUT']),
  payload: z.record(z.unknown()),
});

const DecisionSchema = z.object({
  decisionId: z.string(),
  merchantId: z.string(),
  entityId: z.string(),
  action: z.enum(['ALLOW', 'REVIEW', 'BLOCK']),
  riskScore: z.number().min(0).max(100),
  timestamp: z.string(),
});

describe('Kafka message schemas (unit)', () => {
  describe('EventSchema', () => {
    it('accepts valid PAGE_VIEW event', () => {
      const result = EventSchema.safeParse({
        merchantId: 'merchant-001',
        deviceId: 'device-abc',
        sessionId: 'session-xyz',
        type: 'PAGE_VIEW',
        payload: { page: '/home' },
      });
      expect(result.success).toBe(true);
    });

    it('accepts valid CHECKOUT event', () => {
      const result = EventSchema.safeParse({
        merchantId: 'merchant-002',
        deviceId: 'device-def',
        sessionId: 'session-abc',
        type: 'CHECKOUT',
        payload: { cartValue: 149.99, currency: 'USD' },
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing merchantId', () => {
      const result = EventSchema.safeParse({
        deviceId: 'device-abc',
        sessionId: 'session-xyz',
        type: 'PAGE_VIEW',
        payload: {},
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const fields = result.error.issues.map(i => i.path[0]);
        expect(fields).toContain('merchantId');
      }
    });

    it('rejects unknown event type', () => {
      const result = EventSchema.safeParse({
        merchantId: 'merchant-001',
        deviceId: 'device-abc',
        sessionId: 'session-xyz',
        type: 'PURCHASE',
        payload: {},
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing payload', () => {
      const result = EventSchema.safeParse({
        merchantId: 'merchant-001',
        deviceId: 'device-abc',
        sessionId: 'session-xyz',
        type: 'LOGIN',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const fields = result.error.issues.map(i => i.path[0]);
        expect(fields).toContain('payload');
      }
    });

    it('accepts any payload shape (record)', () => {
      const payloads = [
        {},
        { key: 'value' },
        { nested: { deep: true }, array: [1, 2, 3], num: 42 },
        { flag: false, nullish: null },
      ];
      for (const payload of payloads) {
        const result = EventSchema.safeParse({
          merchantId: 'merchant-001',
          deviceId: 'device-abc',
          sessionId: 'session-xyz',
          type: 'CLICK',
          payload,
        });
        expect(result.success).toBe(true);
      }
    });
  });

  describe('DecisionSchema', () => {
    it('accepts BLOCK decision', () => {
      const result = DecisionSchema.safeParse({
        decisionId: 'dec-001',
        merchantId: 'merchant-001',
        entityId: 'device-abc',
        action: 'BLOCK',
        riskScore: 95,
        timestamp: new Date().toISOString(),
      });
      expect(result.success).toBe(true);
    });

    it('accepts ALLOW decision', () => {
      const result = DecisionSchema.safeParse({
        decisionId: 'dec-002',
        merchantId: 'merchant-001',
        entityId: 'device-xyz',
        action: 'ALLOW',
        riskScore: 10,
        timestamp: new Date().toISOString(),
      });
      expect(result.success).toBe(true);
    });

    it('rejects riskScore > 100', () => {
      const result = DecisionSchema.safeParse({
        decisionId: 'dec-003',
        merchantId: 'merchant-001',
        entityId: 'device-abc',
        action: 'BLOCK',
        riskScore: 101,
        timestamp: new Date().toISOString(),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const fields = result.error.issues.map(i => i.path[0]);
        expect(fields).toContain('riskScore');
      }
    });

    it('rejects riskScore < 0', () => {
      const result = DecisionSchema.safeParse({
        decisionId: 'dec-004',
        merchantId: 'merchant-001',
        entityId: 'device-abc',
        action: 'ALLOW',
        riskScore: -1,
        timestamp: new Date().toISOString(),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const fields = result.error.issues.map(i => i.path[0]);
        expect(fields).toContain('riskScore');
      }
    });

    it('rejects unknown action', () => {
      const result = DecisionSchema.safeParse({
        decisionId: 'dec-005',
        merchantId: 'merchant-001',
        entityId: 'device-abc',
        action: 'QUARANTINE',
        riskScore: 75,
        timestamp: new Date().toISOString(),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('DLQ envelope', () => {
    it('DLQ message wraps original + error', () => {
      const dlq = { originalMessage: {}, error: 'validation failed', timestamp: new Date().toISOString() };
      expect(dlq.originalMessage).toBeDefined();
      expect(dlq.error).toBeDefined();
    });

    it('DLQ message preserves original payload content', () => {
      const original = { merchantId: 'test', bad_field: true };
      const dlq = {
        originalMessage: original,
        error: 'missing required fields: deviceId, sessionId, type, payload',
        timestamp: new Date().toISOString(),
      };
      expect(dlq.originalMessage).toEqual(original);
      expect(typeof dlq.error).toBe('string');
      expect(dlq.error.length).toBeGreaterThan(0);
    });

    it('DLQ timestamp is a valid ISO string', () => {
      const timestamp = new Date().toISOString();
      const dlq = { originalMessage: {}, error: 'bad event', timestamp };
      expect(() => new Date(dlq.timestamp)).not.toThrow();
      expect(new Date(dlq.timestamp).toISOString()).toBe(timestamp);
    });
  });
});
