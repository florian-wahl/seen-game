import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadImageMap, loadManifest, resetLibraryCache } from "./index";

const bundle = {
  version: 3,
  dir: "t",
  pictures: [
    { id: "a", name: "A", category: "x", svg: "<svg viewBox='0 0 1 1'/>" },
    { id: "b", name: "B", category: "y", svg: "<svg viewBox='0 0 1 1'/>" },
  ],
};

describe("library loader", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    resetLibraryCache();
    let n = 0;
    URL.createObjectURL = vi.fn(() => `blob:fake/${n++}`);
    fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () =>
        url.endsWith("current.json") ? { url: "/library/bundles/library-t-v3-abcd1234.json", version: 3 } : bundle,
    }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("maps bundle pictures to blob URLs with two fetches total", async () => {
    const [map, manifest] = await Promise.all([loadImageMap(), loadManifest()]);
    expect(Object.keys(map)).toEqual(["a", "b"]);
    expect(map.a).toMatch(/^blob:/);
    expect(manifest.version).toBe(3);
    expect(manifest.pictures.map((p) => p.id)).toEqual(["a", "b"]);
    expect(manifest.confusables).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]).toEqual({ cache: "no-cache" });
    await loadImageMap();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries after a failure", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    await expect(loadImageMap()).rejects.toThrow();
    await expect(loadImageMap()).resolves.toHaveProperty("a");
  });
});
