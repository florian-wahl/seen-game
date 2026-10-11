"use client";
import { LEGEND, type ScoreCell, type ScoreRow } from "@/lib/game/scoreboard";
import { formatTotal } from "@/lib/game/format";

const CELL_STYLE: Record<ScoreCell["kind"], string> = {
  done: "text-cream",
  capped: "text-mustard",
  forfeited: "text-[#f08aba]",
  live: "text-mustard font-bold",
  waiting: "text-mustard font-bold",
  pending: "text-dim",
  none: "text-dim",
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
    <div className="overflow-x-auto rounded-[20px] bg-surface" data-testid={testId}>
      <table className="w-full min-w-max border-collapse text-sm tabular-nums">
        <thead>
          <tr className="border-b border-line font-wide text-[11px] uppercase tracking-wide text-muted">
            {showRank && <th className="px-2 py-2 text-left font-medium">#</th>}
            <th className="px-2 py-2 text-left font-medium">Player</th>
            {Array.from({ length: rounds }, (_, i) => (
              <th key={i} className="px-1.5 py-2 text-right font-medium">
                R{i + 1}
              </th>
            ))}
            <th className="px-2.5 py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.userId}
              data-testid={`row-${r.userId}`}
              data-current={r.isCurrent ? "true" : undefined}
              className={`border-b border-line last:border-0 ${r.isCurrent ? "bg-[rgba(245,185,63,.12)] shadow-[inset_3px_0_0_var(--color-mustard)]" : ""} ${r.retired ? "opacity-60" : ""}`}
            >
              {showRank && (
                <td className="px-2 py-2 text-muted">{r.retired ? "–" : (r.rank ?? "")}</td>
              )}
              <td className={`max-w-[9rem] truncate px-2 py-2 ${r.isMe ? "font-bold" : "font-medium"} text-cream`}>
                {r.name}
                {r.isMe && <span className="ml-1 text-xs font-normal text-muted">(you)</span>}
                {r.retired && <span className="ml-1 text-xs font-normal text-muted">retired</span>}
              </td>
              {r.cells.map((c) => (
                <td key={c.round} className={`px-1.5 py-2 text-right ${CELL_STYLE[c.kind]}`} data-kind={c.kind}>
                  {c.label}
                </td>
              ))}
              <td className="px-2.5 py-2 text-right font-wide font-black text-cream">
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
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Legend">
      {LEGEND.map((l) => (
        <li key={l.mark}>
          <span className="font-semibold text-cream">{l.mark}</span> {l.text}
        </li>
      ))}
    </ul>
  );
}
