"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BoardCanvas, type BoardCanvasHandle, type BoardCanvasStats } from "@/components/board/BoardCanvas";
import { generateBoard } from "@/lib/board/generate";
import type { LibraryManifest } from "@/lib/board/types";
import manifestJson from "@/public/library/placeholder/manifest.json";

const manifest = manifestJson as unknown as LibraryManifest;
const LIBRARY_ROOT = "/library/placeholder";
const ALL_IMAGES: Record<string, string> = Object.fromEntries(
  manifest.pictures.map((p) => [p.id, `${LIBRARY_ROOT}/${p.file}`]),
);

const SIZES = [100, 200, 300] as const;

function pickTarget(ids: string[], avoid?: string | null): string {
  let id = ids[Math.floor(Math.random() * ids.length)];
  if (ids.length > 1) while (id === avoid) id = ids[Math.floor(Math.random() * ids.length)];
  return id;
}

export default function DevBoard() {
  const [size, setSize] = useState<(typeof SIZES)[number]>(200);
  const board = useMemo(
    () =>
      generateBoard({
        pictures: manifest.pictures,
        confusables: manifest.confusables,
        size,
        seed: `dev-${size}`,
      }),
    [size],
  );
  const images = ALL_IMAGES;
  const ids = useMemo(() => board.tiles.map((t) => t.pictureId), [board]);

  const [target, setTarget] = useState<string | null>(null);
  const [penaltyMs, setPenaltyMs] = useState(0);
  const [foundMs, setFoundMs] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [start, setStart] = useState(0);
  const handle = useRef<BoardCanvasHandle>(null);
  const [stats, setStats] = useState<BoardCanvasStats | null>(null);

  const newRound = useCallback(
    (avoid?: string | null) => {
      handle.current?.resetView();
      setTarget(pickTarget(ids, avoid));
      setPenaltyMs(0);
      setFoundMs(null);
      const t0 = performance.now();
      setStart(t0);
      setNow(t0);
    },
    [ids],
  );

  useEffect(() => {
    // Start a round on mount and whenever the board changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    newRound();
  }, [newRound]);

  useEffect(() => {
    if (foundMs !== null) return;
    let raf = 0;
    const loop = () => {
      setNow(performance.now());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [foundMs, target]);

  const onTap = useCallback(
    (pictureId: string | null) => {
      if (!pictureId || foundMs !== null || !target) return;
      if (pictureId === target) {
        handle.current?.markCorrect(pictureId);
        setFoundMs(performance.now() - start + penaltyMs);
      } else {
        handle.current?.flashWrong(pictureId);
        setPenaltyMs((p) => p + 5000);
      }
    },
    [foundMs, target, penaltyMs, start],
  );

  const elapsed = foundMs ?? Math.max(0, now - start) + penaltyMs;

  return (
    <div className="fixed inset-0 flex flex-col bg-white text-neutral-900">
      <div className="flex items-center gap-3 border-b border-neutral-200 px-3 py-2">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-neutral-100">
          {target && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={images[target]} alt="target" className="h-14 w-14" data-testid="target" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-3xl tabular-nums" data-testid="clock">
            {(elapsed / 1000).toFixed(1)} s
          </div>
          {foundMs !== null && (
            <div className="text-sm font-semibold text-green-700" data-testid="found">
              Found in {(foundMs / 1000).toFixed(1)} s
            </div>
          )}
        </div>
        {foundMs !== null ? (
          <button
            className="rounded-full bg-neutral-900 px-4 py-2 text-white"
            onClick={() => newRound(target)}
          >
            Next
          </button>
        ) : (
          <select
            className="rounded border border-neutral-300 px-2 py-1"
            value={size}
            onChange={(e) => setSize(Number(e.target.value) as (typeof SIZES)[number])}
            aria-label="Board size"
          >
            {SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="relative min-h-0 flex-1">
        <BoardCanvas
          ref={handle}
          board={board}
          images={images}
          onTap={onTap}
          onStats={setStats}
          className="absolute inset-0"
        />
        <div className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white">
          {stats ? `${stats.fps} fps | ${stats.visibleTiles} tiles | z${stats.zoom.toFixed(2)}` : "..."}
        </div>
      </div>
    </div>
  );
}
