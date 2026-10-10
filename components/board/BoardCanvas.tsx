"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { CELL, type Board } from "@/lib/board/types";
import {
  clampCamera,
  clampZoom,
  initialCamera,
  screenToWorld,
  worldToScreen,
  zoomAround,
  zoomLimits,
  type Camera,
  type Point,
  type Viewport,
} from "./camera";
import { hitTest } from "./hitTest";
import { BitmapCache } from "./bitmapCache";
import { useBoardGestures } from "./useBoardGestures";

export interface BoardCanvasHandle {
  flashWrong(pictureId: string): void;
  markCorrect(pictureId: string): void;
  resetView(): void;
}

export interface BoardCanvasStats {
  fps: number;
  visibleTiles: number;
  zoom: number;
}

export interface BoardCanvasProps {
  board: Board;
  /** pictureId -> SVG URL */
  images: Record<string, string>;
  onTap(pictureId: string | null, worldPoint: Point): void;
  /** Optional perf probe, called at most ~2x per second while drawing. */
  onStats?(stats: BoardCanvasStats): void;
  className?: string;
  ref?: Ref<BoardCanvasHandle>;
}

const FLASH_MS = 600;
const BACKGROUND = "#f4f1ea";

interface Flash {
  pictureId: string;
  start: number;
}

