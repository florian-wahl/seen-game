/**
 * Pure pointer gesture state machine. No DOM; time is passed in by the caller.
 * Coordinates are CSS px in the canvas' own space.
 */

export const TAP_MAX_MOVE_PX = 8;
export const TAP_MAX_MS = 350;
/** Inertia velocity decay time constant (ms). */
export const INERTIA_TAU_MS = 325;
/** Below this speed (px/ms) inertia is considered at rest. */
export const INERTIA_REST_SPEED = 0.02;
/** Release velocity older than this (ms) does not trigger a fling. */
const FLING_MAX_IDLE_MS = 80;

export type GestureEvent =
  | { type: "pan"; dx: number; dy: number }
  | { type: "pinch"; cx: number; cy: number; factor: number; dx: number; dy: number }
  | { type: "tap"; x: number; y: number };

interface Pointer {
  x: number;
  y: number;
}

export class GestureMachine {
  private pointers = new Map<number, Pointer>();
  private tapCandidate = false;
  private downT = 0;
  private moved = 0;
  private pendX = 0;
  private pendY = 0;
  private vx = 0;
  private vy = 0;
  private lastMoveT = 0;
  private inertiaV: { vx: number; vy: number } | null = null;

  get activePointers(): number {
    return this.pointers.size;
  }

  get inertiaActive(): boolean {
    return this.inertiaV !== null;
  }

  pointerDown(id: number, x: number, y: number, t: number): GestureEvent[] {
    this.inertiaV = null;
    this.pointers.set(id, { x, y });
    if (this.pointers.size === 1) {
      this.tapCandidate = true;
      this.downT = t;
      this.moved = 0;
      this.pendX = 0;
      this.pendY = 0;
    } else {
      this.tapCandidate = false;
    }
    this.vx = 0;
    this.vy = 0;
    this.lastMoveT = t;
    return [];
  }

  pointerMove(id: number, x: number, y: number, t: number): GestureEvent[] {
    const p = this.pointers.get(id);
    if (!p) return [];
    const events: GestureEvent[] = [];

    if (this.pointers.size === 1) {
      const dx = x - p.x;
      const dy = y - p.y;
      this.moved += Math.hypot(dx, dy);
      p.x = x;
      p.y = y;
      if (this.tapCandidate) {
        this.pendX += dx;
        this.pendY += dy;
        if (this.moved < TAP_MAX_MOVE_PX) return events;
        this.tapCandidate = false;
        // Crossed the threshold: release the movement held back so far.
        events.push({ type: "pan", dx: this.pendX, dy: this.pendY });
        this.lastMoveT = t;
        return events;
      }
      if (dx !== 0 || dy !== 0) {
        const dt = Math.max(1, t - this.lastMoveT);
        const a = 0.6; // smoothed velocity, px/ms
        this.vx = a * (dx / dt) + (1 - a) * this.vx;
        this.vy = a * (dy / dt) + (1 - a) * this.vy;
        this.lastMoveT = t;
        events.push({ type: "pan", dx, dy });
      }
      return events;
    }

    const [a, b] = [...this.pointers.keys()];
    const pa = this.pointers.get(a)!;
    const pb = this.pointers.get(b)!;
    const oldMid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
    const oldDist = Math.hypot(pa.x - pb.x, pa.y - pb.y);
    p.x = x;
    p.y = y;
    const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
    const dist = Math.hypot(pa.x - pb.x, pa.y - pb.y);
    const factor = oldDist > 0 && dist > 0 ? dist / oldDist : 1;
    const dx = mid.x - oldMid.x;
    const dy = mid.y - oldMid.y;
    if (factor !== 1 || dx !== 0 || dy !== 0) {
      events.push({ type: "pinch", cx: mid.x, cy: mid.y, factor, dx, dy });
    }
    return events;
  }

  pointerUp(id: number, t: number): GestureEvent[] {
    const p = this.pointers.get(id);
    if (!p) return [];
    const events: GestureEvent[] = [];
    const wasSingle = this.pointers.size === 1;
    this.pointers.delete(id);

    if (wasSingle) {
      if (this.tapCandidate && t - this.downT < TAP_MAX_MS) {
        events.push({ type: "tap", x: p.x, y: p.y });
      } else if (!this.tapCandidate && t - this.lastMoveT <= FLING_MAX_IDLE_MS) {
        if (Math.hypot(this.vx, this.vy) > INERTIA_REST_SPEED * 4) {
          this.inertiaV = { vx: this.vx, vy: this.vy };
        }
      }
    }
    // A pointer left over after a pinch continues as a pan; never a tap.
    this.tapCandidate = false;
    if (!wasSingle) {
      this.vx = 0;
      this.vy = 0;
      this.lastMoveT = t;
    }
    return events;
  }

  pointerCancel(id: number): void {
    this.pointers.delete(id);
    this.tapCandidate = false;
    this.vx = 0;
    this.vy = 0;
  }

  /** Advance inertia by dtMs; returns the pan delta in px, or null at rest. */
  stepInertia(dtMs: number): { dx: number; dy: number } | null {
    const v = this.inertiaV;
    if (!v) return null;
    // Exact integral of v0 * exp(-t/tau) over dt.
    const decay = Math.exp(-dtMs / INERTIA_TAU_MS);
    const dist = INERTIA_TAU_MS * (1 - decay);
    const dx = v.vx * dist;
    const dy = v.vy * dist;
    v.vx *= decay;
    v.vy *= decay;
    if (Math.hypot(v.vx, v.vy) < INERTIA_REST_SPEED) this.inertiaV = null;
    return { dx, dy };
  }

  stopInertia(): void {
    this.inertiaV = null;
  }
}
