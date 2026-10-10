import { describe, expect, it } from "vitest";
import { boardFromTiles, gridFor } from "./boardFromTiles";

describe("boardFromTiles", () => {
  it("matches the generator grid for the allowed sizes", () => {
    expect(gridFor(100)).toEqual({ cols: 10, rows: 10 });
    expect(gridFor(200)).toEqual({ cols: 15, rows: 14 });
    expect(gridFor(300)).toEqual({ cols: 18, rows: 17 });
  });

  it("uses board_size for dimensions in board units", () => {
    const tiles = [{ pictureId: "a", x: 50, y: 50, rotation: 0, scale: 0.8 }];
    const b = boardFromTiles(tiles, 200);
    expect(b.cols).toBe(15);
    expect(b.rows).toBe(14);
    expect(b.width).toBe(1500);
    expect(b.height).toBe(1400);
    expect(b.tiles).toBe(tiles);
  });
});
