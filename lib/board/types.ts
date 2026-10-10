// Shared contracts between the board generator (lib/board), the renderer
// (components/board) and the database (board_tiles). Change only with the lead.

/** Board units per grid cell. Tile coordinates are in board units. */
export const CELL = 100;

export type ReviewStatus = "draft" | "approved" | "rejected";

export interface Picture {
  id: string; // stable slug, e.g. "mug-red"
  name: string;
  category: string;
  /** Path relative to the library root, e.g. "mug-red.svg". */
  file: string;
  reviewStatus: ReviewStatus;
}

/** Unordered pair of picture ids that must never share a board. */
export type ConfusablePair = readonly [string, string];

/** Library manifest: <libraryRoot>/manifest.json */
export interface LibraryManifest {
  version: number;
  pictures: Picture[];
  confusables: ConfusablePair[];
}

export interface Tile {
  pictureId: string;
  /** Centre of the tile, board units. */
  x: number;
  y: number;
  /** Degrees, clockwise. */
  rotation: number;
  /** Fraction of CELL the picture occupies (0.78–0.9). */
  scale: number;
}

export interface Board {
  cols: number;
  rows: number;
  /** cols * CELL, rows * CELL */
  width: number;
  height: number;
  tiles: Tile[];
}
