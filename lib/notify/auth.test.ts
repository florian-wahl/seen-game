import { describe, expect, it } from "vitest";
import { isAuthorized } from "./auth";

describe("isAuthorized", () => {
  it("accepts the exact bearer secret", () => {
    expect(isAuthorized("Bearer s3cret", "s3cret")).toBe(true);
  });
  it("rejects wrong, missing and malformed headers", () => {
    expect(isAuthorized("Bearer nope", "s3cret")).toBe(false);
    expect(isAuthorized("Bearer s3cret2", "s3cret")).toBe(false);
    expect(isAuthorized("s3cret", "s3cret")).toBe(false);
    expect(isAuthorized("Basic s3cret", "s3cret")).toBe(false);
    expect(isAuthorized(null, "s3cret")).toBe(false);
    expect(isAuthorized("", "s3cret")).toBe(false);
  });
  it("rejects everything when no secret is configured", () => {
    expect(isAuthorized("Bearer ", undefined)).toBe(false);
    expect(isAuthorized("Bearer x", "")).toBe(false);
    expect(isAuthorized("Bearer undefined", undefined)).toBe(false);
  });
});
