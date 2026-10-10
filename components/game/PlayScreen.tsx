"use client";
// Solo timed round: Ready -> Round -> Round result (docs/DESIGN.md §2, §5, §6).
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BoardCanvas, type BoardCanvasHandle } from "@/components/board/BoardCanvas";
import { sharedBitmapCache } from "@/components/board/bitmapCache";
import { loadImageMap } from "@/lib/library";
import { boardFromTiles } from "@/lib/game/boardFromTiles";
import { clockOffset, displayMs, formatSeconds, isExpired, type ClockInput } from "@/lib/game/clock";
import { nextSeq } from "@/lib/game/tapSeq";
import { drawTarget, fetchGameState, friendlyError, RpcError, submitTap, withRetry } from "@/lib/game/rpc";
import { formatTotal } from "@/lib/game/format";
import type { DrawResult, GameState, Turn } from "@/lib/game/types";
import type { Tile } from "@/lib/board/types";
import { testHooksEnabled } from "@/lib/testHooks";

export interface PlayScreenProps {
  gameId: string;
  /** The player's current turn when the page was rendered. */
  initialTurn: Turn;
  penaltyMs: number;
  capMs: number;
  boardSize: number;
  rounds: number;
}

interface Round {
  turnId: string;
  drawnAtMs: number;
  offsetMs: number;
  target: string;
  wrongTaps: number;
  tiles: Tile[];
  round: number;
}

type Phase = "ready" | "drawing" | "round" | "closing" | "result" | "blocked";

const PRELOAD_CHUNK = 40;

declare global {
  interface Window {
    /** Test only (see lib/testHooks.ts). */
    __seenTest?: { tap(pictureId: string | null): void; target(): string | null };
  }
}

