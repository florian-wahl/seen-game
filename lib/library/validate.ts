import type { LibraryManifest } from "@/lib/board/types";

/** Problems found in a single SVG string (empty when OK). */
export function validateSvg(svg: string): string[] {
  const problems: string[] = [];
  if (!/<svg[\s>]/i.test(svg)) return ["not an <svg> document"];
  if (/<script[\s>/]/i.test(svg)) problems.push("contains <script>");
  if (/<foreignObject[\s>/]/i.test(svg)) problems.push("contains <foreignObject>");
  if (/\son[a-z]+\s*=/i.test(svg)) problems.push("contains an event-handler attribute");
  for (const m of svg.matchAll(/(?:xlink:)?href\s*=\s*["']([^"']*)["']/gi)) {
    if (!m[1].startsWith("#")) problems.push(`external href "${m[1].slice(0, 60)}"`);
  }
  if (/url\(\s*["']?(?!#)/i.test(svg)) problems.push("url() reference to something other than a local #id");
  if (/@import/i.test(svg)) problems.push("contains @import");
  const vb = /viewBox\s*=\s*["']([^"']*)["']/i.exec(svg);
  if (!vb) problems.push("missing viewBox");
  else {
    const n = vb[1].trim().split(/[\s,]+/).map(Number);
    if (n.length !== 4 || n.some((x) => !Number.isFinite(x))) problems.push(`invalid viewBox "${vb[1]}"`);
    else if (n[2] <= 0 || n[3] <= 0 || Math.abs(n[2] - n[3]) > 1e-6) problems.push(`viewBox is not square ("${vb[1]}")`);
  }
  return problems;
}

/**
 * Validates a manifest. `readSvg(file)` returns the file text or null when missing.
 * Only approved pictures are checked for files/SVG content.
 */
export function validateLibrary(manifest: LibraryManifest, readSvg: (file: string) => string | null): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const p of manifest.pictures) {
    if (seen.has(p.id)) problems.push(`duplicate id: ${p.id}`);
    seen.add(p.id);
  }
  for (const p of manifest.pictures) {
    if (p.reviewStatus !== "approved") continue;
    const svg = readSvg(p.file);
    if (svg === null) {
      problems.push(`${p.id}: file missing (${p.file})`);
      continue;
    }
    for (const msg of validateSvg(svg)) problems.push(`${p.id}: ${msg}`);
  }
  for (const [a, b] of manifest.confusables ?? []) {
    for (const id of [a, b]) if (!seen.has(id)) problems.push(`confusable pair [${a}, ${b}]: unknown picture id ${id}`);
  }
  return problems;
}
