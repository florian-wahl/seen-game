import { describe, expect, it } from "vitest";
import { bitmapCacheFor, sharedBitmapCache, toGrayscale } from "./bitmapCache";

describe("toGrayscale", () => {
  it("turns each pixel into its luma and keeps alpha", () => {
    // red, green, blue, ink with half alpha
    const px = new Uint8ClampedArray([229, 72, 77, 255, 47, 158, 107, 255, 74, 102, 212, 255, 28, 27, 34, 128]);
    toGrayscale(px);
    const pixels = [0, 4, 8, 12].map((i) => Array.from(px.slice(i, i + 4)));
    for (const [r, g, b] of pixels) expect(r === g && g === b).toBe(true);
    expect(pixels.map((p) => p[0])).toEqual([106, 131, 104, 28]);
    expect(pixels.map((p) => p[3])).toEqual([255, 255, 255, 128]);
  });

  it("leaves white and black as they are", () => {
    const px = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 0]);
    toGrayscale(px);
    expect(Array.from(px)).toEqual([255, 255, 255, 255, 0, 0, 0, 0]);
  });
});

describe("bitmapCacheFor", () => {
  it("keeps color and monochrome bitmaps in separate caches", () => {
    expect(bitmapCacheFor(false)).toBe(sharedBitmapCache);
    expect(bitmapCacheFor(true)).not.toBe(sharedBitmapCache);
    expect(bitmapCacheFor(true).mono).toBe(true);
    expect(bitmapCacheFor(false).mono).toBe(false);
  });
});
