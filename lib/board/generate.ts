import { CELL, type Board, type ConfusablePair, type Picture, type Tile } from "./types";
import { hashString, mulberry32, randInt, randRange, shuffle } from "./prng";

/** "grid": rows and columns with small offsets; "scatter": no rows or columns (issue #3). */
export type Layout = "grid" | "scatter";

export interface GenerateOptions {
  pictures: Picture[];
  confusables: readonly ConfusablePair[];
  size: number;
  seed: string;
  /** Default "grid". */
  layout?: Layout;
}

const MAX_REPAIR_PASSES = 2000;
const SWAP_CANDIDATES = 24;

export const SCALE_MIN = 0.78;
export const SCALE_MAX = 0.9;
export const ROTATION_MAX = 20;
export const OFFSET_MAX = 8;

/** Scatter: no two tile centres closer than this (the grid's worst case is 100 - 2 * OFFSET_MAX). */
export const SCATTER_MIN_DIST = 84;
/** Scatter: tile centres stay this far inside the board edge (grid: CELL / 2 - OFFSET_MAX). */
export const SCATTER_MARGIN = 42;
/** Scatter: tiles closer than this count as neighbours for the category spread (≈ a grid diagonal). */
export const SCATTER_NEIGHBOUR_RADIUS = 140;
const SCATTER_CANDIDATES = 12;
const SCATTER_RELAX_PASSES = 1000;

function confusableMap(pairs: readonly ConfusablePair[]): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const [a, b] of pairs) {
    if (!m.has(a)) m.set(a, new Set());
    if (!m.has(b)) m.set(b, new Set());
    m.get(a)!.add(b);
    m.get(b)!.add(a);
  }
  return m;
}

/** Step 1: shuffle approved pictures, greedily take non-confusable ones. */
function samplePictures(
  pictures: Picture[],
  confusables: readonly ConfusablePair[],
  size: number,
  rand: () => number,
): Picture[] {
  const approved = pictures.filter((p) => p.reviewStatus === "approved");
  if (approved.length < size) {
    throw new Error(
      `Cannot generate a board of ${size}: only ${approved.length} approved pictures available (of ${pictures.length}).`,
    );
  }
  const conf = confusableMap(confusables);
  const taken: Picture[] = [];
  const takenIds = new Set<string>();
  for (const p of shuffle(approved, rand)) {
    if (taken.length === size) break;
    const bad = conf.get(p.id);
    if (bad && [...bad].some((id) => takenIds.has(id))) continue;
    taken.push(p);
    takenIds.add(p.id);
  }
  if (taken.length < size) {
    throw new Error(
      `Cannot generate a board of ${size}: only ${taken.length} approved pictures remain after confusable exclusion (${approved.length} approved).`,
    );
  }
  return taken;
}

/** Indices (row-major) of the cells that stay empty, spread evenly. */
function emptyCellIndices(totalCells: number, empty: number): Set<number> {
  const s = new Set<number>();
  for (let i = 0; i < empty; i++) s.add(Math.floor(((i + 0.5) * totalCells) / empty));
  return s;
}

function neighbours(cell: number, cols: number, rows: number): number[] {
  const r = Math.floor(cell / cols);
  const c = cell % cols;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const rr = r + dr;
      const cc = c + dc;
      if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) out.push(rr * cols + cc);
    }
  }
  return out;
}

/** Step 2 (grid): occupied cells, row-major, and their 8-neighbourhoods as slot indices. */
function gridSlots(size: number, cols: number, rows: number) {
  const total = cols * rows;
  const empties = emptyCellIndices(total, total - size);
  const occupied: number[] = [];
  for (let i = 0; i < total; i++) if (!empties.has(i)) occupied.push(i);
  const slotOf = new Map(occupied.map((cell, i) => [cell, i]));
  const nbrs = occupied.map((cell) =>
    neighbours(cell, cols, rows)
      .map((nb) => slotOf.get(nb))
      .filter((i): i is number => i !== undefined),
  );
  return { occupied, nbrs };
}

interface Point {
  x: number;
  y: number;
}

/**
 * Step 2 (scatter): `size` points over the board with no rows or columns. Best-candidate
 * sampling spreads them evenly; a relaxation then pushes apart any two closer than
 * SCATTER_MIN_DIST, keeping every point SCATTER_MARGIN inside the edge.
 */
