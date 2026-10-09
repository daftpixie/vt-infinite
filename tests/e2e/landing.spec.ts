import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { runRules } from "@/guards/rules.mjs";
import { LANDING } from "@/lib/landing";
import { LANDING_PATHS } from "@/lib/mode";
import { ROUTES } from "@/lib/routes";
import { pageText } from "./helpers";

// The landing server: the same build, started with SITE_MODE=landing (playwright.config.ts).
const LANDING_URL = `http://127.0.0.1:${Number(process.env.E2E_PORT ?? 3100) + 2}`;
test.use({ baseURL: LANDING_URL });

const PAGES = ["/", "/privacy"];
/** Pages a reader can reach in landing mode, including the 404 and 410 answers. */
const SURFACES = [...PAGES, "/does-not-exist", "/words", "/phial"];

test.describe("landing mode: only the landing release answers (exhaustive over lib/routes.ts)", () => {
  for (const route of ROUTES) {
    test(`${route.path} → ${route.landing}`, async ({ request }) => {
      const res = await request.get(route.path, { maxRedirects: 0 });
      expect(res.status()).toBe(route.landing);
    });
  }

  test("the 200s are exactly the landing paths", () => {
    expect(ROUTES.filter((r) => r.landing === 200).map((r) => r.path).sort()).toEqual([...LANDING_PATHS].sort());
  });

  test("other methods and APIs answer 404 too", async ({ request }) => {
    expect((await request.post("/api/cron/refresh")).status()).toBe(404);
    expect((await request.get("/api/cron/refresh", { headers: { Authorization: "Bearer anything" } })).status()).toBe(404);
    expect((await request.get("/api/admin/x")).status()).toBe(404);
    expect((await request.get("/api/anything")).status()).toBe(404);
  });

  test("the 404 page links only to the landing page", async ({ page }) => {
    const res = await page.goto("/words");
    expect(res?.status()).toBe(404);
    await expect(page.locator("h1")).toHaveText("Not found");
    const hrefs = await page.locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    expect(hrefs).toEqual(["#main", "/"]);
  });

  test("the old-URL table still applies: /phial is 410, linking only to the landing page", async ({ page, request }) => {
    expect((await request.get("/phial", { maxRedirects: 0 })).status()).toBe(410);
    await page.goto("/phial");
    await expect(page.locator("h1")).toHaveText("This page is not available");
    const hrefs = await page.locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    expect(hrefs).toEqual(["#main", "/"]);
  });

  test("redirects in the old-URL table are unchanged", async ({ request }) => {
    const res = await request.get("/origin", { maxRedirects: 0 });
    expect(res.status()).toBe(308);
    expect(res.headers()["location"]).toBe("/agency");
  });

  test("robots.txt and the sitemap list only the landing release's pages", async ({ request }) => {
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toBe("User-agent: *\nAllow: /$\nAllow: /privacy\nDisallow: /\n\nSitemap: https://vt-infinite.com/sitemap.xml\n");
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])).toEqual(["https://vt-infinite.com", "https://vt-infinite.com/privacy"]);
  });
});

