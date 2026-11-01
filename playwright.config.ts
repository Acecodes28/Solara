import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000' },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: 'npm run start', url: 'http://localhost:3000', reuseExistingServer: true, timeout: 120_000, env: { RATE_LIMIT_PER_MIN: '1000' } },
});
