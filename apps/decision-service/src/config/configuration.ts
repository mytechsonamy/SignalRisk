/**
 * SignalRisk Decision Service — Configuration
 *
 * Centralized configuration using NestJS ConfigModule.
 * All values are sourced from environment variables with sensible defaults.
 */

export default () => ({
  port: parseInt(process.env.PORT || '3009', 10),
  serviceName: process.env.SERVICE_NAME || 'decision-service',

  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'signalrisk',
    password: process.env.DB_PASSWORD || 'signalrisk',
    database: process.env.DB_DATABASE || 'signalrisk',
    ssl: process.env.DB_SSL === 'true',
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    keyPrefix: process.env.REDIS_KEY_PREFIX || '',
  },

  decision: {
    /** Timeout per signal fetch in milliseconds */
    signalTimeoutMs: parseInt(process.env.SIGNAL_TIMEOUT_MS || '150', 10),
    /** Risk score threshold for BLOCK action */
    blockThreshold: parseInt(process.env.BLOCK_THRESHOLD || '70', 10),
    /** Risk score threshold for REVIEW action */
    reviewThreshold: parseInt(process.env.REVIEW_THRESHOLD || '40', 10),
    /** Idempotency TTL in seconds (24h) */
    idempotencyTtlSeconds: parseInt(process.env.IDEMPOTENCY_TTL_SECONDS || '86400', 10),
  },

  services: {
    /** Base URL of device-intel-service */
    deviceIntelUrl: process.env.DEVICE_INTEL_URL || 'http://localhost:3003',
    /** Base URL of velocity-engine service */
    velocityUrl: process.env.VELOCITY_URL || 'http://localhost:3004',
    /** Base URL of behavioral-service */
    behavioralUrl: process.env.BEHAVIORAL_URL || 'http://localhost:3005',
    /** Base URL of network-intel-service */
    networkIntelUrl: process.env.NETWORK_INTEL_URL || 'http://localhost:3006',
    /** Base URL of telco-intel-service */
    telcoIntelUrl: process.env.TELCO_INTEL_URL || 'http://localhost:3007',
  },

  otel: {
    endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
  },
});
