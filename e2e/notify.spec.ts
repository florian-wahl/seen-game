import { expect, test } from "@playwright/test";
import { admin, createStartedGame, openTurn, playTurnViaRpc, uniqueEmail } from "./helpers/game";

const MAILPIT = process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:54324";

interface Mail {
  subject: string;
  html: string;
  text: string;
}

async function findMail(email: string, subject: string, gameId: string): Promise<Mail | null> {
  const q = encodeURIComponent(`to:${email} subject:"${subject}"`);
  const list = await (await fetch(`${MAILPIT}/api/v1/search?query=${q}`)).json();
  for (const m of list.messages ?? []) {
    const msg = await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json();
    if (`${msg.Text}${msg.HTML}`.includes(gameId)) return { subject: msg.Subject, html: msg.HTML, text: msg.Text };
  }
  return null;
}

async function waitForMail(email: string, subject: string, gameId: string): Promise<Mail> {
  for (let i = 0; i < 40; i++) {
    const m = await findMail(email, subject, gameId);
    if (m) return m;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No "${subject}" mail for ${email}`);
}

test("starting a game and finishing a turn send 'Your turn' emails", async () => {
  const emails = [uniqueEmail("notify1"), uniqueEmail("notify2")];
  const g = await createStartedGame({ emails, names: ["Notify1", "Notify2"], rounds: 3, size: 100 });

  // The outbox trigger only POSTs when Vault secrets notify_url/notify_secret exist
  // (npm run db:setup-notify). Without them attempts stays 0.
  await new Promise((r) => setTimeout(r, 2500));
  const { data: rows } = await admin().from("notification_outbox").select("attempts").eq("game_id", g.gameId);
  test.skip(
    !rows?.length || rows.every((r) => r.attempts === 0),
    "Vault secret notify_url is not set: run `npm run db:setup-notify` (and start the dev server) to enable this test",
  );

  const first = g.firstUser;
  const second = g.users.find((u) => u.id !== first.id)!;

  const mail1 = await waitForMail(first.email, "Your turn in Seen!", g.gameId);
  expect(mail1.html).toContain(`/g/${g.gameId}/play`);
  expect(mail1.html).toContain("Play your turn");
  expect(mail1.text).toContain(`/g/${g.gameId}/play`);

  const turn = await openTurn(g.gameId);
  expect(turn?.user_id).toBe(first.id);
  await playTurnViaRpc(first, g.gameId);
  const mail2 = await waitForMail(second.email, "Your turn in Seen!", g.gameId);
  expect(mail2.html).toContain(`/g/${g.gameId}/play`);

  // Delivered rows are marked sent.
  await expect
    .poll(async () => {
      const { data } = await admin().from("notification_outbox").select("sent_at").eq("game_id", g.gameId);
      return data?.length ? data.every((r) => r.sent_at) : false;
    })
    .toBe(true);
});
