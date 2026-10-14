import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { countNearbyCategoryConflicts, findConfusableViolations, generateBoard } from "@/lib/board/generate";
import type { LibraryManifest } from "@/lib/board/types";

// The live library must fill the largest board create_game offers, after skipping confusable pairs.
const manifest = JSON.parse(
  readFileSync(path.resolve(__dirname, "../../public/library/v2/manifest.json"), "utf8"),
) as LibraryManifest;
const approved = manifest.pictures.filter((p) => p.reviewStatus === "approved");

describe("live picture library (v2)", () => {
  it.each(["seed-a", "seed-b", "seed-c", "seed-d", "seed-e"])("fills a 500-picture board (%s)", (seed) => {
    const board = generateBoard({ pictures: approved, confusables: manifest.confusables, size: 500, seed });
    expect(board.tiles).toHaveLength(500);
    expect(findConfusableViolations(board, manifest.confusables)).toEqual([]);
  });

  it.each(["seed-a", "seed-b", "seed-c"])("fills a scattered 500-picture board (%s)", (seed) => {
    const board = generateBoard({
      pictures: approved,
      confusables: manifest.confusables,
      size: 500,
      seed,
      layout: "scatter",
    });
    expect(board.tiles).toHaveLength(500);
    expect(findConfusableViolations(board, manifest.confusables)).toEqual([]);
    expect(countNearbyCategoryConflicts(board, approved)).toBe(0);
  });
});