export function PlayScreen(props: PlayScreenProps) {
  const { gameId, initialTurn, penaltyMs, capMs, boardSize, rounds } = props;

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
          await sharedBitmapCache.preload(Object.fromEntries(entries.slice(i, i + PRELOAD_CHUNK)));
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
  }, []);

  const board = useMemo(() => (round ? boardFromTiles(round.tiles, boardSize) : null), [round, boardSize]);
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
    if (phaseRef.current === "drawing" || phaseRef.current === "round") return;
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
        offsetMs: offset,
        target: d.target_picture_id,
        wrongTaps: d.wrong_taps,
        tiles: d.tiles,
        round: d.turn.round,
      };
      roundRef.current = r;
      setRound(r);
      setPhaseBoth("round");
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
        <h1 className="text-xl font-bold">Cannot continue</h1>
        <p className="text-stone-600" data-testid="error-message">
          {message}
        </p>
        <Link href={backHref} className="rounded-full bg-stone-900 px-6 py-3 font-semibold text-white" data-testid="back-to-game">
          Back to game
        </Link>
      </Centered>
    );
  }

  if (phase === "ready" || phase === "drawing") {
    return (
      <Centered>
        <p className="text-sm font-medium uppercase tracking-wide text-stone-500">
          Round {initialTurn.round} of {rounds}
        </p>
        <h1 className="text-3xl font-extrabold">Ready?</h1>
        <p className="max-w-xs text-stone-600">
          Nothing is timed yet. The clock starts the moment you tap <b>Draw</b>. Find the picture on the board as fast as you can.
          A wrong tap adds 5 seconds.
        </p>
        <div className="w-full max-w-xs" aria-live="polite">
          <div className="h-2 overflow-hidden rounded-full bg-stone-200">
            <div
              className="h-full bg-emerald-500 transition-[width]"
              style={{ width: `${total ? Math.round((loaded / total) * 100) : 0}%` }}
              data-testid="preload-bar"
            />
          </div>
          <p className="mt-1 text-xs text-stone-500">{ready ? "Pictures ready" : `Loading pictures… ${loaded}/${total || "?"}`}</p>
        </div>
        {message && <p className="text-sm text-red-700">{message}</p>}
        <button
          className="w-full max-w-xs rounded-2xl bg-emerald-600 px-6 py-5 text-2xl font-extrabold text-white shadow disabled:bg-stone-300 disabled:shadow-none"
          disabled={!ready || phase === "drawing"}
          onClick={() => void draw()}
          data-testid="draw"
        >
          {phase === "drawing" ? "Drawing…" : "Draw"}
        </button>
        <Link href={backHref} className="text-sm text-stone-500 underline">
          Back to game
        </Link>
      </Centered>
    );
  }

  // round | closing | result
  const timeUp = closed ? closed.status !== "found" : phase === "closing";
  return (
    <div className="fixed inset-0 flex flex-col bg-white text-stone-900" style={{ overscrollBehavior: "none" }} data-testid="round-screen">
      <div className="flex items-center gap-3 border-b border-stone-200 px-3 py-2" style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}>
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-stone-100">
          {targetUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={targetUrl} alt="Find this picture" className="h-14 w-14" data-testid="target" data-picture-id={round?.target} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className={`font-mono text-3xl tabular-nums ${timeUp ? "text-red-600" : ""}`} data-testid="clock">
            {formatSeconds(shownMs)} s
          </div>
          <div className="text-xs text-stone-500" data-testid="wrong-count">
            {round?.wrongTaps ?? 0} wrong · +{(((round?.wrongTaps ?? 0) * penaltyMs) / 1000).toFixed(0)} s
          </div>
        </div>
        <div className="text-right text-xs text-stone-500">
          Round {round?.round}/{rounds}
          {busy && <div className="text-stone-400">…</div>}
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        {board && images && (
          <BoardCanvas
            ref={boardRef}
            board={board}
            images={images}
            onTap={(id) => void onTap(id)}
            className="absolute inset-0"
          />
        )}
        {phase === "closing" && (
          <div className="absolute inset-x-0 top-4 text-center">
            <span className="rounded-full bg-red-600 px-4 py-2 font-bold text-white">Time&apos;s up</span>
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
      className="absolute inset-x-0 bottom-0 max-h-[85%] overflow-y-auto rounded-t-3xl border-t border-stone-200 bg-white p-5 shadow-2xl"
      style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      data-testid="round-result"
      data-status={turn.status}
    >
      <h2 className={`text-2xl font-extrabold ${found ? "text-emerald-700" : "text-red-600"}`}>
        {found ? "Found it!" : turn.status === "capped" ? "Time's up" : "Round over"}
      </h2>
      <div className="mt-1 flex items-baseline gap-4">
        <span className="font-mono text-4xl tabular-nums" data-testid="result-score">
          {formatTotal(turn.score_ms ?? 0)}
        </span>
        <span className="text-sm text-stone-500" data-testid="result-wrong">
          {turn.wrong_taps} wrong {turn.wrong_taps === 1 ? "tap" : "taps"}
        </span>
      </div>
      {standings && (
        <ol className="mt-4 flex flex-col gap-1 text-sm" data-testid="standings">
          {standings.players.map((p) => (
            <li key={p.user_id} className={`flex items-center justify-between rounded-lg px-3 py-1.5 ${p.user_id === standings.me.user_id ? "bg-stone-100 font-semibold" : ""}`}>
              <span className="truncate">
                {p.status === "retired" ? "–" : (p.rank ?? "")} {p.display_name}
              </span>
              <span className="tabular-nums">{p.turns_done > 0 ? formatTotal(p.total_ms) : "—"}</span>
            </li>
          ))}
        </ol>
      )}
      <Link
        href={backHref}
        className="mt-5 block rounded-2xl bg-stone-900 px-6 py-4 text-center text-lg font-bold text-white"
        data-testid="back-to-game"
      >
        {gameFinished ? "See final results" : "Back to game"}
      </Link>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      {children}
    </main>
  );
}
