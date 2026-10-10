import { describe, expect, it } from "vitest";
import { GestureMachine, type GestureEvent } from "./gestures";

const taps = (evs: GestureEvent[]) => evs.filter((e) => e.type === "tap");

describe("GestureMachine", () => {
  it("quick still press is a tap", () => {
    const m = new GestureMachine();
    m.pointerDown(1, 100, 100, 0);
    m.pointerMove(1, 102, 101, 20);
    const up = m.pointerUp(1, 120);
    expect(taps(up)).toEqual([{ type: "tap", x: 102, y: 101 }]);
  });

  it("a drag of >= 8 px is never a tap", () => {
    const m = new GestureMachine();
    m.pointerDown(1, 100, 100, 0);
    const evs = [...m.pointerMove(1, 108, 100, 30), ...m.pointerUp(1, 60)];
    expect(taps(evs)).toHaveLength(0);
    expect(evs[0]).toEqual({ type: "pan", dx: 8, dy: 0 });
  });

  it("many small moves summing to >= 8 px are not a tap", () => {
    const m = new GestureMachine();
    m.pointerDown(1, 0, 0, 0);
    let evs: GestureEvent[] = [];
    for (let i = 1; i <= 10; i++) evs = evs.concat(m.pointerMove(1, i, 0, i * 5));
    evs = evs.concat(m.pointerUp(1, 100));
    expect(taps(evs)).toHaveLength(0);
  });

  it("small jitter below 8 px is still a tap", () => {
    const m = new GestureMachine();
    m.pointerDown(1, 0, 0, 0);
    m.pointerMove(1, 3, 0, 10);
    m.pointerMove(1, 0, 0, 20);
    expect(taps(m.pointerUp(1, 100))).toHaveLength(1);
  });

  it("long press (>= 350 ms) is not a tap", () => {
    const m = new GestureMachine();
    m.pointerDown(1, 100, 100, 0);
    expect(taps(m.pointerUp(1, 350))).toHaveLength(0);
    m.pointerDown(1, 100, 100, 1000);
    expect(taps(m.pointerUp(1, 1349))).toHaveLength(1);
  });

  it("pinch never produces a tap, even if one finger lifts quickly", () => {
    const m = new GestureMachine();
    m.pointerDown(1, 100, 100, 0);
    m.pointerDown(2, 200, 100, 10);
    const pinch = m.pointerMove(2, 220, 100, 20);
    expect(pinch[0]).toMatchObject({ type: "pinch" });
    const evs = [...m.pointerUp(2, 50), ...m.pointerUp(1, 80)];
    expect(taps(evs)).toHaveLength(0);
  });

  it("second pointer cancels the tap without any movement", () => {
    const m = new GestureMachine();
    m.pointerDown(1, 100, 100, 0);
    m.pointerDown(2, 150, 100, 5);
    expect(taps([...m.pointerUp(2, 20), ...m.pointerUp(1, 40)])).toHaveLength(0);
  });

  it("a new tap works after a pinch", () => {
    const m = new GestureMachine();
    m.pointerDown(1, 100, 100, 0);
    m.pointerDown(2, 150, 100, 5);
    m.pointerUp(2, 20);
    m.pointerUp(1, 40);
    m.pointerDown(1, 10, 10, 1000);
    expect(taps(m.pointerUp(1, 1050))).toHaveLength(1);
  });

  it("pinch reports factor around the midpoint", () => {
    const m = new GestureMachine();
    m.pointerDown(1, 100, 100, 0);
    m.pointerDown(2, 200, 100, 0);
    const [ev] = m.pointerMove(2, 300, 100, 16);
    expect(ev).toMatchObject({ type: "pinch", factor: 2, cx: 200, cy: 100, dx: 50, dy: 0 });
  });

  it("flings with inertia that decays to rest", () => {
    const m = new GestureMachine();
    m.pointerDown(1, 0, 0, 0);
    for (let i = 1; i <= 10; i++) m.pointerMove(1, i * 10, 0, i * 16);
    m.pointerUp(1, 165);
    expect(m.inertiaActive).toBe(true);
    let total = 0;
    let frames = 0;
    for (; frames < 1000 && m.inertiaActive; frames++) {
      const s = m.stepInertia(16);
      if (s) {
        expect(s.dx).toBeGreaterThan(0);
        total += s.dx;
      }
    }
    expect(m.inertiaActive).toBe(false);
    expect(frames).toBeLessThan(1000);
    expect(total).toBeGreaterThan(50);
    expect(m.stepInertia(16)).toBeNull();
  });

  it("no inertia after a stationary hold, and touching stops it", () => {
    const m = new GestureMachine();
    m.pointerDown(1, 0, 0, 0);
    for (let i = 1; i <= 10; i++) m.pointerMove(1, i * 10, 0, i * 16);
    m.pointerUp(1, 500); // held still before release
    expect(m.inertiaActive).toBe(false);

    m.pointerDown(1, 0, 0, 1000);
    for (let i = 1; i <= 10; i++) m.pointerMove(1, i * 10, 0, 1000 + i * 16);
    m.pointerUp(1, 1170);
    expect(m.inertiaActive).toBe(true);
    m.pointerDown(1, 5, 5, 1200);
    expect(m.inertiaActive).toBe(false);
  });
});
