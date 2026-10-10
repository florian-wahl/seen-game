"use client";
// Read-only board for studying between rounds. Taps do nothing.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
        <h1 className="text-xl font-bold">The board unlocks after your first round</h1>
        <p className="text-stone-600">Everyone plays on the same board. Once you have drawn your first picture you can study it here between rounds.</p>
        <Link href={`/g/${gameId}`} className="rounded-full bg-stone-900 px-6 py-3 font-semibold text-white" data-testid="back-to-game">
          Back to game
        </Link>
      </main>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-white text-stone-900" data-testid="board-study">
      <div className="flex items-center justify-between border-b border-stone-200 px-3 py-2" style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}>
        <span className="font-semibold">Board</span>
        <Link href={`/g/${gameId}`} className="rounded-full bg-stone-900 px-4 py-1.5 text-sm font-semibold text-white" data-testid="back-to-game">
          Back
        </Link>
      </div>
      <div className="relative min-h-0 flex-1">
        {images && <BoardCanvas board={board} images={images} onTap={noop} className="absolute inset-0" />}
      </div>
    </div>
  );
}
