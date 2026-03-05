export default () => ({
  port: parseInt(process.env.PORT || '3010', 10),
  serviceName: process.env.SERVICE_NAME || 'case-service',

  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'signalrisk',
    password: process.env.DB_PASSWORD || 'signalrisk',
    database: process.env.DB_DATABASE || 'signalrisk',
    ssl: process.env.DB_SSL === 'true',
  },

  kafka: {
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092')
      .split(',')
      .map((b) => b.trim()),
    clientId: process.env.KAFKA_CLIENT_ID || 'case-service',
    groupId: process.env.KAFKA_GROUP_ID || 'case-service-consumer',
    ssl: process.env.KAFKA_SSL === 'true',
    saslMechanism: process.env.KAFKA_SASL_MECHANISM || undefined,
    saslUsername: process.env.KAFKA_SASL_USERNAME || undefined,
    saslPassword: process.env.KAFKA_SASL_PASSWORD || undefined,
  },
});
