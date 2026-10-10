/**
 * Single switch for every dev/test-only surface: /dev/login, /dev/board, /dev/game/[id]
 * and the client hook `window.__seenTest`.
 *
 * On in `next dev` and `next test`; in a production build only when it was built with
 * NEXT_PUBLIC_E2E_TEST_HOOKS=1 (inlined at build time, used by the Playwright e2e run).
 *
 * !!! NEVER set NEXT_PUBLIC_E2E_TEST_HOOKS on a deployed environment: /dev/login lets anyone
 * !!! sign in as any email. next.config.ts fails the build if it is set with VERCEL_ENV=production.
 */
export const testHooksEnabled: boolean =
  process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_E2E_TEST_HOOKS === "1";
