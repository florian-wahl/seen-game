"use client";

import { useEffect, useRef, type RefObject } from "react";
import { GestureMachine, type GestureEvent } from "./gestures";

export interface BoardGestureHandlers {
  /** Screen-space pan delta in CSS px. */
  onPan(dx: number, dy: number): void;
  /** Zoom by factor around a canvas-space point, plus midpoint drag. */
  onZoom(cx: number, cy: number, factor: number, dx: number, dy: number): void;
  /** Canvas-space tap position in CSS px. */
  onTap(x: number, y: number): void;
}

export function useBoardGestures(
  ref: RefObject<HTMLCanvasElement | null>,
  handlers: BoardGestureHandlers,
): void {
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const machine = new GestureMachine();
    let raf = 0;
    let lastFrame = 0;

    const local = (e: PointerEvent | WheelEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const dispatch = (events: GestureEvent[]) => {
      const h = handlersRef.current;
      for (const ev of events) {
        if (ev.type === "pan") h.onPan(ev.dx, ev.dy);
        else if (ev.type === "pinch") h.onZoom(ev.cx, ev.cy, ev.factor, ev.dx, ev.dy);
        else h.onTap(ev.x, ev.y);
      }
    };

    const tick = (now: number) => {
      const step = machine.stepInertia(Math.min(64, now - lastFrame));
      lastFrame = now;
      if (step) handlersRef.current.onPan(step.dx, step.dy);
      raf = machine.inertiaActive ? requestAnimationFrame(tick) : 0;
    };
    const startInertiaLoop = () => {
      if (machine.inertiaActive && !raf) {
        lastFrame = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };

    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* pointer already gone */
      }
      const p = local(e);
      dispatch(machine.pointerDown(e.pointerId, p.x, p.y, e.timeStamp));
    };
    const move = (e: PointerEvent) => {
      const p = local(e);
      dispatch(machine.pointerMove(e.pointerId, p.x, p.y, e.timeStamp));
    };
    const up = (e: PointerEvent) => {
      dispatch(machine.pointerUp(e.pointerId, e.timeStamp));
      startInertiaLoop();
    };
    const cancel = (e: PointerEvent) => machine.pointerCancel(e.pointerId);
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16;
      else if (e.deltaMode === 2) dy *= 400;
      // ctrlKey = trackpad pinch (small deltas), so scale it up.
      const k = e.ctrlKey ? 0.01 : 0.0015;
      handlersRef.current.onZoom(p.x, p.y, Math.exp(-dy * k), 0, 0);
    };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", cancel);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", cancel);
      el.removeEventListener("wheel", wheel);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ref]);
}
