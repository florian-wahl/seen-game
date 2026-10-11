// Imports a picture library manifest into the database (pictures + confusables).
// Usage: npx tsx --env-file=.env.local scripts/import-library.ts [--library <dir>] (default: public/library/$NEXT_PUBLIC_LIBRARY_DIR or placeholder)
// Idempotent: upserts every manifest picture; pictures missing from the manifest are marked rejected.
import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/database.types";
import type { LibraryManifest } from "../lib/board/types";
import { LIBRARY_SOURCE_PATH } from "../lib/library/config";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};

async function main() {
  const root = arg("library", LIBRARY_SOURCE_PATH);
  const manifest = JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8")) as LibraryManifest;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set");
  const db = createClient<Database>(url, key, { auth: { persistSession: false } });

  const rows = manifest.pictures.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    file_path: p.file,
    review_status: p.reviewStatus,
    library_version: manifest.version,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from("pictures").upsert(rows.slice(i, i + 500));
    if (error) throw error;
  }

  const ids = new Set(rows.map((r) => r.id));
  const { data: existing, error: exErr } = await db.from("pictures").select("id");
  if (exErr) throw exErr;
  const stale = (existing ?? []).map((r) => r.id).filter((id) => !ids.has(id));
  if (stale.length) {
    const { error } = await db.from("pictures").update({ review_status: "rejected" }).in("id", stale);
    if (error) throw error;
  }

  const pairs = manifest.confusables.map(([a, b]) => (a < b ? { picture_a: a, picture_b: b } : { picture_a: b, picture_b: a }));
  const { error: delErr } = await db.from("picture_confusables").delete().neq("picture_a", "");
  if (delErr) throw delErr;
  if (pairs.length) {
    const { error } = await db.from("picture_confusables").insert(pairs);
    if (error) throw error;
  }

  console.log(JSON.stringify({ library: root, version: manifest.version, pictures: rows.length, rejectedStale: stale.length, confusables: pairs.length }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
