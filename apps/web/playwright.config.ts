import { defineConfig, devices } from "@playwright/test";

const testDbUrl = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL ?? "";
const testDirectUrl = process.env.DIRECT_URL_TEST ?? process.env.DIRECT_URL ?? testDbUrl;

export default defineConfig({
  testDir: "./tests/e2e-fe",
  timeout: 120_000,
  expect: {
    timeout: 10_000
  },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    headless: true
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  globalSetup: "./tests/e2e-fe/global-setup.ts",
  webServer: {
    command: "pnpm --filter web exec next dev -p 4173",
    url: "http://127.0.0.1:4173/login",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      ...process.env,
      DATABASE_URL: testDbUrl,
      DIRECT_URL: testDirectUrl,
      AUTH_SECRET: process.env.AUTH_SECRET ?? "test-auth-secret-please-change",
      AUTH_URL: "http://127.0.0.1:4173",
      SEED_ADMIN_EMAIL: process.env.SEED_ADMIN_EMAIL ?? "umberto.giancola00@gmail.com",
      SEED_ADMIN_PASSWORD: process.env.SEED_ADMIN_PASSWORD ?? "Castiglione1!"
    }
  }
});
