"use server";
import { requireUserId } from "@/lib/auth/session";
import { startGame, type StartGameResult } from "@/lib/game/startGame";

export async function startGameAction(gameId: string): Promise<StartGameResult> {
  await requireUserId(`/g/${gameId}`);
  return startGame(gameId);
}
