"use client";
// Read-only board for studying between rounds. Taps do nothing.
import { useEffect, useMemo, useState } from "react";
import { LinkButton } from "@/components/ui/Button";
import { BoardCanvas } from "@/components/board/BoardCanvas";
import { boardFromTiles } from "@/lib/game/boardFromTiles";
import { loadImageMap } from "@/lib/library";
import type { Tile } from "@/lib/board/types";

const noop = () => {};

export function BoardStudy({ gameId, tiles, boardSize }: { gameId: string; tiles: Tile[]; boardSize: number }) {
  const [images, setImages] = useState<Record<string, string> | null>(null);
  const board = useMemo(() => boardFromTiles(tiles, boardSize), [tiles, boardSize]);
  const unlocked = tiles.length > 0;

  useEffect(() => {
    if (!unlocked) return;
    let cancelled = false;
    void loadImageMap().then((m) => !cancelled && setImages(m));
    return () => {
      cancelled = true;
    };
  }, [unlocked]);

  useEffect(() => {
    const el = document.documentElement;
    const prev = el.style.overscrollBehavior;
    el.style.overscrollBehavior = "none";
    return () => {
      el.style.overscrollBehavior = prev;
    };
  }, []);

  if (!unlocked) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-1 flex-col items-center justify-center gap-4 p-6 text-center" data-testid="board-locked">
        <h1 className="font-wide text-xl font-black uppercase tracking-tight text-cream">The board unlocks after your first round</h1>
        <p className="text-muted">Everyone plays on the same board. Once you have drawn your first picture you can study it here between rounds.</p>
        <LinkButton href={`/g/${gameId}`} variant="light" data-testid="back-to-game">
          Back to game
        </LinkButton>
      </main>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-ink text-cream" data-testid="board-study">
      <div className="flex items-center justify-between gap-3 px-4 py-2" style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}>
        <div className="min-w-0">
          <span className="block font-wide text-xl font-black uppercase tracking-tight text-cream">Board</span>
          <span className="block text-xs text-muted">Study it between rounds. Taps do nothing.</span>
        </div>
        <LinkButton href={`/g/${gameId}`} variant="light" className="min-h-11 px-5 text-sm" data-testid="back-to-game">
          Back
        </LinkButton>
      </div>
      <div className="mx-2 mb-2 min-h-0 flex-1 overflow-hidden rounded-[22px]" style={{ marginBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
        <div className="relative h-full min-h-0">
          {images && <BoardCanvas board={board} images={images} onTap={noop} className="absolute inset-0" />}
        </div>
      </div>
    </div>
  );
}
