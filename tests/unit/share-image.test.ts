import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { SHARE_IMAGE } from "@/lib/social";

/**
 * The committed share image (ADR 0010). The end-to-end suite re-renders it
 * with scripts/render-share-image.mjs and requires the same bytes; these
 * checks hold whatever machine rendered it: size, format and colours.
 */
const FILE = `public${SHARE_IMAGE.url}`;
/** Recorded in docs/adr/0010-social-share-previews.md. */
const SHA256 = "b8df161811531d9ff74dd3f120ecbadfc47e488ab7d1520ec978661d178fec9a";

type Png = { width: number; height: number; bitDepth: number; colorType: number; pixel: (x: number, y: number) => [number, number, number] };

/** A small PNG reader: 8-bit RGB or RGBA, not interlaced, as Chromium writes them. */
function readPng(buf: Buffer): Png {
  expect(buf.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  let pos = 8;
  let ihdr: Buffer | null = null;
  const idat: Buffer[] = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") ihdr = data;
    if (type === "IDAT") idat.push(data);
    pos += 12 + len;
  }
  if (!ihdr) throw new Error("no IHDR");
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const bitDepth = ihdr[8]!;
  const colorType = ihdr[9]!;
  expect(ihdr[12], "not interlaced").toBe(0);
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x]!;
      const a = x >= bpp ? out[y * stride + x - bpp]! : 0;
      const b = y > 0 ? out[(y - 1) * stride + x]! : 0;
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp]! : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      out[y * stride + x] = (v + pred) & 0xff;
    }
  }
  return { width, height, bitDepth, colorType, pixel: (x, y) => [out[y * stride + x * bpp]!, out[y * stride + x * bpp + 1]!, out[y * stride + x * bpp + 2]!] };
}

const buf = readFileSync(FILE);
const png = readPng(buf);

describe("the share image", () => {
  it("is the recorded file, a PNG under 300 KB", () => {
    expect(createHash("sha256").update(buf).digest("hex")).toBe(SHA256);
    expect(buf.length).toBeLessThan(300 * 1024);
    expect(SHARE_IMAGE.type).toBe("image/png");
  });

  it("is 1200 × 630, 8-bit", () => {
    expect([png.width, png.height, png.bitDepth]).toEqual([SHARE_IMAGE.width, SHARE_IMAGE.height, 8]);
    expect([2, 6]).toContain(png.colorType);
  });

  it("is black and white with the motto's gray: no other color, a black ground, white mark, motto no brighter than #909090", () => {
    // Rows of the lockup and of the motto, found from the pixels.
    const rowMax: number[] = [];
    let colored = 0;
    for (let y = 0; y < png.height; y++) {
      let max = 0;
      for (let x = 0; x < png.width; x++) {
        const [r, g, b] = png.pixel(x, y);
        if (r !== g || g !== b) colored++;
        max = Math.max(max, r);
      }
      rowMax.push(max);
    }
    expect(colored, "pixels that are not gray").toBe(0);
    for (const [x, y] of [[0, 0], [png.width - 1, 0], [0, png.height - 1], [png.width - 1, png.height - 1]] as const) expect(png.pixel(x, y)).toEqual([0, 0, 0]);
    // Ink rows form two bands: the lockup (reaching white) and, below it, the motto (reaching exactly #909090).
    const bands: Array<{ from: number; to: number; max: number }> = [];
    rowMax.forEach((m, y) => {
      if (m === 0) return;
      const last = bands.at(-1);
      if (last && y - last.to <= 40) {
        last.to = y;
        last.max = Math.max(last.max, m);
      } else bands.push({ from: y, to: y, max: m });
    });
    expect(bands.map((b) => b.max)).toEqual([255, 0x90]);
    // Centred. Across: the ink's middle within 1 px of the image's. Down, the layout centres line boxes, and the motto has
    // no capitals, so its ink sits low in its line: the ink's middle is within 16 px (half the motto's leading of 51.2 px, less its x-height).
    let left = png.width, right = 0;
    for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) if (png.pixel(x, y)[0] > 0) [left, right] = [Math.min(left, x), Math.max(right, x)];
    expect(Math.abs((left + right) / 2 - (png.width - 1) / 2)).toBeLessThanOrEqual(1);
    const mid = (bands[0]!.from + bands[1]!.to) / 2;
    expect(Math.abs(mid - png.height / 2)).toBeLessThanOrEqual(16);
  });
});
