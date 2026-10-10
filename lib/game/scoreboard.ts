// Pure scoreboard model: players x rounds from GameState.
import type { GamePlayer, GameState, Turn } from "./types";

export type CellKind =
  | "done" //      found: score in s
  | "capped" //    time ran out: 90.0 C
  | "forfeited" // not played / left: 90.0 F
  | "live" //      drawn, running
  | "waiting" //   it is their turn, not drawn yet
  | "pending" //   still to come
  | "none"; //     retired before this round

export interface ScoreCell {
  round: number;
  kind: CellKind;
  scoreMs: number | null;
  wrongTaps: number;
  /** Display text, e.g. "12.3", "90.0 F", "—". */
  label: string;
}

export interface ScoreRow {
  userId: string;
  name: string;
  seat: number | null;
  retired: boolean;
  rank: number | null;
  totalMs: number;
  wrongTaps: number;
  turnsDone: number;
  isMe: boolean;
  isCurrent: boolean;
  cells: ScoreCell[];
}

export interface Scoreboard {
  rounds: number;
  rows: ScoreRow[];
}

export const LEGEND: { mark: string; text: string }[] = [
  { mark: "C", text: "time ran out (capped at 90 s)" },
  { mark: "F", text: "forfeited: not played in time or player left" },
  { mark: "—", text: "not played yet" },
];

export function formatScore(ms: number): string {
  return (Math.round(ms / 100) / 10).toFixed(1);
}

export function cellFor(turn: Turn | undefined, round: number, retired: boolean, isCurrentTurn: boolean): ScoreCell {
  if (!turn) {
    return { round, kind: retired ? "none" : "pending", scoreMs: null, wrongTaps: 0, label: retired ? "" : "—" };
  }
  const score = turn.score_ms;
  const base = { round, scoreMs: score, wrongTaps: turn.wrong_taps };
  switch (turn.status) {
    case "found":
      return { ...base, kind: "done", label: score === null ? "—" : formatScore(score) };
    case "capped":
      return { ...base, kind: "capped", label: `${formatScore(score ?? 90000)} C` };
    case "forfeited":
      return { ...base, kind: "forfeited", label: `${formatScore(score ?? 90000)} F` };
    case "live":
      return { ...base, kind: "live", label: "…" };
    default:
      return { ...base, kind: isCurrentTurn ? "waiting" : "pending", label: "—" };
  }
}

function rowFor(p: GamePlayer, state: GameState, rounds: number, byKey: Map<string, Turn>): ScoreRow {
  const retired = p.status === "retired";
  const cur = state.current_turn;
  const cells: ScoreCell[] = [];
  for (let r = 1; r <= rounds; r++) {
    const t = byKey.get(`${p.user_id}:${r}`);
    cells.push(cellFor(t, r, retired, !!cur && t?.id === cur.id));
  }
  return {
    userId: p.user_id,
    name: p.display_name,
    seat: p.seat,
    retired,
    rank: p.rank,
    totalMs: p.total_ms,
    wrongTaps: p.wrong_taps,
    turnsDone: p.turns_done,
    isMe: p.user_id === state.me.user_id,
    isCurrent: state.whose_turn === p.user_id,
    cells,
  };
}

/**
 * order "seat": active players by seat (turn order), retired last.
 * order "rank": as returned by the server (ranked first, retired last).
 */
export function buildScoreboard(state: GameState, order: "seat" | "rank" = "seat"): Scoreboard {
  const rounds = state.game.rounds_per_player;
  const byKey = new Map<string, Turn>();
  for (const t of state.turns) byKey.set(`${t.user_id}:${t.round}`, t);
  let players = [...state.players];
  if (order === "seat") {
    players.sort((a, b) => {
      const ra = a.status === "retired" ? 1 : 0;
      const rb = b.status === "retired" ? 1 : 0;
      if (ra !== rb) return ra - rb;
      return (a.seat ?? 99) - (b.seat ?? 99);
    });
  } else {
    players = players.slice();
  }
  return { rounds, rows: players.map((p) => rowFor(p, state, rounds, byKey)) };
}

export interface FinalEntry {
  row: ScoreRow;
  rank: number;
  /** 1..3 for medal positions (shared ranks share the medal), else null */
  medal: 1 | 2 | 3 | null;
}

export interface FinalResults {
  ranked: FinalEntry[];
  retired: ScoreRow[];
  winners: ScoreRow[];
  rounds: number;
}

export function buildFinalResults(state: GameState): FinalResults {
  const board = buildScoreboard(state, "rank");
  const active = board.rows.filter((r) => !r.retired);
  const retired = board.rows.filter((r) => r.retired);
  const ranked: FinalEntry[] = active.map((row, i) => {
    const rank = row.rank ?? i + 1;
    return { row, rank, medal: rank >= 1 && rank <= 3 ? (rank as 1 | 2 | 3) : null };
  });
  const winners = ranked.filter((e) => e.rank === 1).map((e) => e.row);
  return { ranked, retired, winners, rounds: board.rounds };
}
