// npx tsx scripts/generate-board.ts --size 200 --seed demo [--library dir] [--out board.svg]
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { generateBoard, countCategoryConflicts, findConfusableViolations } from "../lib/board/generate";
import type { LibraryManifest } from "../lib/board/types";

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function main(): number {
  const size = Number(arg("size", "200"));
  const seed = arg("seed", "demo")!;
  const lib = path.resolve(process.cwd(), arg("library", "public/library/placeholder")!);
  const out = arg("out");
  const manifest = JSON.parse(readFileSync(path.join(lib, "manifest.json"), "utf8")) as LibraryManifest;

  const board = generateBoard({
    pictures: manifest.pictures,
    confusables: manifest.confusables,
    size,
    seed,
  });

  const violations = findConfusableViolations(board, manifest.confusables);
  const conflicts = countCategoryConflicts(board, manifest.pictures);
  const unique = new Set(board.tiles.map((t) => t.pictureId)).size;
  const problems: string[] = [];
  if (board.tiles.length !== size) problems.push(`tile count ${board.tiles.length} != ${size}`);
  if (unique !== board.tiles.length) problems.push("duplicate pictures on board");
  if (violations.length) problems.push(`${violations.length} confusable violation(s)`);
  if (conflicts > 0) problems.push(`${conflicts} adjacent same-category pair(s)`);

  console.log(
    JSON.stringify(
      {
        size,
        seed,
        cols: board.cols,
        rows: board.rows,
        width: board.width,
        height: board.height,
        tiles: board.tiles.length,
        uniquePictures: unique,
        confusableViolations: violations.length,
        categoryConflicts: conflicts,
        ok: problems.length === 0,
      },
      null,
      2,
    ),
  );

  if (out) {
    const files = new Map(manifest.pictures.map((p) => [p.id, p.file]));
    const cache = new Map<string, string>();
    const href = (id: string) => {
      let v = cache.get(id);
      if (!v) {
        const data = readFileSync(path.join(lib, files.get(id)!));
        v = `data:image/svg+xml;base64,${data.toString("base64")}`;
        cache.set(id, v);
      }
      return v;
    };
    const parts = board.tiles.map((t) => {
      const px = (t.scale * 100).toFixed(2);
      const h = (t.scale * 50).toFixed(2);
      return `<image href="${href(t.pictureId)}" x="-${h}" y="-${h}" width="${px}" height="${px}" transform="translate(${t.x.toFixed(2)} ${t.y.toFixed(2)}) rotate(${t.rotation.toFixed(2)})"/>`;
    });
    const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${board.width} ${board.height}" width="${board.width}" height="${board.height}"><rect width="100%" height="100%" fill="#faf7f0"/>${parts.join("\n")}</svg>\n`;
    writeFileSync(path.resolve(process.cwd(), out), svg);
  }

  for (const p of problems) console.error(`VIOLATION: ${p}`);
  return problems.length ? 1 : 0;
}

process.exit(main());
