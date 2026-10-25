import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { SITE_NAME, STANDFIRST } from "@/lib/site";
import { SHARE_IMAGE, X_HANDLE } from "@/lib/social";
import { MAX_OFFSET, shareImageFacts, SPEC } from "../share-image-checks";

/**
 * Social share previews (ADR 0010) on the landing release: the flag-off
 * landing server, with SITE_URL unset (the default, the canonical host),
 * and the flag-on one, with SITE_URL=https://www.vt-infinite.com set.
 */
const BASE = Number(process.env.E2E_PORT ?? 3100);
const SERVERS = [
  { name: "now playing off, SITE_URL unset (the default)", url: `http://127.0.0.1:${BASE + 2}`, origin: "https://www.vt-infinite.com" },
  { name: "now playing on, SITE_URL set", url: `http://127.0.0.1:${BASE + 4}`, origin: "https://www.vt-infinite.com" },
] as const;

const PAGES = [
  { path: "/", title: SITE_NAME },
  { path: "/privacy", title: "Privacy notice · VT ∞" },
] as const;

/** Every description, canonical, Open Graph and X tag in <head>, as [key, value]. */
async function shareTags(page: Page): Promise<Array<[string, string]>> {
  return page.evaluate(() =>
    [...document.head.querySelectorAll('meta[name="description"], meta[property^="og:"], meta[name^="twitter:"], link[rel="canonical"]')].map((el) =>
      el.tagName === "LINK" ? (["canonical", el.getAttribute("href") ?? ""] as [string, string]) : ([el.getAttribute("property") ?? el.getAttribute("name") ?? "", el.getAttribute("content") ?? ""] as [string, string]),
    ),
  );
}

for (const server of SERVERS) {
  test.describe(`share previews (${server.name})`, () => {
    for (const p of PAGES) {
      test(`${p.path} carries every tag, with absolute URLs on ${server.origin}`, async ({ page }) => {
        await page.goto(`${server.url}${p.path}`);
        const url = p.path === "/" ? server.origin : `${server.origin}${p.path}`;
        const image = `${server.origin}${SHARE_IMAGE.url}`;
        // Every tag exactly once, in any order.
        const sorted = (t: Array<[string, string]>) => [...t].sort((a, b) => a[0].localeCompare(b[0]));
        expect(sorted(await shareTags(page))).toEqual(sorted([
          ["description", STANDFIRST],
          ["canonical", url],
          ["og:title", p.title],
          ["og:description", STANDFIRST],
          ["og:url", url],
          ["og:site_name", SITE_NAME],
          ["og:image", image],
          ["og:image:width", "1200"],
          ["og:image:height", "630"],
          ["og:image:type", "image/png"],
          ["og:image:alt", "VT Infinite"],
          ["og:type", "website"],
          ["twitter:card", "summary_large_image"],
          ["twitter:site", X_HANDLE],
          ["twitter:creator", X_HANDLE],
          ["twitter:title", p.title],
          ["twitter:description", STANDFIRST],
          ["twitter:image", image],
          ["twitter:image:alt", "VT Infinite"],
        ]));
        await expect(page).toHaveTitle(p.title);
      });
    }

    test("404 and 410 pages carry none of them", async ({ page }) => {
      for (const path of ["/does-not-exist", "/words", "/phial"]) {
        const res = await page.goto(`${server.url}${path}`);
        expect([404, 410]).toContain(res?.status());
        expect(await shareTags(page), path).toEqual([]);
      }
    });

    test("the image answers 200, image/png, the committed bytes, to a request with no cookies", async ({ playwright }) => {
      const crawler = await playwright.request.newContext({ extraHTTPHeaders: { "User-Agent": "facebookexternalhit/1.1" } });
      const res = await crawler.get(`${server.url}${SHARE_IMAGE.url}`, { maxRedirects: 0 });
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toBe("image/png");
      expect(res.headers()["set-cookie"]).toBeUndefined();
      const body = await res.body();
      expect(body.equals(readFileSync(`public${SHARE_IMAGE.url}`))).toBe(true);
      expect([body.readUInt32BE(16), body.readUInt32BE(20)]).toEqual([1200, 630]);
      // Security headers unchanged: the same as on the page.
      const page = await crawler.get(`${server.url}/`);
      for (const h of ["content-security-policy", "x-content-type-options", "referrer-policy", "permissions-policy", "x-frame-options"]) expect(res.headers()[h], h).toBe(page.headers()[h]);
      await crawler.dispose();
    });
  });
}

test("a fresh render by scripts/render-share-image.mjs meets the same specification as the committed image", () => {
  // Chromium's anti-aliasing differs between machines, so the bytes may differ; the specification may not (ADR 0010).
  const out = join(mkdtempSync(join(tmpdir(), "share-")), "share.png");
  const r = spawnSync(process.execPath, ["scripts/render-share-image.mjs", "--out", out], { encoding: "utf8", env: process.env });
  expect(r.status, `${r.stdout}${r.stderr}`).toBe(0);
  const facts = shareImageFacts(readFileSync(out));
  expect(facts).toMatchObject(SPEC);
  expect(facts.horizontalOffset).toBeLessThanOrEqual(MAX_OFFSET.horizontal);
  expect(facts.verticalOffset).toBeLessThanOrEqual(MAX_OFFSET.vertical);
});
