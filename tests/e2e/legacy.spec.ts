import { expect, test } from "@playwright/test";

test.describe("old URL table (PRD DN-6)", () => {
  for (const [from, to] of [
    ["/origin", "/agency"],
    ["/partners", "/contact"],
  ]) {
    test(`${from} → 308 ${to}`, async ({ request }) => {
      const res = await request.get(from!, { maxRedirects: 0 });
      expect(res.status()).toBe(308);
      expect(res.headers()["location"]).toBe(to);
    });
  }

  test("/phial → 410 with an explanatory page", async ({ page, request }) => {
    const res = await request.get("/phial", { maxRedirects: 0 });
    expect(res.status()).toBe(410);
    const html = await res.text();
    expect(html).not.toMatch(/phial/i);
    await page.goto("/phial");
    await expect(page.locator("h1")).toHaveText("This page is not available");
    // A 410 here may be temporary (PRD DN-6): no claim that nothing replaces it.
    await expect(page.locator("main")).not.toContainText(/nothing replaces|permanently|never return/i);
    await expect(page.getByRole("link", { name: "Words" }).first()).toBeVisible();
  });

  test("/the-record/feed.xml keeps its path", async ({ request }) => {
    expect((await request.get("/the-record/feed.xml", { maxRedirects: 0 })).status()).toBe(200);
  });
});
