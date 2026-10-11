import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { LibraryManifest } from "@/lib/board/types";
import { validateLibrary, validateSvg } from "./validate";

const fx = (name: string) => readFileSync(path.join(__dirname, "__fixtures__", name), "utf8");

describe("validateSvg", () => {
  it("accepts a clean square SVG", () => expect(validateSvg(fx("good.svg"))).toEqual([]));
  it("accepts local #refs", () => expect(validateSvg(fx("good-local-ref.svg"))).toEqual([]));
  it("rejects script", () => expect(validateSvg(fx("script.svg"))).toContain("contains <script>"));
  it("rejects foreignObject", () => expect(validateSvg(fx("foreign.svg"))).toContain("contains <foreignObject>"));
  it("rejects external href", () => expect(validateSvg(fx("external.svg")).join()).toMatch(/external href/));
  it("rejects non-square viewBox", () => expect(validateSvg(fx("wide.svg")).join()).toMatch(/not square/));
  it("rejects missing viewBox", () => expect(validateSvg(fx("noviewbox.svg"))).toContain("missing viewBox"));
});

describe("validateLibrary", () => {
  const pic = (id: string, file = `${id}.svg`, reviewStatus: "approved" | "draft" = "approved") => ({
    id,
    name: id,
    category: "c",
    file,
    reviewStatus,
  });
  const files: Record<string, string> = { "a.svg": fx("good.svg"), "b.svg": fx("good.svg"), "bad.svg": fx("script.svg") };
  const read = (f: string) => files[f] ?? null;
  const mk = (pictures: LibraryManifest["pictures"], confusables: LibraryManifest["confusables"] = []): LibraryManifest => ({
    version: 1,
    pictures,
    confusables,
  });

  it("passes a good library", () => expect(validateLibrary(mk([pic("a"), pic("b")], [["a", "b"]]), read)).toEqual([]));
  it("reports duplicates, missing files, bad svg, unknown confusables", () => {
    const problems = validateLibrary(mk([pic("a"), pic("a"), pic("bad"), pic("gone")], [["a", "zzz"]]), read);
    expect(problems).toContain("duplicate id: a");
    expect(problems.some((p) => p.startsWith("gone: file missing"))).toBe(true);
    expect(problems).toContain("bad: contains <script>");
    expect(problems.some((p) => p.includes("unknown picture id zzz"))).toBe(true);
  });
  it("ignores files of non-approved pictures", () => {
    expect(validateLibrary(mk([pic("a"), pic("gone", "gone.svg", "draft")]), read)).toEqual([]);
  });
});
