import { describe, expect, it } from "vitest";
import { formatTotal, timeAgo } from "./format";

describe("format", () => {
  const now = Date.parse("2026-01-10T12:00:00Z");
  it("timeAgo", () => {
    expect(timeAgo("2026-01-10T11:59:40Z", now)).toBe("just now");
    expect(timeAgo("2026-01-10T11:55:00Z", now)).toBe("5 min ago");
    expect(timeAgo("2026-01-10T09:00:00Z", now)).toBe("3 h ago");
    expect(timeAgo("2026-01-07T12:00:00Z", now)).toBe("3 days ago");
  });
  it("formatTotal", () => {
    expect(formatTotal(123400)).toBe("123.4 s");
  });
});
