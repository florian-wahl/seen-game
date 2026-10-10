// TEMPORARY: fake board + placeholder SVGs for the M2 prototype. Swap for the
// real generator (lib/board/generate.ts) and library once available.
import { CELL, type Board, type Tile } from "@/lib/board/types";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fakeBoard(n: number, seed = 1): Board {
  const rnd = mulberry32(seed);
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const tiles: Tile[] = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    tiles.push({
      pictureId: `fake-${i}`,
      x: c * CELL + CELL / 2 + (rnd() * 2 - 1) * 8,
      y: r * CELL + CELL / 2 + (rnd() * 2 - 1) * 8,
      rotation: (rnd() * 2 - 1) * 20,
      scale: 0.78 + rnd() * 0.12,
    });
  }
  return { cols, rows, width: cols * CELL, height: rows * CELL, tiles };
}

const SHAPES = [
  (f: string) => `<circle cx="50" cy="50" r="40" fill="${f}"/>`,
  (f: string) => `<rect x="12" y="12" width="76" height="76" rx="8" fill="${f}"/>`,
  (f: string) => `<polygon points="50,8 92,88 8,88" fill="${f}"/>`,
  (f: string) => `<polygon points="50,6 62,38 96,38 68,58 80,92 50,72 20,92 32,58 4,38 38,38" fill="${f}"/>`,
  (f: string) => `<polygon points="50,6 94,50 50,94 6,50" fill="${f}"/>`,
  (f: string) => `<rect x="6" y="30" width="88" height="40" rx="20" fill="${f}"/>`,
  (f: string) => `<polygon points="30,8 70,8 94,50 70,92 30,92 6,50" fill="${f}"/>`,
  (f: string) => `<path d="M50 90 C-10 45 25 5 50 32 C75 5 110 45 50 90Z" fill="${f}"/>`,
];

export function placeholderSvg(index: number): string {
  const hue = (index * 47) % 360;
  const fill = `hsl(${hue} 70% 55%)`;
  const shape = SHAPES[index % SHAPES.length](fill);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">` +
    `${shape}<text x="50" y="58" font-family="sans-serif" font-size="26" font-weight="700" ` +
    `text-anchor="middle" fill="#fff" stroke="#0006" stroke-width="1">${index}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function fakeImages(board: Board): Record<string, string> {
  const out: Record<string, string> = {};
  board.tiles.forEach((t, i) => {
    out[t.pictureId] = placeholderSvg(i);
  });
  return out;
}
