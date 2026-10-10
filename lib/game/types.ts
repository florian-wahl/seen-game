// Shapes returned by the database RPCs (see docs/API.md). Keep in sync with SQL.
import type { Tile } from "@/lib/board/types";

export type GameStatus = "lobby" | "in_progress" | "finished" | "abandoned";
export type TurnStatus = "pending" | "live" | "found" | "capped" | "forfeited";
export type PlayerStatus = "active" | "retired";

export interface Turn {
  id: string;
  game_id: string;
  user_id: string;
  seq: number;
  round: number;
  status: TurnStatus;
  became_current_at: string;
  drawn_at: string | null;
  deadline_at: string | null;
  ended_at: string | null;
  /** null until the turn is drawn */
  target_picture_id: string | null;
  wrong_taps: number;
  score_ms: number | null;
  reminded_at: string | null;
}

export interface GamePlayer {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  /** 1-based; null in the lobby */
  seat: number | null;
  status: PlayerStatus;
  turns_done: number;
  total_ms: number;
  wrong_taps: number;
  /** null for retired players and in the lobby; ties share a rank */
  rank: number | null;
  is_host: boolean;
  board_unlocked: boolean;
}

export interface Game {
  id: string;
  host_id: string;
  status: GameStatus;
  rounds_per_player: number;
  board_size: number;
  penalty_ms: number;
  cap_ms: number;
  current_turn_id: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface GameState {
  server_now: string;
  game: Game;
  /** ranked players first, retired last */
  players: GamePlayer[];
  /** ordered by seq */
  turns: Turn[];
  current_turn: Turn | null;
  whose_turn: string | null;
  is_my_turn: boolean;
  me: { user_id: string; status: PlayerStatus; seat: number | null; rank: number | null; board_unlocked: boolean };
  board_unlocked: boolean;
  /** host only, lobby only */
  invite: { token: string; expires_at: string } | null;
}

export interface DrawResult {
  turn_id: string;
  turn: Turn;
  target_picture_id: string;
  drawn_at: string;
  deadline_at: string;
  wrong_taps: number;
  server_now: string;
  already_drawn: boolean;
  tiles: Tile[];
}

export interface TapResult {
  turn: Turn;
  client_seq: number;
  picture_id: string;
  correct: boolean;
  counted: boolean;
  replayed: boolean;
  game_status: GameStatus;
  current_turn_id: string | null;
  server_now: string;
}

/** Error codes raised by the RPCs (error.message). */
export type RpcErrorCode =
  | "not_authenticated" | "not_a_member" | "game_not_found" | "not_your_turn"
  | "game_not_in_progress" | "game_not_in_lobby" | "lobby_full" | "invite_expired"
  | "invite_not_found" | "invalid_argument" | "turn_not_found" | "turn_not_live"
  | "game_not_finished" | "invalid_picture" | "not_enough_players";
