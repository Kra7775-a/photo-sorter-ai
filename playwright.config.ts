import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://localhost:3000",
    browserName: "chromium",
    colorScheme: "dark",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: {
        ...devices["Desktop Chrome"],
        browserName: "chromium",
        colorScheme: "dark",
        viewport: { width: 1280, height: 900 },
      },
    },
    {
      name: "chromium-mobile",
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
        colorScheme: "dark",
      },
    },
  ],
  webServer: {
    command: "bun run dev:all",
    url: "http://localhost:3000",
    // Placeholders keep `/api` working from a clean clone; real secrets still win.
    env: {
      SYNC_MASTER_KEY:
        process.env.SYNC_MASTER_KEY ??
        Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64"),
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "e2e-only-secret-not-for-production",
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
