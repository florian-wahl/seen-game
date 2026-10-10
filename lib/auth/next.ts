/** Only allow same-site relative paths as post-login destinations. */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  if (/[\u0000-\u001f]/.test(next)) return fallback;
  return next;
}

export function signInPath(next: string): string {
  return `/signin?next=${encodeURIComponent(safeNext(next))}`;
}
