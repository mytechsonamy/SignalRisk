/**
 * SignalRisk Telco Intel Service — Configuration
 *
 * Centralized configuration using NestJS ConfigModule.
 * All values are sourced from environment variables with sensible defaults.
 */

export default () => ({
  port: parseInt(process.env.PORT || '3007', 10),
  serviceName: process.env.SERVICE_NAME || 'telco-intel-service',

  kafka: {
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(',').map((b) => b.trim()),
    clientId: process.env.KAFKA_CLIENT_ID || 'telco-intel-service',
    groupId: process.env.KAFKA_GROUP_ID || 'telco-intel-payguru-consumer',
    ssl: process.env.KAFKA_SSL === 'true',
    saslMechanism: process.env.KAFKA_SASL_MECHANISM || undefined,
    saslUsername: process.env.KAFKA_SASL_USERNAME || undefined,
    saslPassword: process.env.KAFKA_SASL_PASSWORD || undefined,
  },

  otel: {
    endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
  },
});
