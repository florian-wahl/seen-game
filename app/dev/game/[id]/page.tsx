// DEV ONLY: renders <GameView> for a game, standing in for /g/[id] until it exists.
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { GameView } from "@/components/game/GameView";
import type { GameState } from "@/lib/game/types";
import { supabaseServer } from "@/lib/supabase/server";
import { testHooksEnabled } from "@/lib/testHooks";

async function Loaded({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await connection(); // session reads are request-time only (see requireUserId)
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("game_state", { game_id: id });
  if (error || !data) notFound();
  return <GameView gameId={id} initial={data as unknown as GameState} />;
}

export default function DevGamePage({ params }: PageProps<"/dev/game/[id]">) {
  if (!testHooksEnabled) notFound();
  return (
    <Suspense fallback={<p className="p-4">Loading…</p>}>
      <Loaded params={params} />
    </Suspense>
  );
}
