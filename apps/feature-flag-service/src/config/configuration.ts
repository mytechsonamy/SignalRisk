export default () => ({
  port: parseInt(process.env.PORT || '3013', 10),
  serviceName: process.env.SERVICE_NAME || 'feature-flag-service',
  featureFlagUrl: process.env.FEATURE_FLAG_URL || 'http://localhost:3013',
});
