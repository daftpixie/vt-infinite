import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { runRules } from "@/guards/rules.mjs";
import { NOW_PLAYING_API, STATE_TEXT } from "@/lib/now-playing/view";
import { pageText } from "./helpers";

/**
 * "Now playing" with NOW_PLAYING_ENABLED=true (ADR 0009), on servers that
 * answer from a synthetic Spotify (playwright.config.ts). The flag-off
 * landing server and its tests (landing.spec.ts) are unchanged.
 */
const BASE = Number(process.env.E2E_PORT ?? 3100);
const OFF_URL = `http://127.0.0.1:${BASE + 2}`;
const ON_URL = `http://127.0.0.1:${BASE + 4}`;
const FULL_ON_URL = `http://127.0.0.1:${BASE + 5}`;
test.use({ baseURL: ON_URL });

/** Where everything above the component sits. */
async function above(page: Page) {
  return page.evaluate(() =>
    ["h1", ".acrostic", ".motto", ".landing-links"].map((sel) => {
      const r = document.querySelector(sel)!.getBoundingClientRect();
      return { sel, x: r.x, y: r.y, w: r.width, h: r.height };
    }),
  );
}

test.describe("the landing page with now playing on", () => {
  test("sits below the links and above the sign-up line, read in order", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("main")).toMatchAriaSnapshot(`
      - main:
        - heading "VT Infinite" [level=1]:
          - img "VT Infinite"
        - heading "Heart. Mind. Hands." [level=2]
        - list:
          - listitem: Heart defines the purpose.
          - listitem: Mind defines the method.
          - listitem: Hands build the hope.
        - paragraph: ad astra per aspera
        - list:
          - listitem:
            - link "The Human Butterfly (opens another site)"
          - listitem:
            - link "Incentive Eyes (opens another site)"
          - listitem:
            - link "The VT Infinite Discord (opens another site)"
        - region "What is Matty vibing to?":
          - heading "What is Matty vibing to?" [level=2]
          - paragraph: Playing
          - term: Track
          - definition:
            - link "Synthetic Track (opens another site)":
              - /url: https://open.spotify.com/track/SyntheticTrackId000001
          - term: Artists
          - definition:
            - link "Synthetic Artist (opens another site)":
              - /url: https://open.spotify.com/artist/SyntheticArtistId00001
            - text: ","
            - link "Second Synthetic Artist (opens another site)":
              - /url: https://open.spotify.com/artist/SyntheticArtistId00002
          - term: Album
          - definition:
            - link "Synthetic Album (opens another site)":
              - /url: https://open.spotify.com/album/SyntheticAlbumId000001
          - paragraph: /Placeholder/
        - paragraph: Updates sign-up opens soon
    `);
  });

  test("shows the label verbatim, with the emoji hidden from screen readers", async ({ page }) => {
    await page.goto("/");
    const label = page.locator("#now-playing-label");
    await expect(label).toHaveText("What is Matty vibing to? ❤️");
    await expect(label).toHaveAccessibleName("What is Matty vibing to?");
    await expect(label.locator('[aria-hidden="true"]')).toHaveText("❤️");
  });

  test("moves nothing above it: the mark, acrostic, motto and links sit where they do with the feature off", async ({ page, browser }) => {
    for (const width of [1280, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await page.evaluate(async () => void (await document.fonts.load(`1rem "JetBrains Mono"`)));
      const off = await browser.newPage({ viewport: { width, height: 900 } });
      await off.goto(`${OFF_URL}/`);
      await off.evaluate(async () => void (await document.fonts.load(`1rem "JetBrains Mono"`)));
      expect(await above(page), `${width} px`).toEqual(await above(off));
      await off.close();
    }
  });

  test("causes no layout shift while it loads and polls", async ({ page }) => {
    await page.clock.install();
    await page.addInitScript(() => {
      (window as unknown as { __cls: number }).__cls = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value;
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto("/");
    await expect(page.locator("[data-now-playing-live]")).toHaveAttribute("data-now-playing-live", "on");
    await page.clock.runFor(31_000);
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBe(0);
  });

  test("is complete without JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL: ON_URL });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.locator(".now-playing-state")).toHaveText(STATE_TEXT.playing);
    await expect(page.getByRole("link", { name: /Synthetic Track/ })).toBeVisible();
    await expect(page.locator("[data-now-playing-live]")).toHaveAttribute("data-now-playing-live", "off");
    await context.close();
  });

  test("polls the site's own API every 30 s while visible, and stops while hidden", async ({ page }) => {
    const polls: string[] = [];
    page.on("request", (r) => {
      if (new URL(r.url()).pathname === NOW_PLAYING_API) polls.push(r.url());
    });
    // Each poll is scheduled once the previous answer is in, so advance the clock only after it arrives.
    const tick = async (ms: number) => {
      const answered = page.waitForResponse((r) => new URL(r.url()).pathname === NOW_PLAYING_API);
      await page.clock.runFor(ms);
      await answered;
      await page.evaluate(() => new Promise((r) => setTimeout(r, 0)));
    };
    await page.clock.install();
    await page.goto("/");
    await expect(page.locator("[data-now-playing-live]")).toHaveAttribute("data-now-playing-live", "on");
    await page.clock.runFor(29_000);
    expect(polls).toHaveLength(0);
    await tick(1_000);
    expect(polls).toHaveLength(1);
    await tick(30_000);
    expect(polls).toHaveLength(2);
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.clock.runFor(5 * 60_000);
    await page.waitForTimeout(300);
    expect(polls, "no poll while hidden").toHaveLength(2);
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await tick(1_000);
    expect(polls, "catches up when shown again").toHaveLength(3);
    for (const u of polls) expect(new URL(u).origin).toBe(ON_URL);
  });

  test("every browser request goes to the site's own origin, while polling too, and sets no cookies", async ({ page, context }) => {
    const origins = new Set<string>();
    page.on("request", (r) => origins.add(new URL(r.url()).origin));
    await page.clock.install();
    for (const path of ["/", "/privacy"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
    }
    await page.goto("/");
    await page.clock.runFor(61_000);
    await page.waitForLoadState("networkidle");
    expect([...origins]).toEqual([ON_URL]);
    expect(await context.cookies()).toEqual([]);
    await expect(page.locator(".now-playing img, .now-playing svg, .now-playing iframe, iframe, embed, object")).toHaveCount(0);
  });

  test("keeps the CSP unchanged", async ({ request }) => {
    const on = (await request.get(`${ON_URL}/`)).headers()["content-security-policy"];
    const off = (await request.get(`${OFF_URL}/`)).headers()["content-security-policy"];
    expect(on).toBe(off);
    expect(on).toContain("connect-src 'self'");
  });

  test("respects reduced motion: nothing in it animates or transitions", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce", baseURL: ON_URL });
    const page = await context.newPage();
    await page.goto("/");
    const motion = await page.locator(".now-playing, .now-playing *").evaluateAll((els) =>
      els.map((el) => {
        const cs = getComputedStyle(el);
        return `${cs.animationName}|${cs.transitionDuration}`;
      }),
    );
    for (const m of motion) expect(["none|0s"]).toContain(m);
    await context.close();
  });

  test("the rendered page passes every guard", async ({ page }) => {
    await page.goto("/");
    expect(runRules(`${await page.title()}\n${await pageText(page)}`, { target: "/" })).toEqual([]);
  });

  test("the API answers the projection, uncached, and nothing else", async ({ request }) => {
    const res = await request.get(NOW_PLAYING_API);
    expect(res.status()).toBe(200);
    expect(res.headers()["cache-control"]).toBe("no-store");
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["checkedAt", "servedAt", "view"]);
    expect(body.view.state).toBe("playing");
    expect(JSON.stringify(body)).not.toMatch(/image|device|progress|timestamp|token/i);
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) expect((await request.fetch(NOW_PLAYING_API, { method })).status(), method).toBe(404);
    expect((await request.get(`${NOW_PLAYING_API}/child`)).status()).toBe(404);
  });

  test("with the flag off the API answers 404", async ({ request }) => {
    expect((await request.get(`${OFF_URL}${NOW_PLAYING_API}`)).status()).toBe(404);
  });
});

