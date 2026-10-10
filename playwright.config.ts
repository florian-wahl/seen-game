import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3001";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-iphone14",
      // iPhone 14 profile (viewport, touch, UA) on Chromium.
      use: { ...devices["iPhone 14"], browserName: "chromium", defaultBrowserType: "chromium" },
    },
  ],
  // Run `npx next dev -p 3001` yourself, or set E2E_START_SERVER=1 to have Playwright start it.
  webServer: process.env.E2E_START_SERVER
    ? { command: "npx next dev -p 3001", url: baseURL, reuseExistingServer: true, timeout: 120_000 }
    : undefined,
});
