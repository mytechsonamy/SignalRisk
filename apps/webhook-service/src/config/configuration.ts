export default () => ({
  port: parseInt(process.env.PORT || '3011', 10),
  serviceName: process.env.SERVICE_NAME || 'webhook-service',

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },

  kafka: {
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092')
      .split(',')
      .map((b) => b.trim()),
    clientId: process.env.KAFKA_CLIENT_ID || 'webhook-service',
    groupId: process.env.KAFKA_GROUP_ID || 'webhook-service',
    ssl: process.env.KAFKA_SSL === 'true',
    saslMechanism: process.env.KAFKA_SASL_MECHANISM || undefined,
    saslUsername: process.env.KAFKA_SASL_USERNAME || undefined,
    saslPassword: process.env.KAFKA_SASL_PASSWORD || undefined,
  },
});
