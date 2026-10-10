"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { GameState } from "@/lib/game/types";
import { buildFinalResults, type ScoreRow } from "@/lib/game/scoreboard";
import { formatTotal } from "@/lib/game/format";
import { friendlyError, rematchGame } from "@/lib/game/rpc";
import { Legend, ScoreTable } from "./ScoreTable";

const MEDAL = { 1: "🥇", 2: "🥈", 3: "🥉" } as const;

function names(rows: ScoreRow[]): string {
  return rows.map((r) => r.name).join(" & ");
}

export function FinalResults({ gameId, state }: { gameId: string; state: GameState }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const f = buildFinalResults(state);
  const iWon = f.winners.some((w) => w.isMe);
  const canRematch = state.me.status === "active";

  async function rematch() {
    setBusy(true);
    setErr(null);
    try {
      const r = await rematchGame(gameId);
      router.push(`/g/${r.game_id}`);
    } catch (e) {
      setErr(friendlyError(e));
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-4 pb-8" data-testid="final-results">
      <header className="rounded-2xl bg-amber-100 p-5 text-center" data-testid="winner">
        <div className="text-4xl" aria-hidden>
          🏆
        </div>
        {f.winners.length > 0 ? (
          <>
            <h1 className="mt-1 text-2xl font-bold text-amber-950">
              {iWon ? "You win!" : `${names(f.winners)} ${f.winners.length > 1 ? "win" : "wins"}!`}
            </h1>
            <p className="text-sm text-amber-900">
              {f.winners.length > 1 ? "Tied at " : ""}
              {formatTotal(f.winners[0].totalMs)}
            </p>
          </>
        ) : (
          <h1 className="mt-1 text-2xl font-bold text-amber-950">Game over</h1>
        )}
      </header>

      <ol className="flex flex-col gap-2" data-testid="ranking">
        {f.ranked.map((e) => (
          <li
            key={e.row.userId}
            className={`flex items-center gap-3 rounded-2xl border bg-white px-4 py-3 ${e.row.isMe ? "border-stone-900" : "border-stone-200"}`}
          >
            <span className="w-8 text-center text-2xl">{e.medal ? MEDAL[e.medal] : <span className="text-base text-stone-500">{e.rank}</span>}</span>
            <span className="min-w-0 flex-1 truncate font-semibold">
              {e.row.name}
              {e.row.isMe && <span className="ml-1 text-xs font-normal text-stone-500">(you)</span>}
            </span>
            <span className="text-right tabular-nums">
              <span className="block font-bold">{formatTotal(e.row.totalMs)}</span>
              <span className="block text-xs text-stone-500">{e.row.wrongTaps} wrong</span>
            </span>
          </li>
        ))}
      </ol>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Round by round</h2>
        <ScoreTable rows={f.ranked.map((e) => e.row)} rounds={f.rounds} testId="final-table" />
        <div className="mt-2">
          <Legend />
        </div>
      </section>

      {f.retired.length > 0 && (
        <section data-testid="retired">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Retired</h2>
          <ScoreTable rows={f.retired} rounds={f.rounds} showRank={false} testId="retired-table" />
        </section>
      )}

      {err && <p className="text-center text-sm text-red-700">{err}</p>}
      {canRematch && (
        <button
          className="rounded-2xl bg-emerald-600 px-6 py-4 text-lg font-bold text-white disabled:opacity-60"
          onClick={rematch}
          disabled={busy}
          data-testid="rematch"
        >
          {busy ? "Setting up…" : "Rematch"}
        </button>
      )}
      <div className="flex justify-center gap-6 text-sm">
        {state.board_unlocked && (
          <Link href={`/g/${gameId}/board`} className="underline">
            View board
          </Link>
        )}
        <Link href="/" className="underline">
          Home
        </Link>
      </div>
    </main>
  );
}
