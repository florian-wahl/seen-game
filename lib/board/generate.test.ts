import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  OFFSET_MAX,
  ROTATION_MAX,
  SCALE_MAX,
  SCALE_MIN,
  countCategoryConflicts,
  findConfusableViolations,
  generateBoard,
} from "./generate";
import { hashString, mulberry32 } from "./prng";
import { CELL, type ConfusablePair, type Picture } from "./types";

const CATEGORIES = 15;

function makeLibrary(count: number, categories = CATEGORIES) {
  const pictures: Picture[] = [];
  for (let i = 0; i < count; i++) {
    pictures.push({
      id: `p${i}`,
      name: `Picture ${i}`,
      category: `c${i % categories}`,
      file: `p${i}.svg`,
      reviewStatus: "approved",
    });
  }
  // confusable pairs: (p0,p15), (p1,p16), ... within the same category
  const confusables: ConfusablePair[] = [];
  for (let i = 0; i < count - categories; i += 6) confusables.push([`p${i}`, `p${i + categories}`]);
  return { pictures, confusables };
}

describe("prng", () => {
  it("hashString is deterministic and discriminating", () => {
    expect(hashString("abc")).toBe(hashString("abc"));
    expect(hashString("abc")).not.toBe(hashString("abd"));
  });
  it("mulberry32 yields floats in [0,1) and is reproducible", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const v = a();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(v).toBe(b());
    }
  });
});

describe("generateBoard", () => {
  const { pictures, confusables } = makeLibrary(450);

  for (const size of [100, 200, 300]) {
    it(`builds a valid board of ${size}`, () => {
      const board = generateBoard({ pictures, confusables, size, seed: `game-${size}` });
      expect(board.tiles).toHaveLength(size);
      expect(new Set(board.tiles.map((t) => t.pictureId)).size).toBe(size);
      expect(board.cols).toBe(Math.ceil(Math.sqrt(size)));
      expect(board.rows).toBe(Math.ceil(size / board.cols));
      expect(board.width).toBe(board.cols * CELL);
      expect(board.height).toBe(board.rows * CELL);
      expect(findConfusableViolations(board, confusables)).toEqual([]);
      expect(countCategoryConflicts(board, pictures)).toBe(0);
    });
  }

  it("keeps tiles within bounds and scatter limits", () => {
    const board = generateBoard({ pictures, confusables, size: 200, seed: "bounds" });
    expect(board.cols).toBe(15);
    expect(board.rows).toBe(14);
    for (const t of board.tiles) {
      expect(t.x).toBeGreaterThan(0);
      expect(t.x).toBeLessThan(board.width);
      expect(t.y).toBeGreaterThan(0);
      expect(t.y).toBeLessThan(board.height);
      expect(t.scale).toBeGreaterThanOrEqual(SCALE_MIN);
      expect(t.scale).toBeLessThanOrEqual(SCALE_MAX);
      expect(Math.abs(t.rotation)).toBeLessThanOrEqual(ROTATION_MAX);
      const dx = t.x - (Math.floor(t.x / CELL) * CELL + CELL / 2);
      const dy = t.y - (Math.floor(t.y / CELL) * CELL + CELL / 2);
      expect(Math.abs(dx)).toBeLessThanOrEqual(OFFSET_MAX + 1e-9);
      expect(Math.abs(dy)).toBeLessThanOrEqual(OFFSET_MAX + 1e-9);
    }
  });

  it("spreads empty cells across the board", () => {
    const board = generateBoard({ pictures, confusables, size: 200, seed: "empties" });
    const occupiedRows = new Set(board.tiles.map((t) => Math.floor(t.y / CELL)));
    expect(occupiedRows.size).toBe(board.rows);
    // 10 empty cells: the last row must not be the only home of empties
    const lastRow = board.tiles.filter((t) => Math.floor(t.y / CELL) === board.rows - 1);
    expect(lastRow.length).toBeGreaterThan(board.cols - 4);
  });

  it("is deterministic per seed and differs across seeds", () => {
    const a = generateBoard({ pictures, confusables, size: 200, seed: "same" });
    const b = generateBoard({ pictures, confusables, size: 200, seed: "same" });
    const c = generateBoard({ pictures, confusables, size: 200, seed: "other" });
    expect(b).toEqual(a);
    expect(c).not.toEqual(a);
  });

  it("only uses approved pictures and throws when too few", () => {
    const mixed = pictures.map((p, i) => (i % 2 ? { ...p, reviewStatus: "draft" as const } : p));
    const board = generateBoard({ pictures: mixed, confusables: [], size: 200, seed: "x" });
    const ids = new Set(mixed.filter((p) => p.reviewStatus === "approved").map((p) => p.id));
    expect(board.tiles.every((t) => ids.has(t.pictureId))).toBe(true);
    expect(() => generateBoard({ pictures: mixed, confusables: [], size: 300, seed: "x" })).toThrow(
      /approved/,
    );
  });

  it("throws when confusables leave too few pictures", () => {
    const pics = makeLibrary(10, 5).pictures;
    const conf: ConfusablePair[] = [];
    for (let i = 0; i < 10; i += 2) conf.push([`p${i}`, `p${i + 1}`]);
    expect(() => generateBoard({ pictures: pics, confusables: conf, size: 8, seed: "x" })).toThrow(
      /confusable/,
    );
  });

  it("property: valid boards for arbitrary seeds and sizes", () => {
    fc.assert(
      fc.property(fc.string(), fc.constantFrom(100, 200, 300), (seed, size) => {
        const board = generateBoard({ pictures, confusables, size, seed });
        expect(board.tiles).toHaveLength(size);
        expect(new Set(board.tiles.map((t) => t.pictureId)).size).toBe(size);
        expect(findConfusableViolations(board, confusables)).toEqual([]);
        expect(countCategoryConflicts(board, pictures)).toBe(0);
      }),
      { numRuns: 15 },
    );
  });
});
