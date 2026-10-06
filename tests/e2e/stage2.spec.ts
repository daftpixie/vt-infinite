import { expect, test } from "@playwright/test";

// The server under test reads synthetic fixtures (playwright.config.ts).
const HIDDEN = ["SYNTHETIC-PRIVATE-HOLD-REASON", "synthetic-draft", "synthetic-held", "synthetic-scheduled", "must never render"];

test.describe("drafts, held and scheduled pieces never reach public output (W-2)", () => {
  for (const path of ["/", "/words", "/words?publication=vt-infinite.com", "/words/feed.xml", "/sitemap.xml", "/the-record", "/the-record/feed.xml"]) {
    test(path, async ({ request }) => {
      const body = await (await request.get(path)).text();
      for (const h of HIDDEN) expect(body).not.toContain(h);
    });
  }
  for (const slug of ["synthetic-draft", "synthetic-held", "synthetic-scheduled"]) {
    test(`/words/${slug} → 404`, async ({ request }) => {
      expect((await request.get(`/words/${slug}`)).status()).toBe(404);
    });
  }
});

test.describe("Words (PRD §06, SS-4, SS-5)", () => {
  test("lists local essays and stream posts newest first, each once", async ({ page }) => {
    await page.goto("/words");
    const titles = page.locator(".words-title");
    await expect(titles).toHaveText([
      /Synthetic post kept off Home/,
      "Synthetic fixture essay",
      /Synthetic stream post \(fixture\)/,
      "Synthetic fixture mirror",
    ]);
    await expect(page.getByRole("link", { name: "Synthetic fixture mirror" })).toHaveAttribute("href", "/words/synthetic-mirror");
    const external = page.getByRole("link", { name: /Synthetic stream post/ });
    await expect(external).toHaveAttribute("href", "https://everydecimal.substack.com/p/synthetic-stream-post");
    await expect(external).toContainText("↗");
    await expect(external).not.toHaveAttribute("target", /.+/);
  });

  test("labels a stale read in server-rendered HTML", async ({ request }) => {
    const html = await (await request.get("/words")).text();
    expect(html).toContain('data-stream-status="stale"');
    expect(html).toMatch(/last read/);
  });

  test("filters by publication without JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/words");
    await page.getByRole("navigation", { name: "Filter by publication" }).getByRole("link", { name: "vt-infinite.com" }).click();
    await expect(page).toHaveURL(/publication=vt-infinite\.com/);
    await expect(page.locator(".words-title")).toHaveText(["Synthetic fixture essay"]);
    await expect(page.getByRole("navigation", { name: "Filter by publication" }).locator('[aria-current="page"]')).toHaveText("vt-infinite.com");
    await context.close();
  });

  test("an essay page puts corrections first and uses the approved byline", async ({ page }) => {
    await page.goto("/words/synthetic-site-essay");
    const order = await page.evaluate(() => {
      const c = document.querySelector(".corrections");
      const h1 = document.querySelector("h1");
      return c && h1 ? Boolean(c.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING) : null;
    });
    expect(order).toBe(true);
    await expect(page.locator(".byline")).toHaveText("Matthew J Adams");
    await expect(page.locator(".corrections")).toContainText("10 Sep 2026");
    await expect(page.locator(".essay-cover")).toHaveJSProperty("complete", true);
    await expect(page.getByText("Cover: Synthetic test image, generated for tests.")).toBeVisible();
    await expect(page.getByRole("link", { name: /external page/ })).toContainText("↗");
  });

  test("a mirror names its first publication as canonical", async ({ page }) => {
    await page.goto("/words/synthetic-mirror");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://everydecimal.substack.com/p/synthetic-fixture-mirror");
    await expect(page.getByRole("link", { name: /read it there/ })).toHaveAttribute("href", "https://everydecimal.substack.com/p/synthetic-fixture-mirror");
  });

  test("serves only the assets a published essay names (W-5)", async ({ request }) => {
    const ok = await request.get("/words/synthetic-site-essay/assets/cover.png");
    expect(ok.status()).toBe(200);
    expect(ok.headers()["content-type"]).toBe("image/png");
    for (const path of ["/words/synthetic-site-essay/assets/..%2Findex.mdx", "/words/synthetic-site-essay/assets/index.mdx", "/words/synthetic-draft/assets/cover.png"]) {
      expect((await request.get(path)).status(), path).toBe(404);
    }
  });

  test("the sitemap lists published content", async ({ request }) => {
    const xml = await (await request.get("/sitemap.xml")).text();
    expect(xml).toContain("/words/synthetic-site-essay");
    expect(xml).toContain("/the-record/synthetic-entry");
  });
});

