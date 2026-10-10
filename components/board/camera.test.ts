import { describe, expect, it } from "vitest";
import { CELL, type Board } from "@/lib/board/types";
import {
  clampCamera,
  initialCamera,
  screenToWorld,
  worldToScreen,
  zoomAround,
  zoomLimits,
} from "./camera";

function board(n: number): Board {
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  return { cols, rows, width: cols * CELL, height: rows * CELL, tiles: [] };
}

const vp = { width: 390, height: 700 };

describe("camera", () => {
  it("round-trips screen -> world -> screen", () => {
    const cam = { x: 321, y: 123, zoom: 0.7 };
    for (const p of [{ x: 0, y: 0 }, { x: 390, y: 700 }, { x: 123.4, y: 55.5 }]) {
      const back = worldToScreen(cam, vp, screenToWorld(cam, vp, p));
      expect(back.x).toBeCloseTo(p.x, 9);
      expect(back.y).toBeCloseTo(p.y, 9);
    }
  });

  it("viewport centre maps to camera position", () => {
    const cam = { x: 500, y: 400, zoom: 1.3 };
    const w = screenToWorld(cam, vp, { x: 195, y: 350 });
    expect(w.x).toBeCloseTo(500);
    expect(w.y).toBeCloseTo(400);
  });

  it("zoomAround keeps the focal point fixed", () => {
    const b = board(200);
    const lim = zoomLimits(b, vp);
    const cam = { x: 700, y: 600, zoom: lim.default };
    const focal = { x: 100, y: 500 };
    const before = screenToWorld(cam, vp, focal);
    for (const f of [1.5, 0.8, 2]) {
      const next = zoomAround(cam, focal, f, vp, lim);
      const after = screenToWorld(next, vp, focal);
      expect(after.x).toBeCloseTo(before.x, 6);
      expect(after.y).toBeCloseTo(before.y, 6);
    }
  });

  it("zoomAround respects limits", () => {
    const b = board(200);
    const lim = zoomLimits(b, vp);
    const cam = { x: 700, y: 600, zoom: lim.default };
    expect(zoomAround(cam, { x: 0, y: 0 }, 1000, vp, lim).zoom).toBeCloseTo(lim.max);
    expect(zoomAround(cam, { x: 0, y: 0 }, 0.0001, vp, lim).zoom).toBeCloseTo(lim.min);
  });

  it.each([100, 200, 300])("limits for a %i board on 390x700", (n) => {
    const b = board(n);
    const lim = zoomLimits(b, vp);
    expect(lim.min * b.width).toBeCloseTo(390); // full width fits
    // half the width visible, raised so the smallest picture stays >= 44 px
    expect(lim.default).toBeCloseTo(Math.max(lim.min * 2, 44 / (0.78 * CELL)));
    expect(lim.max * CELL).toBeCloseTo(160); // one tile ~160 px
    expect(lim.min).toBeLessThan(lim.default);
    expect(lim.default).toBeLessThan(lim.max);
  });

  it.each([100, 200, 300])("keeps the smallest picture >= 44 CSS px at default zoom (%i)", (n) => {
    const lim = zoomLimits(board(n), vp);
    expect(lim.default * CELL * 0.78).toBeGreaterThanOrEqual(44 - 1e-9);
  });

  it("clamps the camera inside the board", () => {
    const b = board(200);
    const lim = zoomLimits(b, vp);
    const c = clampCamera({ x: -5000, y: 99999, zoom: lim.default }, b, vp, lim);
    const halfW = vp.width / 2 / lim.default;
    const halfH = vp.height / 2 / lim.default;
    expect(c.x).toBeCloseTo(halfW);
    expect(c.y).toBeCloseTo(b.height - halfH);
  });

  it("clamps zoom and centres when the board is smaller than the viewport", () => {
    const b = board(200);
    const lim = zoomLimits(b, vp);
    const c = clampCamera({ x: 0, y: 0, zoom: lim.min }, b, vp, lim);
    expect(c.x).toBeCloseTo(b.width / 2); // full width visible
    expect(c.zoom).toBe(lim.min);
    expect(clampCamera({ x: 0, y: 0, zoom: 99 }, b, vp, lim).zoom).toBe(lim.max);
  });

  it("initialCamera is centred at default zoom", () => {
    const b = board(200);
    const c = initialCamera(b, vp);
    expect(c.zoom).toBeCloseTo(zoomLimits(b, vp).default);
    expect(c.x).toBeCloseTo(b.width / 2);
    expect(c.y).toBeCloseTo(b.height / 2);
  });
});
