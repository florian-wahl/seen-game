/**
 * Single source of truth for which picture library is live: a folder under
 * `public/library/`. Defaults to the final set (`v2`); override with
 * NEXT_PUBLIC_LIBRARY_DIR (e.g. `placeholder`; inlined at build time on the client).
 */
export const LIBRARY_DIR: string = process.env.NEXT_PUBLIC_LIBRARY_DIR || "v2";

/** Repo-relative folder holding the manifest and the per-picture SVGs. */
export const LIBRARY_SOURCE_PATH = `public/library/${LIBRARY_DIR}`;

/** URL folder for the built bundles (build output, gitignored). */
export const BUNDLE_URL_ROOT = "/library/bundles";
