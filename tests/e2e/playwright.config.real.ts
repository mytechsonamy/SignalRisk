import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './scenarios',
  timeout: 60_000,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 4,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3002',
    extraHTTPHeaders: { 'Content-Type': 'application/json' },
  },
  webServer: process.env.SKIP_DOCKER ? undefined : {
    command: 'docker compose -f ../../docker-compose.full.yml up --wait',
    url: 'http://localhost:3001/health',
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
