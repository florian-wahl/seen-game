import type { LibraryManifest, Picture } from "@/lib/board/types";
import { BUNDLE_URL_ROOT } from "./config";

export { LIBRARY_DIR } from "./config";

interface Current {
  url: string;
  version: number;
}
interface Bundle {
  version: number;
  dir: string;
  pictures: { id: string; name: string; category: string; svg: string }[];
}
interface Loaded {
  manifest: LibraryManifest;
  images: Record<string, string>;
}

let loadedPromise: Promise<Loaded> | undefined;

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`Library fetch failed (${url}): ${r.status}`);
  return (await r.json()) as T;
}

async function load(): Promise<Loaded> {
  // current.json is never cached (it points at the immutable hashed bundle).
  const current = await fetchJson<Current>(`${BUNDLE_URL_ROOT}/current.json`, { cache: "no-cache" });
  const bundle = await fetchJson<Bundle>(current.url);
  const images: Record<string, string> = {};
  const pictures: Picture[] = [];
  for (const p of bundle.pictures) {
    images[p.id] = URL.createObjectURL(new Blob([p.svg], { type: "image/svg+xml" }));
    pictures.push({ id: p.id, name: p.name, category: p.category, file: "", reviewStatus: "approved" });
  }
  // Confusables are only needed server-side (board generation); not shipped in the bundle.
  return { manifest: { version: bundle.version, pictures, confusables: [] }, images };
}

function loadOnce(): Promise<Loaded> {
  loadedPromise ??= load().catch((e) => {
    loadedPromise = undefined; // allow retry
    throw e;
  });
  return loadedPromise;
}

/** Library manifest derived from the bundle (approved pictures; `confusables` is always empty client-side). */
export async function loadManifest(): Promise<LibraryManifest> {
  return (await loadOnce()).manifest;
}

/** pictureId -> Blob URL of its SVG for every picture in the bundle. One network fetch, memoized. */
export async function loadImageMap(): Promise<Record<string, string>> {
  return (await loadOnce()).images;
}

/** Test helper: forget the memoized bundle. */
export function resetLibraryCache() {
  loadedPromise = undefined;
}
