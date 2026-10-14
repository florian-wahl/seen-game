import { expect, test } from "@playwright/test";
import { admin, createStartedGame, openTurn, playTurnViaRpc, uniqueEmail } from "./helpers/game";

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

test("email off: no 'Your turn' email, and the outbox row is still marked sent", async ({ page }) => {
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

  // Make sure the quiet player has had a turn come up.
  const quietUser = g.users.find((u) => u.email === quiet)!;
  const loudUser = g.users.find((u) => u.email === loud)!;
  if (g.firstUser.id !== quietUser.id) {
    expect((await openTurn(g.gameId))?.user_id).toBe(loudUser.id);
    await playTurnViaRpc(loudUser, g.gameId);
  }
  expect((await openTurn(g.gameId))?.user_id).toBe(quietUser.id);

  const quietRow = async () =>
    (
      await admin()
        .from("notification_outbox")
        .select("sent_at")
        .eq("game_id", g.gameId)
        .eq("user_id", quietUser.id)
        .eq("kind", "your_turn")
    ).data ?? [];
  await expect.poll(async () => (await quietRow()).length > 0 && (await quietRow()).every((r) => r.sent_at)).toBe(true);
  expect(await mailCount(quiet, g.gameId)).toBe(0);
  if (g.firstUser.id !== quietUser.id) expect(await mailCount(loud, g.gameId)).toBeGreaterThan(0); // control: email works
});
