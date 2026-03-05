/**
 * SignalRisk Event Collector — Configuration
 *
 * Centralized configuration using NestJS ConfigModule.
 * All values are sourced from environment variables with sensible defaults.
 */

export default () => ({
  port: parseInt(process.env.PORT || '3001', 10),
  serviceName: process.env.SERVICE_NAME || 'event-collector',

  kafka: {
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(',').map((b) => b.trim()),
    clientId: process.env.KAFKA_CLIENT_ID || 'event-collector',
    ssl: process.env.KAFKA_SSL === 'true',
    saslMechanism: process.env.KAFKA_SASL_MECHANISM || undefined,
    saslUsername: process.env.KAFKA_SASL_USERNAME || undefined,
    saslPassword: process.env.KAFKA_SASL_PASSWORD || undefined,
    /** Maximum batch size for producer sends */
    batchSize: parseInt(process.env.KAFKA_BATCH_SIZE || '100', 10),
    /** Linger time in ms — how long to wait to fill a batch */
    lingerMs: parseInt(process.env.KAFKA_LINGER_MS || '10', 10),
    /** Compression codec: gzip | snappy | lz4 | zstd | none */
    compression: process.env.KAFKA_COMPRESSION || 'lz4',
  },

  backpressure: {
    /** Maximum consumer lag before returning 429 */
    maxConsumerLag: parseInt(process.env.BACKPRESSURE_MAX_LAG || '100000', 10),
    /** How often to poll consumer lag (ms) */
    lagCheckIntervalMs: parseInt(process.env.BACKPRESSURE_CHECK_INTERVAL_MS || '5000', 10),
  },

  rateLimit: {
    /** Rate limit window in milliseconds */
    ttl: parseInt(process.env.RATE_LIMIT_TTL || '60000', 10),
    /** Maximum requests per merchant per window */
    limit: parseInt(process.env.RATE_LIMIT_MAX || '1000', 10),
  },

  otel: {
    endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
  },
});
