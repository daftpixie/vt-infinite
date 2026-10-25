import { createHash } from "node:crypto";
import { crc32, deflateSync, inflateSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SHARE_IMAGE } from "@/lib/social";
import { grayOnly } from "@/scripts/render-share-image.mjs";
import { MAX_OFFSET, shareImageFacts, SPEC } from "../share-image-checks";

/**
 * The committed share image (ADR 0010). The end-to-end suite re-renders it
 * with scripts/render-share-image.mjs and checks the fresh render against
 * the same specification (rendering is not byte-identical across machines).
 */
const FILE = `public${SHARE_IMAGE.url}`;
/** Recorded in docs/adr/0010-social-share-previews.md. */
const SHA256 = "b8df161811531d9ff74dd3f120ecbadfc47e488ab7d1520ec978661d178fec9a";

const buf = readFileSync(FILE);
const facts = shareImageFacts(buf);

describe("the share image", () => {
  it("is the recorded file, a PNG under 300 KB", () => {
    expect(createHash("sha256").update(buf).digest("hex")).toBe(SHA256);
    expect(buf.length).toBeLessThan(300 * 1024);
    expect(SHARE_IMAGE.type).toBe("image/png");
  });

  it("is 1200 × 630, 8-bit, matching the metadata", () => {
    expect([facts.width, facts.height]).toEqual([SHARE_IMAGE.width, SHARE_IMAGE.height]);
    expect([2, 6]).toContain(facts.colorType);
  });

  it("is black and white with the motto's gray: no other color, a black ground, white mark, motto exactly #909090 at its brightest, centred", () => {
    expect(facts).toMatchObject(SPEC);
    expect(facts.horizontalOffset).toBeLessThanOrEqual(MAX_OFFSET.horizontal);
    expect(facts.verticalOffset).toBeLessThanOrEqual(MAX_OFFSET.vertical);
  });
});

/** A tiny RGB PNG, unfiltered, for the gray-only fallback. */
function rgbPng(width: number, pixels: number[][]): Buffer {
  const height = pixels.length / width;
  const chunk = (type: string, data: Buffer) => {
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
  const rows = Buffer.concat(Array.from({ length: height }, (_, y) => Buffer.from([0, ...pixels.slice(y * width, (y + 1) * width).flat()])));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", hdr), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}

describe("the render script's gray-only fallback", () => {
  it("returns a gray render byte for byte", () => {
    const gray = rgbPng(2, [[0, 0, 0], [144, 144, 144]]);
    expect(grayOnly(gray).equals(gray)).toBe(true);
  });

  it("turns coloured anti-aliasing fringes into the gray of their luminance, never brighter than the brightest channel", () => {
    const out = grayOnly(rgbPng(3, [[0, 0, 0], [144, 120, 96], [255, 255, 255]]));
    const raw = inflateSync(out.subarray(33 + 8, out.length - 12));
    // 0.2126 × 144 + 0.7152 × 120 + 0.0722 × 96 = 123.37.
    expect([...raw]).toEqual([0, 0, 0, 0, 123, 123, 123, 255, 255, 255]);
  });
});
