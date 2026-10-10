import { describe, expect, it } from "vitest";
import type { Board } from "@/lib/board/types";
import { hitTest } from "./hitTest";

const board: Board = {
  cols: 2,
  rows: 1,
  width: 200,
  height: 100,
  tiles: [
    { pictureId: "a", x: 50, y: 50, rotation: 0, scale: 0.8 },
    { pictureId: "b", x: 150, y: 50, rotation: 0, scale: 0.8 },
  ],
};

describe("hitTest", () => {
  it("returns the nearest tile", () => {
    expect(hitTest(board, { x: 60, y: 50 })).toBe("a");
    expect(hitTest(board, { x: 140, y: 55 })).toBe("b");
    expect(hitTest(board, { x: 101, y: 50 })).toBe("b");
    expect(hitTest(board, { x: 99, y: 50 })).toBe("a");
  });

  it("returns null in empty space", () => {
    expect(hitTest(board, { x: 500, y: 500 })).toBeNull();
    expect(hitTest(board, { x: 50, y: 120 })).toBeNull();
  });

  it("includes exactly 50 units, excludes beyond", () => {
    expect(hitTest(board, { x: 100, y: 50 })).toBe("a"); // dist 50 from a, tie -> first
    expect(hitTest(board, { x: 50, y: 100 })).toBe("a");
    expect(hitTest(board, { x: 50, y: 100.01 })).toBeNull();
  });

  it("honours maxDist", () => {
    expect(hitTest(board, { x: 70, y: 50 }, 10)).toBeNull();
    expect(hitTest(board, { x: 70, y: 50 }, 20)).toBe("a");
  });
});
