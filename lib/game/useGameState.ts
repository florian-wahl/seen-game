"use client";
// Live game state: fetch `game_state`, then re-fetch whenever the private Broadcast channel
// `game:<id>` says something changed (see docs/API.md "Realtime contract"). Broadcast payloads
// carry no data; they are only a nudge. Also refetches on focus/visibility and (re)subscribe,
// with a 20 s polling fallback.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { GameState } from "./types";

export interface UseGameState {
  state: GameState | null;
  error: Error | null;
  /** Re-fetch now (call after your own RPCs). */
  refresh: () => Promise<void>;
}

const DEBOUNCE_MS = 150;
const POLL_MS = 20_000;

export function useGameState(gameId: string, initial?: GameState | null): UseGameState {
  const [state, setState] = useState<GameState | null>(initial ?? null);
  const [error, setError] = useState<Error | null>(null);
  const requestSeq = useRef(0); // id of the newest request issued
  const appliedSeq = useRef(0); // id of the newest request whose result was applied
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    const seq = ++requestSeq.current;
    const { data, error } = await supabaseBrowser().rpc("game_state", { game_id: gameId });
    // Ignore unmounted callers and out-of-order responses (older than what is already shown).
    if (!alive.current || seq < appliedSeq.current) return;
    appliedSeq.current = seq;
    if (error) setError(new Error(error.message));
    else {
      setError(null);
      setState(data as unknown as GameState);
    }
  }, [gameId]);

  useEffect(() => {
    alive.current = true;
    const supabase = supabaseBrowser();
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const scheduleRefresh = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => void refresh(), DEBOUNCE_MS);
    };

    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    void refresh();

    let channel: ReturnType<typeof supabase.channel> | undefined;
    let cancelled = false;
    void (async () => {
      try {
        await supabase.realtime.setAuth(); // use the current session's JWT for the private channel
      } catch {
        // polling fallback still works
      }
      if (cancelled) return;
      channel = supabase
        .channel(`game:${gameId}`, { config: { private: true } })
        .on("broadcast", { event: "changed" }, scheduleRefresh)
        .subscribe((status) => {
          if (status === "SUBSCRIBED") void refresh(); // catch anything missed while (re)connecting
        });
    })();

    const poll = setInterval(() => void refresh(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      alive.current = false;
      cancelled = true;
      clearTimeout(debounce);
      clearInterval(poll);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [gameId, refresh]);

  return { state, error, refresh };
}
