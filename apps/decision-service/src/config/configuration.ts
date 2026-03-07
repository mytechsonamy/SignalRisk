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
    host: process.env.DATABASE_HOST || process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || process.env.DB_PORT || '5432', 10),
    username: process.env.DATABASE_USER || process.env.DB_USERNAME || 'signalrisk',
    password: process.env.DATABASE_PASSWORD || process.env.DB_PASSWORD || 'signalrisk',
    database: process.env.DATABASE_NAME || process.env.DB_DATABASE || 'signalrisk',
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
    deviceIntelUrl: process.env.DEVICE_INTEL_SERVICE_URL || process.env.DEVICE_INTEL_URL || 'http://localhost:3003',
    velocityUrl: process.env.VELOCITY_SERVICE_URL || process.env.VELOCITY_URL || 'http://localhost:3004',
    behavioralUrl: process.env.BEHAVIORAL_SERVICE_URL || process.env.BEHAVIORAL_URL || 'http://localhost:3005',
    networkIntelUrl: process.env.NETWORK_INTEL_SERVICE_URL || process.env.NETWORK_INTEL_URL || 'http://localhost:3006',
    telcoIntelUrl: process.env.TELCO_INTEL_SERVICE_URL || process.env.TELCO_INTEL_URL || 'http://localhost:3007',
  },

  kafka: {
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    clientId: process.env.KAFKA_CLIENT_ID || 'decision-service',
    groupId: process.env.KAFKA_GROUP_ID || 'decision-service',
    ssl: process.env.KAFKA_SSL === 'true',
    saslMechanism: process.env.KAFKA_SASL_MECHANISM || undefined,
    saslUsername: process.env.KAFKA_SASL_USERNAME || undefined,
    saslPassword: process.env.KAFKA_SASL_PASSWORD || undefined,
  },

  otel: {
    endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
  },
});
