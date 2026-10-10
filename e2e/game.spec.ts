import { devices, expect, test, type Browser, type Page } from "@playwright/test";
import { initialCamera, worldToScreen } from "../components/board/camera";
import { boardFromTiles } from "../lib/game/boardFromTiles";
import {
  admin,
  createStartedGame,
  gameState,
  openTurn,
  playTurnViaRpc,
  uniqueEmail,
  type TestGame,
  type TestUser,
} from "./helpers/game";

const E2E_BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3006";

async function asUser(browser: Browser, user: TestUser, next: string): Promise<Page> {
  const { defaultBrowserType: _ignored, ...iphone } = devices["iPhone 14"];
  void _ignored;
  const ctx = await browser.newContext({ ...iphone, baseURL: E2E_BASE_URL });
  const page = await ctx.newPage();
  await page.goto(`/dev/login?email=${encodeURIComponent(user.email)}&name=${user.name}&next=${encodeURIComponent(next)}`);
  return page;
}

const seconds = (s: string | null) => Number.parseFloat((s ?? "").replace(/[^\d.]/g, ""));

/** Screen position of a tile's centre given the untouched initial camera. */
async function tileScreenPos(page: Page, game: TestGame, pictureId: string) {
  const box = await page.locator("canvas").boundingBox();
  if (!box) throw new Error("no canvas");
  const board = boardFromTiles(game.tiles, 100);
  const vp = { width: Math.round(box.width), height: Math.round(box.height) };
  const cam = initialCamera(board, vp);
  const tile = board.tiles.find((t) => t.pictureId === pictureId)!;
  const p = worldToScreen(cam, vp, tile);
  return { x: box.x + p.x, y: box.y + p.y, onScreen: p.x > 0 && p.y > 0 && p.x < vp.width && p.y < vp.height };
}

