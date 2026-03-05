/**
 * SignalRisk — Event Schema Validator
 *
 * AJV-based validator that pre-compiles all event schemas at startup
 * and provides typed validation results with detailed error messages.
 */

import Ajv, { ValidateFunction, ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';

import baseEventSchema from './schemas/base-event.schema.json';
import pageViewSchema from './schemas/page-view.schema.json';
import clickSchema from './schemas/click.schema.json';
import formSubmitSchema from './schemas/form-submit.schema.json';
import loginSchema from './schemas/login.schema.json';
import signupSchema from './schemas/signup.schema.json';
import paymentSchema from './schemas/payment.schema.json';
import customSchema from './schemas/custom.schema.json';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EventType =
  | 'PAGE_VIEW'
  | 'CLICK'
  | 'FORM_SUBMIT'
  | 'LOGIN'
  | 'SIGNUP'
  | 'PAYMENT'
  | 'CUSTOM';

export interface ValidationError {
  /** JSON pointer path to the failing field. */
  path: string;
  /** Human-readable error message. */
  message: string;
  /** AJV keyword that failed (e.g. "required", "type"). */
  keyword: string;
  /** Additional params from AJV (e.g. { missingProperty: "x" }). */
  params: Record<string, unknown>;
}

export interface ValidationResult {
  /** Whether the event passed validation. */
  valid: boolean;
  /** Validation errors (empty array if valid). */
  errors: ValidationError[];
  /** The event type that was validated against (null if unknown type). */
  eventType: string | null;
  /** Schema version used for validation. */
  schemaVersion: number;
}

// ---------------------------------------------------------------------------
// Payload schema map
// ---------------------------------------------------------------------------

const PAYLOAD_SCHEMAS: Record<EventType, object> = {
  PAGE_VIEW: pageViewSchema,
  CLICK: clickSchema,
  FORM_SUBMIT: formSubmitSchema,
  LOGIN: loginSchema,
  SIGNUP: signupSchema,
  PAYMENT: paymentSchema,
  CUSTOM: customSchema,
};

const VALID_EVENT_TYPES = new Set<string>(Object.keys(PAYLOAD_SCHEMAS));

// ---------------------------------------------------------------------------
// EventSchemaValidator
// ---------------------------------------------------------------------------

export class EventSchemaValidator {
  private readonly ajv: Ajv;
  private readonly envelopeValidator: ValidateFunction;
  private readonly payloadValidators: Map<EventType, ValidateFunction>;
  private readonly schemaVersion: number;

  constructor(schemaVersion = 1) {
    this.schemaVersion = schemaVersion;

    this.ajv = new Ajv({
      allErrors: true,
      removeAdditional: false,
      strict: false,
    });
    addFormats(this.ajv);

    // Pre-compile envelope schema
    this.envelopeValidator = this.ajv.compile(baseEventSchema);

    // Pre-compile per-type payload schemas
    this.payloadValidators = new Map<EventType, ValidateFunction>();
    for (const [type, schema] of Object.entries(PAYLOAD_SCHEMAS)) {
      this.payloadValidators.set(
        type as EventType,
        this.ajv.compile(schema),
      );
    }
  }

  /**
   * Validate a full event (envelope + type-specific payload).
   */
  validate(event: unknown): ValidationResult {
    const errors: ValidationError[] = [];

    // Step 1: Validate envelope
    const envelopeValid = this.envelopeValidator(event) as boolean;
    if (!envelopeValid) {
      errors.push(...this.mapErrors(this.envelopeValidator.errors));
      return {
        valid: false,
        errors,
        eventType: null,
        schemaVersion: this.schemaVersion,
      };
    }

    // Step 2: Extract type and validate payload
    const typedEvent = event as Record<string, unknown>;
    const eventType = typedEvent.type as string;

    if (!VALID_EVENT_TYPES.has(eventType)) {
      errors.push({
        path: '/type',
        message: `Unknown event type: ${eventType}`,
        keyword: 'enum',
        params: { allowedValues: Array.from(VALID_EVENT_TYPES) },
      });
      return {
        valid: false,
        errors,
        eventType: eventType,
        schemaVersion: this.schemaVersion,
      };
    }

    const payloadValidator = this.payloadValidators.get(eventType as EventType);
    if (payloadValidator) {
      const payloadValid = payloadValidator(typedEvent.payload) as boolean;
      if (!payloadValid) {
        const payloadErrors = this.mapErrors(payloadValidator.errors).map(
          (e) => ({
            ...e,
            path: `/payload${e.path === '/' ? '' : e.path}`,
          }),
        );
        errors.push(...payloadErrors);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      eventType,
      schemaVersion: this.schemaVersion,
    };
  }

  /**
   * Validate only the envelope (without payload type checking).
   */
  validateEnvelope(event: unknown): ValidationResult {
    const envelopeValid = this.envelopeValidator(event) as boolean;
    const errors = envelopeValid
      ? []
      : this.mapErrors(this.envelopeValidator.errors);

    return {
      valid: envelopeValid,
      errors,
      eventType: null,
      schemaVersion: this.schemaVersion,
    };
  }

  /**
   * Validate only a payload against a specific event type schema.
   */
  validatePayload(
    eventType: EventType,
    payload: unknown,
  ): ValidationResult {
    const validator = this.payloadValidators.get(eventType);
    if (!validator) {
      return {
        valid: false,
        errors: [
          {
            path: '/',
            message: `No schema found for event type: ${eventType}`,
            keyword: 'custom',
            params: { eventType },
          },
        ],
        eventType,
        schemaVersion: this.schemaVersion,
      };
    }

    const valid = validator(payload) as boolean;
    return {
      valid,
      errors: valid ? [] : this.mapErrors(validator.errors),
      eventType,
      schemaVersion: this.schemaVersion,
    };
  }

  /**
   * Get the current schema version.
   */
  getSchemaVersion(): number {
    return this.schemaVersion;
  }

  /**
   * Check whether a given event type string is known.
   */
  isKnownEventType(type: string): type is EventType {
    return VALID_EVENT_TYPES.has(type);
  }

  /**
   * Map AJV ErrorObject[] to our typed ValidationError[].
   */
  private mapErrors(
    ajvErrors: ErrorObject[] | null | undefined,
  ): ValidationError[] {
    if (!ajvErrors || ajvErrors.length === 0) return [];

    return ajvErrors.map((e) => ({
      path: e.instancePath || '/',
      message: e.message || 'Validation failed',
      keyword: e.keyword,
      params: e.params as Record<string, unknown>,
    }));
  }
}
