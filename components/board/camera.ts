import { CELL, type Board } from "@/lib/board/types";

/** x,y = board point at the viewport centre; zoom = CSS px per board unit. */
export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface ZoomLimits {
  min: number;
  default: number;
  max: number;
}

/** CSS px a tile (one grid cell) occupies at maximum zoom. */
export const MAX_TILE_PX = 160;

export function worldToScreen(camera: Camera, viewport: Viewport, p: Point): Point {
  return {
    x: (p.x - camera.x) * camera.zoom + viewport.width / 2,
    y: (p.y - camera.y) * camera.zoom + viewport.height / 2,
  };
}

export function screenToWorld(camera: Camera, viewport: Viewport, p: Point): Point {
  return {
    x: (p.x - viewport.width / 2) / camera.zoom + camera.x,
    y: (p.y - viewport.height / 2) / camera.zoom + camera.y,
  };
}

/**
 * min = whole board width fits the viewport width; default = half the board
 * width visible; max = one tile (grid cell) is MAX_TILE_PX CSS px.
 */
export function zoomLimits(board: Board, viewport: Viewport): ZoomLimits {
  const min = viewport.width / board.width;
  const max = Math.max(MAX_TILE_PX / CELL, min * 2);
  const def = Math.min(Math.max(min * 2, min), max);
  return { min, default: def, max };
}

export function clampZoom(zoom: number, limits: ZoomLimits): number {
  return Math.min(limits.max, Math.max(limits.min, zoom));
}

/** Zoom by `factor` keeping the board point under `screenPoint` fixed. */
export function zoomAround(
  camera: Camera,
  screenPoint: Point,
  factor: number,
  viewport: Viewport,
  limits: ZoomLimits,
): Camera {
  const zoom = clampZoom(camera.zoom * factor, limits);
  const before = screenToWorld(camera, viewport, screenPoint);
  return {
    zoom,
    x: before.x - (screenPoint.x - viewport.width / 2) / zoom,
    y: before.y - (screenPoint.y - viewport.height / 2) / zoom,
  };
}

function clampAxis(c: number, boardSize: number, viewSize: number, zoom: number): number {
  const half = viewSize / 2 / zoom;
  // Board smaller than the viewport on this axis: keep it centred.
  if (half * 2 >= boardSize) return boardSize / 2;
  return Math.min(boardSize - half, Math.max(half, c));
}

/** Keep the viewport inside the board (never shows empty space around it). */
export function clampCamera(
  camera: Camera,
  board: Board,
  viewport: Viewport,
  limits: ZoomLimits,
): Camera {
  const zoom = clampZoom(camera.zoom, limits);
  return {
    zoom,
    x: clampAxis(camera.x, board.width, viewport.width, zoom),
    y: clampAxis(camera.y, board.height, viewport.height, zoom),
  };
}

export function initialCamera(board: Board, viewport: Viewport): Camera {
  const limits = zoomLimits(board, viewport);
  return clampCamera(
    { x: board.width / 2, y: board.height / 2, zoom: limits.default },
    board,
    viewport,
    limits,
  );
}
