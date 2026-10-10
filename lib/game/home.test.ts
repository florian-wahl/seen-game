import { describe, expect, it } from "vitest";
import { groupGames, joinNames, type HomeGame } from "./home";

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
