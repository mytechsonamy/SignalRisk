export default () => ({
  port: parseInt(process.env.PORT || '3012', 10),
  serviceName: process.env.SERVICE_NAME || 'graph-intel-service',

  neo4j: {
    uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
    username: process.env.NEO4J_USERNAME || 'neo4j',
    password: process.env.NEO4J_PASSWORD || 'password',
  },

  kafka: {
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(',').map((b) => b.trim()),
    clientId: process.env.KAFKA_CLIENT_ID || 'graph-intel-service',
    groupId: process.env.KAFKA_GROUP_ID || 'graph-intel-service',
  },
});
