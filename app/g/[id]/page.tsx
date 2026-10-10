import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase/server";
import type { GameState } from "@/lib/game/types";
import { GameView } from "@/components/game/GameView";
import { Lobby } from "@/components/game/Lobby";
import { PageSpinner } from "@/components/ui/Shell";

export const metadata: Metadata = { title: "Game" };

export default function GamePage(props: PageProps<"/g/[id]">) {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Game params={props.params} />
    </Suspense>
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function Game({ params }: { params: PageProps<"/g/[id]">["params"] }) {
  const { id } = await params;
  await requireUserId(`/g/${id}`);
  if (!UUID.test(id)) notFound();
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("game_state", { game_id: id });
  if (error || !data) notFound();
  const state = data as unknown as GameState;

  return (
    <>
      <nav className="mx-auto flex w-full max-w-md items-center px-2 pt-[env(safe-area-inset-top)]">
        <Link
          href="/"
          className="inline-flex min-h-12 items-center gap-1 rounded-xl px-3 font-medium text-indigo-700 hover:bg-indigo-50"
        >
          <span aria-hidden>‹</span> Home
        </Link>
      </nav>
      {state.game.status === "lobby" ? (
        <Lobby gameId={id} initial={state} />
      ) : (
        <GameView gameId={id} initial={state} />
      )}
    </>
  );
}