test.describe("the privacy notice with now playing on (landing-2)", () => {
  test("serves landing-2 with its Spotify sentences; the flag-off server still serves landing-1", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.locator("main")).toContainText("Version landing-2");
    await expect(page.locator("main")).toContainText("The home page shows what Matthew is playing on Spotify. This site asks Spotify for it. Your browser does not contact Spotify.");
    await expect(page.locator("main")).toContainText("Track links go to Spotify.");
    await page.goto(`${OFF_URL}/privacy`);
    await expect(page.locator("main")).toContainText("Version landing-1");
    await expect(page.locator("main")).not.toContainText("Spotify");
  });
});

test.describe("/vibes in the full build", () => {
  test("shows the same component with the flag on; the placeholder stays with it off", async ({ page }) => {
    await page.goto(`${FULL_ON_URL}/vibes`);
    await expect(page.locator(".now-playing-state")).toHaveText(STATE_TEXT.playing);
    await expect(page.locator("[data-placeholder=vibesNowPlaying]")).toHaveCount(0);
    await page.goto(`http://127.0.0.1:${BASE}/vibes`);
    await expect(page.locator("[data-placeholder=vibesNowPlaying]")).toHaveCount(1);
    await expect(page.locator(".now-playing")).toHaveCount(0);
  });

  test("is still 404 in landing mode", async ({ request }) => {
    expect((await request.get(`${ON_URL}/vibes`)).status()).toBe(404);
  });
});

for (const scheme of ["dark", "light"] as const) {
  test.describe(`now playing, ${scheme} theme`, () => {
    test.use({ colorScheme: scheme });
    for (const [name, url] of [
      ["/ (landing)", `${ON_URL}/`],
      ["/privacy (landing-2)", `${ON_URL}/privacy`],
      ["/vibes (full)", `${FULL_ON_URL}/vibes`],
    ] as const) {
      test(`axe: no serious or critical issues on ${name}`, async ({ page }) => {
        await page.goto(url);
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
        const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        expect(blocking.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
      });
    }

    test("the state is words in the figure color on the ground: black and white only", async ({ page }) => {
      await page.goto("/");
      const s = await page.locator(".now-playing-state").evaluate((el) => ({ color: getComputedStyle(el).color, bg: getComputedStyle(document.documentElement).backgroundColor }));
      const [white, black] = ["rgb(255, 255, 255)", "rgb(0, 0, 0)"];
      expect(s).toEqual(scheme === "dark" ? { color: white, bg: black } : { color: black, bg: white });
    });
  });
}
