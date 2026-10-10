import "server-only";
import { generateBoard } from "@/lib/board/generate";
import type { ConfusablePair, Picture } from "@/lib/board/types";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { rpcErrorMessage } from "./errors";
import type { GameState } from "./types";

export type StartGameResult = { ok: true } | { ok: false; error: string };

/**
 * Host-only. Verifies the caller (via their own RLS-bound game_state), generates
 * the board server side, then calls start_game_internal with the service role.
 */
export async function startGame(gameId: string): Promise<StartGameResult> {
  const user = await supabaseServer();
  const { data, error } = await user.rpc("game_state", { game_id: gameId });
  if (error) return { ok: false, error: rpcErrorMessage(error) };
  const state = data as unknown as GameState;

  if (state.game.host_id !== state.me.user_id) {
    return { ok: false, error: "Only the host can start the game." };
  }
  if (state.game.status !== "lobby") return { ok: false, error: rpcErrorMessage("game_not_in_lobby") };
  const active = state.players.filter((p) => p.status === "active").length;
  if (active < 2) return { ok: false, error: rpcErrorMessage("not_enough_players") };
  if (active > 6) return { ok: false, error: rpcErrorMessage("lobby_full") };

  const admin = supabaseAdmin();
  const [pics, conf] = await Promise.all([
    admin.from("pictures").select("id, name, category, file_path, review_status").eq("review_status", "approved").limit(5000),
    admin.from("picture_confusables").select("picture_a, picture_b").limit(20000),
  ]);
  if (pics.error || conf.error) return { ok: false, error: "Could not load the picture library. Please try again." };

  const pictures: Picture[] = pics.data.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    file: r.file_path,
    reviewStatus: r.review_status,
  }));
  const confusables: ConfusablePair[] = conf.data.map((r) => [r.picture_a, r.picture_b] as const);

  let tiles;
  try {
    tiles = generateBoard({ pictures, confusables, size: state.game.board_size, seed: state.game.id }).tiles;
  } catch {
    return { ok: false, error: "There are not enough pictures in the library for this board size." };
  }

  const { error: startErr } = await admin.rpc("start_game_internal", {
    game_id: gameId,
    tiles: tiles as unknown as never,
  });
  if (startErr) return { ok: false, error: rpcErrorMessage(startErr) };
  return { ok: true };
}
