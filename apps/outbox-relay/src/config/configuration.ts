export default () => ({
  relay: {
    pollIntervalMs: parseInt(process.env.RELAY_POLL_INTERVAL_MS ?? '500', 10),
    batchSize: parseInt(process.env.RELAY_BATCH_SIZE ?? '100', 10),
  },
  kafka: {
    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
    clientId: process.env.KAFKA_CLIENT_ID ?? 'signalrisk-outbox-relay',
  },
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    user: process.env.DB_USER ?? 'signalrisk',
    password: process.env.DB_PASSWORD ?? 'signalrisk',
    database: process.env.DB_NAME ?? 'signalrisk',
  },
  health: {
    port: parseInt(process.env.HEALTH_PORT ?? '3010', 10),
  },
});
