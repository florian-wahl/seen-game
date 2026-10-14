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

async function asUser(
  browser: Browser,
  user: TestUser,
  next: string,
  beforeGoto?: (page: Page) => void,
): Promise<Page> {
  const { defaultBrowserType: _ignored, ...iphone } = devices["iPhone 14"];
  void _ignored;
  const ctx = await browser.newContext({ ...iphone, baseURL: E2E_BASE_URL });
  const page = await ctx.newPage();
  beforeGoto?.(page);
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
    const libraryRequests: string[] = [];
    const pageA = await asUser(browser, a, `/g/${game.gameId}/play`, (pg) =>
      pg.on("request", (r) => {
        const u = new URL(r.url());
        if (u.pathname.startsWith("/library/")) libraryRequests.push(u.pathname);
      }),
    );
    const draw = pageA.getByTestId("draw");
    await expect(draw).toBeEnabled({ timeout: 30_000 });
    // Picture library = one hashed bundle (+ the current.json pointer), never per-picture SVG requests.
    expect(libraryRequests.filter((p) => /^\/library\/bundles\/library-.*\.json$/.test(p))).toHaveLength(1);
    expect(libraryRequests.filter((p) => p.endsWith(".svg"))).toEqual([]);
    expect(libraryRequests.length).toBeLessThanOrEqual(2);
    await draw.click();
    await expect(pageA.getByTestId("round-screen")).toBeVisible();
    await expect(pageA.getByTestId("reveal")).toHaveCount(0); // reveal over: board playable
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
    await expect(pageA.getByTestId("reveal")).toHaveCount(0);
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

  test("second turn via in-app links starts fresh (no stale play screen)", async ({ browser }) => {
    test.setTimeout(120_000);
    const game = await createStartedGame({
      emails: [uniqueEmail("e2e-h"), uniqueEmail("e2e-i")],
      names: ["Hal", "Ivy"],
      rounds: 3,
      size: 100,
    });
    const a = game.firstUser;
    const b = game.users.find((u) => u.id !== a.id)!;

    // Turn 1 through the UI, starting from the game page like a player would.
    const page = await asUser(browser, a, `/g/${game.gameId}`);
    await page.getByTestId("play-turn").click();
    await expect(page.getByTestId("draw")).toBeEnabled({ timeout: 30_000 });
    await page.getByTestId("draw").click();
    await expect(page.getByTestId("round-screen")).toBeVisible();
    await expect(page.getByTestId("reveal")).toHaveCount(0);
    const t1 = (await openTurn(game.gameId))!;
    await page.evaluate((id) => window.__seenTest!.tap(id), t1.target_picture_id!);
    await expect(page.getByTestId("round-result")).toBeVisible();

    // Back to the game (client-side link), B plays, A's turn again.
    await page.getByTestId("back-to-game").click();
    await expect(page).toHaveURL(new RegExp(`/g/${game.gameId}$`));
    await playTurnViaRpc(b, game.gameId, 0);
    await expect(page.getByTestId("play-turn")).toBeVisible({ timeout: 25_000 });

    // Turn 2 through the same links, no reload: a fresh Ready screen and a working Draw.
    await page.getByTestId("play-turn").click();
    await expect(page.getByTestId("round-result")).toHaveCount(0);
    await expect(page.getByTestId("draw")).toBeEnabled({ timeout: 30_000 });
    await page.getByTestId("draw").click();
    await expect(page.getByTestId("round-screen")).toBeVisible();
    await expect(page.getByTestId("reveal")).toHaveCount(0);
    const t2 = (await openTurn(game.gameId))!;
    expect(t2.round).toBe(2);
    await expect(page.getByTestId("target")).toHaveAttribute("data-picture-id", t2.target_picture_id!);
    await page.evaluate((id) => window.__seenTest!.tap(id), t2.target_picture_id!);
    await expect(page.getByTestId("round-result")).toHaveAttribute("data-status", "found");
  });

  test("draw reveal: big target over a hidden board, then flies to the slot; clock starts after", async ({ browser }) => {
    test.setTimeout(90_000);
    const game = await createStartedGame({
      emails: [uniqueEmail("e2e-r"), uniqueEmail("e2e-s")],
      names: ["Rae", "Sam"],
      rounds: 3,
      size: 100,
    });
    const a = game.firstUser;
    const page = await asUser(browser, a, `/g/${game.gameId}/play`);
    await expect(page.getByTestId("draw")).toBeEnabled({ timeout: 30_000 });
    const clickedAt = Date.now();
    await page.getByTestId("draw").click();

    // During the reveal: big target card, opaque cover over the board, clock frozen at 0.0.
    const reveal = page.getByTestId("reveal");
    await expect(reveal).toBeVisible();
    await expect(page.getByTestId("reveal-cover")).toBeVisible();
    const turn = (await openTurn(game.gameId))!;
    const targetId = turn.target_picture_id!;
    await expect(page.getByTestId("reveal-card")).toHaveAttribute("data-picture-id", targetId);
    const card = (await page.getByTestId("reveal-card").boundingBox())!;
    const vp = page.viewportSize()!;
    expect(card.width).toBeGreaterThan(vp.width * 0.6);
    await expect(page.getByTestId("clock")).toHaveText("0.0 s");
    // Taps during the reveal do nothing (also not a penalty).
    await page.evaluate((id) => window.__seenTest!.tap(id), targetId);

    // Reveal ends: overlay gone, target in the header slot, clock running, round playable.
    await expect(reveal).toHaveCount(0, { timeout: 5_000 });
    await expect(page.getByTestId("reveal-cover")).toHaveCount(0);
    await expect(page.getByTestId("target")).toHaveAttribute("data-picture-id", targetId);
    await expect(page.getByTestId("target")).toBeVisible();
    await expect.poll(async () => seconds(await page.getByTestId("clock").textContent()), { timeout: 10_000 }).toBeGreaterThan(0);
    await expect(page.getByTestId("wrong-count")).toContainText("0 wrong");

    // The official start (drawn_at) is ~1.2 s after the draw.
    const live = (await openTurn(game.gameId))!;
    expect(Date.parse(live.drawn_at!)).toBeGreaterThanOrEqual(clickedAt + 1000);

    await page.evaluate((id) => window.__seenTest!.tap(id), targetId);
    await expect(page.getByTestId("round-result")).toHaveAttribute("data-status", "found");
    const score = seconds(await page.getByTestId("result-score").textContent());
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(30);
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

  test("monochrome: board, reveal and target are grayscale; highlights keep their color", async ({ browser }) => {
    test.setTimeout(90_000);
    const game = await createStartedGame({
      emails: [uniqueEmail("e2e-m"), uniqueEmail("e2e-n")],
      names: ["Moe", "Nia"],
      rounds: 3,
      size: 100,
      monochrome: true,
    });
    const a = game.firstUser;
    const page = await asUser(browser, a, `/g/${game.gameId}`);
    await expect(page.getByTestId("monochrome-badge")).toBeVisible();
    await page.getByTestId("play-turn").click();
    await expect(page.getByTestId("draw")).toBeEnabled({ timeout: 30_000 });
    await page.getByTestId("draw").click();
    await expect(page.getByTestId("reveal-card")).toHaveClass(/\bgrayscale\b/);
    await expect(page.getByTestId("reveal")).toHaveCount(0, { timeout: 5_000 });
    await expect(page.getByTestId("target")).toHaveClass(/\bgrayscale\b/);

    // Every drawn picture pixel is gray. The paper background (#f4f1ea) is only slightly warm.
    const colorful = async () =>
      page.locator("canvas").evaluate((c: HTMLCanvasElement) => {
        const { data } = c.getContext("2d")!.getImageData(0, 0, c.width, c.height);
        let ink = 0;
        let saturated = 0;
        for (let i = 0; i < data.length; i += 4) {
          const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
          if (Math.max(r, g, b) < 120) ink++;
          if (Math.max(r, g, b) - Math.min(r, g, b) > 12) saturated++;
        }
        return { ink, saturated };
      });
    await expect.poll(async () => (await colorful()).ink, { timeout: 10_000 }).toBeGreaterThan(1000);
    expect((await colorful()).saturated).toBe(0);

    // A wrong tap flashes pink on top of the gray board: highlights keep their color.
    const turn = (await openTurn(game.gameId))!;
    const wrong = await wrongTileOnScreen(page, game, turn.target_picture_id!);
    // Watch the tapped tile every frame while the 600 ms flash plays.
    const watch = page.locator("canvas").evaluate(
      (c: HTMLCanvasElement, at: { x: number; y: number }) =>
        new Promise<number>((resolve) => {
          const rect = c.getBoundingClientRect();
          const k = c.width / rect.width;
          const [sx, sy] = [Math.round((at.x - rect.left - 15) * k), Math.round((at.y - rect.top - 15) * k)];
          const ctx = c.getContext("2d")!;
          let most = 0;
          const end = performance.now() + 2500;
          const tick = () => {
            const { data } = ctx.getImageData(sx, sy, Math.round(30 * k), Math.round(30 * k));
            let n = 0;
            for (let i = 0; i < data.length; i += 4) {
              if (Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]) > 12) n++;
            }
            most = Math.max(most, n);
            if (performance.now() < end) requestAnimationFrame(tick);
            else resolve(most);
          };
          tick();
        }),
      { x: wrong.x, y: wrong.y },
    );
    await page.touchscreen.tap(wrong.x, wrong.y);
    await expect(page.getByTestId("wrong-count")).toContainText("1 wrong");
    expect(await watch).toBeGreaterThan(50);

    await page.evaluate((id) => window.__seenTest!.tap(id), turn.target_picture_id!);
    await expect(page.getByTestId("round-result")).toHaveAttribute("data-status", "found");
  });
});
