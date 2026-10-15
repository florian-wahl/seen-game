// Generates the app icons (the eyes from public/icons/eyes.svg on mustard): the PWA PNGs in public/icons/
// via Playwright's Chromium, and the browser-tab icon app/icon.svg.
// Usage: npx tsx scripts/make-icons.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const OUT = path.resolve(process.cwd(), "public/icons");
const EYES = readFileSync(path.join(OUT, "eyes.svg"), "utf8");
const MUSTARD = "#f5b93f";

// mark = drawing size as a fraction of the icon; maskable keeps the eyes inside the 80% safe zone.
const icons = [
  { file: "icon-192.png", size: 192, mark: 0.86, rounded: true },
  { file: "icon-512.png", size: 512, mark: 0.86, rounded: true },
  { file: "icon-maskable-512.png", size: 512, mark: 0.66, rounded: false },
  { file: "apple-touch-icon.png", size: 180, mark: 0.82, rounded: false },
];

/** The eyes drawing on a mustard tile, as one standalone SVG (100 x 100). */
function tileSvg(mark: number, radius: number): string {
  const inner = EYES.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").replace(/<title>[\s\S]*?<\/title>/, "");
  const offset = (100 - 100 * mark) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<title>Seen!</title>
<rect width="100" height="100" rx="${radius}" fill="${MUSTARD}"/>
<g transform="translate(${offset} ${offset}) scale(${mark})">${inner}</g>
</svg>
`;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.resolve(process.cwd(), "app/icon.svg"), tileSvg(0.86, 22));
  const browser = await chromium.launch();
  for (const i of icons) {
    const page = await browser.newPage({ viewport: { width: i.size, height: i.size } });
    await page.setContent(`<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:${i.size}px;height:${i.size}px}</style>
      ${tileSvg(i.mark, i.rounded ? 22 : 0)}`);
    await page.screenshot({ path: path.join(OUT, i.file), omitBackground: true });
    await page.close();
  }
  await browser.close();
  console.log(`wrote ${icons.length} icons to ${OUT} and app/icon.svg`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
