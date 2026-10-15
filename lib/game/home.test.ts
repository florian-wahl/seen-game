import { describe, expect, it } from "vitest";
import { finishedStatus, groupGames, joinNames, type HomeGame, type HomePlayer } from "./home";

const mk = (id: string, over: Partial<HomeGame>): HomeGame => ({
  id, status: "in_progress", hostId: "h", players: [], turnUserId: null,
  createdAt: "2026-01-01T00:00:00Z", finishedAt: null, ...over,
});

describe("groupGames", () => {
  it("splits by status and turn", () => {
    const g = groupGames(
      [
        mk("a", { turnUserId: "me" }),
        mk("b", { turnUserId: "x" }),
        mk("c", { status: "lobby" }),
        mk("d", { status: "finished", finishedAt: "2026-02-01T00:00:00Z" }),
        mk("e", { status: "abandoned" }),
      ],
      "me",
    );
    expect(g.yourTurn.map((x) => x.id)).toEqual(["a"]);
    expect(g.waiting.map((x) => x.id)).toEqual(["b"]);
    expect(g.lobbies.map((x) => x.id)).toEqual(["c"]);
    expect(g.finished.map((x) => x.id)).toEqual(["d"]);
  });
  it("keeps the 10 most recently finished", () => {
    const games = Array.from({ length: 14 }, (_, i) =>
      mk(`f${i}`, { status: "finished", finishedAt: new Date(2026, 0, i + 1).toISOString() }),
    );
    const g = groupGames(games, "me");
    expect(g.finished).toHaveLength(10);
    expect(g.finished[0].id).toBe("f13");
  });
});

describe("joinNames", () => {
  it("formats lists", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["A"])).toBe("A");
    expect(joinNames(["A", "B"])).toBe("A and B");
    expect(joinNames(["A", "B", "C"])).toBe("A, B and C");
  });
});

describe("finishedStatus", () => {
  const pl = (userId: string, totalMs: number, wrongTaps = 0, status: HomePlayer["status"] = "active"): HomePlayer => ({
    userId, name: userId.toUpperCase(), status, totalMs, wrongTaps,
  });
  const st = (players: HomePlayer[]) => finishedStatus(mk("g", { status: "finished", players }), "me");
  it("you won", () => expect(st([pl("me", 100), pl("x", 200)])).toBe("Finished · You won"));
  it("won by another uses their name", () => expect(st([pl("me", 300), pl("x", 200)])).toBe("Finished · Won by X"));
  it("tie on time and wrong taps", () => expect(st([pl("me", 100, 1), pl("x", 100, 1)])).toBe("Finished · Tie"));
  it("equal time, fewer wrong taps wins", () => expect(st([pl("me", 100, 2), pl("x", 100, 1)])).toBe("Finished · Won by X"));
  it("ignores a retired player with the lowest time", () =>
    expect(st([pl("me", 300), pl("x", 50, 0, "retired")])).toBe("Finished · You won"));
  it("no active players", () => expect(st([pl("x", 50, 0, "retired")])).toBe("Finished"));
});
