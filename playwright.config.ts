import { defineConfig, devices } from "@playwright/test";

// `npm run test:e2e` (E2E_START_SERVER=1, or CI): builds and serves a production bundle with the
// test hooks compiled in, on :3006. E2E_BASE_URL=<url> targets an already-running server instead
// (`npm run test:e2e:dev` against `next dev -p 3001`) and never starts one.
const externalURL = process.env.E2E_BASE_URL;
const baseURL = externalURL ?? "http://localhost:3006";
const startServer = !externalURL && (process.env.E2E_START_SERVER === "1" || !!process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium-iphone14",
      // iPhone 14 profile (viewport, touch, UA) on Chromium.
      use: { ...devices["iPhone 14"], browserName: "chromium", defaultBrowserType: "chromium" },
    },
  ],
  // `next build`/`next start` load .env.local themselves. NEXT_PUBLIC_E2E_TEST_HOOKS is inlined at
  // build time. NEVER set that flag for a deployed build (see lib/testHooks.ts).
  webServer: startServer
    ? {
        command: "npx next build && npx next start -p 3006",
        env: { NEXT_PUBLIC_E2E_TEST_HOOKS: "1" },
        url: baseURL,
        reuseExistingServer: false,
        timeout: 300_000,
        stdout: "pipe",
      }
    : undefined,
});
