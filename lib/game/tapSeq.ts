// Per-turn client_seq counter persisted in sessionStorage so a reload continues the
// sequence (a seq is never reused for a different tap).

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const key = (turnId: string) => `seen:seq:${turnId}`;

function defaultStore(): KeyValueStore | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

const memory = new Map<string, number>();

/** Returns the next seq (1, 2, 3 ...) and persists it. */
export function nextSeq(turnId: string, store: KeyValueStore | null = defaultStore()): number {
  let last = memory.get(turnId) ?? 0;
  try {
    const raw = store?.getItem(key(turnId));
    const n = raw === null || raw === undefined ? 0 : Number.parseInt(raw, 10);
    if (Number.isFinite(n)) last = Math.max(last, n);
  } catch {
    /* storage unavailable: fall back to memory */
  }
  const next = last + 1;
  memory.set(turnId, next);
  try {
    store?.setItem(key(turnId), String(next));
  } catch {
    /* ignore */
  }
  return next;
}

/** Test helper. */
export function _resetSeqMemory() {
  memory.clear();
}
