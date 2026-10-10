// Generates the PWA icons in public/icons/ (bold "S!" on indigo) using Playwright's Chromium.
// Usage: npx tsx scripts/make-icons.ts
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const OUT = path.resolve(process.cwd(), "public/icons");

// glyph = font-size as a fraction of the icon; maskable keeps the mark inside the 80% safe zone.
const icons = [
  { file: "icon-192.png", size: 192, glyph: 0.58, rounded: true },
  { file: "icon-512.png", size: 512, glyph: 0.58, rounded: true },
  { file: "icon-maskable-512.png", size: 512, glyph: 0.4, rounded: false },
  { file: "apple-touch-icon.png", size: 180, glyph: 0.52, rounded: false },
];

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  for (const i of icons) {
    const page = await browser.newPage({ viewport: { width: i.size, height: i.size } });
    await page.setContent(`<!doctype html><style>
      html,body{margin:0;background:transparent}
      .i{width:${i.size}px;height:${i.size}px;display:flex;align-items:center;justify-content:center;
         background:#4f46e5;color:#fff;font:900 ${Math.round(i.size * i.glyph)}px/1 -apple-system,'Helvetica Neue',Arial,sans-serif;
         letter-spacing:-0.04em;border-radius:${i.rounded ? Math.round(i.size * 0.22) : 0}px}
    </style><div class="i">S!</div>`);
    await page.screenshot({ path: path.join(OUT, i.file), omitBackground: true });
    await page.close();
  }
  await browser.close();
  console.log(`wrote ${icons.length} icons to ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
