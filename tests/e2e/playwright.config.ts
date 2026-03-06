import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  testMatch: '**/*.spec.ts',
  workers: 2,
  use: {
    baseURL: 'http://localhost:3099',
    screenshot: 'only-on-failure',
    headless: true,
  },
  reporter: [['github'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  webServer: {
    command: 'npx ts-node mock-server/server.ts',
    port: 3099,
    reuseExistingServer: !process.env.CI,
    env: {
      PORT: '3099',
    },
  },
});
