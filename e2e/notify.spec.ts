import { expect, test } from "@playwright/test";
import { admin, createStartedGame, openTurn, playTurnViaRpc, remindOpenTurn, uniqueEmail } from "./helpers/game";

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

async function mailSubjects(email: string, gameId: string): Promise<string[]> {
  const q = encodeURIComponent(`to:${email}`);
  const list = await (await fetch(`${MAILPIT}/api/v1/search?query=${q}`)).json();
  const out: string[] = [];
  for (const m of list.messages ?? []) {
    const msg = await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json();
    if (`${msg.Text}${msg.HTML}`.includes(gameId)) out.push(msg.Subject);
  }
  return out;
}

test("only the 24 h reminder is emailed; 'Your turn' and 'Game finished' are push only", async () => {
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

  // The stalled first turn gets the reminder email.
  await remindOpenTurn(g.gameId);
  const reminder = await waitForMail(first.email, "Reminder: your turn in Seen! is waiting", g.gameId);
  expect(reminder.html).toContain(`/g/${g.gameId}/play`);
  expect(reminder.html).toContain("Play your turn");
  expect(reminder.text).toContain(`/g/${g.gameId}/play`);

  // Play the game out.
  for (let turn = await openTurn(g.gameId); turn; turn = await openTurn(g.gameId)) {
    await playTurnViaRpc(turn.user_id === first.id ? first : second, g.gameId);
  }

  // Every row (your_turn, reminder, game_finished) is delivered and marked sent...
  await expect
    .poll(async () => {
      const { data } = await admin().from("notification_outbox").select("kind, sent_at").eq("game_id", g.gameId);
      const kinds = new Set(data?.map((r) => r.kind));
      return kinds.has("game_finished") && kinds.has("your_turn") && !!data?.every((r) => r.sent_at);
    })
    .toBe(true);
  // ...but the reminder is the only email.
  expect(await mailSubjects(first.email, g.gameId)).toEqual(["Reminder: your turn in Seen! is waiting"]);
  expect(await mailSubjects(second.email, g.gameId)).toEqual([]);
});
