// Local config for e2e/game.spec.ts (the shared playwright.config.ts belongs to another branch).
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "game.spec.ts",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3002",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium-iphone14", use: { ...devices["iPhone 14"], browserName: "chromium" } }],
  webServer: {
    command: "npx next dev -p 3002",
    url: "http://localhost:3002",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
