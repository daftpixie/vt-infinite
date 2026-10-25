#!/usr/bin/env node
// Renders the social share image (ADR 0010) once, from the approved stacked
// lockup and the site's own font, into public/brand/vt-infinite-share.png.
// The PNG is committed; nothing renders it at run time.
//
//   node scripts/render-share-image.mjs            write the PNG
//   node scripts/render-share-image.mjs --check    render to memory and compare with the committed file
//   node scripts/render-share-image.mjs --out P    write the render to P instead (the end-to-end suite checks it)
//
// Chromium's anti-aliasing differs between machines, so a render on another
// machine may differ in bytes (--check then says DIFFERENT). The committed
// file is the reference; tests check every render against the specification
// in tests/share-image-checks.ts.
//
// It uses the Chromium that the end-to-end suite already installs
// (@playwright/test, a dev dependency). The lockup SVG is read and placed in
// the page as it is; it is never edited. The motto is set as the landing
// page sets it (app/globals.css .motto, dark theme): JetBrains Mono from
// public/fonts, regular weight, the muted gray #909090, no ligatures, no
// tracking, at the same ratio to the lockup's width as on the page
// (20 px to 240 px). The render fails if the font did not load, so the
// image never falls back to another face.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const OUT = "public/brand/vt-infinite-share.png";
export const WIDTH = 1200;
export const HEIGHT = 630;
/** The page sets the lockup 15rem (240 px) wide and the motto at 20 px; the image keeps that ratio at 1.6 times. */
const SCALE = 1.6;
const LOCKUP_WIDTH = 240 * SCALE;
const MOTTO_SIZE = 20 * SCALE;
const MOTTO_LEADING = 32 * SCALE;
/** The page's space step 12 (3rem) between blocks, at the same scale. */
const GAP = 48 * SCALE;

const ROOT = process.cwd();
const landing = JSON.parse(readFileSync(join(ROOT, "content/landing.json"), "utf8"));

function html() {
  const svg = readFileSync(join(ROOT, "public/brand/vt-infinite-lockup-stacked.svg"), "utf8");
  // Embedded as a data URL: the page has no origin from which to fetch a file.
  const font = `data:font/woff2;base64,${readFileSync(join(ROOT, "public/fonts/JetBrainsMono-wght.woff2")).toString("base64")}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
@font-face { font-family: "JetBrains Mono"; src: url("${font}") format("woff2"); font-weight: 100 800; font-style: normal; }
html, body { margin: 0; width: ${WIDTH}px; height: ${HEIGHT}px; background: #000000; }
body { display: flex; flex-direction: column; align-items: center; justify-content: center; }
.lockup { width: ${LOCKUP_WIDTH}px; color: #ffffff; line-height: 0; }
.lockup svg { display: block; width: 100%; height: auto; }
.motto { margin: ${GAP}px 0 0; font-family: "JetBrains Mono"; font-weight: 400; font-size: ${MOTTO_SIZE}px; line-height: ${MOTTO_LEADING}px; color: #909090; font-variant-ligatures: none; letter-spacing: 0; }
</style></head><body><div class="lockup">${svg}</div><p class="motto" lang="${landing.mottoLang}">${landing.motto}</p></body></html>`;
}

export async function render() {
  const require = createRequire(join(ROOT, "package.json"));
  const { chromium } = require("@playwright/test");
  const browser = await chromium.launch(process.env.PW_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PW_CHROMIUM_EXECUTABLE } : {});
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1, colorScheme: "dark" });
    await page.setContent(html(), { waitUntil: "load" });
    const fontLoaded = await page.evaluate(async () => {
      await document.fonts.ready;
      return document.fonts.check('400 32px "JetBrains Mono"') && [...document.fonts].some((f) => f.family.includes("JetBrains Mono") && f.status === "loaded");
    });
    if (!fontLoaded) throw new Error("JetBrains Mono did not load; the share image would use another face. Not written.");
    return await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
  } finally {
    await browser.close();
  }
}

const sha256 = (b) => createHash("sha256").update(b).digest("hex");

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const png = await render();
  if (process.argv.includes("--check")) {
    const committed = readFileSync(join(ROOT, OUT));
    const same = Buffer.compare(png, committed) === 0;
    console.log(`share image: rendered ${sha256(png)}, committed ${sha256(committed)}: ${same ? "identical" : "DIFFERENT"}`);
    process.exit(same ? 0 : 1);
  }
  const i = process.argv.indexOf("--out");
  const target = i > 0 ? process.argv[i + 1] : join(ROOT, OUT);
  if (!target) throw new Error("--out needs a path");
  writeFileSync(target, png);
  console.log(`share image: wrote ${target} (${png.length} bytes, sha256 ${sha256(png)})`);
}
