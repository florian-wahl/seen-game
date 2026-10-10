import { CELL, type Board, type ConfusablePair, type Picture, type Tile } from "./types";
import { hashString, mulberry32, randInt, randRange, shuffle } from "./prng";

export interface GenerateOptions {
  pictures: Picture[];
  confusables: readonly ConfusablePair[];
  size: number;
  seed: string;
}

const MAX_REPAIR_PASSES = 2000;
const SWAP_CANDIDATES = 24;

export const SCALE_MIN = 0.78;
export const SCALE_MAX = 0.9;
export const ROTATION_MAX = 20;
export const OFFSET_MAX = 8;

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

export function generateBoard(opts: GenerateOptions): Board {
  const { pictures, confusables, size, seed } = opts;
  if (!Number.isInteger(size) || size <= 0) throw new Error(`Invalid board size: ${size}`);
  const rand = mulberry32(hashString(seed));

  // 1. sample
  const sampled = samplePictures(pictures, confusables, size, rand);

  // 2. grid
  const cols = Math.ceil(Math.sqrt(size));
  const rows = Math.ceil(size / cols);
  const total = cols * rows;
  const empties = emptyCellIndices(total, total - size);
  const occupied: number[] = [];
  for (let i = 0; i < total; i++) if (!empties.has(i)) occupied.push(i);

  const cellPic: (Picture | null)[] = new Array(total).fill(null);
  sampled.forEach((p, i) => {
    cellPic[occupied[i]] = p;
  });

  // 3. category spread repair
  const nbrs: number[][] = [];
  for (let i = 0; i < total; i++) nbrs.push(neighbours(i, cols, rows));
  const local = (cell: number): number => {
    const p = cellPic[cell];
    if (!p) return 0;
    let n = 0;
    for (const nb of nbrs[cell]) if (cellPic[nb]?.category === p.category) n++;
    return n;
  };
  const swap = (a: number, b: number) => {
    const t = cellPic[a];
    cellPic[a] = cellPic[b];
    cellPic[b] = t;
  };
  for (let pass = 0; pass < MAX_REPAIR_PASSES; pass++) {
    const conflicted = occupied.filter((c) => local(c) > 0);
    if (conflicted.length === 0) break;
    for (const a of shuffle(conflicted, rand)) {
      if (local(a) === 0) continue;
      for (let k = 0; k < SWAP_CANDIDATES; k++) {
        const b = occupied[randInt(rand, occupied.length)];
        if (b === a) continue;
        const before = local(a) + local(b);
        swap(a, b);
        if (local(a) + local(b) < before) break;
        swap(a, b);
      }
    }
  }

  // 4. scatter
  const tiles: Tile[] = [];
  for (const cell of occupied) {
    const p = cellPic[cell]!;
    const r = Math.floor(cell / cols);
    const c = cell % cols;
    const scale = randRange(rand, SCALE_MIN, SCALE_MAX);
    const rotation = randRange(rand, -ROTATION_MAX, ROTATION_MAX);
    const ox = randRange(rand, -OFFSET_MAX, OFFSET_MAX);
    const oy = randRange(rand, -OFFSET_MAX, OFFSET_MAX);
    tiles.push({
      pictureId: p.id,
      x: c * CELL + CELL / 2 + ox,
      y: r * CELL + CELL / 2 + oy,
      rotation,
      scale,
    });
  }

  return { cols, rows, width: cols * CELL, height: rows * CELL, tiles };
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

/** Confusable pairs that both appear on the board. */
export function findConfusableViolations(
  board: Board,
  confusables: readonly ConfusablePair[],
): ConfusablePair[] {
  const ids = new Set(board.tiles.map((t) => t.pictureId));
  return confusables.filter(([a, b]) => ids.has(a) && ids.has(b));
}
