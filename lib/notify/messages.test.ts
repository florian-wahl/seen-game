import { describe, expect, it } from "vitest";
import { buildMessage, ordinal, plainText, type MessageInput } from "./messages";

const base: Omit<MessageInput, "kind" | "payload"> = {
  gameId: "11111111-1111-1111-1111-111111111111",
  appUrl: "https://seen.example/",
  otherNames: ["Ben", "Cleo"],
  roundsPerPlayer: 5,
};

describe("ordinal", () => {
  it("handles suffixes", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 112].map(ordinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "101st", "112th",
    ]);
  });
});

describe("buildMessage", () => {
  it("your_turn: round, names, play link", () => {
    const m = buildMessage({ ...base, kind: "your_turn", payload: { turn_id: "t", round: 2 } });
    expect(m.subject).toBe("Your turn in Seen!");
    expect(m.body).toContain("Round 2 of 5");
    expect(m.body).toContain("Ben and Cleo");
    expect(m.ctaLabel).toBe("Play your turn");
    expect(m.url).toBe(`https://seen.example/g/${base.gameId}/play`);
    expect(m.pushBody).toContain("Tap to play");
  });

  it("your_turn without a round number still reads fine", () => {
    const m = buildMessage({ ...base, kind: "your_turn", payload: {}, otherNames: [] });
    expect(m.body).toContain("Your next round");
    expect(m.body).not.toContain("with");
  });

  it("reminder: pluralises and links to play", () => {
    const two = buildMessage({ ...base, kind: "reminder", payload: { round: 1 } });
    expect(two.body).toContain("Ben and Cleo are waiting");
    const one = buildMessage({ ...base, kind: "reminder", payload: {}, otherNames: ["Ben"] });
    expect(one.body).toContain("Ben is waiting");
    expect(one.url).toBe(`https://seen.example/g/${base.gameId}/play`);
    expect(one.tag).toBe(buildMessage({ ...base, kind: "your_turn", payload: {} }).tag);
  });

  it("game_finished: winner, other ranks, retired", () => {
    const win = buildMessage({ ...base, kind: "game_finished", payload: { rank: 1, retired: false, total_ms: 42300 } });
    expect(win.heading).toBe("You won!");
    expect(win.body).toContain("42.3 s");
    expect(win.ctaLabel).toBe("See results");
    expect(win.url).toBe(`https://seen.example/g/${base.gameId}`);

    const third = buildMessage({ ...base, kind: "game_finished", payload: { rank: 3, retired: false, total_ms: 90000 } });
    expect(third.heading).toBe("You finished 3rd");

    const out = buildMessage({ ...base, kind: "game_finished", payload: { rank: null, retired: true } });
    expect(out.heading).toBe("The game is over");
  });

  it("plainText contains the link and the button label", () => {
    const m = buildMessage({ ...base, kind: "your_turn", payload: { round: 1 } });
    const t = plainText(m);
    expect(t).toContain(m.url);
    expect(t).toContain("Play your turn");
  });
});
