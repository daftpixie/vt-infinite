import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SPOTIFY_LOGOS } from "@/lib/mode";

/**
 * Spotify's official full logo (ADR 0009, "Logo"), supplied by Matthew on
 * 24 Oct 2026 from Spotify's design page. The files are served byte for
 * byte: never edited, minified, optimised, inlined, traced or recoloured.
 */
const HASHES = {
  black: "b91219c14405166e3667deb7f250df4b939a8a5dbc8460ee9525a75672ba9ec5",
  white: "31cdfcdd58d3533a32d287267a1c404f376749b1fc4da99e4baa2233684f053c",
} as const;

const file = (k: keyof typeof SPOTIFY_LOGOS) => readFileSync(`public${SPOTIFY_LOGOS[k]}`);

describe("Spotify's logo files", () => {
  it.each(["black", "white"] as const)("the %s file is unchanged", (k) => {
    expect(createHash("sha256").update(file(k)).digest("hex")).toBe(HASHES[k]);
  });

  it.each(["black", "white"] as const)("the %s file carries no script, link, external reference or embedded image", (k) => {
    const svg = file(k).toString("utf8");
    expect(svg).toContain('viewBox="0 0 823.46 225.25"');
    expect(svg).not.toMatch(/<script|href|<image|url\(|<foreignObject|@import/i);
  });

  it("the white file paints white, the black file is not white: two colors only", () => {
    expect(file("white").toString("utf8")).toContain("fill:#fff");
    expect(file("black").toString("utf8")).not.toMatch(/fill:\s*#fff/i);
  });

  it("nothing else is under public/brand/third-party", () => {
    expect(readdirSync("public/brand/third-party", { recursive: true }).map(String).sort()).toEqual(["spotify", "spotify/Full_Logo_Black_RGB.svg", "spotify/Full_Logo_White_RGB.svg"]);
  });
});
