/** "just now", "5 min ago", "3 h ago", "2 days ago". */
export function timeAgo(iso: string, nowMs: number): string {
  const diff = Math.max(0, nowMs - new Date(iso).getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.floor(h / 24)} days ago`;
}

/** Total in seconds with one decimal, e.g. 123400 -> "123.4 s". */
export function formatTotal(ms: number): string {
  return `${(Math.round(ms / 100) / 10).toFixed(1)} s`;
}
