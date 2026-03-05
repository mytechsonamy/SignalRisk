/**
 * SignalRisk Velocity Engine — Configuration
 *
 * Centralized configuration using NestJS ConfigModule.
 * All values are sourced from environment variables with sensible defaults.
 */

export default () => ({
  port: parseInt(process.env.PORT || '3003', 10),
  serviceName: process.env.SERVICE_NAME || 'velocity-engine',

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    keyPrefix: process.env.REDIS_KEY_PREFIX || '',
    /** Connection timeout in ms */
    connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT || '5000', 10),
    /** Max retries per request */
    maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES || '3', 10),
  },

  kafka: {
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(',').map((b) => b.trim()),
    clientId: process.env.KAFKA_CLIENT_ID || 'velocity-engine',
    ssl: process.env.KAFKA_SSL === 'true',
    saslMechanism: process.env.KAFKA_SASL_MECHANISM || undefined,
    saslUsername: process.env.KAFKA_SASL_USERNAME || undefined,
    saslPassword: process.env.KAFKA_SASL_PASSWORD || undefined,
  },

  velocity: {
    /** TTL for all Redis keys in seconds (default: 25h for safety margin over 24h windows) */
    keyTtlSeconds: parseInt(process.env.VELOCITY_KEY_TTL || '90000', 10),
    /** 1-hour window in seconds */
    window1h: 3600,
    /** 24-hour window in seconds */
    window24h: 86400,
    /** Baseline rolling window in seconds (7 days) */
    baselineWindowSeconds: parseInt(process.env.VELOCITY_BASELINE_WINDOW || '604800', 10),
  },

  burst: {
    /** Multiplier threshold for burst detection (default: 3x baseline) */
    multiplierThreshold: parseFloat(process.env.BURST_MULTIPLIER_THRESHOLD || '3.0'),
  },

  decay: {
    /** Half-life for hourly dimensions in seconds */
    halfLifeHourly: parseInt(process.env.DECAY_HALF_LIFE_HOURLY || '3600', 10),
    /** Half-life for daily dimensions in seconds */
    halfLifeDaily: parseInt(process.env.DECAY_HALF_LIFE_DAILY || '43200', 10),
  },

  otel: {
    endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
  },
});
