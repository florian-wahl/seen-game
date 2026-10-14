// Test helper: build real games against the local Supabase stack without any UI.
// Uses the service-role client (SUPABASE_SECRET_KEY) and password sign-in for RPCs as users.
import { existsSync } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { generateBoard } from "../../lib/board/generate";
import type { ConfusablePair, Picture, Tile } from "../../lib/board/types";
import type { DrawResult, GameState, TapResult } from "../../lib/game/types";

// Same constant as app/dev/login/route.ts.
export const DEV_PASSWORD = "dev-password-not-secret";

function loadEnv() {
  const f = path.resolve(process.cwd(), ".env.local");
  if (existsSync(f) && !process.env.SUPABASE_SECRET_KEY) process.loadEnvFile(f);
}

function env(name: string): string {
  loadEnv();
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set (.env.local)`);
  return v;
}

let adminClient: SupabaseClient | undefined;
export function admin(): SupabaseClient {
  adminClient ??= createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}

export interface TestUser {
  email: string;
  name: string;
  id: string;
  client: SupabaseClient;
}

/** Create (or reuse) a confirmed user and return a client signed in as them. */
export async function ensureUser(email: string, name: string): Promise<TestUser> {
  const a = admin();
  const { error } = await a.auth.admin.createUser({
    email,
    password: DEV_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (error && !/already|registered|exists/i.test(error.message)) throw error;
  const client = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error: signInErr } = await client.auth.signInWithPassword({ email, password: DEV_PASSWORD });
  if (signInErr || !data.user) throw signInErr ?? new Error("sign in failed");
  return { email, name, id: data.user.id, client };
}

async function rpc<T>(client: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message} (${error.code})`);
  return data as T;
}

export interface TestGame {
  gameId: string;
  users: TestUser[];
  /** Users in seat order (seat 1 first). */
  bySeat: TestUser[];
  firstUser: TestUser;
  tiles: Tile[];
}

async function loadLibrary(): Promise<{ pictures: Picture[]; confusables: ConfusablePair[] }> {
  const a = admin();
  const { data: pics, error } = await a
    .from("pictures")
    .select("id,name,category,file_path,review_status")
    .range(0, 4999);
  if (error) throw error;
  const { data: conf, error: e2 } = await a.from("picture_confusables").select("picture_a,picture_b").range(0, 9999);
  if (e2) throw e2;
  return {
    pictures: (pics ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      file: p.file_path,
      reviewStatus: p.review_status,
    })),
    confusables: (conf ?? []).map((c) => [c.picture_a, c.picture_b] as const),
  };
}

export interface CreateGameOptions {
  /** Emails; the first is the host. */
  emails: string[];
  names?: string[];
  /** 3 and 100 are legacy values (no longer offered by create_game), kept for fast tests. */
  rounds?: 3 | 5 | 10 | 20;
  size?: 100 | 200 | 300 | 500;
}

/** create_game as host, join_game as the others, start_game_internal via admin. */
export async function createStartedGame(opts: CreateGameOptions): Promise<TestGame> {
  const users: TestUser[] = [];
  for (let i = 0; i < opts.emails.length; i++) {
    users.push(await ensureUser(opts.emails[i], opts.names?.[i] ?? opts.emails[i].split("@")[0]));
  }
  const [host, ...others] = users;
  const size = opts.size ?? 100;
  const rounds = opts.rounds ?? 3;
  const created = await rpc<{ game_id: string; token: string }>(host.client, "create_game", {
    rounds: 5,
    board_size: 200,
  });
  // The table still accepts the legacy short settings; set the requested ones directly.
  const { error: settingsError } = await admin()
    .from("games")
    .update({ rounds_per_player: rounds, board_size: size })
    .eq("id", created.game_id);
  if (settingsError) throw settingsError;
  for (const u of others) await rpc(u.client, "join_game", { token: created.token });

  const lib = await loadLibrary();
  const board = generateBoard({ ...lib, size, seed: created.game_id });
  const started = await rpc<{ first_user_id: string; seats: { user_id: string; seat: number }[] }>(
    admin(),
    "start_game_internal",
    { game_id: created.game_id, tiles: board.tiles },
  );
  const bySeat = [...started.seats]
    .sort((a, b) => a.seat - b.seat)
    .map((s) => users.find((u) => u.id === s.user_id)!);
  return {
    gameId: created.game_id,
    users,
    bySeat,
    firstUser: users.find((u) => u.id === started.first_user_id)!,
    tiles: board.tiles,
  };
}

/** Admin read of the open turn (test-only; clients cannot see the target before drawing). */
export async function openTurn(gameId: string) {
  const { data, error } = await admin()
    .from("turns")
    .select("id,user_id,status,target_picture_id,wrong_taps,score_ms,round,drawn_at")
    .eq("game_id", gameId)
    .in("status", ["pending", "live"])
    .maybeSingle();
  if (error) throw error;
  return data as {
    id: string;
    user_id: string;
    status: string;
    target_picture_id: string | null;
    wrong_taps: number;
    score_ms: number | null;
    round: number;
    drawn_at: string | null;
  } | null;
}

export async function gameState(user: TestUser, gameId: string): Promise<GameState> {
  return rpc<GameState>(user.client, "game_state", { game_id: gameId });
}

/** Skip the 1.2 s draw reveal of a live turn by moving its official start into the past (test-only). */
export async function skipReveal(turnId: string, ms = 1200): Promise<void> {
  const { data, error } = await admin().from("turns").select("drawn_at,deadline_at").eq("id", turnId).single();
  if (error) throw error;
  const shift = (iso: string) => new Date(Date.parse(iso) - ms).toISOString();
  const { error: e2 } = await admin()
    .from("turns")
    .update({ drawn_at: shift(data.drawn_at), deadline_at: shift(data.deadline_at) })
    .eq("id", turnId);
  if (e2) throw e2;
}

/** Play the current turn as `user` over RPC: draw, optional wrong taps, then the correct tap. */
export async function playTurnViaRpc(user: TestUser, gameId: string, wrongTaps = 0): Promise<TapResult> {
  const d = await rpc<DrawResult>(user.client, "draw_target", { game_id: gameId });
  await skipReveal(d.turn_id); // taps before drawn_at (the reveal) are uncounted
  const wrong = d.tiles.filter((t) => t.pictureId !== d.target_picture_id).slice(0, wrongTaps);
  let seq = 1;
  for (const w of wrong) {
    await rpc(user.client, "submit_tap", { turn_id: d.turn_id, picture_id: w.pictureId, client_seq: seq++, client_elapsed_ms: 100 });
  }
  return rpc<TapResult>(user.client, "submit_tap", {
    turn_id: d.turn_id,
    picture_id: d.target_picture_id,
    client_seq: seq,
    client_elapsed_ms: 200,
  });
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@test.local`;
}
