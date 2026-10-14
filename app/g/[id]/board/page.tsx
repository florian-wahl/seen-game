import type { Viewport } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { BoardStudy } from "@/components/game/BoardStudy";
import { requireUserId } from "@/lib/auth/session";
import type { GameState } from "@/lib/game/types";
import type { Tile } from "@/lib/board/types";
import { supabaseServer } from "@/lib/supabase/server";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function BoardPage({ params }: PageProps<"/g/[id]/board">) {
  return (
    <Suspense fallback={<p className="p-6 text-center text-stone-500">Loading…</p>}>
      <Loaded params={params} />
    </Suspense>
  );
}

async function Loaded({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUserId(`/g/${id}/board`);
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("game_state", { game_id: id });
  if (error || !data) redirect(`/g/${id}`);
  const state = data as unknown as GameState;

  // RLS returns rows only after this player's first draw.
  const { data: rows } = await supabase
    .from("board_tiles")
    .select("picture_id,x,y,rotation,scale")
    .eq("game_id", id);
  const tiles: Tile[] = (rows ?? []).map((r) => ({
    pictureId: r.picture_id,
    x: r.x,
    y: r.y,
    rotation: r.rotation,
    scale: r.scale,
  }));

  return <BoardStudy gameId={id} tiles={tiles} boardSize={state.game.board_size} monochrome={state.game.monochrome} />;
}
