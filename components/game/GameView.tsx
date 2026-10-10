"use client";
// STUB — owned by the game-loop engineer. Rendered by app/g/[id]/page.tsx when the
// game is in_progress, finished or abandoned. Keep this export and prop shape.
import type { GameState } from "@/lib/game/types";

export function GameView({ gameId, initial }: { gameId: string; initial: GameState }) {
  return (
    <div className="p-4">
      Game {gameId} — {initial.game.status}
    </div>
  );
}