/** A visible non-target tile nearest the canvas centre. */
async function wrongTileOnScreen(page: Page, game: TestGame, targetId: string) {
  const box = (await page.locator("canvas").boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  let best: { x: number; y: number; d: number } | null = null;
  for (const t of game.tiles) {
    if (t.pictureId === targetId) continue;
    const p = await tileScreenPos(page, game, t.pictureId);
    if (!p.onScreen) continue;
    const d = Math.hypot(p.x - cx, p.y - cy);
    if (!best || d < best.d) best = { ...p, d };
  }
  if (!best) throw new Error("no visible wrong tile");
  return best;
}

test.describe("game loop", () => {
  test("solo round, resume after reload, scoreboard updates, board study unlock", async ({ browser }) => {
    test.setTimeout(120_000);
    const game = await createStartedGame({
      emails: [uniqueEmail("e2e-a"), uniqueEmail("e2e-b")],
      names: ["Ann", "Ben"],
      rounds: 3,
      size: 100,
    });
    const a = game.firstUser;
    const b = game.users.find((u) => u.id !== a.id)!;

    // B: scoreboard (not B's turn) and board locked before first draw.
    const pageB = await asUser(browser, b, `/dev/game/${game.gameId}`);
    await expect(pageB.getByTestId("game-view")).toBeVisible();
    await expect(pageB.getByTestId("play-turn")).toHaveCount(0);
    await expect(pageB.getByTestId("view-board")).toHaveCount(0);
    await pageB.goto(`/g/${game.gameId}/board`);
    await expect(pageB.getByTestId("board-locked")).toBeVisible();
    await pageB.goto(`/dev/game/${game.gameId}`);

    // Out-of-turn play redirects away from /play (to /g/[id]).
    await pageB.goto(`/g/${game.gameId}/play`);
    await expect(pageB).toHaveURL(new RegExp(`/g/${game.gameId}$`));
    await expect(pageB.getByTestId("play-turn")).toHaveCount(0);
    await pageB.goto(`/dev/game/${game.gameId}`);

    // A: ready screen, draw enabled after preload.
    const pageA = await asUser(browser, a, `/g/${game.gameId}/play`);
    const draw = pageA.getByTestId("draw");
    await expect(draw).toBeEnabled({ timeout: 30_000 });
    await draw.click();
    await expect(pageA.getByTestId("round-screen")).toBeVisible();
    const turn = await openTurn(game.gameId);
    expect(turn?.status).toBe("live");
    const targetId = turn!.target_picture_id!;
    await expect(pageA.getByTestId("target")).toHaveAttribute("data-picture-id", targetId);
    await pageA.screenshot({ path: test.info().outputPath("round.png") });

    // Wrong tap with a real touch on a visible non-target tile.
    const wrong = await wrongTileOnScreen(pageA, game, targetId);
    await pageA.touchscreen.tap(wrong.x, wrong.y);
    await expect(pageA.getByTestId("wrong-count")).toContainText("1 wrong");
    await expect.poll(async () => seconds(await pageA.getByTestId("clock").textContent())).toBeGreaterThanOrEqual(5);

    // Correct tap (via dev hook; the target is usually off-screen at the default zoom).
    await pageA.evaluate((id) => window.__seenTest!.tap(id), targetId);
    const result = pageA.getByTestId("round-result");
    await expect(result).toBeVisible();
    await expect(result).toHaveAttribute("data-status", "found");
    expect(seconds(await pageA.getByTestId("result-score").textContent())).toBeGreaterThan(5);
    await expect(pageA.getByTestId("result-wrong")).toContainText("1 wrong");
    await expect(pageA.getByTestId("standings")).toBeVisible();
    await expect(pageA.getByTestId("back-to-game")).toHaveAttribute("href", `/g/${game.gameId}`);
    await pageA.screenshot({ path: test.info().outputPath("result.png") });

    // B's scoreboard shows A's score and B's turn (polling / realtime).
    await expect(pageB.getByTestId("play-turn")).toBeVisible({ timeout: 25_000 });
    await expect(pageB.getByTestId(`row-${a.id}`).locator('[data-kind="done"]')).toHaveCount(1);
    await expect(pageB.getByTestId("turn-order").locator('[data-current="true"]')).toContainText(b.name);
    await pageB.screenshot({ path: test.info().outputPath("scoreboard.png") });

    // B plays (RPC) -> board unlocks for B, A's second turn starts.
    await playTurnViaRpc(b, game.gameId, 0);
    await pageB.goto(`/g/${game.gameId}/board`);
    await expect(pageB.getByTestId("board-study")).toBeVisible();
    await expect(pageB.locator("canvas")).toBeVisible();
    await pageB.screenshot({ path: test.info().outputPath("board.png") });

    // A, second turn: draw, reload mid-round, same target and clock still running.
    expect((await gameState(a, game.gameId)).is_my_turn).toBe(true);
    await pageA.goto(`/g/${game.gameId}/play`);
    await expect(pageA.getByTestId("draw")).toBeEnabled({ timeout: 30_000 });
    await pageA.getByTestId("draw").click();
    await expect(pageA.getByTestId("round-screen")).toBeVisible();
    const t2 = await openTurn(game.gameId);
    const target2 = t2!.target_picture_id!;
    expect(target2).not.toBe(targetId);
    async function readClock() {
      return seconds(await pageA.getByTestId("clock").textContent());
    }
    await expect.poll(readClock, { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
    const before = await readClock();

    await pageA.reload();
    // No Ready screen: resumes straight into the round.
    await expect(pageA.getByTestId("round-screen")).toBeVisible({ timeout: 30_000 });
    await expect(pageA.getByTestId("target")).toHaveAttribute("data-picture-id", target2);
    const after1 = await readClock();
    expect(after1).toBeGreaterThanOrEqual(before);
    // Clock keeps running (web-first poll instead of a sleep).
    await expect.poll(readClock, { timeout: 15_000 }).toBeGreaterThan(after1);

    // Tap sequence continues after reload (no seq reuse): a wrong tap still works.
    const wrong2 = await wrongTileOnScreen(pageA, game, target2);
    await pageA.touchscreen.tap(wrong2.x, wrong2.y);
    await expect(pageA.getByTestId("wrong-count")).toContainText("1 wrong");
  });

  test("round caps locally at the deadline and shows the closed turn", async ({ browser }) => {
    test.setTimeout(90_000);
    const game = await createStartedGame({
      emails: [uniqueEmail("e2e-c"), uniqueEmail("e2e-d")],
      names: ["Cy", "Di"],
      rounds: 3,
      size: 100,
    });
    const a = game.firstUser;
    // Draw over RPC, then pretend the draw happened 80 s ago: the 90 s cap is ~10 s away, enough
    // to load the page on a slow machine yet short enough to wait for the local cap to fire.
    await a.client.rpc("draw_target", { game_id: game.gameId });
    const t = await openTurn(game.gameId);
    const drawnAt = new Date(Date.now() - 80_000);
    const { error } = await admin()
      .from("turns")
      .update({ drawn_at: drawnAt.toISOString(), deadline_at: new Date(drawnAt.getTime() + 90_000).toISOString() })
      .eq("id", t!.id);
    expect(error).toBeNull();

    const page = await asUser(browser, a, `/g/${game.gameId}/play`);
    await expect(page.getByTestId("round-screen")).toBeVisible({ timeout: 30_000 });
    const result = page.getByTestId("round-result");
    await expect(result).toBeVisible({ timeout: 45_000 });
    await expect(result).toHaveAttribute("data-status", "capped");
    await expect(page.getByTestId("result-score")).toHaveText("90.0 s");
    await page.screenshot({ path: test.info().outputPath("capped.png") });
  });

  test("final results with a retired player, and abandoned/leave flow", async ({ browser }) => {
    test.setTimeout(90_000);
    const game = await createStartedGame({
      emails: [uniqueEmail("e2e-e"), uniqueEmail("e2e-f"), uniqueEmail("e2e-g")],
      names: ["Eve", "Flo", "Gus"],
      rounds: 3,
      size: 100,
    });
    const [s1, s2, s3] = game.bySeat;
    // Round 1 for everyone, then seat 3 leaves through the UI.
    await playTurnViaRpc(s1, game.gameId, 0);
    await playTurnViaRpc(s2, game.gameId, 1);
    await playTurnViaRpc(s3, game.gameId, 0);

    const pageLeave = await asUser(browser, s3, `/dev/game/${game.gameId}`);
    await pageLeave.getByTestId("leave-game").click();
    await pageLeave.getByTestId("leave-confirm").click();
    await expect(pageLeave.getByText("retired").first()).toBeVisible({ timeout: 15_000 });
    await expect(pageLeave.getByTestId("play-turn")).toHaveCount(0);

    // Remaining two finish the game over RPC.
    for (let i = 0; i < 4; i++) {
      const turn = await openTurn(game.gameId);
      if (!turn) break;
      await playTurnViaRpc(turn.user_id === s1.id ? s1 : s2, game.gameId, 0);
    }
    const page = await asUser(browser, s1, `/dev/game/${game.gameId}`);
    await expect(page.getByTestId("final-results")).toBeVisible();
    await expect(page.getByTestId("winner")).toBeVisible();
    await expect(page.getByTestId("ranking").locator("li")).toHaveCount(2);
    await expect(page.getByTestId("retired")).toContainText(s3.name);
    await expect(page.getByTestId("rematch")).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("final.png"), fullPage: true });
  });
});
