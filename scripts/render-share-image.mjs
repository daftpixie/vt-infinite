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
import { crc32, deflateSync, inflateSync } from "node:zlib";

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

/**
 * The image is black and white with the motto's gray (D2). If the machine's
 * Chromium still drew coloured anti-aliasing fringes, each such pixel becomes
 * the gray of its luminance (Rec. 709, rounded); a render that is already
 * gray is returned byte for byte as it is.
 */
export function grayOnly(png) {
  let pos = 8, ihdr = null;
  const idat = [];
  while (pos < png.length) {
    const len = png.readUInt32BE(pos);
    const type = png.toString("ascii", pos + 4, pos + 8);
    if (type === "IHDR") ihdr = png.subarray(pos + 8, pos + 8 + len);
    if (type === "IDAT") idat.push(png.subarray(pos + 8, pos + 8 + len));
    pos += 12 + len;
  }
  const width = ihdr.readUInt32BE(0), height = ihdr.readUInt32BE(4), bpp = ihdr[9] === 6 ? 4 : 3;
  if (ihdr[8] !== 8 || ihdr[12] !== 0) throw new Error("unexpected PNG format from Chromium");
  const raw = inflateSync(Buffer.concat(idat)), stride = width * bpp, px = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x];
      const a = x >= bpp ? px[y * stride + x - bpp] : 0, b = y > 0 ? px[(y - 1) * stride + x] : 0, c = x >= bpp && y > 0 ? px[(y - 1) * stride + x - bpp] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      px[y * stride + x] = (v + (f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
    }
  }
  let fixed = 0;
  const out = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * stride + x * bpp, [r, g, b] = [px[i], px[i + 1], px[i + 2]];
      const v = r === g && g === b ? r : (fixed++, Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b));
      out.fill(v, y * (width * 3 + 1) + 1 + x * 3, y * (width * 3 + 1) + 4 + x * 3);
    }
  }
  if (fixed === 0) return png;
  console.log(`share image: ${fixed} coloured anti-aliasing pixels converted to gray`);
  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, "ascii");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
    return Buffer.concat([head, data, crc]);
  };
  const hdr = Buffer.alloc(13);
  hdr.writeUInt32BE(width, 0);
  hdr.writeUInt32BE(height, 4);
  hdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([png.subarray(0, 8), chunk("IHDR", hdr), chunk("IDAT", deflateSync(out, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

export async function render() {
  const require = createRequire(join(ROOT, "package.json"));
  const { chromium } = require("@playwright/test");
  // Grayscale text anti-aliasing: some machines default to subpixel (LCD) text, whose colour fringes would add a third colour.
  const browser = await chromium.launch({ args: ["--disable-lcd-text"], ...(process.env.PW_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PW_CHROMIUM_EXECUTABLE } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1, colorScheme: "dark" });
    await page.setContent(html(), { waitUntil: "load" });
    const fontLoaded = await page.evaluate(async () => {
      await document.fonts.ready;
      return document.fonts.check('400 32px "JetBrains Mono"') && [...document.fonts].some((f) => f.family.includes("JetBrains Mono") && f.status === "loaded");
    });
    if (!fontLoaded) throw new Error("JetBrains Mono did not load; the share image would use another face. Not written.");
    return grayOnly(await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } }));
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
