/**
 * SVG URL -> rasterized bitmap cache. 128 px base resolution, 256 px on demand
 * for tiles drawn larger than 128 device px. Cached by picture id + resolution.
 */

export type Raster = ImageBitmap | HTMLCanvasElement | HTMLImageElement;

export const BASE_SIZE = 128;
export const HI_SIZE = 256;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url.slice(0, 80)}`));
    img.src = url;
  });
}

/** Rasterize an SVG at `size` px (contain-fit in a square). */
export async function rasterize(url: string, size: number): Promise<Raster> {
  const img = await loadImage(url);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    const nw = img.naturalWidth || size;
    const nh = img.naturalHeight || size;
    const k = Math.min(size / nw, size / nh);
    const w = nw * k;
    const h = nh * k;
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    if (typeof createImageBitmap === "function") {
      try {
        return await createImageBitmap(canvas);
      } catch {
        return canvas;
      }
    }
    return canvas;
  } catch {
    // Safari et al.: draw the SVG image element directly.
    return img;
  }
}

export class BitmapCache {
  private ready = new Map<string, Raster>();
  private pending = new Map<string, Promise<void>>();
  /** Called whenever a new bitmap becomes available. */
  onLoad: (() => void) | null = null;

  private key(id: string, size: number) {
    return `${id}@${size}`;
  }

  private request(id: string, url: string, size: number): Promise<void> {
    const key = this.key(id, size);
    if (this.ready.has(key)) return Promise.resolve();
    let p = this.pending.get(key);
    if (!p) {
      p = rasterize(url, size)
        .then((r) => {
          this.ready.set(key, r);
          this.onLoad?.();
        })
        .catch(() => {
          /* leave missing; tile just isn't drawn */
        })
        .finally(() => this.pending.delete(key));
      this.pending.set(key, p);
    }
    return p;
  }

  /**
   * Best available bitmap for drawing at `devicePx` device pixels. Starts
   * loading what is missing; returns null until the 128 px bitmap is ready.
   */
  get(id: string, url: string, devicePx: number): Raster | null {
    const lo = this.ready.get(this.key(id, BASE_SIZE));
    if (!lo) void this.request(id, url, BASE_SIZE);
    if (devicePx > BASE_SIZE) {
      const hi = this.ready.get(this.key(id, HI_SIZE));
      if (hi) return hi;
      if (lo) void this.request(id, url, HI_SIZE);
    }
    return lo ?? null;
  }

  /** Resolves when every 128 px bitmap is ready. */
  async preload(images: Record<string, string>): Promise<void> {
    await Promise.all(
      Object.entries(images).map(([id, url]) => this.request(id, url, BASE_SIZE)),
    );
  }

  clear() {
    for (const r of this.ready.values()) {
      if ("close" in r) r.close();
    }
    this.ready.clear();
  }
}

export const sharedBitmapCache = new BitmapCache();

export function preload(images: Record<string, string>): Promise<void> {
  return sharedBitmapCache.preload(images);
}
