import { expect, test, type Browser, type Page } from "@playwright/test";

const MAILPIT = process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:54324";
const run = Date.now().toString(36);

async function signedInPage(browser: Browser, name: string, next = "/") {
  const context = await browser.newContext();
  const page = await context.newPage();
  const email = `${name.toLowerCase()}-${run}@test.local`;
  await page.goto(`/dev/login?email=${email}&name=${name}&next=${encodeURIComponent(next)}`);
  return page;
}

async function waitForMail(email: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const list = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json();
    const id = list.messages?.[0]?.ID;
    if (id) {
      const msg = await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json();
      const html: string = msg.HTML ?? msg.Text ?? "";
      const m = html.match(/href="([^"]+)"/) ?? html.match(/(https?:\/\/\S+)/);
      if (m) return m[1].replace(/&amp;/g, "&");
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No mail for ${email}`);
}

test("two players: create, invite, join live, start", async ({ browser }) => {
  const host = await signedInPage(browser, "Hosty");
  await host.goto("/");
  await host.getByTestId("new-game").click();
  await expect(host).toHaveURL(/\/new$/);
  await host.getByTestId("create-game").click();
  await expect(host).toHaveURL(/\/g\/[0-9a-f-]{36}$/);
  await expect(host.getByTestId("settings")).toHaveText(/10 rounds each · 300 pictures/);
  await expect(host.getByTestId("start-game")).toBeDisabled();

  const link = (await host.getByTestId("invite-link").innerText()).trim();
  expect(link).toMatch(/\/join\/.{22}$/);

  const guest = await signedInPage(browser, "Guesty");
  await guest.goto(link);
  await expect(guest).toHaveURL(/\/g\/[0-9a-f-]{36}$/);
  await expect(guest.getByTestId("waiting-host")).toBeVisible();

  // Appears live in the host's lobby (no reload).
  await expect(host.getByTestId("player-list")).toContainText("Guesty");
  await expect(host.getByTestId("start-game")).toBeEnabled();

  await host.getByTestId("start-game").click();
  await expect(host.getByTestId("start-game")).toHaveCount(0);
  await expect(guest.getByTestId("waiting-host")).toHaveCount(0);
  await expect(host.getByText("Game lobby")).toHaveCount(0);
  await expect(guest.getByText("Game lobby")).toHaveCount(0);

  // Home lists the started game for the guest.
  await guest.goto("/");
  await expect(guest.getByRole("link", { name: /with Hosty/ })).toBeVisible();
});

test("monochrome: chosen under Game settings, shown in the lobby", async ({ browser }) => {
  const host = await signedInPage(browser, "Mona");
  await host.goto("/new");
  await expect(host.getByRole("heading", { name: "Game settings" })).toBeVisible();
  const toggle = host.getByRole("switch", { name: /Monochrome/ });
  await expect(toggle).not.toBeChecked();
  await host.getByText("Monochrome", { exact: true }).click();
  await expect(toggle).toBeChecked();
  await host.getByTestId("create-game").click();
  await expect(host).toHaveURL(/\/g\/[0-9a-f-]{36}$/);
  await expect(host.getByTestId("monochrome-badge")).toBeVisible();

  // A color game (the default) has no badge.
  await host.goto("/new");
  await host.getByTestId("create-game").click();
  await expect(host).toHaveURL(/\/g\/[0-9a-f-]{36}$/);
  await expect(host.getByTestId("settings")).toBeVisible();
  await expect(host.getByTestId("monochrome-badge")).toHaveCount(0);
});

test("scattered board: chosen under Game settings, shown in the lobby", async ({ browser }) => {
  const host = await signedInPage(browser, "Scat");
  await host.goto("/new");
  const toggle = host.getByRole("switch", { name: /Scattered board/ });
  await expect(toggle).not.toBeChecked();
  await host.getByText("Scattered board", { exact: true }).click();
  await expect(toggle).toBeChecked();
  await host.getByTestId("create-game").click();
  await expect(host).toHaveURL(/\/g\/[0-9a-f-]{36}$/);
  await expect(host.getByTestId("scatter-badge")).toBeVisible();
  await expect(host.getByTestId("monochrome-badge")).toHaveCount(0);

  // Grid (the default) has no badge.
  await host.goto("/new");
  await host.getByTestId("create-game").click();
  await expect(host).toHaveURL(/\/g\/[0-9a-f-]{36}$/);
  await expect(host.getByTestId("settings")).toBeVisible();
  await expect(host.getByTestId("scatter-badge")).toHaveCount(0);
});

test("join link while signed out goes through sign-in and back", async ({ browser, page }) => {
  const host = await signedInPage(browser, "Hostb");
  await host.goto("/new");
  await host.getByTestId("create-game").click();
  await expect(host.getByTestId("invite-link")).toBeVisible();
  const link = (await host.getByTestId("invite-link").innerText()).trim();
  const token = link.split("/join/")[1];

  await page.goto(`/join/${token}`);
  await expect(page).toHaveURL(new RegExp(`/signin\\?next=%2Fjoin%2F${token}`));
});

test("non-host can leave with confirmation; join errors are friendly", async ({ browser }) => {
  const host = await signedInPage(browser, "Hostc");
  await host.goto("/new");
  await host.getByTestId("create-game").click();
  const link = (await host.getByTestId("invite-link").innerText()).trim();

  const guest = await signedInPage(browser, "Guestc");
  await guest.goto(link);
  await expect(guest.getByTestId("leave-game")).toBeVisible();
  await guest.getByTestId("leave-game").click();
  await guest.getByTestId("confirm-leave").click();
  await expect(guest).toHaveURL(/\/$/);
  await expect(host.getByTestId("player-list")).not.toContainText("Guestc");

  const bad = await signedInPage(browser, "Badc", "/join/does-not-exist-123456");
  await expect(bad.getByTestId("join-error")).toContainText("not valid");
});

test("real magic-link flow through Mailpit, with onboarding", async ({ page }: { page: Page }) => {
  const email = `magic-${run}@test.local`;
  await page.goto("/signin?next=%2Fnew");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: /email me/i }).click();
  await expect(page.getByTestId("check-email")).toBeVisible();

  const link = await waitForMail(email);
  await page.goto(link);

  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByRole("heading", { name: /call you/i })).toBeVisible();
  await page.getByLabel("Your name").fill("Magic Mia");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/new$/);

  await page.goto("/");
  await expect(page.getByTestId("me-name")).toHaveText("Magic Mia");
  await page.getByTestId("account-menu").click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/signin/);
});

test("Google sign-in shows a friendly error when unavailable", async ({ page }) => {
  await page.goto("/signin");
  await page.getByRole("button", { name: /continue with google/i }).click();
  await expect(page.getByText(/Google sign-in is not available/)).toBeVisible();
});
