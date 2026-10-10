import type { RpcErrorCode } from "./types";

const MESSAGES: Record<RpcErrorCode, string> = {
  not_authenticated: "Please sign in first.",
  not_a_member: "You are not part of this game.",
  game_not_found: "We could not find that game.",
  not_your_turn: "It is not your turn.",
  game_not_in_progress: "This game is not in progress.",
  game_not_in_lobby: "This game has already started, so nobody can join any more.",
  lobby_full: "This game is full (6 players maximum).",
  invite_expired: "This invite link has expired. Ask the host for a new one.",
  invite_not_found: "This invite link is not valid. Check that you copied all of it.",
  invalid_argument: "Those settings are not valid.",
  turn_not_found: "We could not find that turn.",
  turn_not_live: "That turn is not running.",
  game_not_finished: "The game is not finished yet.",
  invalid_picture: "That picture is not on this board.",
  not_enough_players: "You need at least 2 players to start.",
};

/** Friendly text for an RPC error (error.message holds the code string). */
export function rpcErrorMessage(err: { message?: string } | string | null | undefined): string {
  const raw = typeof err === "string" ? err : (err?.message ?? "");
  const code = raw.trim() as RpcErrorCode;
  return MESSAGES[code] ?? "Something went wrong. Please try again.";
}

export function rpcErrorCode(err: { message?: string } | null | undefined): string {
  return (err?.message ?? "").trim();
}
