// Display-only clock math (docs/DESIGN.md §5). The score is whatever the server returns.

export interface ClockInput {
  /** Client Date.now() */
  nowMs: number;
  /** server_now - Date.now() at receipt of a server timestamp */
  offsetMs: number;
  drawnAtMs: number;
  wrongTaps: number;
  penaltyMs: number;
}

export function clockOffset(serverNowMs: number, clientNowMs: number): number {
  return serverNowMs - clientNowMs;
}

/** Uncapped running time incl. penalties. */
export function rawElapsedMs(i: ClockInput): number {
  return Math.max(0, i.nowMs + i.offsetMs - i.drawnAtMs + i.wrongTaps * i.penaltyMs);
}

/** Displayed time, never above the cap. */
export function displayMs(i: ClockInput, capMs: number): number {
  return Math.min(rawElapsedMs(i), capMs);
}

/** True when penalties + elapsed reach the cap: stop taps, ask the server to close. */
export function isExpired(i: ClockInput, capMs: number): boolean {
  return rawElapsedMs(i) >= capMs;
}

/** Seconds to 0.1 precision, truncated so the clock never overstates. */
export function formatSeconds(ms: number): string {
  return (Math.floor(Math.max(0, ms) / 100) / 10).toFixed(1);
}
