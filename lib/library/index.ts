import type { LibraryManifest } from "@/lib/board/types";

/**
 * Where picture SVGs are served from. Placeholder set until the final library
 * lands (M7 swaps this for the versioned bundle).
 */
export const LIBRARY_ROOT = "/library/placeholder";

let manifestPromise: Promise<LibraryManifest> | undefined;

/** Fetches (once) the library manifest. Client-side. */
export function loadManifest(): Promise<LibraryManifest> {
  manifestPromise ??= fetch(`${LIBRARY_ROOT}/manifest.json`).then((r) => {
    if (!r.ok) throw new Error(`Library manifest failed: ${r.status}`);
    return r.json() as Promise<LibraryManifest>;
  });
  return manifestPromise;
}

/** pictureId -> SVG URL for every picture in the library. */
export async function loadImageMap(): Promise<Record<string, string>> {
  const m = await loadManifest();
  return Object.fromEntries(m.pictures.map((p) => [p.id, `${LIBRARY_ROOT}/${p.file}`]));
}
