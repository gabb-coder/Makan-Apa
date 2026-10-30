import { defineConfig } from '@playwright/test';

// End-to-end tests run the production build against the real Supabase project. Each test
// creates its own room and deletes it at the end. Anonymous sign-ins are rate limited
// (30 per hour per IP), so the suite keeps sign-ins to a handful per run.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 390, height: 844 },
    timezoneId: 'Asia/Kuala_Lumpur',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
