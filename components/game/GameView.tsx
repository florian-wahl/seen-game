"use client";
// Rendered by app/g/[id]/page.tsx when the game is in_progress, finished or abandoned.
import Link from "next/link";
import { useEffect, useState } from "react";
import { useGameState } from "@/lib/game/useGameState";
import type { GameState } from "@/lib/game/types";
import { buildScoreboard } from "@/lib/game/scoreboard";
import { timeAgo } from "@/lib/game/format";
import { friendlyError, retireFromGame } from "@/lib/game/rpc";
import { FinalResults } from "./FinalResults";
import { Legend, ScoreTable } from "./ScoreTable";

export function GameView({ gameId, initial }: { gameId: string; initial: GameState }) {
  const { state: live, refresh } = useGameState(gameId, initial);
  const state = live ?? initial;
  const status = state.game.status;

  if (status === "finished") return <FinalResults gameId={gameId} state={state} />;
  if (status === "abandoned") {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-bold">Game abandoned</h1>
        <p className="text-stone-600">This game was cancelled before it finished.</p>
        <Link href="/" className="rounded-full bg-stone-900 px-6 py-3 font-semibold text-white">
          Back home
        </Link>
      </main>
    );
  }
  return <InProgress gameId={gameId} state={state} refresh={refresh} />;
}

function useNowMs(intervalMs = 30000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- set after mount to avoid hydration mismatch
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function InProgress({ gameId, state, refresh }: { gameId: string; state: GameState; refresh: () => Promise<void> }) {
  const now = useNowMs();
  const sb = buildScoreboard(state, "seat");
  const turnOrder = sb.rows.filter((r) => !r.retired);
  const cur = state.current_turn;
  const whose = state.players.find((p) => p.user_id === state.whose_turn);
  const iAmRetired = state.me.status === "retired";

  let turnLine: string;
  if (state.is_my_turn) {
    turnLine = cur?.status === "live" ? "Your round is running. Pick it up!" : "It is your turn.";
  } else if (whose) {
    const since = cur && now !== null ? ` Waiting since ${timeAgo(cur.became_current_at, now)}.` : "";
    turnLine = cur?.status === "live" ? `${whose.display_name} is playing right now.` : `Waiting for ${whose.display_name}.${since}`;
  } else {
    turnLine = "Waiting for the next turn.";
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-4 pb-8" data-testid="game-view">
      <header>
        <h1 className="text-2xl font-bold">Scoreboard</h1>
        <p className="text-sm text-stone-600" data-testid="turn-line">
          {turnLine}
        </p>
      </header>

      {state.is_my_turn && !iAmRetired && (
        <Link
          href={`/g/${gameId}/play`}
          className="rounded-2xl bg-emerald-600 px-6 py-4 text-center text-lg font-bold text-white shadow active:bg-emerald-700"
          data-testid="play-turn"
        >
          Play my turn
        </Link>
      )}

      <ScoreTable rows={sb.rows} rounds={sb.rounds} />
      <Legend />

      <section aria-label="Turn order">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Turn order</h2>
        <ol className="flex flex-wrap gap-2" data-testid="turn-order">
          {turnOrder.map((r) => (
            <li
              key={r.userId}
              data-current={r.isCurrent ? "true" : undefined}
              className={`rounded-full border px-3 py-1 text-sm ${
                r.isCurrent ? "border-emerald-600 bg-emerald-50 font-semibold text-emerald-800" : "border-stone-200 bg-white text-stone-700"
              }`}
            >
              {r.seat}. {r.name}
            </li>
          ))}
        </ol>
      </section>

      {state.board_unlocked ? (
        <Link
          href={`/g/${gameId}/board`}
          className="rounded-2xl border border-stone-300 bg-white px-6 py-3 text-center font-semibold"
          data-testid="view-board"
        >
          View board
        </Link>
      ) : (
        <p className="text-center text-sm text-stone-500">The board unlocks after your first round.</p>
      )}

      {!iAmRetired && <LeaveGame gameId={gameId} onDone={refresh} />}
    </main>
  );
}

function LeaveGame({ gameId, onDone }: { gameId: string; onDone: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function leave() {
    setBusy(true);
    setErr(null);
    try {
      await retireFromGame(gameId);
      await onDone();
      setConfirming(false);
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <button className="mt-2 text-sm text-stone-500 underline" onClick={() => setConfirming(true)} data-testid="leave-game">
        Leave game
      </button>
    );
  }
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-4" role="alertdialog" aria-label="Leave game">
      <p className="font-semibold text-red-900">Leave this game?</p>
      <p className="mt-1 text-sm text-red-800">
        You will be removed from the turn order and your open round counts as forfeited. You cannot rejoin.
      </p>
      {err && <p className="mt-2 text-sm text-red-700">{err}</p>}
      <div className="mt-3 flex gap-2">
        <button
          className="flex-1 rounded-full bg-red-600 px-4 py-2 font-semibold text-white disabled:opacity-60"
          onClick={leave}
          disabled={busy}
          data-testid="leave-confirm"
        >
          {busy ? "Leaving…" : "Yes, leave"}
        </button>
        <button className="flex-1 rounded-full border border-stone-300 bg-white px-4 py-2" onClick={() => setConfirming(false)} disabled={busy}>
          Stay
        </button>
      </div>
    </div>
  );
}
