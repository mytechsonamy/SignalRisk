/**
 * SignalRisk — Schema Version Manager
 *
 * Manages schema version registry with forward-compatible validation.
 * When a v2 schema exists, v1 events are still accepted.
 */

import { EventSchemaValidator, EventType, ValidationResult } from './validator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SchemaVersionEntry {
  /** Schema version number. */
  version: number;
  /** Validator instance for this version. */
  validator: EventSchemaValidator;
  /** Whether this version is deprecated (still accepted but emits warnings). */
  deprecated: boolean;
  /** ISO-8601 date when this version was introduced. */
  introducedAt: string;
  /** ISO-8601 date when this version was deprecated (null if active). */
  deprecatedAt: string | null;
}

export interface VersionedValidationResult extends ValidationResult {
  /** Whether the schema version used is deprecated. */
  versionDeprecated: boolean;
  /** Latest available schema version. */
  latestVersion: number;
}

// ---------------------------------------------------------------------------
// SchemaVersionManager
// ---------------------------------------------------------------------------

export class SchemaVersionManager {
  private readonly versions: Map<number, SchemaVersionEntry> = new Map();
  private latestVersion = 0;

  constructor() {
    // Register v1 as the current and only version
    this.registerVersion({
      version: 1,
      validator: new EventSchemaValidator(1),
      deprecated: false,
      introducedAt: '2025-01-01T00:00:00Z',
      deprecatedAt: null,
    });
  }

  /**
   * Register a schema version.
   */
  registerVersion(entry: SchemaVersionEntry): void {
    this.versions.set(entry.version, entry);
    if (entry.version > this.latestVersion) {
      this.latestVersion = entry.version;
    }
  }

  /**
   * Deprecate a schema version. Events using this version are still accepted
   * but the validation result will flag the version as deprecated.
   */
  deprecateVersion(version: number, deprecatedAt?: string): boolean {
    const entry = this.versions.get(version);
    if (!entry) return false;
    entry.deprecated = true;
    entry.deprecatedAt = deprecatedAt || new Date().toISOString();
    return true;
  }

  /**
   * Validate an event against the appropriate schema version.
   *
   * If schemaVersion is provided in the event, uses that version.
   * Falls back to the latest version if no version is specified or
   * the requested version does not exist.
   */
  validate(event: unknown, requestedVersion?: number): VersionedValidationResult {
    const version = requestedVersion ?? this.latestVersion;
    const entry = this.versions.get(version) ?? this.versions.get(this.latestVersion)!;

    const result = entry.validator.validate(event);

    return {
      ...result,
      schemaVersion: entry.version,
      versionDeprecated: entry.deprecated,
      latestVersion: this.latestVersion,
    };
  }

  /**
   * Validate a payload against a specific event type and version.
   */
  validatePayload(
    eventType: EventType,
    payload: unknown,
    requestedVersion?: number,
  ): VersionedValidationResult {
    const version = requestedVersion ?? this.latestVersion;
    const entry = this.versions.get(version) ?? this.versions.get(this.latestVersion)!;

    const result = entry.validator.validatePayload(eventType, payload);

    return {
      ...result,
      versionDeprecated: entry.deprecated,
      latestVersion: this.latestVersion,
    };
  }

  /**
   * Get all registered schema versions.
   */
  getVersions(): SchemaVersionEntry[] {
    return Array.from(this.versions.values()).sort(
      (a, b) => a.version - b.version,
    );
  }

  /**
   * Get the latest schema version number.
   */
  getLatestVersion(): number {
    return this.latestVersion;
  }

  /**
   * Check whether a specific version exists.
   */
  hasVersion(version: number): boolean {
    return this.versions.has(version);
  }
}
