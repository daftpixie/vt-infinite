import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { SPOTIFY_LOGOS } from "@/lib/mode";

/**
 * Spotify's official full logo beside "now playing" (ADR 0009, "Logo"), on
 * the servers with NOW_PLAYING_ENABLED=true and a synthetic Spotify
 * (playwright.config.ts). The flag-off servers must not serve the files.
 */
const BASE = Number(process.env.E2E_PORT ?? 3100);
const FULL_OFF_URL = `http://127.0.0.1:${BASE}`;
const OFF_URL = `http://127.0.0.1:${BASE + 2}`;
const ON_URL = `http://127.0.0.1:${BASE + 4}`;
const FULL_ON_URL = `http://127.0.0.1:${BASE + 5}`;
test.use({ baseURL: ON_URL });

const HASHES: Record<string, string> = {
  [SPOTIFY_LOGOS.black]: "b91219c14405166e3667deb7f250df4b939a8a5dbc8460ee9525a75672ba9ec5",
  [SPOTIFY_LOGOS.white]: "31cdfcdd58d3533a32d287267a1c404f376749b1fc4da99e4baa2233684f053c",
};

/** The icon in the files' own units: x 11.77 to 230.59, y 3.22 to 222.04, in a viewBox 823.46 wide. */
const ICON = { x: 11.77, y: 3.22, size: 218.82, viewWidth: 823.46, artworkRight: 811.69 };

/** The logo the reader sees, and what it says to assistive technology. */
async function shown(page: Page) {
  return page.evaluate(() => {
    const imgs = [...document.querySelectorAll<HTMLImageElement>(".spotify-logo img")];
    const visible = imgs.filter((i) => getComputedStyle(i).display !== "none");
    return { visible: visible.map((i) => new URL(i.src).pathname), loaded: visible.every((i) => i.complete && i.naturalWidth > 0) };
  });
}

/** Every pixel of the visible logo, read back from a screenshot: counts of black, white and anything else. */
async function paint(page: Page) {
  const img = page.locator(".spotify-logo img:visible");
  const png = (await img.screenshot()).toString("base64");
  return page.evaluate(async (data) => {
    const im = new Image();
    im.src = `data:image/png;base64,${data}`;
    await im.decode();
    const c = document.createElement("canvas");
    c.width = im.width;
    c.height = im.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(im, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let white = 0, black = 0, gray = 0, colored = 0;
    for (let i = 0; i < d.length; i += 4) {
      const [r, g, b] = [d[i]!, d[i + 1]!, d[i + 2]!];
      if (Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b)) > 3) colored++;
      else if (r >= 250) white++;
      else if (r <= 5) black++;
      else gray++;
    }
    return { white, black, gray, colored, total: d.length / 4 };
  }, png);
}

for (const [name, scheme, stored, variant] of [
  ["system dark", "dark", null, SPOTIFY_LOGOS.white],
  ["system light", "light", null, SPOTIFY_LOGOS.black],
  ["Light chosen on a dark system", "dark", "light", SPOTIFY_LOGOS.black],
  ["Dark chosen on a light system", "light", "dark", SPOTIFY_LOGOS.white],
] as const) {
  test(`${name}: shows the ${variant === SPOTIFY_LOGOS.white ? "white" : "black"} logo from its first paint, named "Spotify" once`, async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: scheme, baseURL: ON_URL });
    if (stored) await context.addInitScript((t) => localStorage.setItem("vt-theme", t), stored);
    const page = await context.newPage();
    // Before scripts load or React hydrates: the theme is set by the inline boot script, so CSS already picks the variant.
    await page.goto("/", { waitUntil: "domcontentloaded" });
    expect((await shown(page)).visible).toEqual([variant]);
    await page.waitForLoadState("load");
    expect(await shown(page)).toEqual({ visible: [variant], loaded: true });
    await expect(page.getByRole("img", { name: "Spotify", exact: true })).toHaveCount(1);
    await context.close();
  });
}

test("follows the theme switch at once", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  expect((await shown(page)).visible).toEqual([SPOTIFY_LOGOS.white]);
  await page.getByRole("button", { name: "Light" }).click();
  expect((await shown(page)).visible).toEqual([SPOTIFY_LOGOS.black]);
  await page.getByRole("button", { name: "Dark" }).click();
  expect((await shown(page)).visible).toEqual([SPOTIFY_LOGOS.white]);
  await page.getByRole("button", { name: "System" }).click();
  expect((await shown(page)).visible).toEqual([SPOTIFY_LOGOS.white]);
});

