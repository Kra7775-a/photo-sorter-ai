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
        ...devices["Desktop Chrome"],
        browserName: "chromium",
        colorScheme: "dark",
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: {
    command: "bun run dev:all",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
