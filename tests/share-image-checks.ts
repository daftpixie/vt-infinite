import { inflateSync } from "node:zlib";

/**
 * The share image's specification (ADR 0010), checked from its pixels.
 * Chromium's text and anti-aliasing differ between machines, so a fresh
 * render is not byte-identical everywhere; what must hold everywhere is this:
 * a 1200 × 630 8-bit PNG, every pixel a gray, a black ground and corners, the
 * mark reaching white, the motto below it reaching exactly #909090 and no
 * brighter, centred across, and centred down within the motto's line box.
 * Used by tests/unit/share-image.test.ts (the committed file) and
 * tests/e2e/social.spec.ts (a fresh render by the script).
 */
export type ShareImageFacts = {
  signature: boolean;
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  interlaced: boolean;
  coloredPixels: number;
  corners: number[];
  bandMaxima: number[];
  horizontalOffset: number;
  verticalOffset: number;
};

/** The facts the specification requires, for comparison with toEqual. */
export const SPEC = { signature: true, width: 1200, height: 630, bitDepth: 8, interlaced: false, coloredPixels: 0, corners: [0, 0, 0, 0], bandMaxima: [255, 0x90] } as const;
/** Across: the ink's middle within 1 px of the image's. Down: within 16 px (the layout centres line boxes; the motto has no capitals). */
export const MAX_OFFSET = { horizontal: 1, vertical: 16 } as const;

export function shareImageFacts(buf: Buffer): ShareImageFacts {
  const signature = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
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
  const interlaced = ihdr[12] !== 0;
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const px = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x]!;
      const a = x >= bpp ? px[y * stride + x - bpp]! : 0;
      const b = y > 0 ? px[(y - 1) * stride + x]! : 0;
      const c = x >= bpp && y > 0 ? px[(y - 1) * stride + x - bpp]! : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      px[y * stride + x] = (v + pred) & 0xff;
    }
  }
  const at = (x: number, y: number) => [px[y * stride + x * bpp]!, px[y * stride + x * bpp + 1]!, px[y * stride + x * bpp + 2]!] as const;

  let coloredPixels = 0;
  let left = width, right = -1;
  const rowMax: number[] = [];
  for (let y = 0; y < height; y++) {
    let max = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b] = at(x, y);
      if (r !== g || g !== b) coloredPixels++;
      if (r > 0) [left, right] = [Math.min(left, x), Math.max(right, x)];
      max = Math.max(max, r);
    }
    rowMax.push(max);
  }
  // Ink rows form bands: the lockup, then the motto, separated by more than 40 blank rows.
  const bands: Array<{ from: number; to: number; max: number }> = [];
  rowMax.forEach((m, y) => {
    if (m === 0) return;
    const last = bands.at(-1);
    if (last && y - last.to <= 40) {
      last.to = y;
      last.max = Math.max(last.max, m);
    } else bands.push({ from: y, to: y, max: m });
  });
  const corners = [at(0, 0), at(width - 1, 0), at(0, height - 1), at(width - 1, height - 1)].map(([r, g, b]) => r + g + b);
  return {
    signature,
    width,
    height,
    bitDepth,
    colorType,
    interlaced,
    coloredPixels,
    corners,
    bandMaxima: bands.map((b) => b.max),
    horizontalOffset: Math.abs((left + right) / 2 - (width - 1) / 2),
    verticalOffset: bands.length ? Math.abs((bands[0]!.from + bands.at(-1)!.to) / 2 - height / 2) : Infinity,
  };
}
