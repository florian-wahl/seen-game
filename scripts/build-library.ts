// Builds the versioned picture bundle from public/library/<dir>/manifest.json.
// Usage: npx tsx scripts/build-library.ts [--library-dir <dir>] [--out-dir <dir>]
// Output: library-<dir>-v<version>-<hash8>.json + current.json (default out: public/library/bundles).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { optimize } from "svgo";
import type { LibraryManifest } from "../lib/board/types";
import { BUNDLE_URL_ROOT, LIBRARY_DIR } from "../lib/library/config";
import { validateLibrary } from "../lib/library/validate";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

function main(): number {
  const dir = arg("library-dir", LIBRARY_DIR);
  const src = path.resolve(process.cwd(), "public/library", dir);
  const outDir = path.resolve(process.cwd(), arg("out-dir", "public/library/bundles"));
  const manifestPath = path.join(src, "manifest.json");
  if (!existsSync(manifestPath)) {
    console.error(`No manifest at ${manifestPath}`);
    return 1;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as LibraryManifest;
  const readSvg = (file: string) => {
    const f = path.join(src, file);
    return existsSync(f) ? readFileSync(f, "utf8") : null;
  };

  const problems = validateLibrary(manifest, readSvg);
  if (problems.length) {
    console.error(`Library "${dir}" has ${problems.length} problem(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    return 1;
  }

  const sizes: { id: string; bytes: number }[] = [];
  let rawBytes = 0;
  const pictures = manifest.pictures
    .filter((p) => p.reviewStatus === "approved")
    .map((p) => {
      const raw = readSvg(p.file)!;
      rawBytes += Buffer.byteLength(raw);
      const svg = optimize(raw, {
        path: p.file,
        plugins: ["preset-default", "removeDimensions"] // svgo 4's default preset keeps the viewBox,
      }).data;
      sizes.push({ id: p.id, bytes: Buffer.byteLength(svg) });
      return { id: p.id, name: p.name, category: p.category, svg };
    });

  const body = JSON.stringify({ version: manifest.version, dir, pictures });
  const hash = createHash("sha256").update(body).digest("hex").slice(0, 8);
  const name = `library-${dir}-v${manifest.version}-${hash}.json`;
  mkdirSync(outDir, { recursive: true });
  for (const f of readdirSync(outDir)) if (f.startsWith("library-") && f !== name) rmSync(path.join(outDir, f));
  writeFileSync(path.join(outDir, name), body);
  const bytes = Buffer.byteLength(body);
  const current = { url: `${BUNDLE_URL_ROOT}/${name}`, version: manifest.version, hash, count: pictures.length, bytes };
  writeFileSync(path.join(outDir, "current.json"), JSON.stringify(current));

  const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
  console.log(`Library "${dir}" v${manifest.version}: ${pictures.length} pictures -> ${path.join(outDir, name)}`);
  console.log(`  raw SVG total ${kb(rawBytes)}, bundle ${kb(bytes)}, gzipped ${kb(gzipSync(body).length)}`);
  console.log("  largest 10:");
  for (const s of sizes.sort((a, b) => b.bytes - a.bytes).slice(0, 10)) console.log(`    ${s.id.padEnd(32)} ${kb(s.bytes)}`);
  return 0;
}

process.exit(main());