test.describe("the landing page", () => {
  test("reads in order: mark, acrostic heading, three sentences, motto, links, sign-up, footer", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("main")).toMatchAriaSnapshot(`
      - main:
        - heading "VT Infinite" [level=1]:
          - img "VT Infinite"
        - region "Heart. Mind. Hands.":
          - heading "Heart. Mind. Hands." [level=2]
          - list:
            - listitem: Heart defines the purpose.
            - listitem: Mind defines the method.
            - listitem: Hands build the hope.
        - paragraph: ad astra per aspera
        - list:
          - listitem:
            - link "The Human Butterfly ↗ (opens another site)":
              - /url: https://everydecimal.substack.com
          - listitem:
            - link "Incentive Eyes ↗ (opens another site)":
              - /url: https://incentiveeyes.substack.com
          - listitem:
            - link "The VT Infinite Discord ↗ (opens another site)":
              - /url: https://discord.gg/zkdFVqG4Gz
        - paragraph: Updates sign-up opens soon
    `);
    await expect(page.locator("footer")).toMatchAriaSnapshot(`
      - contentinfo:
        - paragraph: VT Infinite, Inc.
        - list:
          - listitem:
            - link "Privacy notice":
              - /url: /privacy
          - listitem:
            - link "matthew@vt-infinite.com":
              - /url: mailto:matthew@vt-infinite.com
    `);
    // No site header or primary navigation in the landing release.
    await expect(page.getByRole("navigation")).toHaveCount(0);
  });

  test("each item's accessible text is one sentence, and the visible periods are hidden", async ({ page }) => {
    await page.goto("/");
    const items = page.locator(".acrostic-list > li");
    await expect(items).toHaveCount(3);
    const sentences = ["Heart defines the purpose.", "Mind defines the method.", "Hands build the hope."];
    for (let i = 0; i < 3; i++) {
      await expect(items.nth(i)).toHaveAccessibleName(""); // list items take no name; their text is read as content
      await expect(items.nth(i)).toMatchAriaSnapshot(`- listitem: ${sentences[i]}`);
    }
    await expect(page.locator(".acrostic-across [aria-hidden=true]")).toHaveText([".", ".", "."]);
    await expect(page.locator(".acrostic-list br")).toHaveCount(0);
    // What a sighted reader sees: the bold top row, then one word per line.
    const lines = await items.evaluateAll((els) =>
      els.map((el) => {
        const rows = new Map<number, string>();
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          for (const m of (n.textContent ?? "").matchAll(/\S+/g)) {
            const range = document.createRange();
            range.setStart(n, m.index);
            range.setEnd(n, m.index + m[0].length);
            const top = Math.round(range.getBoundingClientRect().top);
            rows.set(top, (rows.get(top) ?? "") + m[0]);
          }
        }
        return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, w]) => w);
      }),
    );
    expect(lines).toEqual([
      ["Heart.", "defines", "the", "purpose."],
      ["Mind.", "defines", "the", "method."],
      ["Hands.", "build", "the", "hope."],
    ]);
    const weights = await page.locator(".acrostic-across").evaluateAll((els) => els.map((el) => getComputedStyle(el).fontWeight));
    expect(weights).toEqual(["700", "700", "700"]);
  });

  test("works without JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL: LANDING_URL });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 2 })).toHaveText("Heart. Mind. Hands.");
    await expect(page.locator(".acrostic-list > li")).toHaveCount(3);
    await expect(page.getByText(LANDING.motto, { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /The Human Butterfly/ })).toBeVisible();
    await expect(page.locator("footer")).toContainText("VT Infinite, Inc.");
    await context.close();
  });

  test("uses the small mark as its favicon", async ({ page, request }) => {
    await page.goto("/");
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "/brand/vt-infinite-mark-small.svg");
    const res = await request.get("/brand/vt-infinite-mark-small.svg");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/svg+xml");
  });

  test("sets no cookies and requests nothing from another origin", async ({ page, context }) => {
    const origins = new Set<string>();
    page.on("request", (r) => origins.add(new URL(r.url()).origin));
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect([...origins]).toEqual([LANDING_URL]);
    expect(await context.cookies()).toEqual([]);
  });
});

type Layout = { lefts: number[]; tops: number[]; heights: number[]; lineHeight: number; scroll: number; client: number };

async function layout(page: Page): Promise<Layout> {
  return page.evaluate(() => {
    const items = [...document.querySelectorAll<HTMLElement>(".acrostic-list > li .acrostic-text")];
    const r = items.map((el) => el.getBoundingClientRect());
    return {
      lefts: r.map((x) => Math.round(x.left)),
      tops: r.map((x) => Math.round(x.top)),
      heights: r.map((x) => Math.round(x.height)),
      lineHeight: parseFloat(getComputedStyle(items[0]!).lineHeight),
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    };
  });
}

