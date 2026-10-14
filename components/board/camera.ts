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

/**
 * Minimum CSS px of the smallest picture at default zoom (spec: pictures are at
 * least 44 px wide). Pictures are scaled to as little as SCALE_MIN of a cell.
 */
export const MIN_PICTURE_PX = 44;
const SCALE_MIN = 0.78;

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

export interface ZoomOptions {
  /** Allow zooming out until the whole board width fits (board study). Default: zoom out stops at the default zoom. */
  fullZoomOut?: boolean;
}

/**
 * default = half the board width visible, but never so small that a picture
 * drops under MIN_PICTURE_PX; max = one tile (grid cell) is MAX_TILE_PX CSS px;
 * min = the default zoom (seeing more of the board makes a round too easy), or
 * with `fullZoomOut` the zoom at which the whole board width fits the viewport.
 */
export function zoomLimits(board: Board, viewport: Viewport, options: ZoomOptions = {}): ZoomLimits {
  const fit = viewport.width / board.width;
  const max = Math.max(MAX_TILE_PX / CELL, fit * 2);
  const floor = MIN_PICTURE_PX / (SCALE_MIN * CELL);
  const def = Math.min(Math.max(fit * 2, floor), max);
  return { min: options.fullZoomOut ? fit : def, default: def, max };
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
