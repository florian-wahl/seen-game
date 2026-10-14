"use client";
// Solo timed round: Ready -> Round -> Round result (docs/DESIGN.md §2, §5, §6).
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BoardCanvas, type BoardCanvasHandle } from "@/components/board/BoardCanvas";
import { bitmapCacheFor } from "@/components/board/bitmapCache";
import { loadImageMap } from "@/lib/library";
import { boardFromTiles } from "@/lib/game/boardFromTiles";
import { clockOffset, displayMs, formatSeconds, isExpired, type ClockInput } from "@/lib/game/clock";
import { nextSeq } from "@/lib/game/tapSeq";
import { drawTarget, fetchGameState, friendlyError, RpcError, submitTap, withRetry } from "@/lib/game/rpc";
import { formatTotal } from "@/lib/game/format";
import type { DrawResult, GameState, Turn } from "@/lib/game/types";
import type { Tile } from "@/lib/board/types";
import { testHooksEnabled } from "@/lib/testHooks";
import { LinkButton } from "@/components/ui/Button";
import { DrawReveal } from "@/components/game/DrawReveal";

export interface PlayScreenProps {
  gameId: string;
  /** The player's current turn when the page was rendered. */
  initialTurn: Turn;
  penaltyMs: number;
  capMs: number;
  boardSize: number;
  rounds: number;
  /** Every picture in grayscale (game setting). */
  monochrome: boolean;
}

interface Round {
  turnId: string;
  drawnAtMs: number;
  /** Client-clock (Date.now()) time at which the reveal ends = drawn_at - offset. */
  revealEndMs: number;
  offsetMs: number;
  target: string;
  wrongTaps: number;
  tiles: Tile[];
  round: number;
}

type Phase = "ready" | "drawing" | "reveal" | "round" | "closing" | "result" | "blocked";

const PRELOAD_CHUNK = 40;

declare global {
  interface Window {
    /** Test only (see lib/testHooks.ts). */
    __seenTest?: { tap(pictureId: string | null): void; target(): string | null };
  }
}