for (const scheme of ["dark", "light"] as const) {
  test(`${scheme} theme: the logo actually paints ${scheme === "dark" ? "white on black" : "black on white"}, and nothing else`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/");
    await page.waitForLoadState("load");
    const p = await paint(page);
    // Anti-aliased edges are grays; there is no third color at all.
    expect(p.colored, "colored pixels").toBe(0);
    const [ink, ground] = scheme === "dark" ? [p.white, p.black] : [p.black, p.white];
    expect(ink / p.total, "share of the logo's own color").toBeGreaterThan(0.15);
    expect(ground / p.total, "share of the ground").toBeGreaterThan(0.3);
    expect((ink + ground + p.gray) / p.total).toBe(1);
    // The other color is only the ground: on dark, no black-on-black logo; on light, no white-on-white one.
    expect(p.gray / p.total, "edge pixels").toBeLessThan(0.2);
  });

  for (const width of [320, 390, 1280]) {
    test(`${scheme} theme, ${width} px: at least 70 px wide, with clear space of half the icon's height on every side`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width, height: 1200 });
      await page.goto("/");
      await page.waitForLoadState("load");
      const m = await page.evaluate((icon) => {
        const box = (el: Element | null) => (el ? el.getBoundingClientRect() : null);
        const wrap = document.querySelector(".spotify-logo")!;
        const visible = [...wrap.querySelectorAll("img")].find((i) => getComputedStyle(i).display !== "none")!;
        const r = visible.getBoundingClientRect();
        const s = r.width / icon.viewWidth;
        const clear = (icon.size / 2) * s;
        const art = { left: r.left + icon.x * s, top: r.top + icon.y * s, right: r.left + icon.artworkRight * s, bottom: r.top + (icon.y + icon.size) * s };
        const w = wrap.getBoundingClientRect();
        return {
          width: r.width,
          clear,
          room: { left: art.left - w.left, top: art.top - w.top, right: w.right - art.right, bottom: w.bottom - art.bottom },
          prevBottom: box(wrap.previousElementSibling)?.bottom ?? -Infinity,
          nextTop: box(wrap.nextElementSibling)?.top ?? Infinity,
          wrapTop: w.top,
          wrapBottom: w.bottom,
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        };
      }, ICON);
      expect(m.width).toBeGreaterThanOrEqual(70);
      for (const [side, room] of Object.entries(m.room)) expect(room, `clear space, ${side}`).toBeGreaterThanOrEqual(m.clear);
      // Nothing else enters the clear space: the neighbours sit outside the padded box.
      expect(m.prevBottom).toBeLessThanOrEqual(m.wrapTop);
      expect(m.nextTop).toBeGreaterThanOrEqual(m.wrapBottom);
      expect(m.overflow, "no horizontal scroll").toBe(false);
    });
  }
}

test("both files are served byte for byte, as SVG, from the site's own origin, only while the flag is on", async ({ request }) => {
  for (const path of [SPOTIFY_LOGOS.black, SPOTIFY_LOGOS.white]) {
    for (const base of [ON_URL, FULL_ON_URL]) {
      const res = await request.get(`${base}${path}`);
      expect(res.status(), `${base}${path}`).toBe(200);
      expect(res.headers()["content-type"]).toContain("image/svg+xml");
      expect(createHash("sha256").update(await res.body()).digest("hex")).toBe(HASHES[path]);
    }
    for (const base of [OFF_URL, FULL_OFF_URL]) expect((await request.get(`${base}${path}`, { maxRedirects: 0 })).status(), `${base}${path} (flag off)`).toBe(404);
  }
});

test("nothing else under /brand/third-party is served, flag on or off", async ({ request }) => {
  for (const path of ["/brand/third-party/", "/brand/third-party/spotify/", "/brand/third-party/spotify/Full_Logo_Green_RGB.svg", "/brand/third-party/spotify/full_logo_black_rgb.svg", `${SPOTIFY_LOGOS.white}/x`]) {
    // A trailing slash is normalised by a 308 first; the final answer must be 404.
    for (const base of [ON_URL, OFF_URL]) expect((await request.get(`${base}${path}`, { maxRedirects: 2 })).status(), `${base}${path}`).toBe(404);
  }
});
