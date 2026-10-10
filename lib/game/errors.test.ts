import { describe, expect, it } from "vitest";
import { rpcErrorMessage } from "./errors";

describe("rpcErrorMessage", () => {
  it("maps known codes", () => {
    expect(rpcErrorMessage({ message: "lobby_full" })).toMatch(/full/);
    expect(rpcErrorMessage({ message: "invite_expired" })).toMatch(/expired/);
    expect(rpcErrorMessage({ message: "invite_not_found" })).toMatch(/not valid/);
    expect(rpcErrorMessage("game_not_in_lobby")).toMatch(/already started/);
    expect(rpcErrorMessage({ message: "not_enough_players" })).toMatch(/2 players/);
  });
  it("falls back for unknown errors", () => {
    expect(rpcErrorMessage({ message: "boom" })).toMatch(/went wrong/);
    expect(rpcErrorMessage(null)).toMatch(/went wrong/);
  });
});
