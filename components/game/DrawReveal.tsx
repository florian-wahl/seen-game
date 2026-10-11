"use client";
// Draw reveal: the drawn target is shown large, then flies (FLIP) into the header slot.
// Timing is driven by `endAtMs` (client time of the official start, drawn_at - clock offset),
// not by fixed delays: a slow network shortens the hold, it never shifts the start.
// The opaque cover over the board is rendered by PlayScreen; this is only the flying card.
import { useEffect, useRef } from "react";

export const REVEAL_FLIGHT_MS = 400;

export interface DrawRevealProps {
  src: string | undefined;
  pictureId: string;
  /** Client-clock (Date.now()) instant at which the reveal ends and the board is revealed. */
  endAtMs: number;
  /** Bounding rect of the small target slot in the round header. */
  getTargetRect(): DOMRect | null;
}

export function DrawReveal({ src, pictureId, endAtMs, getTargetRect }: DrawRevealProps) {
  const cardRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let timer = 0;
    let anim: Animation | undefined;

    const fly = () => {
      const remaining = Math.max(0, endAtMs - Date.now());
      const target = getTargetRect();
      if (!target || remaining <= 0) return;
      const from = card.getBoundingClientRect();
      const dx = target.left + target.width / 2 - (from.left + from.width / 2);
      const dy = target.top + target.height / 2 - (from.top + from.height / 2);
      const scale = target.width / from.width;
      anim = card.animate(
        [{ transform: "translate(0px, 0px) scale(1)" }, { transform: `translate(${dx}px, ${dy}px) scale(${scale})` }],
        {
          duration: Math.min(REVEAL_FLIGHT_MS, remaining),
          easing: "cubic-bezier(0.4, 0, 0.2, 1)",
          fill: "forwards",
        },
      );
    };

    if (!reduced) {
      // Hold, then fly so that the flight ends exactly at the reveal end.
      const wait = () => {
        const left = endAtMs - Date.now() - REVEAL_FLIGHT_MS;
        if (left > 4) timer = window.setTimeout(wait, left);
        else fly();
      };
      wait();
    }
    return () => {
      window.clearTimeout(timer);
      anim?.cancel();
    };
  }, [endAtMs, getTargetRect]);

  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center" data-testid="reveal">
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={cardRef}
          src={src}
          alt=""
          data-testid="reveal-card"
          data-picture-id={pictureId}
          className="will-change-transform"
          style={{ width: "min(70vw, 70dvh)", height: "min(70vw, 70dvh)", objectFit: "contain" }}
        />
      )}
    </div>
  );
}
