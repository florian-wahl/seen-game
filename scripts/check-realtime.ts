// Live check of the private Broadcast contract against the local stack.
// Usage: npx tsx --env-file=.env.local scripts/check-realtime.ts
// A member subscribed to game:<id> must receive `changed` within 2 s of a state change;
// a non-member's subscription must be rejected / receive nothing. Cleans up its game.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const pub = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const secret = process.env.SUPABASE_SECRET_KEY!;
const PASSWORD = "dev-password-not-secret";
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

const admin = createClient(url, secret, opts);

async function signedIn(email: string): Promise<SupabaseClient> {
  const { error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error && !/already|registered|exists/i.test(error.message)) throw error;
  const c = createClient(url, pub, opts);
  const { error: e2 } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (e2) throw e2;
  await c.realtime.setAuth();
  return c;
}

function listen(c: SupabaseClient, gameId: string) {
  const got: unknown[] = [];
  let status = "";
  const ch = c
    .channel(`game:${gameId}`, { config: { private: true } })
    .on("broadcast", { event: "changed" }, (m) => got.push(m.payload))
    .subscribe((s) => (status = s));
  const ready = async (ms = 4000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms && status !== "SUBSCRIBED" && status !== "CHANNEL_ERROR") await sleep(50);
    return status;
  };
  return { got, ch, ready, status: () => status };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const [host, joiner, outsider] = await Promise.all([
    signedIn("rt-host@test.local"),
    signedIn("rt-joiner@test.local"),
    signedIn("rt-outsider@test.local"),
  ]);
  const { data: g, error } = await host.rpc("create_game", { rounds: 3, board_size: 100 });
  if (error) throw error;
  const { game_id: gameId, token } = g as { game_id: string; token: string };

  const member = listen(host, gameId);
  const stranger = listen(outsider, gameId);
  const memberStatus = await member.ready();
  const strangerStatus = await stranger.ready();
  console.log(`member status=${memberStatus}, outsider status=${strangerStatus}`);

  const t0 = Date.now();
  const { error: je } = await joiner.rpc("join_game", { token });
  if (je) throw je;
  while (Date.now() - t0 < 2000 && member.got.length === 0) await sleep(25);
  await sleep(500);
  const ms = member.got.length ? Date.now() - t0 : null;
  console.log(`member received ${member.got.length} message(s)${ms ? ` (first within ~${ms} ms)` : ""}:`, JSON.stringify(member.got));
  console.log(`outsider received ${stranger.got.length} message(s)`);

  await admin.from("games").delete().eq("id", gameId);
  await Promise.all([host, joiner, outsider].map((c) => c.removeAllChannels()));

  const ok = memberStatus === "SUBSCRIBED" && member.got.length > 0 && ms !== null && ms <= 2000 && stranger.got.length === 0 && strangerStatus !== "SUBSCRIBED";
  console.log(ok ? "OK" : "FAIL");
  process.exit(ok ? 0 : 1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
