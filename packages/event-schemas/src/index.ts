/**
 * @signalrisk/event-schemas
 *
 * Shared JSON Schema registry, AJV validator, and version manager
 * for all SignalRisk event types.
 */

export {
  EventSchemaValidator,
  EventType,
  ValidationError,
  ValidationResult,
} from './validator';

export {
  SchemaVersionManager,
  SchemaVersionEntry,
  VersionedValidationResult,
} from './version-manager';

// Re-export raw schemas for consumers that need them
export { default as baseEventSchema } from './schemas/base-event.schema.json';
export { default as pageViewSchema } from './schemas/page-view.schema.json';
export { default as clickSchema } from './schemas/click.schema.json';
export { default as formSubmitSchema } from './schemas/form-submit.schema.json';
export { default as loginSchema } from './schemas/login.schema.json';
export { default as signupSchema } from './schemas/signup.schema.json';
export { default as paymentSchema } from './schemas/payment.schema.json';
export { default as customSchema } from './schemas/custom.schema.json';
