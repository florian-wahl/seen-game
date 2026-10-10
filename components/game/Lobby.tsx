"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startGameAction } from "@/app/g/[id]/actions";
import { rpcErrorMessage } from "@/lib/game/errors";
import { useGameState } from "@/lib/game/useGameState";
import type { GameState } from "@/lib/game/types";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card, ErrorNote } from "@/components/ui/Card";
import { ShareLink } from "@/components/ui/ShareLink";
import { Page } from "@/components/ui/Shell";

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;

export function Lobby({ gameId, initial }: { gameId: string; initial: GameState }) {
  const router = useRouter();
  const { state: live, refresh } = useGameState(gameId, initial);
  const state = live ?? initial;
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [starting, startTransition] = useTransition();
  const [leaving, setLeaving] = useState(false);

  const status = state.game.status;
  useEffect(() => {
    // Game started (or was cancelled): let the server component render the right view.
    if (status !== "lobby") router.refresh();
  }, [status, router]);

  const isHost = state.game.host_id === state.me.user_id;
  const players = state.players.filter((p) => p.status === "active");
  const canStart = players.length >= MIN_PLAYERS && players.length <= MAX_PLAYERS;
  const token = state.invite?.token;

  function start() {
    setError(null);
    startTransition(async () => {
      const res = await startGameAction(gameId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      await refresh();
      router.refresh();
    });
  }

  async function leave() {
    setLeaving(true);
    setError(null);
    const { error: err } = await supabaseBrowser().rpc("retire", { game_id: gameId });
    if (err) {
      setLeaving(false);
      setConfirm(false);
      setError(rpcErrorMessage(err));
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <Page>
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Game lobby</h1>
        <p className="mt-1 text-slate-600" data-testid="settings">
          {state.game.rounds_per_player} rounds each · {state.game.board_size} pictures
        </p>
      </div>

      <Card className="flex flex-col gap-1">
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="font-semibold">Players</h2>
          <span className="text-sm text-slate-500" data-testid="player-count">
            {players.length} of {MAX_PLAYERS}
          </span>
        </div>
        <ul className="flex flex-col" data-testid="player-list">
          {players.map((p) => (
            <li key={p.user_id} className="flex min-h-12 items-center gap-3">
              <Avatar name={p.display_name} url={p.avatar_url} size={36} />
              <span className="min-w-0 flex-1 truncate font-medium">
                {p.display_name}
                {p.user_id === state.me.user_id ? " (you)" : ""}
              </span>
              {p.is_host ? (
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                  Host
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>

      {isHost && token ? (
        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold">Invite friends</h2>
          <p className="text-sm text-slate-600">Anyone with this link can join until the game starts.</p>
          <ShareLink
            path={`/join/${token}`}
            title="Join my game of Seen!"
            text="Join my game of Seen! and try to find the picture faster than me."
          />
        </Card>
      ) : null}

      <ErrorNote>{error}</ErrorNote>

      {confirm ? (
        <Card className="flex flex-col gap-3" role="alertdialog" aria-label="Confirm">
          <p className="font-semibold">
            {isHost ? "Cancel this game for everyone?" : "Leave this game?"}
          </p>
          <p className="text-sm text-slate-600">
            {isHost
              ? "The lobby will be closed and the invite link stops working."
              : "You can rejoin later with the invite link while the lobby is open."}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setConfirm(false)} disabled={leaving}>
              Keep it
            </Button>
            <Button variant="danger" onClick={leave} disabled={leaving} data-testid="confirm-leave">
              {leaving ? "…" : isHost ? "Cancel game" : "Leave"}
            </Button>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {isHost ? (
            <>
              <Button onClick={start} disabled={!canStart || starting} className="min-h-14 text-lg" data-testid="start-game">
                {starting ? "Starting…" : "Start game"}
              </Button>
              {!canStart ? (
                <p className="text-center text-sm text-slate-500">
                  Waiting for at least {MIN_PLAYERS} players. Share the invite link above.
                </p>
              ) : null}
              <Button variant="danger" onClick={() => setConfirm(true)} data-testid="cancel-game">
                Cancel game
              </Button>
            </>
          ) : (
            <>
              <p className="rounded-2xl bg-white p-4 text-center text-slate-700 ring-1 ring-slate-200" data-testid="waiting-host">
                Waiting for the host to start the game…
              </p>
              <Button variant="danger" onClick={() => setConfirm(true)} data-testid="leave-game">
                Leave
              </Button>
            </>
          )}
        </div>
      )}
    </Page>
  );
}
