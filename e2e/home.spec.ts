import { devices, expect, test, type Browser, type Page } from "@playwright/test";
import { createStartedGame, playTurnViaRpc, uniqueEmail, type TestGame, type TestUser } from "./helpers/game";

const E2E_BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3006";

async function asUser(
  browser: Browser,
  user: TestUser,
  next: string,
  beforeGoto?: (page: Page) => Promise<void>,
): Promise<Page> {
  const { defaultBrowserType: _ignored, ...iphone } = devices["iPhone 14"];
  void _ignored;
  const ctx = await browser.newContext({ ...iphone, baseURL: E2E_BASE_URL });
  const page = await ctx.newPage();
  await beforeGoto?.(page);
  await page.goto(`/dev/login?email=${encodeURIComponent(user.email)}&name=${user.name}&next=${encodeURIComponent(next)}`);
  return page;
}

/** Two players, started. `waiter` is not the one to move; `mover` plays first. */
async function twoPlayerGame(): Promise<{ game: TestGame; mover: TestUser; waiter: TestUser }> {
  const game = await createStartedGame({
    emails: [uniqueEmail("e2e-home-a"), uniqueEmail("e2e-home-b")],
    names: ["Hana", "Hugo"],
    rounds: 3,
    size: 100,
  });
  const mover = game.firstUser;
  const waiter = game.users.find((u) => u.id !== mover.id)!;
  return { game, mover, waiter };
}

/** Sit on `/` with the game under "Waiting for others", and mark the document so a reload is detectable. */
async function sitOnHome(page: Page) {
  await expect(page.locator('section[aria-label="Waiting for others"]')).toBeVisible();
  await expect(page.locator('section[aria-label="Your turn"]')).toHaveCount(0);
  await page.evaluate(() => {
    (window as unknown as { __noReload: boolean }).__noReload = true;
  });
}

async function expectTurnHighlightedWithoutReload(page: Page, timeout: number) {
  const card = page.locator('section[aria-label="Your turn"] [data-just-turned="true"]');
  await expect(card).toBeVisible({ timeout });
  expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);
}

/** Block the Realtime websocket so only focus/visibility events and the poll can refresh the page. */
const blockRealtime = async (p: Page) => {
  await p.routeWebSocket(/\/realtime\/v1\//, (ws) => void ws.close());
};

test.describe("home page stays current", () => {
  test("a game moves into Your turn, highlighted, when the other player finishes their turn", async ({ browser }) => {
    test.setTimeout(60_000);
    const { game, mover, waiter } = await twoPlayerGame();
    const page = await asUser(browser, waiter, "/");
    await sitOnHome(page);

    await playTurnViaRpc(mover, game.gameId);
    await expectTurnHighlightedWithoutReload(page, 5_000);

    // The highlight is brief.
    await expect(page.locator('[data-just-turned="true"]')).toHaveCount(0, { timeout: 6_000 });
    await expect(page.locator('section[aria-label="Your turn"]')).toBeVisible();
    await page.context().close();
  });

  test("no highlight for a game that is already your turn on first load", async ({ browser }) => {
    test.setTimeout(60_000);
    const { mover } = await twoPlayerGame();
    const page = await asUser(browser, mover, "/");
    await expect(page.locator('section[aria-label="Your turn"]')).toBeVisible();
    await expect(page.locator('[data-just-turned="true"]')).toHaveCount(0);
    await page.context().close();
  });

  test("with realtime blocked, a focus event refreshes the list", async ({ browser }) => {
    test.setTimeout(60_000);
    const { game, mover, waiter } = await twoPlayerGame();
    const page = await asUser(browser, waiter, "/", blockRealtime);
    await sitOnHome(page);

    await playTurnViaRpc(mover, game.gameId);
    await page.waitForTimeout(1_000);
    await expect(page.locator('section[aria-label="Your turn"]')).toHaveCount(0); // nothing nudged us
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expectTurnHighlightedWithoutReload(page, 5_000);
    await page.context().close();
  });

  test("with realtime blocked, the 20 s poll refreshes the list", async ({ browser }) => {
    test.setTimeout(90_000);
    const { game, mover, waiter } = await twoPlayerGame();
    const page = await asUser(browser, waiter, "/", blockRealtime);
    await sitOnHome(page);

    await playTurnViaRpc(mover, game.gameId);
    await expectTurnHighlightedWithoutReload(page, 30_000);
    await page.context().close();
  });
});