export function BoardCanvas({ board, images, onTap, onStats, className, ref }: BoardCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraRef = useRef<Camera | null>(null);
  const viewportRef = useRef<Viewport>({ width: 0, height: 0 });
  const dprRef = useRef(1);
  const flashesRef = useRef<Flash[]>([]);
  const correctRef = useRef<Set<string>>(new Set());
  const rafRef = useRef(0);
  const cacheRef = useRef<BitmapCache | null>(null);
  const tileIndexRef = useRef<Map<string, Board["tiles"][number]>>(new Map());
  const frameTimesRef = useRef<number[]>([]);
  const lastStatsRef = useRef(0);

  // Latest props, readable from long-lived callbacks.
  const propsRef = useRef({ board, images, onTap, onStats });
  useEffect(() => {
    propsRef.current = { board, images, onTap, onStats };
  });

  const drawRef = useRef<(now: number) => void>(() => {});

  const draw = useCallback((now: number) => {
    rafRef.current = 0;
    const canvas = canvasRef.current;
    const camera = cameraRef.current;
    const { width, height } = viewportRef.current;
    const { board, images, onStats } = propsRef.current;
    const cache = cacheRef.current;
    if (!canvas || !camera || !cache || width === 0 || height === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = dprRef.current;
    const viewport = viewportRef.current;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, width, height);

    const cellPx = CELL * camera.zoom;
    let visible = 0;
    const screenPos = new Map<string, { x: number; y: number; size: number; rot: number }>();

    for (const tile of board.tiles) {
      const size = tile.scale * cellPx;
      const reach = size * 0.75; // half-diagonal upper bound with rotation
      const p = worldToScreen(camera, viewport, tile);
      if (p.x + reach < 0 || p.x - reach > width || p.y + reach < 0 || p.y - reach > height) continue;
      visible++;
      const rot = (tile.rotation * Math.PI) / 180;
      screenPos.set(tile.pictureId, { x: p.x, y: p.y, size, rot });
      const url = images[tile.pictureId];
      if (!url) continue;
      const bmp = cache.get(tile.pictureId, url, size * dpr);
      if (!bmp) continue;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.translate(p.x, p.y);
      ctx.rotate(rot);
      ctx.drawImage(bmp, -size / 2, -size / 2, size, size);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Correct rings (persistent).
    for (const id of correctRef.current) {
      const s = screenPos.get(id);
      if (!s) continue;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot);
      ctx.strokeStyle = "#16a34a";
      ctx.lineWidth = Math.max(3, s.size * 0.06);
      ctx.beginPath();
      ctx.roundRect(-s.size / 2, -s.size / 2, s.size, s.size, s.size * 0.18);
      ctx.stroke();
      ctx.restore();
    }

    // Wrong-tap flashes.
    const flashes = flashesRef.current;
    for (const f of flashes) {
      const t = (now - f.start) / FLASH_MS;
      if (t < 0 || t >= 1) continue;
      const tile = tileIndexRef.current.get(f.pictureId);
      if (!tile) continue;
      const p = worldToScreen(camera, viewport, tile);
      const size = tile.scale * cellPx;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((tile.rotation * Math.PI) / 180);
      ctx.fillStyle = `rgba(220, 38, 38, ${0.5 * (1 - t)})`;
      ctx.beginPath();
      ctx.roundRect(-size / 2, -size / 2, size, size, size * 0.18);
      ctx.fill();
      ctx.restore();
      ctx.save();
      const fontPx = Math.max(16, Math.min(28, size * 0.35));
      ctx.globalAlpha = 1 - t;
      ctx.font = `700 ${fontPx}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const ty = p.y - size / 2 - t * 40;
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#ffffff";
      ctx.strokeText("+5 s", p.x, ty);
      ctx.fillStyle = "#dc2626";
      ctx.fillText("+5 s", p.x, ty);
      ctx.restore();
    }
    flashesRef.current = flashes.filter((f) => now - f.start < FLASH_MS);

    // Perf probe.
    const times = frameTimesRef.current;
    times.push(now);
    while (times.length > 0 && now - times[0] > 1000) times.shift();
    if (onStats && now - lastStatsRef.current > 500) {
      lastStatsRef.current = now;
      onStats({ fps: times.length, visibleTiles: visible, zoom: camera.zoom });
    }

    if (flashesRef.current.length > 0) {
      rafRef.current = requestAnimationFrame((t) => drawRef.current(t));
    }
  }, []);

  useEffect(() => {
    drawRef.current = draw;
  }, [draw]);

  const requestRender = useCallback(() => {
    if (!rafRef.current) rafRef.current = requestAnimationFrame((t) => drawRef.current(t));
  }, []);

  const limits = () => zoomLimits(propsRef.current.board, viewportRef.current);
  const setCamera = (c: Camera) => {
    cameraRef.current = clampCamera(c, propsRef.current.board, viewportRef.current, limits());
    requestRender();
  };

  useImperativeHandle(ref, () => ({
    flashWrong(pictureId) {
      flashesRef.current.push({ pictureId, start: performance.now() });
      requestRender();
    },
    markCorrect(pictureId) {
      correctRef.current.add(pictureId);
      requestRender();
    },
    resetView() {
      correctRef.current.clear();
      if (viewportRef.current.width > 0) {
        cameraRef.current = initialCamera(propsRef.current.board, viewportRef.current);
      }
      requestRender();
    },
  }));

  // Bitmap cache and image preloading.
  useEffect(() => {
    const cache = new BitmapCache();
    cache.onLoad = requestRender;
    cacheRef.current = cache;
    void cache.preload(images);
    requestRender();
    return () => {
      cache.onLoad = null;
      cache.clear();
      cacheRef.current = null;
    };
  }, [images, requestRender]);

  // Board change: re-index, reset view and overlays.
  useEffect(() => {
    tileIndexRef.current = new Map(board.tiles.map((t) => [t.pictureId, t]));
    correctRef.current.clear();
    flashesRef.current = [];
    if (viewportRef.current.width > 0) {
      cameraRef.current = initialCamera(board, viewportRef.current);
    }
    requestRender();
  }, [board, requestRender]);

  // Resize with the container.
  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      const dpr = window.devicePixelRatio || 1;
      if (width === 0 || height === 0) return;
      const prev = viewportRef.current;
      if (width === prev.width && height === prev.height && dpr === dprRef.current) return;
      viewportRef.current = { width, height };
      dprRef.current = dpr;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      const b = propsRef.current.board;
      cameraRef.current = cameraRef.current
        ? clampCamera(cameraRef.current, b, viewportRef.current, zoomLimits(b, viewportRef.current))
        : initialCamera(b, viewportRef.current);
      requestRender();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    window.addEventListener("resize", resize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [requestRender]);

  useBoardGestures(canvasRef, {
    onPan(dx, dy) {
      const c = cameraRef.current;
      if (!c) return;
      setCamera({ ...c, x: c.x - dx / c.zoom, y: c.y - dy / c.zoom });
    },
    onZoom(cx, cy, factor, dx, dy) {
      const c = cameraRef.current;
      if (!c) return;
      const vp = viewportRef.current;
      const lim = limits();
      // Pan by the midpoint drag, then zoom around the (moved) midpoint.
      const panned = { ...c, x: c.x - dx / c.zoom, y: c.y - dy / c.zoom };
      const next = zoomAround(panned, { x: cx, y: cy }, factor, vp, lim);
      setCamera({ ...next, zoom: clampZoom(next.zoom, lim) });
    },
    onTap(x, y) {
      const c = cameraRef.current;
      if (!c) return;
      const world = screenToWorld(c, viewportRef.current, { x, y });
      const { board, onTap } = propsRef.current;
      onTap(hitTest(board, world), world);
    },
  });

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ touchAction: "none", display: "block", width: "100%", height: "100%" }}
    />
  );
}
