import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SHARE_IMAGE } from "@/lib/social";
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
