"use server";
import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/auth/session";
import { rpcErrorMessage } from "@/lib/game/errors";
import { supabaseServer } from "@/lib/supabase/server";

export interface NewGameState {
  error?: string;
}

export async function createGame(_prev: NewGameState, formData: FormData): Promise<NewGameState> {
  await requireUserId("/new");
  const rounds = Number(formData.get("rounds"));
  const boardSize = Number(formData.get("board_size"));
  const monochrome = formData.get("monochrome") === "on";
  const layout = formData.get("scatter") === "on" ? "scatter" : "grid";
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("create_game", { rounds, board_size: boardSize, monochrome, layout });
  if (error) return { error: rpcErrorMessage(error) };
  const gameId = (data as unknown as { game_id: string }).game_id;
  redirect(`/g/${gameId}`);
}
