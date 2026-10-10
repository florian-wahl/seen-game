import { describe, expect, it } from "vitest";
import { clockOffset, displayMs, formatSeconds, isExpired, rawElapsedMs } from "./clock";

const base = { nowMs: 1_000_000, offsetMs: 0, drawnAtMs: 990_000, wrongTaps: 0, penaltyMs: 5000 };

describe("clock", () => {
  it("computes offset", () => {
    expect(clockOffset(5000, 4000)).toBe(1000);
  });
  it("elapsed = now + offset - drawn_at", () => {
    expect(rawElapsedMs(base)).toBe(10_000);
    expect(rawElapsedMs({ ...base, offsetMs: 2000 })).toBe(12_000);
  });
  it("adds penalties per wrong tap", () => {
    expect(rawElapsedMs({ ...base, wrongTaps: 2 })).toBe(20_000);
  });
  it("never negative", () => {
    expect(rawElapsedMs({ ...base, drawnAtMs: 2_000_000 })).toBe(0);
  });
  it("caps the display and expires at the cap incl. penalties", () => {
    const i = { ...base, wrongTaps: 16 }; // 10 s + 80 s = 90 s
    expect(isExpired(i, 90_000)).toBe(true);
    expect(displayMs({ ...i, wrongTaps: 20 }, 90_000)).toBe(90_000);
    expect(isExpired({ ...base, wrongTaps: 15 }, 90_000)).toBe(false);
  });
  it("formats to 0.1 s, truncating", () => {
    expect(formatSeconds(12_349)).toBe("12.3");
    expect(formatSeconds(0)).toBe("0.0");
    expect(formatSeconds(90_000)).toBe("90.0");
  });
});
