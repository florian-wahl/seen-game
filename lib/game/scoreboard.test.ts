import { describe, expect, it } from "vitest";
import { buildFinalResults, buildScoreboard, formatScore } from "./scoreboard";
import type { GamePlayer, GameState, Turn } from "./types";

const A = "a", B = "b", C = "c";

function player(id: string, seat: number, over: Partial<GamePlayer> = {}): GamePlayer {
  return {
    user_id: id, display_name: id.toUpperCase(), avatar_url: null, seat, status: "active",
    turns_done: 0, total_ms: 0, wrong_taps: 0, rank: null, is_host: false, board_unlocked: false, ...over,
  };
}
let n = 0;
function turn(user: string, round: number, status: Turn["status"], score: number | null, over: Partial<Turn> = {}): Turn {
  n++;
  return {
    id: `t${n}`, game_id: "g", user_id: user, seq: n, round, status, became_current_at: "", drawn_at: null,
    deadline_at: null, ended_at: null, target_picture_id: null, wrong_taps: 0, score_ms: score, reminded_at: null, ...over,
  };
}
function state(players: GamePlayer[], turns: Turn[], over: Partial<GameState> = {}): GameState {
  return {
    server_now: "", game: { id: "g", host_id: A, status: "in_progress", rounds_per_player: 3, board_size: 100, monochrome: false, penalty_ms: 5000,
      cap_ms: 90000, current_turn_id: null, created_at: "", started_at: null, finished_at: null },
    players, turns, current_turn: null, whose_turn: null, is_my_turn: false,
    me: { user_id: A, status: "active", seat: 1, rank: null, board_unlocked: false },
    board_unlocked: false, invite: null, ...over,
  };
}

describe("scoreboard", () => {
  it("formats scores to 0.1 s", () => {
    expect(formatScore(12345)).toBe("12.3");
    expect(formatScore(90000)).toBe("90.0");
  });

  it("builds rounds x players with marks, in seat order, current highlighted", () => {
    const turns = [
      turn(A, 1, "found", 12300),
      turn(B, 1, "capped", 90000),
      turn(A, 2, "forfeited", 90000),
      turn(B, 2, "live", null),
    ];
    const live = turns[3];
    const s = state([player(B, 2), player(A, 1)], turns, { whose_turn: B, current_turn: live });
    const sb = buildScoreboard(s);
    expect(sb.rounds).toBe(3);
    expect(sb.rows.map((r) => r.userId)).toEqual([A, B]);
    expect(sb.rows[0].cells.map((c) => c.label)).toEqual(["12.3", "90.0 F", "—"]);
    expect(sb.rows[1].cells.map((c) => c.label)).toEqual(["90.0 C", "…", "—"]);
    expect(sb.rows[1].isCurrent).toBe(true);
    expect(sb.rows[0].isMe).toBe(true);
  });

  it("marks the pending current turn as waiting and retired later rounds as none", () => {
    const t1 = turn(A, 1, "pending", null);
    const s = state(
      [player(A, 1), player(B, 2, { status: "retired" })],
      [t1, turn(B, 1, "forfeited", 90000)],
      { current_turn: t1, whose_turn: A },
    );
    const sb = buildScoreboard(s);
    expect(sb.rows[0].cells[0].kind).toBe("waiting");
    expect(sb.rows[1].retired).toBe(true);
    expect(sb.rows[1].cells[1].kind).toBe("none");
    expect(sb.rows[1].cells[1].label).toBe("");
  });

  it("final results: shared ranks, medals, retired separate", () => {
    const players = [
      player(A, 1, { rank: 1, total_ms: 30000, turns_done: 3 }),
      player(B, 2, { rank: 1, total_ms: 30000, turns_done: 3 }),
      player(C, 3, { rank: 3, total_ms: 50000, turns_done: 3 }),
      player("d", 4, { status: "retired", turns_done: 1 }),
    ];
    const f = buildFinalResults(state(players, [turn("d", 1, "found", 20000)]));
    expect(f.ranked.map((e) => [e.row.userId, e.rank, e.medal])).toEqual([[A, 1, 1], [B, 1, 1], [C, 3, 3]]);
    expect(f.winners.map((w) => w.userId)).toEqual([A, B]);
    expect(f.retired.map((r) => r.userId)).toEqual(["d"]);
    expect(f.retired[0].cells[0].label).toBe("20.0");
  });
});
