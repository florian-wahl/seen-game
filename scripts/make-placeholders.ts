// Generates the placeholder picture library: npx tsx scripts/make-placeholders.ts
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ConfusablePair, LibraryManifest, Picture } from "../lib/board/types";

const OUT = path.resolve(process.cwd(), "public/library/placeholder");

function flower(): string {
  const parts: string[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i * 72 - 90) * (Math.PI / 180);
    const cx = Math.round(50 + 26 * Math.cos(a));
    const cy = Math.round(50 + 26 * Math.sin(a));
    parts.push(`M${cx - 18} ${cy}a18 18 0 1 0 36 0a18 18 0 1 0 -36 0Z`);
  }
  parts.push("M38 50a12 12 0 1 0 24 0a12 12 0 1 0 -24 0Z");
  return parts.join("");
}

// Silhouette families (viewBox 0 0 100 100).
const FAMILIES: Record<string, string> = {
  star: "M50 6L61 38L95 38L67 58L78 92L50 71L22 92L33 58L5 38L39 38Z",
  heart: "M50 90C10 60 6 30 28 20C40 15 50 25 50 32C50 25 60 15 72 20C94 30 90 60 50 90Z",
  house: "M10 48L50 12L90 48L80 48L80 88L20 88L20 48ZM42 88L42 64L58 64L58 88Z",
  fish: "M6 50C24 20 60 20 78 50C60 80 24 80 6 50ZM76 50L96 28L96 72Z",
  key: "M32 14a20 20 0 1 0 0.1 0ZM32 28a6 6 0 1 1 -0.1 0ZM44 48L90 86L82 94L74 88L68 94L60 86L38 62Z",
  cup: "M18 22L72 22L66 80Q65 88 56 88L34 88Q25 88 24 80ZM70 32Q94 30 90 52Q86 68 66 66L68 57Q80 57 80 50Q80 41 70 42Z",
  tree: "M50 6L84 50L68 50L90 78L10 78L32 50L16 50ZM44 78L56 78L56 94L44 94Z",
  car: "M6 64L10 48Q12 44 18 44L34 44L44 26Q46 24 50 24L68 24Q72 24 76 30L84 44L92 48Q96 50 96 56L96 68L6 68ZM30 66a10 10 0 1 0 0.1 0ZM76 66a10 10 0 1 0 0.1 0Z",
  bell: "M50 8Q56 8 56 14Q80 20 80 50L80 62L92 76L8 76L20 62L20 50Q20 20 44 14Q44 8 50 8ZM38 82Q50 98 62 82Z",
  leaf: "M12 88C6 40 40 10 92 8C94 58 60 92 12 88ZM12 88L56 44",
  umbrella:
    "M6 52Q50 -10 94 52Q83 44 72 52Q61 44 50 52Q39 44 28 52Q17 44 6 52ZM47 52L53 52L53 80Q53 92 42 92Q36 92 35 85L41 84Q42 86 47 84Z",
  moon: "M62 8A44 44 0 1 0 92 66A36 36 0 0 1 62 8Z",
  flower: flower(),
  arrow: "M8 38L56 38L56 16L94 50L56 84L56 62L8 62Z",
  gem: "M26 14L74 14L94 38L50 90L6 38Z",
};

// Colours in near-identical pairs (groups of two share a hue family).
interface Colour {
  name: string;
  fill: string;
  dark: string;
  group: number;
}
const COLOURS: Colour[] = [
  { name: "red", fill: "#e53935", dark: "#8e1c1a", group: 0 },
  { name: "crimson", fill: "#d32f4a", dark: "#80162a", group: 0 },
  { name: "orange", fill: "#fb8c00", dark: "#9a5400", group: 1 },
  { name: "amber", fill: "#ffa726", dark: "#a8650c", group: 1 },
  { name: "green", fill: "#43a047", dark: "#1f5c24", group: 2 },
  { name: "teal", fill: "#26a69a", dark: "#0f625a", group: 2 },
  { name: "blue", fill: "#1e88e5", dark: "#0d4a8a", group: 3 },
  { name: "navy", fill: "#2f4b9c", dark: "#162a63", group: 3 },
  { name: "purple", fill: "#8e44ad", dark: "#52246a", group: 4 },
  { name: "pink", fill: "#e85d9e", dark: "#9a2a64", group: 4 },
];
// Only these near-identical hue groups are flagged (keeps >= 300 pickable per board).
const CONFUSABLE_GROUPS = [0, 3];
const ACCENTS =["plain", "stripes", "dots"] as const;
type Accent = (typeof ACCENTS)[number];

// Slight shape variant: near-pair colours share the same variant.
const VARIANTS = ["1 1", "0.92 1.04", "1.07 0.94", "0.95 1", "1 0.93"];

function svg(family: string, colour: Colour, accent: Accent): string {
  const d = FAMILIES[family];
  const tf = `translate(50 50) scale(${VARIANTS[colour.group]}) translate(-50 -50)`;
  const shape = (extra: string) => `<path d="${d}" fill-rule="evenodd"${extra}/>`;
  let defs = "";
  let body = shape(` fill="${colour.fill}" stroke="${colour.dark}" stroke-width="3" stroke-linejoin="round"`);
  if (accent === "stripes") {
    defs =
      '<defs><pattern id="p" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="12" fill="#fff" fill-opacity=".6"/></pattern></defs>';
    body += shape(' fill="url(#p)"');
  } else if (accent === "dots") {
    defs =
      '<defs><pattern id="p" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="7" cy="7" r="3.2" fill="#fff" fill-opacity=".7"/></pattern></defs>';
    body += shape(' fill="url(#p)"');
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${defs}<g transform="${tf}">${body}</g></svg>\n`;
}

function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const pictures: Picture[] = [];
  const confusables: ConfusablePair[] = [];
  for (const family of Object.keys(FAMILIES)) {
    for (const accent of ACCENTS) {
      for (const colour of COLOURS) {
        const id = `${family}-${colour.name}-${accent}`;
        const file = `${id}.svg`;
        const content = svg(family, colour, accent);
        if (content.length >= 2048) throw new Error(`${file} too large`);
        writeFileSync(path.join(OUT, file), content);
        pictures.push({
          id,
          name: `${colour.name} ${accent} ${family}`,
          category: family,
          file,
          reviewStatus: "approved",
        });
      }
      // near-identical colour pairs with the same accent are confusable
      for (const g of CONFUSABLE_GROUPS) {
        const [a, b] = COLOURS.filter((c) => c.group === g);
        const ids = [`${family}-${a.name}-${accent}`, `${family}-${b.name}-${accent}`].sort();
        confusables.push([ids[0], ids[1]]);
      }
    }
  }
  const manifest: LibraryManifest = { version: 1, pictures, confusables };
  writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1) + "\n");
  console.log(`wrote ${pictures.length} pictures, ${confusables.length} confusable pairs to ${OUT}`);
}

main();