test.describe("Home", () => {
  test("shows the three newest posts that pass the homepage checks", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".words-title")).toHaveText(["Synthetic fixture essay", /Synthetic stream post/, "Synthetic fixture mirror"]);
    await expect(page.getByText("Synthetic post kept off Home")).toHaveCount(0);
  });
  test("keeps Matthew-owned placeholders visible", async ({ page }) => {
    await page.goto("/");
    for (const id of ["directionsOfWork", "oneRhythmSummary", "governanceIntro", "roverDemoEntry"]) {
      await expect(page.locator(`[data-placeholder="${id}"]`)).toBeVisible();
    }
  });
});

test.describe("The Record (new system)", () => {
  test("an entry shows what changed, evidence, who decided and what is open", async ({ page }) => {
    await page.goto("/the-record/synthetic-entry");
    for (const h of ["What changed", "Evidence", "Who decided", "What is still open"]) await expect(page.getByRole("heading", { name: h })).toBeVisible();
    await expect(page.getByText(/Republished; first published/)).toBeVisible();
  });
});

test.describe("Code (G-1 to G-4)", () => {
  test("shows an honest empty state", async ({ page }) => {
    await page.goto("/code");
    await expect(page.getByText("No repositories are listed yet.")).toBeVisible();
    await expect(page.locator("main")).not.toContainText(/stars|forks|followers/i);
  });
});

test.describe("Lorenz figure (PRD §08)", () => {
  test("still frame and computed caption without JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/");
    const still = page.locator(".lorenz svg[role=img]");
    await expect(still).toBeVisible();
    await expect(still).toHaveAttribute("aria-label", /17\.870.*21\.835/);
    await expect(page.locator("#lorenz-caption")).toContainText("first exceeds 1 at t = 17.870");
    await expect(page.locator("#lorenz-caption")).toContainText("not a reenactment");
    await expect(page.getByRole("button", { name: "Start the demonstration" })).toBeHidden();
    await context.close();
  });

  test("starts only when asked, pauses, and is operable by keyboard", async ({ page }) => {
    await page.goto("/");
    const readout = page.locator(".lorenz .figure-readout");
    await expect(readout).toHaveText(/^t = 0\.000 · distance 0\.000127 · Together$/);
    await page.waitForTimeout(300);
    await expect(readout).toHaveText(/^t = 0\.000/);
    const start = page.getByRole("button", { name: "Start the demonstration" });
    await start.focus();
    await page.keyboard.press("Enter");
    await expect(readout).not.toHaveText(/^t = 0\.000/);
    const pause = page.getByRole("button", { name: "Pause" });
    await pause.focus();
    await page.keyboard.press("Enter");
    const paused = await readout.textContent();
    await page.waitForTimeout(300);
    await expect(readout).toHaveText(paused ?? "");
    await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
  });

  test.describe("with reduced motion", () => {
    test.use({ reducedMotion: "reduce" });
    test("shows the final frame without animating", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("button", { name: "Show the result" }).click();
      await expect(page.locator(".lorenz .figure-readout")).toHaveText(/^t = 40\.000 · distance \d+\.\d{3} · Apart$/);
    });
  });
});

test.describe("Mandelbrot is held until its kernel is approved (P7)", () => {
  test("Agency shows the placeholder and no figure", async ({ page, request }) => {
    await page.goto("/agency");
    await expect(page.locator('[data-placeholder="mandelbrotFigure"]')).toBeVisible();
    await expect(page.locator(".mandelbrot")).toHaveCount(0);
    expect((await request.get("/figures/mandelbrot-still.png")).status()).toBe(404);
  });
});

test.describe("Proposed governance stays informational (GOV-1 to GOV-3)", () => {
  test("no participation surface", async ({ page }) => {
    await page.goto("/governance");
    await expect(page.locator("h1")).toHaveText("Proposed corporate governance");
    await expect(page.getByText("Proposed — not yet adopted")).toBeVisible();
    await expect(page.locator("main form, main input, main select, main textarea, main button")).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText(/\b(vote|ballot|enrol|enroll|wallet|sign up|join)\b/i);
  });
});
