/**
 * SignalRisk Device Intel Service — Configuration
 *
 * Centralized configuration using NestJS ConfigModule.
 * All values are sourced from environment variables with sensible defaults.
 */

export default () => ({
  port: parseInt(process.env.PORT || '3002', 10),
  serviceName: process.env.SERVICE_NAME || 'device-intel-service',

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

  kafka: {
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(',').map((b) => b.trim()),
    clientId: process.env.KAFKA_CLIENT_ID || 'device-intel-service',
    groupId: process.env.KAFKA_GROUP_ID || 'signalrisk.cg.device-intel',
    ssl: process.env.KAFKA_SSL === 'true',
    saslMechanism: process.env.KAFKA_SASL_MECHANISM || undefined,
    saslUsername: process.env.KAFKA_SASL_USERNAME || undefined,
    saslPassword: process.env.KAFKA_SASL_PASSWORD || undefined,
  },

  fingerprint: {
    /** Similarity threshold for fuzzy matching (0.0 - 1.0) */
    fuzzyMatchThreshold: parseFloat(process.env.FUZZY_MATCH_THRESHOLD || '0.85'),
    /** Default trust score for new devices */
    defaultTrustScore: parseFloat(process.env.DEFAULT_TRUST_SCORE || '50'),
  },

  cache: {
    /** TTL for device cache entries in seconds */
    ttlSeconds: parseInt(process.env.DEVICE_CACHE_TTL_SECONDS || '86400', 10),
  },

  otel: {
    endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
  },
});
