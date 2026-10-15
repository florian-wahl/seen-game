import type { GameStatus } from "./types";

export interface HomePlayer {
  userId: string;
  name: string;
  status: "active" | "retired";
  totalMs: number;
  wrongTaps: number;
}

export interface HomeGame {
  id: string;
  status: GameStatus;
  hostId: string;
  players: HomePlayer[];
  /** user whose turn it currently is (in_progress only) */
  turnUserId: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface HomeGroups {
  yourTurn: HomeGame[];
  waiting: HomeGame[];
  lobbies: HomeGame[];
  finished: HomeGame[];
}

const FINISHED_LIMIT = 10;

const time = (s: string | null) => (s ? Date.parse(s) : 0);

/** Group games for the home screen. Abandoned games are hidden. */
export function groupGames(games: HomeGame[], me: string): HomeGroups {
  const g: HomeGroups = { yourTurn: [], waiting: [], lobbies: [], finished: [] };
  for (const game of games) {
    if (game.status === "in_progress") {
      (game.turnUserId === me ? g.yourTurn : g.waiting).push(game);
    } else if (game.status === "lobby") g.lobbies.push(game);
    else if (game.status === "finished") g.finished.push(game);
  }
  const byCreated = (a: HomeGame, b: HomeGame) => time(b.createdAt) - time(a.createdAt);
  g.yourTurn.sort(byCreated);
  g.waiting.sort(byCreated);
  g.lobbies.sort(byCreated);
  g.finished.sort((a, b) => time(b.finishedAt ?? b.createdAt) - time(a.finishedAt ?? a.createdAt));
  g.finished = g.finished.slice(0, FINISHED_LIMIT);
  return g;
}

/** "Alice, Bob and Carol" */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Home-card status for a finished game; first place matches `private.ranking` (active only, total_ms then wrong_taps). */
export function finishedStatus(game: HomeGame, me: string): string {
  const act = game.players.filter((p) => p.status === "active");
  if (!act.length) return "Finished";
  const best = act.reduce((a, p) => (p.totalMs < a.totalMs || (p.totalMs === a.totalMs && p.wrongTaps < a.wrongTaps) ? p : a));
  const first = act.filter((p) => p.totalMs === best.totalMs && p.wrongTaps === best.wrongTaps);
  if (first.length > 1) return "Finished · Tie";
  return first[0].userId === me ? "Finished · You won" : `Finished · Won by ${first[0].name}`;
}
