import type { Viewport } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { PlayScreen } from "@/components/game/PlayScreen";
import { requireUserId } from "@/lib/auth/session";
import type { GameState } from "@/lib/game/types";
import { supabaseServer } from "@/lib/supabase/server";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function PlayPage({ params }: PageProps<"/g/[id]/play">) {
  return (
    <Suspense fallback={<p className="p-6 text-center text-stone-500">Loading…</p>}>
      <Loaded params={params} />
    </Suspense>
  );
}

async function Loaded({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUserId(`/g/${id}/play`);
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("game_state", { game_id: id });
  if (error || !data) redirect(`/g/${id}`);
  const state = data as unknown as GameState;
  const turn = state.current_turn;
  if (state.game.status !== "in_progress" || !state.is_my_turn || !turn) redirect(`/g/${id}`);

  // Keyed by turn: Cache Components keeps visited routes alive (React Activity) with their
  // state, so without a key the next turn would reuse the previous turn's finished screen.
  return (
    <PlayScreen
      key={turn.id}
      gameId={id}
      initialTurn={turn}
      penaltyMs={state.game.penalty_ms}
      capMs={state.game.cap_ms}
      boardSize={state.game.board_size}
      rounds={state.game.rounds_per_player}
    />
  );
}
