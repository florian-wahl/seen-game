/** Shown in the lobby and on the scoreboard when the game is monochrome (issue #1). */
export function MonochromeBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-raised px-3 py-1 text-xs font-bold uppercase tracking-[0.08em] text-cream ${className}`}
      data-testid="monochrome-badge"
    >
      <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
      </svg>
      Monochrome
    </span>
  );
}
