import { CELL, type Board, type Tile } from "@/lib/board/types";

/** Grid dimensions exactly as lib/board/generate.ts derives them from N. */
export function gridFor(n: number): { cols: number; rows: number } {
  const cols = Math.ceil(Math.sqrt(n));
  return { cols, rows: Math.ceil(n / cols) };
}

/**
 * Rebuild a Board from server tiles. Dimensions come from `boardSize` (the game's
 * configured N), not from tiles.length, so a partial list still lays out right.
 */
export function boardFromTiles(tiles: Tile[], boardSize: number): Board {
  const { cols, rows } = gridFor(boardSize);
  return { cols, rows, width: cols * CELL, height: rows * CELL, tiles };
}
