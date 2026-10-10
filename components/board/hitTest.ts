import type { Board } from "@/lib/board/types";
import type { Point } from "./camera";

/** Nearest tile centre within `maxDist` board units (inclusive), else null. */
export function hitTest(board: Board, world: Point, maxDist = 50): string | null {
  let best: string | null = null;
  const max2 = maxDist * maxDist;
  let bestD2 = Infinity;
  for (const t of board.tiles) {
    const dx = t.x - world.x;
    const dy = t.y - world.y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= max2 && d2 < bestD2) {
      bestD2 = d2;
      best = t.pictureId;
    }
  }
  return best;
}
