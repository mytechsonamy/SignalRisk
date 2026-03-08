import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './scenarios',
  timeout: 60_000,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3002',
    extraHTTPHeaders: { 'Content-Type': 'application/json' },
  },
  projects: [
    // Light tests first — no heavy Kafka traffic
    {
      name: 'e2e-light',
      testMatch: /happy-path|jwt-revoke|multi-tenant|analytics-decision/,
      fullyParallel: false,
    },
    // Heavy load tests — fraud blast + performance gate generate significant Kafka lag
    {
      name: 'e2e-heavy',
      testMatch: /fraud-blast|performance-gate|case-lifecycle/,
      fullyParallel: false,
      dependencies: ['e2e-light'],
    },
    // Chaos tests last — they stop/start Redis, disrupting other services
    {
      name: 'chaos',
      testMatch: /chaos-redis|chaos-kafka/,
      fullyParallel: false,
      dependencies: ['e2e-heavy'],
    },
  ],
  webServer: process.env.SKIP_DOCKER ? undefined : {
    command: 'docker compose -f ../../docker-compose.full.yml up --wait',
    url: 'http://localhost:3001/health',
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