function scatterPoints(size: number, width: number, height: number, rand: () => number): Point[] {
  const lo = SCATTER_MARGIN;
  const hiX = width - SCATTER_MARGIN;
  const hiY = height - SCATTER_MARGIN;
  const pts: Point[] = [];
  for (let i = 0; i < size; i++) {
    let best: Point | null = null;
    let bestD2 = -1;
    for (let k = 0; k < SCATTER_CANDIDATES; k++) {
      const c = { x: randRange(rand, lo, hiX), y: randRange(rand, lo, hiY) };
      let d2 = Infinity;
      for (const p of pts) d2 = Math.min(d2, (p.x - c.x) ** 2 + (p.y - c.y) ** 2);
      if (d2 > bestD2) {
        best = c;
        bestD2 = d2;
      }
    }
    pts.push(best!);
  }

  const min2 = SCATTER_MIN_DIST * SCATTER_MIN_DIST;
  for (let pass = 0; pass < SCATTER_RELAX_PASSES; pass++) {
    let moved = false;
    for (let i = 0; i < size; i++) {
      for (let j = i + 1; j < size; j++) {
        const a = pts[i];
        const b = pts[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min2) continue;
        let d = Math.sqrt(d2);
        if (d === 0) {
          dx = rand() - 0.5;
          dy = rand() - 0.5;
          d = Math.sqrt(dx * dx + dy * dy);
        }
        // Each moves half the shortfall (plus a hair, so the pair clears the limit).
        const push = (SCATTER_MIN_DIST - d) / 2 + 0.01;
        const ux = (dx / d) * push;
        const uy = (dy / d) * push;
        a.x = clamp(a.x - ux, lo, hiX);
        a.y = clamp(a.y - uy, lo, hiY);
        b.x = clamp(b.x + ux, lo, hiX);
        b.y = clamp(b.y + uy, lo, hiY);
        moved = true;
      }
    }
    if (!moved) return pts;
  }
  throw new Error(`Cannot scatter ${size} pictures on a ${width} x ${height} board.`);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** For each point, the indices of the others within `radius`. */
function nearby(pts: Point[], radius: number): number[][] {
  const r2 = radius * radius;
  return pts.map((a, i) => {
    const out: number[] = [];
    pts.forEach((b, j) => {
      if (j !== i && (a.x - b.x) ** 2 + (a.y - b.y) ** 2 <= r2) out.push(j);
    });
    return out;
  });
}

/**
 * Step 3: place pictures in slot order, then swap pictures between slots while that
 * lowers the number of same-category neighbours. Mutates `slotPic`.
 */
function spreadCategories(slotPic: Picture[], nbrs: number[][], rand: () => number): void {
  const slots = slotPic.map((_, i) => i);
  const local = (s: number): number => {
    const cat = slotPic[s].category;
    let n = 0;
    for (const nb of nbrs[s]) if (slotPic[nb].category === cat) n++;
    return n;
  };
  const swap = (a: number, b: number) => {
    const t = slotPic[a];
    slotPic[a] = slotPic[b];
    slotPic[b] = t;
  };
  for (let pass = 0; pass < MAX_REPAIR_PASSES; pass++) {
    const conflicted = slots.filter((s) => local(s) > 0);
    if (conflicted.length === 0) break;
    for (const a of shuffle(conflicted, rand)) {
      if (local(a) === 0) continue;
      for (let k = 0; k < SWAP_CANDIDATES; k++) {
        const b = randInt(rand, slots.length);
        if (b === a) continue;
        const before = local(a) + local(b);
        swap(a, b);
        if (local(a) + local(b) < before) break;
        swap(a, b);
      }
    }
  }
}

export function generateBoard(opts: GenerateOptions): Board {
  const { pictures, confusables, size, seed, layout = "grid" } = opts;
  if (!Number.isInteger(size) || size <= 0) throw new Error(`Invalid board size: ${size}`);
  const rand = mulberry32(hashString(seed));

  // 1. sample
  const slotPic = samplePictures(pictures, confusables, size, rand);

  // The scattered board covers the same area as the grid, so the density is the same.
  const cols = Math.ceil(Math.sqrt(size));
  const rows = Math.ceil(size / cols);
  const width = cols * CELL;
  const height = rows * CELL;

  if (layout === "scatter") {
    // 2. points, 3. category spread, 4. scale and rotation (no offset: the points are already irregular)
    const pts = scatterPoints(size, width, height, rand);
    spreadCategories(slotPic, nearby(pts, SCATTER_NEIGHBOUR_RADIUS), rand);
    const tiles: Tile[] = pts.map((p, i) => ({
      pictureId: slotPic[i].id,
      x: p.x,
      y: p.y,
      scale: randRange(rand, SCALE_MIN, SCALE_MAX),
      rotation: randRange(rand, -ROTATION_MAX, ROTATION_MAX),
    }));
    return { cols, rows, width, height, tiles };
  }

  // 2. grid
  const { occupied, nbrs } = gridSlots(size, cols, rows);

  // 3. category spread repair
  spreadCategories(slotPic, nbrs, rand);

  // 4. scatter
  const tiles: Tile[] = [];
  occupied.forEach((cell, i) => {
    const r = Math.floor(cell / cols);
    const c = cell % cols;
    const scale = randRange(rand, SCALE_MIN, SCALE_MAX);
    const rotation = randRange(rand, -ROTATION_MAX, ROTATION_MAX);
    const ox = randRange(rand, -OFFSET_MAX, OFFSET_MAX);
    const oy = randRange(rand, -OFFSET_MAX, OFFSET_MAX);
    tiles.push({
      pictureId: slotPic[i].id,
      x: c * CELL + CELL / 2 + ox,
      y: r * CELL + CELL / 2 + oy,
      rotation,
      scale,
    });
  });

  return { cols, rows, width, height, tiles };
}

/** Number of unordered adjacent (8-neighbourhood) same-category tile pairs. */
export function countCategoryConflicts(board: Board, pictures: Picture[]): number {
  const cat = new Map(pictures.map((p) => [p.id, p.category]));
  const grid = new Map<number, string | undefined>();
  const cellOf = (t: Tile) => Math.floor(t.y / CELL) * board.cols + Math.floor(t.x / CELL);
  for (const t of board.tiles) grid.set(cellOf(t), cat.get(t.pictureId));
  let n = 0;
  for (const [cell, c] of grid) {
    if (c === undefined) continue;
    const r = Math.floor(cell / board.cols);
    const col = cell % board.cols;
    // count each pair once: only neighbours later in row-major order
    for (const [dr, dc] of [
      [0, 1],
      [1, -1],
      [1, 0],
      [1, 1],
    ]) {
      const rr = r + dr;
      const cc = col + dc;
      if (rr >= board.rows || cc < 0 || cc >= board.cols) continue;
      if (grid.get(rr * board.cols + cc) === c) n++;
    }
  }
  return n;
}

/** Unordered pairs of same-category tiles whose centres are within `radius` (scatter layout). */
export function countNearbyCategoryConflicts(
  board: Board,
  pictures: Picture[],
  radius = SCATTER_NEIGHBOUR_RADIUS,
): number {
  const cat = new Map(pictures.map((p) => [p.id, p.category]));
  const r2 = radius * radius;
  const t = board.tiles;
  let n = 0;
  for (let i = 0; i < t.length; i++) {
    for (let j = i + 1; j < t.length; j++) {
      if ((t[i].x - t[j].x) ** 2 + (t[i].y - t[j].y) ** 2 > r2) continue;
      const c = cat.get(t[i].pictureId);
      if (c !== undefined && c === cat.get(t[j].pictureId)) n++;
    }
  }
  return n;
}

/** Smallest distance between two tile centres. */
export function minTileDistance(board: Board): number {
  let min2 = Infinity;
  const t = board.tiles;
  for (let i = 0; i < t.length; i++) {
    for (let j = i + 1; j < t.length; j++) {
      min2 = Math.min(min2, (t[i].x - t[j].x) ** 2 + (t[i].y - t[j].y) ** 2);
    }
  }
  return Math.sqrt(min2);
}

/** Confusable pairs that both appear on the board. */
export function findConfusableViolations(
  board: Board,
  confusables: readonly ConfusablePair[],
): ConfusablePair[] {
  const ids = new Set(board.tiles.map((t) => t.pictureId));
  return confusables.filter(([a, b]) => ids.has(a) && ids.has(b));
}
