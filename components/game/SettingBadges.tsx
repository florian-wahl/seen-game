import type { ReactNode } from "react";
import type { Game } from "@/lib/game/types";

function Badge({ children, testId }: { children: ReactNode; testId: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-raised px-3 py-1 text-xs font-bold uppercase tracking-[0.08em] text-cream"
      data-testid={testId}
    >
      {children}
    </span>
  );
}

/**
 * The game's optional settings, shown in the lobby and on the scoreboard: monochrome (issue #1)
 * and the scattered board (issue #3). Renders nothing for a plain game.
 */
export function SettingBadges({ game, className = "" }: { game: Pick<Game, "monochrome" | "layout">; className?: string }) {
  if (!game.monochrome && game.layout !== "scatter") return null;
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {game.monochrome && (
        <Badge testId="monochrome-badge">
          <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
          </svg>
          Monochrome
        </Badge>
      )}
      {game.layout === "scatter" && (
        <Badge testId="scatter-badge">
          <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="5" cy="6" r="2.4" />
            <circle cx="15" cy="4.5" r="2.4" />
            <circle cx="10" cy="12.5" r="2.4" />
            <circle cx="19.5" cy="12" r="2.4" />
            <circle cx="4.5" cy="18.5" r="2.4" />
            <circle cx="14.5" cy="19.5" r="2.4" />
          </svg>
          Scattered
        </Badge>
      )}
    </div>
  );
}