export function PlayScreen(props: PlayScreenProps) {
  const { gameId, initialTurn, penaltyMs, capMs, boardSize, rounds, monochrome } = props;

  const [images, setImages] = useState<Record<string, string> | null>(null);
  const [loaded, setLoaded] = useState(0);
  const [total, setTotal] = useState(0);
  const [phase, setPhase] = useState<Phase>("ready");
  const [round, setRound] = useState<Round | null>(null);
  const [display, setDisplay] = useState(0);
  const [closed, setClosed] = useState<Turn | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [standings, setStandings] = useState<GameState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const boardRef = useRef<BoardCanvasHandle>(null);
  const phaseRef = useRef<Phase>("ready");
  const roundRef = useRef<Round | null>(null);
  const inFlight = useRef(false);
  const finished = useRef(false);

  const setPhaseBoth = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  // No page scroll / pull-to-refresh bounce during play.
  useEffect(() => {
    const el = document.documentElement;
    const prev = [el.style.overscrollBehavior, document.body.style.overscrollBehavior];
    el.style.overscrollBehavior = "none";
    document.body.style.overscrollBehavior = "none";
    return () => {
      el.style.overscrollBehavior = prev[0];
      document.body.style.overscrollBehavior = prev[1];
    };
  }, []);

  // Library preload with progress.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const map = await loadImageMap();
        if (cancelled) return;
        const entries = Object.entries(map);
        setImages(map);
        setTotal(entries.length);
        for (let i = 0; i < entries.length; i += PRELOAD_CHUNK) {
          await bitmapCacheFor(monochrome).preload(Object.fromEntries(entries.slice(i, i + PRELOAD_CHUNK)));
          if (cancelled) return;
          setLoaded(Math.min(entries.length, i + PRELOAD_CHUNK));
        }
      } catch {
        if (!cancelled) setMessage("Could not load the pictures. Check your connection and reload.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [monochrome]);

  // Keyed on the tiles, not the round: each tap result replaces `round`, and a new board object
  // would make BoardCanvas reset the view and drop the wrong-tap flash.
  const tiles = round?.tiles;
  const board = useMemo(() => (tiles ? boardFromTiles(tiles, boardSize) : null), [tiles, boardSize]);
  const ready = images !== null && total > 0 && loaded >= total;

  const clockInput = useCallback(
    (r: Round, nowMs: number): ClockInput => ({
      nowMs,
      offsetMs: r.offsetMs,
      drawnAtMs: r.drawnAtMs,
      wrongTaps: r.wrongTaps,
      penaltyMs,
    }),
    [penaltyMs],
  );

  const loadStandings = useCallback(async () => {
    try {
      setStandings(await withRetry(() => fetchGameState(gameId)));
    } catch {
      /* standings are a nicety */
    }
  }, [gameId]);

  const finish = useCallback(
    (turn: Turn) => {
      if (finished.current) return;
      finished.current = true;
      setClosed(turn);
      setPhaseBoth("result");
      void loadStandings();
      // Let the green ring show for a moment before the result sheet.
      setTimeout(() => setShowResult(true), turn.status === "found" ? 800 : 0);
    },
    [loadStandings, setPhaseBoth],
  );

  const block = useCallback(
    (e: unknown) => {
      setMessage(friendlyError(e));
      setPhaseBoth("blocked");
    },
    [setPhaseBoth],
  );

  // Draw (idempotent: also resumes a live round after reload).
  const draw = useCallback(async () => {
    if (phaseRef.current === "drawing" || phaseRef.current === "reveal" || phaseRef.current === "round") return;
    setPhaseBoth("drawing");
    try {
      const d: DrawResult = await withRetry(() => drawTarget(gameId));
      if (d.turn.status !== "live") {
        finish(d.turn);
        return;
      }
      const offset = clockOffset(Date.parse(d.server_now), Date.now());
      const r: Round = {
        turnId: d.turn_id,
        drawnAtMs: Date.parse(d.drawn_at),
        revealEndMs: Date.parse(d.drawn_at) - offset,
        offsetMs: offset,
        target: d.target_picture_id,
        wrongTaps: d.wrong_taps,
        tiles: d.tiles,
        round: d.turn.round,
      };
      roundRef.current = r;
      setRound(r);
      setDisplay(0);
      // Still inside the reveal (fresh draw, or reload within 1.2 s): show the card, board covered.
      // Otherwise (reload later) there is no reveal at all.
      setPhaseBoth(Date.now() < r.revealEndMs ? "reveal" : "round");
    } catch (e) {
      block(e);
    }
  }, [gameId, finish, block, setPhaseBoth]);

  // Reload mid-round: skip Ready.
  const resumed = useRef(false);
  useEffect(() => {
    if (initialTurn.status === "live" && !resumed.current) {
      resumed.current = true;
      void draw();
    }
  }, [initialTurn.status, draw]);

  // Close an expired turn on the server and show its result.
  const closeExpired = useCallback(async () => {
    setPhaseBoth("closing");
    for (let i = 0; i < 12 && !finished.current; i++) {
      try {
        const s = await fetchGameState(gameId);
        const t = s.turns.find((x) => x.id === roundRef.current?.turnId);
        if (t && t.status !== "live" && t.status !== "pending") {
          finish(t);
          return;
        }
      } catch (e) {
        if (e instanceof RpcError && !e.network) {
          block(e);
          return;
        }
      }
      await new Promise((r) => setTimeout(r, 600));
    }
  }, [gameId, finish, block, setPhaseBoth]);

  // End of the reveal, driven by the server's drawn_at (client time), not by a fixed delay.
  useEffect(() => {
    if (phase !== "reveal") return;
    let timer = 0;
    const check = () => {
      const r = roundRef.current;
      if (!r || phaseRef.current !== "reveal") return;
      const left = r.revealEndMs - Date.now();
      if (left <= 0) setPhaseBoth("round");
      else timer = window.setTimeout(check, left);
    };
    check();
    return () => window.clearTimeout(timer);
  }, [phase, setPhaseBoth]);

  const targetRef = useRef<HTMLImageElement>(null);
  const getTargetRect = useCallback(() => targetRef.current?.getBoundingClientRect() ?? null, []);

  // Running clock, 0.1 s precision, rAF driven.
  useEffect(() => {
    if (phase !== "round") return;
    let raf = 0;
    let last = -1;
    const frame = () => {
      const r = roundRef.current;
      if (!r || phaseRef.current !== "round") return;
      const input = clockInput(r, Date.now());
      if (isExpired(input, capMs)) {
        setDisplay(capMs);
        void closeExpired();
        return;
      }
      const tenth = Math.floor(displayMs(input, capMs) / 100);
      if (tenth !== last) {
        last = tenth;
        setDisplay(tenth * 100);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [phase, round, capMs, clockInput, closeExpired]);

  const onTap = useCallback(
    async (pictureId: string | null) => {
      const r = roundRef.current;
      if (!pictureId || !r || phaseRef.current !== "round" || inFlight.current) return;
      const input = clockInput(r, Date.now());
      if (isExpired(input, capMs)) return;
      inFlight.current = true;
      setBusy(true);
      const seq = nextSeq(r.turnId);
      const elapsed = Math.max(0, Math.round(Date.now() + r.offsetMs - r.drawnAtMs));
      try {
        const res = await withRetry(() =>
          submitTap({ turnId: r.turnId, pictureId, clientSeq: seq, clientElapsedMs: elapsed }),
        );
        if (res.turn.id !== r.turnId) return;
        const next = { ...r, wrongTaps: res.turn.wrong_taps };
        roundRef.current = next;
        setRound(next);
        if (res.turn.status === "found") {
          boardRef.current?.markCorrect(res.picture_id);
          finish(res.turn);
        } else if (res.turn.status === "live") {
          if (res.counted && !res.correct) boardRef.current?.flashWrong(res.picture_id);
        } else {
          finish(res.turn);
        }
      } catch (e) {
        if (e instanceof RpcError && e.appCode === "turn_not_live") {
          // The turn closed under us (deadline passed): fetch its final state.
          void closeExpired();
        } else {
          block(e);
        }
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [capMs, clockInput, closeExpired, finish, block],
  );

  // Dev/test hook.
  useEffect(() => {
    if (!testHooksEnabled) return;
    window.__seenTest = { tap: (id) => void onTap(id), target: () => roundRef.current?.target ?? null };
    return () => {
      delete window.__seenTest;
    };
  }, [onTap]);

  const backHref = `/g/${gameId}`;
  const targetUrl = round && images ? images[round.target] : undefined;
  const shownMs = closed?.score_ms ?? display;
  const gameFinished = standings?.game.status === "finished";

  if (phase === "blocked") {
    return (
      <Centered>
        <h1 className="font-wide text-2xl font-black uppercase">Cannot continue</h1>
        <p className="text-soft" data-testid="error-message">
          {message}
        </p>
        <LinkButton href={backHref} variant="light" data-testid="back-to-game">
          Back to game
        </LinkButton>
      </Centered>
    );
  }

  if (phase === "ready" || phase === "drawing") {
    const points: { icon: React.ReactNode; text: string }[] = [
      { icon: <ClockIcon />, text: "Nothing is timed yet. The picture is shown for a moment, then the clock starts." },
      { icon: <MagnifierIcon />, text: "Find the picture on the board as fast as you can. A wrong tap adds 5 seconds." },
      { icon: <MoveIcon />, text: "The board is bigger than your screen. Drag it to move around." },
    ];
    const drawDisabled = !ready || phase === "drawing";
    return (
      <Centered>
        <p className="font-wide text-sm font-bold uppercase tracking-widest text-muted">
          Round {initialTurn.round} of {rounds}
        </p>
        <h1 className="font-wide text-[64px] font-black uppercase leading-none">
          Ready<span className="text-mustard">?</span>
        </h1>
        <div className="flex h-[132px] w-[132px] items-center justify-center rounded-[28px] bg-paper" aria-hidden="true">
          <span className="font-wide text-[88px] font-black leading-none text-[#c9c3b8]">?</span>
        </div>
        <ul className="flex w-full max-w-xs flex-col gap-3 text-left">
          {points.map((pt) => (
            <li key={pt.text} className="flex items-start gap-3 text-soft">
              <span className="mt-0.5 shrink-0 text-mustard">{pt.icon}</span>
              <span>{pt.text}</span>
            </li>
          ))}
        </ul>
        <div className="w-full max-w-xs" aria-live="polite">
          <div className="h-2 overflow-hidden rounded-full bg-surface">
            <div
              className="h-full bg-teal transition-[width]"
              style={{ width: `${total ? Math.round((loaded / total) * 100) : 0}%` }}
              data-testid="preload-bar"
            />
          </div>
          <p className="mt-1 text-xs text-muted">{ready ? "Pictures ready" : `Loading pictures… ${loaded}/${total || "?"}`}</p>
        </div>
        {message && <p className="text-sm text-[#f08aba]">{message}</p>}
        <button
          className={`min-h-[76px] w-full max-w-xs rounded-full font-wide text-[30px] font-black uppercase tracking-wide transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mustard disabled:cursor-not-allowed ${
            drawDisabled ? "bg-surface text-dim" : "bg-mustard text-ink shadow-[0_0_36px_rgba(245,185,63,.35)]"
          }`}
          disabled={drawDisabled}
          onClick={() => void draw()}
          data-testid="draw"
        >
          {phase === "drawing" ? "Drawing…" : "Draw"}
        </button>
        <Link href={backHref} className="inline-flex min-h-11 items-center text-sm text-muted underline">
          Back to game
        </Link>
      </Centered>
    );
  }

  // round | closing | result
  const timeUp = closed ? closed.status !== "found" : phase === "closing";
  const resultFound = phase === "result" && closed?.status === "found";
  const wrongTaps = round?.wrongTaps ?? 0;
  const penaltySecs = ((wrongTaps * penaltyMs) / 1000).toFixed(0);
  const clockColor =
    phase === "reveal" ? "text-dim" : timeUp ? "text-magenta" : phase === "result" ? "text-cream" : "text-mustard";
  const ring = resultFound
    ? "shadow-[0_0_0_3px_var(--color-teal),0_0_24px_rgba(42,167,160,.45)]"
    : "shadow-[0_0_0_3px_var(--color-mustard),0_0_24px_rgba(245,185,63,.4)]";
  const roundNo = round?.round ?? 1;
  return (
    <div className="fixed inset-0 flex flex-col bg-ink text-cream" style={{ overscrollBehavior: "none" }} data-testid="round-screen">
      <div className="flex items-center gap-4 bg-ink px-4 pb-3" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
        <div
          className={`flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-[18px] ${
            phase === "reveal" ? "bg-surface" : `bg-paper ${ring}`
          }`}
        >
          {targetUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={targetRef}
              src={targetUrl}
              alt="Find this picture"
              className={`h-14 w-14 ${monochrome ? "grayscale" : ""}`}
              style={{ visibility: phase === "reveal" ? "hidden" : "visible" }}
              data-testid="target"
              data-picture-id={round?.target}
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className={`font-wide text-5xl font-extrabold leading-none tabular-nums ${clockColor}`} data-testid="clock">
            {formatSeconds(shownMs)}
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-xs text-muted">
            {wrongTaps > 0 && (
              <span className="whitespace-nowrap rounded-full bg-magenta px-2 py-0.5 font-wide text-[12px] font-black text-ink">
                +{penaltySecs}
              </span>
            )}
            <span className="whitespace-nowrap" data-testid="wrong-count">
              {wrongTaps} wrong
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="font-wide text-[20px] font-black leading-none">
            {roundNo}
            <span className="text-dim">/{rounds}</span>
          </div>
          {/* 20 full-size dots would be wider than the space a phone leaves next to the clock. */}
          <div className={`flex ${rounds > 10 ? "gap-0.5" : "gap-1"}`} aria-hidden="true">
            {Array.from({ length: rounds }, (_, i) => (
              <span
                key={i}
                className={`h-1 ${rounds > 10 ? "w-1.5" : "w-3"} rounded-full ${i < roundNo - 1 ? "bg-cream" : i === roundNo - 1 ? "bg-mustard" : "bg-line-strong"}`}
              />
            ))}
          </div>
          {busy && <div className="text-dim">…</div>}
        </div>
      </div>
      <div
        className="relative mx-2 mb-2 min-h-0 flex-1 overflow-hidden rounded-[22px]"
        style={{ marginBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        {board && images && (
          <BoardCanvas
            ref={boardRef}
            board={board}
            images={images}
            onTap={(id) => void onTap(id)}
            monochrome={monochrome}
            className="absolute inset-0"
          />
        )}
        {phase === "reveal" && (
          // Opaque cover: the board stays hidden and untappable until the reveal ends.
          <div className="absolute inset-0 z-30 bg-paper" data-testid="reveal-cover" />
        )}
        {phase === "closing" && (
          <div className="absolute inset-x-0 top-4 text-center">
            <span className="rounded-full bg-magenta px-4 py-2 font-wide font-black uppercase text-ink">Time&apos;s up</span>
          </div>
        )}
        {showResult && closed && (
          <ResultSheet
            turn={closed}
            standings={standings}
            backHref={backHref}
            gameFinished={gameFinished}
          />
        )}
      </div>
      {phase === "reveal" && round && (
        <DrawReveal src={targetUrl} pictureId={round.target} endAtMs={round.revealEndMs} getTargetRect={getTargetRect} monochrome={monochrome} />
      )}
    </div>
  );
}

function ResultSheet({
  turn,
  standings,
  backHref,
  gameFinished,
}: {
  turn: Turn;
  standings: GameState | null;
  backHref: string;
  gameFinished: boolean;
}) {
  const found = turn.status === "found";
  return (
    <div
      className="absolute inset-x-0 bottom-0 max-h-[85%] overflow-y-auto rounded-t-[22px] bg-ink p-5 text-cream shadow-[0_-12px_40px_rgba(28,27,34,.35)]"
      style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      data-testid="round-result"
      data-status={turn.status}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className={`whitespace-nowrap font-wide text-[26px] font-black uppercase ${found ? "text-teal" : "text-magenta"}`}>
          {found ? "Found it!" : turn.status === "capped" ? "Time's up" : "Round over"}
        </h2>
        <span className="whitespace-nowrap font-wide text-[44px] font-extrabold leading-none tabular-nums" data-testid="result-score">
          {formatTotal(turn.score_ms ?? 0).replace(/ s$/, "")}
          <span className="text-xl"> s</span>
        </span>
      </div>
      <p className="mt-1 text-right text-[13px] text-muted" data-testid="result-wrong">
        {turn.wrong_taps} wrong {turn.wrong_taps === 1 ? "tap" : "taps"}
      </p>
      {standings && (
        <ol className="mt-4 flex flex-col gap-1.5 text-sm" data-testid="standings">
          {standings.players.map((p) => {
            const me = p.user_id === standings.me.user_id;
            return (
              <li
                key={p.user_id}
                className={`flex items-center justify-between rounded-xl px-3 py-2.5 ${me ? "bg-mustard font-black text-ink" : "bg-surface"}`}
              >
                <span className="truncate">
                  <span className={`font-wide font-black ${me ? "text-ink" : "text-muted"}`}>
                    {p.status === "retired" ? "–" : (p.rank ?? "")}
                  </span>{" "}
                  {p.display_name}
                </span>
                <span className="font-wide font-extrabold tabular-nums">{p.turns_done > 0 ? formatTotal(p.total_ms) : "—"}</span>
              </li>
            );
          })}
        </ol>
      )}
      <LinkButton href={backHref} variant="light" className="mt-5 w-full" data-testid="back-to-game">
        {gameFinished ? "See final results" : "Back to game"}
      </LinkButton>
    </div>
  );
}

const iconProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.4,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function ClockIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function MagnifierIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M20 20l-4.9-4.9" />
    </svg>
  );
}

function MoveIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" />
    </svg>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-1 flex-col items-center justify-center gap-5 bg-ink p-6 text-center text-cream">
      {children}
    </main>
  );
}
