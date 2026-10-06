import { expect, test } from "@playwright/test";
import { ROUTES } from "@/lib/routes";
import { PRIMARY_NAV, FOOTER_LINES } from "@/lib/site";

test.describe("every PRD §04 route answers as specified with flags off", () => {
  for (const route of ROUTES) {
    test(`${route.path} → ${route.status}`, async ({ request }) => {
      const res = await request.get(route.path, { maxRedirects: 0 });
      expect(res.status()).toBe(route.status);
    });
  }
});

test.describe("route shells render the site frame", () => {
  for (const route of ROUTES.filter((r) => r.kind === "page" && r.status === 200)) {
    test(route.path, async ({ page }) => {
      await page.goto(route.path);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      const links = page.getByRole("navigation", { name: "Primary" }).getByRole("link");
      await expect(links).toHaveText(PRIMARY_NAV.map((l) => l.label));
      const footer = page.locator("footer");
      for (const line of Object.values(FOOTER_LINES)) await expect(footer).toContainText(line);
      await expect(footer.getByRole("link", { name: "Marrs Rover" })).toHaveAttribute("href", "/marrs-rover");
      await expect(footer.getByRole("link", { name: "Proposed governance" })).toHaveAttribute("href", "/governance");
      for (const p of ["/policies/comments", "/policies/privacy", "/policies/terms"]) {
        await expect(footer.locator(`a[href="${p}"]`)).toHaveCount(1);
      }
      await expect(page.locator("meta[name=robots]")).toHaveAttribute("content", /noindex/);
    });
  }

  test("a page renders its text without JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.locator("h1")).toHaveText("We see the problem. We go to where it is.");
    await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link")).toHaveCount(6);
    await context.close();
  });
});

test.describe("feeds", () => {
  test("/words/feed.xml lists published local essays only", async ({ request }) => {
    const res = await request.get("/words/feed.xml");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/rss+xml");
    const xml = await res.text();
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>\n<rss version="2.0"/);
    expect(xml.match(/<item>/g)).toHaveLength(2);
    expect(xml).toContain("/words/synthetic-site-essay");
    expect(xml).not.toMatch(/synthetic-draft|synthetic-held|synthetic-scheduled|Synthetic stream post/);
    for (const d of xml.matchAll(/<pubDate>([^<]+)<\/pubDate>/g)) expect(Number.isNaN(Date.parse(d[1] as string))).toBe(false);
  });

  test("/the-record/feed.xml keeps a republished entry's original GUID", async ({ request }) => {
    const xml = await (await request.get("/the-record/feed.xml")).text();
    expect(xml).toContain('<guid isPermaLink="false">synthetic-legacy-guid-0001</guid>');
  });
});
