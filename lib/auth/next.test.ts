import { describe, expect, it } from "vitest";
import { safeNext, signInPath } from "./next";

describe("safeNext", () => {
  it("keeps relative paths", () => {
    expect(safeNext("/join/abc")).toBe("/join/abc");
    expect(safeNext("/g/1?x=2")).toBe("/g/1?x=2");
  });
  it("rejects external or malformed targets", () => {
    expect(safeNext("https://evil.com")).toBe("/");
    expect(safeNext("//evil.com")).toBe("/");
    expect(safeNext("/\\evil.com")).toBe("/");
    expect(safeNext("javascript:alert(1)")).toBe("/");
    expect(safeNext(null)).toBe("/");
    expect(safeNext("")).toBe("/");
  });
  it("builds sign-in paths", () => {
    expect(signInPath("/join/abc")).toBe("/signin?next=%2Fjoin%2Fabc");
  });
});
