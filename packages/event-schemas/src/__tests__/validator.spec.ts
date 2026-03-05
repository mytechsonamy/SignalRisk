/**
 * Unit tests for EventSchemaValidator
 */

import { EventSchemaValidator, EventType } from '../validator';
import { SchemaVersionManager } from '../version-manager';

describe('EventSchemaValidator', () => {
  let validator: EventSchemaValidator;

  beforeEach(() => {
    validator = new EventSchemaValidator();
  });

  // -------------------------------------------------------------------------
  // Base event envelope
  // -------------------------------------------------------------------------

  describe('base event envelope', () => {
    it('should accept a valid minimal event', () => {
      const result = validator.validate({
        merchantId: 'merchant-001',
        deviceId: 'device-abc',
        sessionId: 'session-xyz',
        type: 'CUSTOM',
        payload: { event_name: 'test' },
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept a fully populated event', () => {
      const result = validator.validate({
        merchantId: 'merchant-001',
        deviceId: 'device-abc',
        sessionId: 'session-xyz',
        type: 'PAGE_VIEW',
        payload: { url: 'https://example.com' },
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        pageUrl: 'https://example.com/page',
        referrer: 'https://google.com',
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: '2025-01-15T10:30:00Z',
      });
      expect(result.valid).toBe(true);
    });

    it('should reject event missing merchantId', () => {
      const result = validator.validate({
        deviceId: 'device-abc',
        sessionId: 'session-xyz',
        type: 'CUSTOM',
        payload: { event_name: 'test' },
      });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.params.missingProperty === 'merchantId')).toBe(true);
    });

    it('should reject event missing required fields', () => {
      const result = validator.validate({});
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject event with empty merchantId', () => {
      const result = validator.validate({
        merchantId: '',
        deviceId: 'device-abc',
        sessionId: 'session-xyz',
        type: 'CUSTOM',
        payload: { event_name: 'test' },
      });
      expect(result.valid).toBe(false);
    });

    it('should reject event with invalid ipAddress format', () => {
      const result = validator.validate({
        merchantId: 'merchant-001',
        deviceId: 'device-abc',
        sessionId: 'session-xyz',
        type: 'CUSTOM',
        payload: { event_name: 'test' },
        ipAddress: 'not-an-ip',
      });
      expect(result.valid).toBe(false);
    });

    it('should reject event with additional properties', () => {
      const result = validator.validate({
        merchantId: 'merchant-001',
        deviceId: 'device-abc',
        sessionId: 'session-xyz',
        type: 'CUSTOM',
        payload: { event_name: 'test' },
        unknownField: 'nope',
      });
      expect(result.valid).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // PAGE_VIEW
  // -------------------------------------------------------------------------

  describe('PAGE_VIEW payload', () => {
    const baseEvent = {
      merchantId: 'merchant-001',
      deviceId: 'device-abc',
      sessionId: 'session-xyz',
      type: 'PAGE_VIEW',
    };

    it('should accept valid PAGE_VIEW payload', () => {
      const result = validator.validate({
        ...baseEvent,
        payload: {
          url: 'https://example.com/page',
          referrer: 'https://google.com',
          viewport: { width: 1920, height: 1080 },
          scrollDepth: 75.5,
        },
      });
      expect(result.valid).toBe(true);
      expect(result.eventType).toBe('PAGE_VIEW');
    });

    it('should reject PAGE_VIEW missing url', () => {
      const result = validator.validate({
        ...baseEvent,
        payload: { referrer: 'https://google.com' },
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path.includes('payload'))).toBe(true);
    });

    it('should reject PAGE_VIEW with scrollDepth > 100', () => {
      const result = validator.validate({
        ...baseEvent,
        payload: { url: 'https://example.com', scrollDepth: 150 },
      });
      expect(result.valid).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // CLICK
  // -------------------------------------------------------------------------

  describe('CLICK payload', () => {
    const baseEvent = {
      merchantId: 'merchant-001',
      deviceId: 'device-abc',
      sessionId: 'session-xyz',
      type: 'CLICK',
    };

    it('should accept valid CLICK payload', () => {
      const result = validator.validate({
        ...baseEvent,
        payload: { x: 100, y: 200, targetElement: '#submit-btn' },
      });
      expect(result.valid).toBe(true);
    });

    it('should reject CLICK missing coordinates', () => {
      const result = validator.validate({
        ...baseEvent,
        payload: { targetElement: '#btn' },
      });
      expect(result.valid).toBe(false);
    });

    it('should reject CLICK missing targetElement', () => {
      const result = validator.validate({
        ...baseEvent,
        payload: { x: 10, y: 20 },
      });
      expect(result.valid).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // FORM_SUBMIT
  // -------------------------------------------------------------------------

  describe('FORM_SUBMIT payload', () => {
    const baseEvent = {
      merchantId: 'merchant-001',
      deviceId: 'device-abc',
      sessionId: 'session-xyz',
      type: 'FORM_SUBMIT',
    };

    it('should accept valid FORM_SUBMIT payload', () => {
      const result = validator.validate({
        ...baseEvent,
        payload: {
          formId: 'checkout-form',
          fields: [
            { name: 'email', type: 'email', hasValue: true },
            { name: 'password', type: 'password', hasValue: true },
          ],
          fillTimeMs: 5000,
        },
      });
      expect(result.valid).toBe(true);
    });

    it('should reject FORM_SUBMIT missing formId', () => {
      const result = validator.validate({
        ...baseEvent,
        payload: { fields: [] },
      });
      expect(result.valid).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // LOGIN
  // -------------------------------------------------------------------------

  describe('LOGIN payload', () => {
    const baseEvent = {
      merchantId: 'merchant-001',
      deviceId: 'device-abc',
      sessionId: 'session-xyz',
      type: 'LOGIN',
    };

    it('should accept valid LOGIN payload', () => {
      const result = validator.validate({
        ...baseEvent,
        payload: {
          success: true,
          method: 'password',
          attemptCount: 1,
        },
      });
      expect(result.valid).toBe(true);
    });

    it('should accept LOGIN with MFA', () => {
      const result = validator.validate({
        ...baseEvent,
        payload: {
          success: true,
          method: 'mfa',
          mfaUsed: true,
          attemptCount: 1,
        },
      });
      expect(result.valid).toBe(true);
    });

    it('should reject LOGIN missing success', () => {
      const result = validator.validate({
        ...baseEvent,
        payload: { method: 'password' },
      });
      expect(result.valid).toBe(false);
    });

    it('should reject LOGIN with invalid method', () => {
      const result = validator.validate({
        ...baseEvent,
        payload: { success: true, method: 'magic_link' },
      });
      expect(result.valid).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // SIGNUP
  // -------------------------------------------------------------------------

  describe('SIGNUP payload', () => {
    const baseEvent = {
      merchantId: 'merchant-001',
      deviceId: 'device-abc',
      sessionId: 'session-xyz',
      type: 'SIGNUP',
    };

    it('should accept valid SIGNUP payload', () => {
      const result = validator.validate({
        ...baseEvent,
        payload: {
          method: 'email',
          emailDomain: 'gmail.com',
          fillTimeMs: 15000,
        },
      });
      expect(result.valid).toBe(true);
    });

    it('should reject SIGNUP missing method', () => {
      const result = validator.validate({
        ...baseEvent,
        payload: { emailDomain: 'gmail.com' },
      });
      expect(result.valid).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // PAYMENT
  // -------------------------------------------------------------------------

  describe('PAYMENT payload', () => {
    const baseEvent = {
      merchantId: 'merchant-001',
      deviceId: 'device-abc',
      sessionId: 'session-xyz',
      type: 'PAYMENT',
    };

    it('should accept valid PAYMENT payload', () => {
      const result = validator.validate({
        ...baseEvent,
        payload: {
          amount: 9999,
          currency: 'USD',
          paymentMethod: 'credit_card',
          merchantRef: 'order-12345',
          cardBin: '411111',
          cardLast4: '1234',
          billingCountry: 'US',
        },
      });
      expect(result.valid).toBe(true);
    });

    it('should reject PAYMENT with invalid currency code', () => {
      const result = validator.validate({
        ...baseEvent,
        payload: {
          amount: 1000,
          currency: 'usd',
          paymentMethod: 'credit_card',
        },
      });
      expect(result.valid).toBe(false);
    });

    it('should reject PAYMENT with negative amount', () => {
      const result = validator.validate({
        ...baseEvent,
        payload: {
          amount: -100,
          currency: 'USD',
          paymentMethod: 'credit_card',
        },
      });
      expect(result.valid).toBe(false);
    });

    it('should reject PAYMENT missing required fields', () => {
      const result = validator.validate({
        ...baseEvent,
        payload: { amount: 1000 },
      });
      expect(result.valid).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // CUSTOM
  // -------------------------------------------------------------------------

  describe('CUSTOM payload', () => {
    const baseEvent = {
      merchantId: 'merchant-001',
      deviceId: 'device-abc',
      sessionId: 'session-xyz',
      type: 'CUSTOM',
    };

    it('should accept valid CUSTOM payload', () => {
      const result = validator.validate({
        ...baseEvent,
        payload: {
          event_name: 'add_to_cart',
          data: { productId: 'sku-123', quantity: 2 },
        },
      });
      expect(result.valid).toBe(true);
    });

    it('should accept CUSTOM with additional properties', () => {
      const result = validator.validate({
        ...baseEvent,
        payload: {
          event_name: 'custom_metric',
          arbitrary_field: 'value',
          nested: { deep: true },
        },
      });
      expect(result.valid).toBe(true);
    });

    it('should reject CUSTOM missing event_name', () => {
      const result = validator.validate({
        ...baseEvent,
        payload: { data: { foo: 'bar' } },
      });
      expect(result.valid).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Unknown event type handling
  // -------------------------------------------------------------------------

  describe('unknown event type', () => {
    it('should reject event with unknown type at envelope level', () => {
      const result = validator.validate({
        merchantId: 'merchant-001',
        deviceId: 'device-abc',
        sessionId: 'session-xyz',
        type: 'UNKNOWN_TYPE',
        payload: {},
      });
      expect(result.valid).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Schema versioning
  // -------------------------------------------------------------------------

  describe('schema versioning', () => {
    it('should report schema version', () => {
      expect(validator.getSchemaVersion()).toBe(1);
    });

    it('should allow custom schema version', () => {
      const v2Validator = new EventSchemaValidator(2);
      expect(v2Validator.getSchemaVersion()).toBe(2);
    });

    it('should identify known event types', () => {
      expect(validator.isKnownEventType('PAGE_VIEW')).toBe(true);
      expect(validator.isKnownEventType('PAYMENT')).toBe(true);
      expect(validator.isKnownEventType('INVALID')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Envelope-only validation
  // -------------------------------------------------------------------------

  describe('validateEnvelope', () => {
    it('should validate envelope without payload type checking', () => {
      const result = validator.validateEnvelope({
        merchantId: 'merchant-001',
        deviceId: 'device-abc',
        sessionId: 'session-xyz',
        type: 'PAGE_VIEW',
        payload: {},
      });
      expect(result.valid).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Payload-only validation
  // -------------------------------------------------------------------------

  describe('validatePayload', () => {
    it('should validate payload for a specific event type', () => {
      const result = validator.validatePayload('PAYMENT', {
        amount: 500,
        currency: 'EUR',
        paymentMethod: 'debit_card',
      });
      expect(result.valid).toBe(true);
    });

    it('should reject invalid payload for a specific event type', () => {
      const result = validator.validatePayload('PAYMENT', {
        amount: 'not-a-number',
      });
      expect(result.valid).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// SchemaVersionManager tests
// ---------------------------------------------------------------------------

describe('SchemaVersionManager', () => {
  let manager: SchemaVersionManager;

  beforeEach(() => {
    manager = new SchemaVersionManager();
  });

  it('should default to version 1', () => {
    expect(manager.getLatestVersion()).toBe(1);
  });

  it('should validate events using default version', () => {
    const result = manager.validate({
      merchantId: 'merchant-001',
      deviceId: 'device-abc',
      sessionId: 'session-xyz',
      type: 'CUSTOM',
      payload: { event_name: 'test' },
    });
    expect(result.valid).toBe(true);
    expect(result.schemaVersion).toBe(1);
    expect(result.versionDeprecated).toBe(false);
  });

  it('should allow deprecating a version', () => {
    const deprecated = manager.deprecateVersion(1);
    expect(deprecated).toBe(true);

    const result = manager.validate({
      merchantId: 'merchant-001',
      deviceId: 'device-abc',
      sessionId: 'session-xyz',
      type: 'CUSTOM',
      payload: { event_name: 'test' },
    });
    expect(result.versionDeprecated).toBe(true);
  });

  it('should fall back to latest version for unknown version', () => {
    const result = manager.validate(
      {
        merchantId: 'merchant-001',
        deviceId: 'device-abc',
        sessionId: 'session-xyz',
        type: 'CUSTOM',
        payload: { event_name: 'test' },
      },
      99,
    );
    expect(result.schemaVersion).toBe(1);
  });

  it('should report hasVersion correctly', () => {
    expect(manager.hasVersion(1)).toBe(true);
    expect(manager.hasVersion(2)).toBe(false);
  });

  it('should list all versions', () => {
    const versions = manager.getVersions();
    expect(versions).toHaveLength(1);
    expect(versions[0].version).toBe(1);
  });
});
