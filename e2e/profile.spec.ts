import { expect, test } from "@playwright/test";
import { admin, createStartedGame, openTurn, playTurnViaRpc, remindOpenTurn, uniqueEmail } from "./helpers/game";

const MAILPIT = process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:54324";

async function mailCount(email: string, gameId: string): Promise<number> {
  const q = encodeURIComponent(`to:${email}`);
  const list = await (await fetch(`${MAILPIT}/api/v1/search?query=${q}`)).json();
  let n = 0;
  for (const m of list.messages ?? []) {
    const msg = await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json();
    if (`${msg.Text}${msg.HTML}`.includes(gameId)) n++;
  }
  return n;
}

test("profile: rename from the account menu; preferences persist", async ({ page }) => {
  const email = uniqueEmail("profile");
  await page.goto(`/dev/login?email=${email}&name=Before&next=/`);
  await page.getByTestId("account-menu").click();
  await page.getByTestId("profile-link").click();
  await expect(page).toHaveURL(/\/profile$/);

  await page.getByTestId("profile-name").fill("  After Rename  ");
  await page.getByTestId("save-name").click();
  await expect(page.getByTestId("name-status")).toHaveText("Saved. You're After Rename.");

  const emailSwitch = page.getByTestId("pref-email");
  const pushSwitch = page.getByTestId("pref-push");
  await expect(emailSwitch).toHaveAttribute("aria-checked", "true");
  await expect(pushSwitch).toHaveAttribute("aria-checked", "true");
  await emailSwitch.click();
  await expect(emailSwitch).toHaveAttribute("aria-checked", "false");
  await expect(emailSwitch).toBeEnabled(); // saved
  await pushSwitch.click();
  await expect(pushSwitch).toHaveAttribute("aria-checked", "false");
  await expect(pushSwitch).toBeEnabled();

  await page.reload();
  await expect(page.getByTestId("profile-name")).toHaveValue("After Rename");
  await expect(page.getByTestId("pref-email")).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("pref-push")).toHaveAttribute("aria-checked", "false");

  await page.goto("/");
  await expect(page.getByTestId("me-name")).toHaveText("After Rename");
  await expect(page.getByTestId("enable-notifications")).toHaveCount(0); // push is off: no nudge on Home
});

test("email off: no reminder email, and the outbox row is still marked sent", async ({ page }) => {
  const quiet = uniqueEmail("quiet");
  const loud = uniqueEmail("loud");
  await page.goto(`/dev/login?email=${quiet}&name=Quiet&next=/profile`);
  await page.getByTestId("pref-email").click();
  await expect(page.getByTestId("pref-email")).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("pref-email")).toBeEnabled();

  const g = await createStartedGame({ emails: [quiet, loud], names: ["Quiet", "Loud"], rounds: 3, size: 100 });
  await new Promise((r) => setTimeout(r, 2500));
  const { data: rows } = await admin().from("notification_outbox").select("attempts").eq("game_id", g.gameId);
  test.skip(
    !rows?.length || rows.every((r) => r.attempts === 0),
    "Vault secret notify_url is not set: run `npm run db:setup-notify` (and start the dev server) to enable this test",
  );

  const quietUser = g.users.find((u) => u.email === quiet)!;
  const loudUser = g.users.find((u) => u.email === loud)!;
  const reminderSent = (userId: string) => async () => {
    const { data } = await admin()
      .from("notification_outbox")
      .select("sent_at")
      .eq("game_id", g.gameId)
      .eq("user_id", userId)
      .eq("kind", "reminder");
    return !!data?.length && data.every((r) => r.sent_at);
  };

  // Control: with email on, the loud player's reminder arrives. Then the quiet player is up.
  if (g.firstUser.id !== quietUser.id) {
    expect((await openTurn(g.gameId))?.user_id).toBe(loudUser.id);
    await remindOpenTurn(g.gameId);
    await expect.poll(reminderSent(loudUser.id)).toBe(true);
    await expect.poll(() => mailCount(loud, g.gameId)).toBe(1);
    await playTurnViaRpc(loudUser, g.gameId);
  }
  expect((await openTurn(g.gameId))?.user_id).toBe(quietUser.id);
  await remindOpenTurn(g.gameId);
  await expect.poll(reminderSent(quietUser.id)).toBe(true);
  expect(await mailCount(quiet, g.gameId)).toBe(0);
});

test("best times: hidden before any finished game, then one line per game type", async ({ page }) => {
  test.setTimeout(120_000);
  const game = await createStartedGame({
    emails: [uniqueEmail("best-a"), uniqueEmail("best-b")],
    names: ["Bea", "Bo"],
    rounds: 5,
    size: 200,
  });
  const me = game.users[0];
  await page.goto(`/dev/login?email=${encodeURIComponent(me.email)}&name=${me.name}&next=/profile`);
  await expect(page.getByTestId("profile-name")).toBeVisible();
  await expect(page.getByTestId("best-times")).toHaveCount(0);

  // Play every turn to the end; one wrong tap each so the total includes penalties.
  for (let turn = await openTurn(game.gameId); turn; turn = await openTurn(game.gameId)) {
    await playTurnViaRpc(game.users.find((u) => u.id === turn!.user_id)!, game.gameId, 1);
  }
  const { data: mine } = await admin()
    .from("game_players")
    .select("total_ms")
    .eq("game_id", game.gameId)
    .eq("user_id", me.id)
    .single();
  const expected = `${(Math.round(mine!.total_ms / 100) / 10).toFixed(1)} s`;

  await page.reload();
  const line = page.getByTestId("best-time");
  await expect(line).toHaveCount(1);
  await expect(line).toContainText("5 rounds · 200 pictures");
  await expect(line).toContainText("1 game");
  await expect(line).toContainText(expected);
});

test("push already on for this device: Home shows nothing, Profile offers Turn off", async ({ page }) => {
  // Stub a browser that has permission and an active push subscription.
  await page.addInitScript(() => {
    Object.defineProperty(Notification, "permission", { get: () => "granted", configurable: true });
    if (!("PushManager" in window)) {
      Object.defineProperty(window, "PushManager", { value: function PushManager() {}, configurable: true });
    }
    const sub = {
      endpoint: "https://fcm.googleapis.com/fcm/send/e2e-fake",
      toJSON: () => ({ keys: { p256dh: "x", auth: "y" } }),
      unsubscribe: async () => true,
    };
    Object.defineProperty(navigator.serviceWorker, "ready", {
      get: () => Promise.resolve({ pushManager: { getSubscription: async () => sub } }),
      configurable: true,
    });
  });

  const email = uniqueEmail("pushon");
  // Home's mount check re-saves the subscription just before it switches to "on".
  const saved = page.waitForResponse((r) => r.url().includes("save_push_subscription") && r.ok());
  await page.goto(`/dev/login?email=${email}&name=PushOn&next=/`);
  await expect(page.getByTestId("me-name")).toHaveText("PushOn");
  await saved;
  await page.waitForTimeout(300); // let React render the "on" state before asserting absence
  await expect(page.getByTestId("notifications-on")).toHaveCount(0);
  await expect(page.getByTestId("enable-notifications")).toHaveCount(0);

  await page.goto("/profile");
  await expect(page.getByTestId("notifications-on")).toBeVisible();
  await expect(page.getByTestId("disable-notifications")).toBeVisible();
});
