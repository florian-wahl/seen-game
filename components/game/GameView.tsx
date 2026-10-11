"use client";
// Rendered by app/g/[id]/page.tsx when the game is in_progress, finished or abandoned.
import { useEffect, useState } from "react";
import { useGameState } from "@/lib/game/useGameState";
import type { GameState } from "@/lib/game/types";
import { buildScoreboard } from "@/lib/game/scoreboard";
import { timeAgo } from "@/lib/game/format";
import { friendlyError, retireFromGame } from "@/lib/game/rpc";
import { LinkButton } from "@/components/ui/Button";
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
        <h1 className="font-wide text-2xl font-black uppercase tracking-tight text-cream">Game abandoned</h1>
        <p className="text-muted">This game was cancelled before it finished.</p>
        <LinkButton href="/" variant="light">
          Back home
        </LinkButton>
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
        <h1 className="font-wide text-2xl font-black uppercase tracking-tight text-cream">Scoreboard</h1>
        <p className={`text-sm ${state.is_my_turn ? "font-bold text-mustard" : "text-muted"}`} data-testid="turn-line">
          {turnLine}
        </p>
      </header>

      {state.is_my_turn && !iAmRetired && (
        <LinkButton href={`/g/${gameId}/play`} data-testid="play-turn">
          <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z" />
          </svg>
          Play my turn
        </LinkButton>
      )}

      <ScoreTable rows={sb.rows} rounds={sb.rounds} />
      <Legend />

      <section aria-label="Turn order">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-muted">Turn order</h2>
        <ol className="flex flex-wrap gap-2" data-testid="turn-order">
          {turnOrder.map((r) => (
            <li
              key={r.userId}
              data-current={r.isCurrent ? "true" : undefined}
              className={`rounded-full px-3 py-1.5 text-sm ${
                r.isCurrent ? "bg-mustard font-bold text-ink" : "bg-surface text-soft"
              }`}
            >
              {r.seat}. {r.name}
            </li>
          ))}
        </ol>
      </section>

      {state.board_unlocked ? (
        <LinkButton href={`/g/${gameId}/board`} variant="secondary" data-testid="view-board">
          View board
        </LinkButton>
      ) : (
        <p className="text-center text-sm text-muted">The board unlocks after your first round.</p>
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
      <button className="mt-2 min-h-11 text-sm text-muted underline" onClick={() => setConfirming(true)} data-testid="leave-game">
        Leave game
      </button>
    );
  }
  return (
    <div className="rounded-2xl bg-surface p-4 shadow-[inset_0_0_0_2px_var(--color-magenta)]" role="alertdialog" aria-label="Leave game">
      <p className="font-bold text-cream">Leave this game?</p>
      <p className="mt-1 text-sm text-soft">
        You will be removed from the turn order and your open round counts as forfeited. You cannot rejoin.
      </p>
      {err && <p className="mt-2 text-sm text-[#f08aba]">{err}</p>}
      <div className="mt-3 flex gap-2">
        <button
          className="min-h-12 flex-1 rounded-full bg-magenta px-4 py-2 font-bold text-ink disabled:opacity-60"
          onClick={leave}
          disabled={busy}
          data-testid="leave-confirm"
        >
          {busy ? "Leaving…" : "Yes, leave"}
        </button>
        <button className="min-h-12 flex-1 rounded-full px-4 py-2 font-bold text-cream shadow-[inset_0_0_0_2px_var(--color-line-strong)] hover:bg-raised disabled:opacity-60" onClick={() => setConfirming(false)} disabled={busy}>
          Stay
        </button>
      </div>
    </div>
  );
}
