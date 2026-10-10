// Typed, error-normalised wrappers around the game RPCs (docs/API.md). Client side.
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { DrawResult, GameState, RpcErrorCode, TapResult } from "./types";

export class RpcError extends Error {
  /** App-level error code (error.message) when the server rejected the call. */
  readonly appCode: RpcErrorCode | null;
  /** True for transport failures worth retrying (idempotent calls only). */
  readonly network: boolean;
  constructor(message: string, readonly sqlstate: string | null) {
    super(message);
    this.appCode = sqlstate && (sqlstate.startsWith("SN") || sqlstate === "42501") ? (message as RpcErrorCode) : null;
    this.network = this.appCode === null && !isHttpError(sqlstate);
  }
}

function isHttpError(code: string | null): boolean {
  // PostgREST/Postgres errors carry a code; fetch failures do not.
  return !!code;
}

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  let res;
  try {
    res = await supabaseBrowser().rpc(fn as never, args as never);
  } catch (e) {
    throw new RpcError(e instanceof Error ? e.message : "network_error", null);
  }
  if (res.error) throw new RpcError(res.error.message, res.error.code || null);
  return res.data as unknown as T;
}

export const drawTarget = (gameId: string) => call<DrawResult>("draw_target", { game_id: gameId });

export const submitTap = (a: { turnId: string; pictureId: string; clientSeq: number; clientElapsedMs: number }) =>
  call<TapResult>("submit_tap", {
    turn_id: a.turnId,
    picture_id: a.pictureId,
    client_seq: a.clientSeq,
    client_elapsed_ms: a.clientElapsedMs,
  });

export const fetchGameState = (gameId: string) => call<GameState>("game_state", { game_id: gameId });

export const retireFromGame = (gameId: string) =>
  call<{ game_id: string; status: string; left: boolean }>("retire", { game_id: gameId });

export const rematchGame = (gameId: string) =>
  call<{ game_id: string; token: string; expires_at: string }>("rematch", { game_id: gameId });

const FRIENDLY: Partial<Record<RpcErrorCode, string>> = {
  not_your_turn: "It is not your turn.",
  game_not_in_progress: "This game is not in progress any more.",
  turn_not_live: "This round is no longer running.",
  not_a_member: "You are not a player in this game.",
  game_not_found: "We could not find this game.",
  not_authenticated: "Please sign in again.",
  game_not_finished: "The game is not finished yet.",
  invalid_picture: "That picture is not on this board.",
};

export function friendlyError(e: unknown): string {
  if (e instanceof RpcError) {
    if (e.appCode && FRIENDLY[e.appCode]) return FRIENDLY[e.appCode]!;
    if (e.network) return "Connection problem. Check your network and try again.";
    return "Something went wrong. Please try again.";
  }
  return "Something went wrong. Please try again.";
}

/** Retry an idempotent call on transport errors with exponential backoff. */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 4, baseMs = 400): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!(e instanceof RpcError) || !e.network) throw e;
      await new Promise((r) => setTimeout(r, baseMs * 2 ** i));
    }
  }
  throw last;
}
