"use client";
// STUB (polling only). The Realtime engineer replaces the body with the private
// Broadcast channel described in docs/API.md, keeping this exact signature.
import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { GameState } from "./types";

export interface UseGameState {
  state: GameState | null;
  error: Error | null;
  /** Re-fetch now (call after your own RPCs). */
  refresh: () => Promise<void>;
}

export function useGameState(gameId: string, initial?: GameState | null): UseGameState {
  const [state, setState] = useState<GameState | null>(initial ?? null);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    const { data, error } = await supabaseBrowser().rpc("game_state", { game_id: gameId });
    if (error) setError(new Error(error.message));
    else {
      setError(null);
      setState(data as unknown as GameState);
    }
  }, [gameId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    void refresh();
    const id = setInterval(() => void refresh(), 3000);
    return () => clearInterval(id);
  }, [refresh]);

  return { state, error, refresh };
}
