"use client";
import { LEGEND, type ScoreCell, type ScoreRow } from "@/lib/game/scoreboard";
import { formatTotal } from "@/lib/game/format";

const CELL_STYLE: Record<ScoreCell["kind"], string> = {
  done: "text-stone-900",
  capped: "text-amber-700",
  forfeited: "text-red-700",
  live: "text-emerald-700 font-semibold",
  waiting: "text-emerald-700 font-semibold",
  pending: "text-stone-400",
  none: "text-stone-300",
};

export function ScoreTable({
  rows,
  rounds,
  showRank = true,
  testId = "scoreboard",
}: {
  rows: ScoreRow[];
  rounds: number;
  showRank?: boolean;
  testId?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white" data-testid={testId}>
      <table className="w-full min-w-max border-collapse text-sm tabular-nums">
        <thead>
          <tr className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
            {showRank && <th className="px-2 py-2 text-left font-medium">#</th>}
            <th className="px-2 py-2 text-left font-medium">Player</th>
            {Array.from({ length: rounds }, (_, i) => (
              <th key={i} className="px-2 py-2 text-right font-medium">
                R{i + 1}
              </th>
            ))}
            <th className="px-3 py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.userId}
              data-testid={`row-${r.userId}`}
              data-current={r.isCurrent ? "true" : undefined}
              className={`border-b border-stone-100 last:border-0 ${r.isCurrent ? "bg-emerald-50" : ""} ${r.retired ? "opacity-60" : ""}`}
            >
              {showRank && (
                <td className="px-2 py-2 text-stone-500">{r.retired ? "–" : (r.rank ?? "")}</td>
              )}
              <td className="max-w-[9rem] truncate px-2 py-2 font-medium text-stone-900">
                {r.name}
                {r.isMe && <span className="ml-1 text-xs font-normal text-stone-500">(you)</span>}
                {r.retired && <span className="ml-1 text-xs font-normal text-stone-500">retired</span>}
              </td>
              {r.cells.map((c) => (
                <td key={c.round} className={`px-2 py-2 text-right ${CELL_STYLE[c.kind]}`} data-kind={c.kind}>
                  {c.label}
                </td>
              ))}
              <td className="px-3 py-2 text-right font-semibold text-stone-900">
                {r.turnsDone > 0 || r.retired ? formatTotal(r.totalMs) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500" aria-label="Legend">
      {LEGEND.map((l) => (
        <li key={l.mark}>
          <span className="font-semibold text-stone-700">{l.mark}</span> {l.text}
        </li>
      ))}
    </ul>
  );
}
