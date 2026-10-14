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
import { MonochromeBadge } from "./MonochromeBadge";

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
        <h1 className="font-wide text-3xl font-black uppercase tracking-tight text-cream">Game lobby</h1>
        <p className="mt-1 text-muted" data-testid="settings">
          {state.game.rounds_per_player} rounds each · {state.game.board_size} pictures
        </p>
        {state.game.monochrome && <MonochromeBadge className="mt-2" />}
      </div>

      <Card className="flex flex-col gap-1">
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Players</h2>
          <span className="font-wide text-sm font-extrabold tabular-nums text-cream" data-testid="player-count">
            {players.length} <span className="text-dim">/ {MAX_PLAYERS}</span>
          </span>
        </div>
        <ul className="flex flex-col" data-testid="player-list">
          {players.map((p) => (
            <li key={p.user_id} className="flex min-h-14 items-center gap-3 border-b border-line last:border-0">
              <Avatar name={p.display_name} url={p.avatar_url} size={36} />
              <span className="min-w-0 flex-1 truncate font-bold text-cream">
                {p.display_name}
                {p.user_id === state.me.user_id ? " (you)" : ""}
              </span>
              {p.is_host ? (
                <span className="rounded-full bg-mustard px-2.5 py-1 font-wide text-[11px] font-black uppercase tracking-wide text-ink">
                  Host
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>

      {isHost && token ? (
        <Card className="flex flex-col gap-3">
          <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Invite friends</h2>
          <p className="text-sm text-soft">Anyone with this link can join until the game starts.</p>
          <ShareLink
            path={`/join/${token}`}
            title="Join my game of Seen!"
            text="Join my game of Seen! and try to find the picture faster than me."
          />
        </Card>
      ) : null}

      <ErrorNote>{error}</ErrorNote>

      {confirm ? (
        <Card className="flex flex-col gap-3 shadow-[inset_0_0_0_2px_var(--color-magenta)]" role="alertdialog" aria-label="Confirm">
          <p className="font-bold text-cream">
            {isHost ? "Cancel this game for everyone?" : "Leave this game?"}
          </p>
          <p className="text-sm text-soft">
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
              <Button onClick={start} disabled={!canStart || starting} data-testid="start-game">
                {starting ? "Starting…" : "Start game"}
              </Button>
              {!canStart ? (
                <p className="text-center text-sm text-muted">
                  Waiting for at least {MIN_PLAYERS} players. Share the invite link above.
                </p>
              ) : null}
              <Button variant="danger" onClick={() => setConfirm(true)} data-testid="cancel-game">
                Cancel game
              </Button>
            </>
          ) : (
            <>
              <p className="rounded-2xl bg-surface p-4 text-center text-soft" data-testid="waiting-host">
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
