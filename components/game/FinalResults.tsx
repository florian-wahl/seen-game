"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { GameState } from "@/lib/game/types";
import { buildFinalResults, type ScoreRow } from "@/lib/game/scoreboard";
import { formatTotal } from "@/lib/game/format";
import { friendlyError, rematchGame } from "@/lib/game/rpc";
import { Button } from "@/components/ui/Button";
import { Legend, ScoreTable } from "./ScoreTable";

const MEDAL_BG = { 1: "bg-[#f5b93f]", 2: "bg-[#cfd6dc]", 3: "bg-[#d9a47a]" } as const;

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
      <header className="relative overflow-hidden rounded-3xl bg-paper px-5 py-6 pr-24 text-left text-ink" data-testid="winner">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/library/v1/disco-ball.svg" alt="" aria-hidden className="pointer-events-none absolute -right-2 -top-1 h-20 w-20 rotate-12" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/library/v1/tambourine.svg" alt="" aria-hidden className="pointer-events-none absolute -bottom-3 right-14 h-16 w-16 -rotate-12" />
        <p className="relative text-xs font-bold uppercase tracking-[0.12em] text-ink/60">Game over</p>
        {f.winners.length > 0 ? (
          <>
            <h1 className="relative mt-1 font-wide text-[40px] font-black uppercase leading-none tracking-tight text-ink [overflow-wrap:anywhere]">
              {iWon ? "You win!" : `${names(f.winners)} ${f.winners.length > 1 ? "win" : "wins"}!`}
            </h1>
            <p className="relative mt-2 font-wide text-base font-extrabold tabular-nums text-ink">
              {f.winners.length > 1 ? "Tied at " : ""}
              {formatTotal(f.winners[0].totalMs)}
            </p>
          </>
        ) : (
          <h1 className="relative mt-1 font-wide text-[40px] font-black uppercase leading-none tracking-tight text-ink">Game over</h1>
        )}
      </header>

      <ol className="flex flex-col gap-2" data-testid="ranking">
        {f.ranked.map((e) => (
          <li
            key={e.row.userId}
            className={`flex items-center gap-3 rounded-2xl bg-surface px-4 py-3 ${e.row.isMe ? "shadow-[inset_0_0_0_2px_var(--color-cream)]" : ""}`}
          >
            {e.medal ? (
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-wide text-sm font-black text-ink ${MEDAL_BG[e.medal]}`}>{e.rank}</span>
            ) : (
              <span className="w-8 shrink-0 text-center text-base font-bold text-muted">{e.rank}</span>
            )}
            <span className="min-w-0 flex-1 truncate font-semibold">
              {e.row.name}
              {e.row.isMe && <span className="ml-1 text-xs font-normal text-muted">(you)</span>}
            </span>
            <span className="text-right tabular-nums">
              <span className="block font-wide font-extrabold">{formatTotal(e.row.totalMs)}</span>
              <span className="block text-xs text-muted">{e.row.wrongTaps} wrong</span>
            </span>
          </li>
        ))}
      </ol>

      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-muted">Round by round</h2>
        <ScoreTable rows={f.ranked.map((e) => e.row)} rounds={f.rounds} showRank={false} testId="final-table" />
        <div className="mt-2">
          <Legend />
        </div>
      </section>

      {f.retired.length > 0 && (
        <section data-testid="retired">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-muted">Retired</h2>
          <ScoreTable rows={f.retired} rounds={f.rounds} showRank={false} testId="retired-table" />
        </section>
      )}

      {err && <p className="text-center text-sm text-[#f08aba]">{err}</p>}
      {canRematch && (
        <Button onClick={rematch} disabled={busy} data-testid="rematch">
          {busy ? "Setting up…" : "Rematch"}
        </Button>
      )}
      {state.board_unlocked && (
        <div className="flex justify-center text-sm text-cream">
          <Link href={`/g/${gameId}/board`} className="inline-flex min-h-11 items-center underline">
            View board
          </Link>
        </div>
      )}
    </main>
  );
}