function expectRow(l: Layout) {
  expect(new Set(l.tops).size, "one row: every column starts on the same line").toBe(1);
  expect(l.lefts[0]! < l.lefts[1]! && l.lefts[1]! < l.lefts[2]!).toBe(true);
}

function expectStacked(l: Layout) {
  expect(new Set(l.lefts).size, "stacked: every block starts at the same left edge").toBe(1);
  expect(l.tops[0]! < l.tops[1]! && l.tops[1]! < l.tops[2]!).toBe(true);
}

test.describe("acrostic layout", () => {
  for (const [width, textSize, expected] of [
    [1280, "100%", "row"],
    [768, "100%", "row"],
    [320, "100%", "stacked"],
    [1280, "200%", "row"],
    [640, "200%", "stacked"],
    [320, "200%", "stacked"],
  ] as const) {
    test(`${width} px at ${textSize} text: ${expected}, four lines a column, on one grid, no horizontal scroll`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await page.evaluate((size) => (document.documentElement.style.fontSize = size), textSize);
      const l = await layout(page);
      if (expected === "row") expectRow(l);
      else expectStacked(l);
      // Every column is exactly four lines of one leading: the shared baseline grid.
      for (const h of l.heights) expect(h).toBe(Math.round(4 * l.lineHeight));
      expect(l.scroll, "no horizontal scroll").toBeLessThanOrEqual(l.client);
    });
  }
});

/** WCAG relative luminance contrast of two rgb() colors. */
function contrast(a: string, b: string): number {
  const lum = (c: string) => {
    const [r, g, bl] = (c.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

for (const scheme of ["dark", "light"] as const) {
  test.describe(`landing, ${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test("the motto is at least 16 px and 4.5:1", async ({ page }) => {
      await page.goto("/");
      const s = await page.getByText(LANDING.motto, { exact: true }).evaluate((el) => {
        const cs = getComputedStyle(el);
        return { size: parseFloat(cs.fontSize), color: cs.color, ground: getComputedStyle(document.documentElement).backgroundColor };
      });
      expect(s.size).toBeGreaterThanOrEqual(16);
      expect(contrast(s.color, s.ground)).toBeGreaterThanOrEqual(4.5);
    });

    for (const path of SURFACES) {
      test(`axe: no serious or critical issues on ${path}`, async ({ page }) => {
        const res = await page.goto(path);
        expect(res?.status()).toBeLessThan(500);
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
        const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        expect(blocking.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
      });
    }
  });
}

test.describe("keyboard and targets", () => {
  test("Tab reaches every control in reading order, each with a visible focus ring", async ({ page }) => {
    await page.goto("/");
    const expected = [
      "Skip to content",
      "The Human Butterfly ↗ (opens another site)",
      "Incentive Eyes ↗ (opens another site)",
      "The VT Infinite Discord ↗ (opens another site)",
      "Privacy notice",
      "matthew@vt-infinite.com",
      "Dark",
      "Light",
      "System",
    ];
    for (const name of expected) {
      await page.keyboard.press("Tab");
      const f = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        return { text: el.textContent?.trim() ?? "", outline: getComputedStyle(el).outlineStyle, width: parseFloat(getComputedStyle(el).outlineWidth) };
      });
      expect(f.text).toBe(name);
      expect(f.outline).toBe("solid");
      expect(f.width).toBeGreaterThanOrEqual(2);
    }
  });

  test("every link and button is at least 44 by 44 px", async ({ page }) => {
    await page.goto("/");
    const boxes = await page.locator("main a, main button, footer a, footer button").evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { text: el.textContent?.trim(), w: r.width, h: r.height };
      }),
    );
    expect(boxes.length).toBe(8);
    for (const b of boxes) {
      expect(b.h, b.text).toBeGreaterThanOrEqual(44);
      expect(b.w, b.text).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe("rendered copy passes every guard (landing)", () => {
  for (const path of SURFACES) {
    test(path, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBeLessThan(500);
      const text = await pageText(page);
      expect(runRules(`${await page.title()}\n${text}`, { target: path })).toEqual([]);
    });
  }
});
