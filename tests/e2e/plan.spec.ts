import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { runRules } from "@/guards/rules.mjs";

// The plan server reads a synthetic stored projection (tests/fixtures/plan-snapshots).
const PLAN = `http://127.0.0.1:${Number(process.env.E2E_PORT ?? 3100) + 1}`;

test.describe("OneRhythm plan, flag off (default)", () => {
  test("page and API do not exist; Home shows only the placeholder", async ({ request, page }) => {
    expect((await request.get("/plan/onerhythm")).status()).toBe(404);
    expect((await request.get("/api/plan/onerhythm")).status()).toBe(404);
    await page.goto("/");
    await expect(page.locator('[data-placeholder="oneRhythmSummary"]')).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Read the OneRhythm plan" })).toHaveCount(0);
  });
});

test.describe("OneRhythm plan, flag on (synthetic projection)", () => {
  test("renders without JavaScript, with the read time and stale label server-rendered", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    const res = await page.goto(`${PLAN}/plan/onerhythm`);
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toHaveText("OneRhythm plan");
    await expect(page.locator('[data-plan-status="stale"]')).toContainText("Last read 1 Sep 2026, 08:00 EDT");
    await expect(page.locator(".plan-initiative-title")).toHaveText(["Synthetic plan initiative (fixture)", "Milestone: Synthetic milestone initiative (fixture)"]);
    await expect(page.locator(".plan-initiative").first().locator(".label")).toHaveText("1 done · 1 open · Due 30 Nov 2026");
    await expect(page.getByText("1 item is held for review and not shown.")).toBeVisible();
    await expect(page.locator('[data-plan-live="off"]')).toHaveCount(1);
    await context.close();
  });

  test("milestones differ by text and weight, not colour alone", async ({ page }) => {
    await page.goto(`${PLAN}/plan/onerhythm`);
    const milestone = page.locator(".plan-step-milestone .plan-milestone");
    await expect(milestone).toHaveText("Milestone: Synthetic milestone step (fixture)");
    expect(await milestone.evaluate((el) => getComputedStyle(el).fontWeight)).toBe("700");
    expect(await page.locator(".plan-step").first().evaluate((el) => getComputedStyle(el).fontWeight)).toBe("400");
  });

  test("links to nothing that shows more than the projection (A-10)", async ({ page }) => {
    await page.goto(`${PLAN}/plan/onerhythm`);
    expect(await page.locator("main a").count()).toBe(0);
    expect(await page.content()).not.toMatch(/asana\.com|<iframe/i);
  });

  test("polls the site's own projection every 60 seconds", async ({ page }) => {
    await page.clock.install();
    await page.goto(`${PLAN}/plan/onerhythm`);
    // Fast-forward only once the poller has started; before hydration there is no timer to fire.
    await expect(page.locator('[data-plan-live="on"]')).toHaveCount(1);
    const polled = page.waitForRequest((r) => r.url() === `${PLAN}/api/plan/onerhythm` && r.method() === "GET");
    await page.clock.fastForward(60_000);
    const req = await polled;
    const res = await req.response();
    expect(res?.status()).toBe(200);
    expect(res?.headers()["cache-control"]).toBe("no-store");
    await expect(page.locator(".plan-initiative-title").first()).toHaveText("Synthetic plan initiative (fixture)");
  });

  test("Home summarises the same snapshot and links to the plan", async ({ page }) => {
    await page.goto(`${PLAN}/`);
    const summary = page.locator(".plan-summary");
    await expect(summary).toContainText("Synthetic plan initiative (fixture) · 1 done · 1 open");
    await expect(summary.locator('[data-plan-status="stale"]')).toHaveCount(1);
    await expect(summary.getByRole("link", { name: "Read the OneRhythm plan" })).toHaveAttribute("href", "/plan/onerhythm");
  });

  test("rendered copy passes every guard", async ({ page }) => {
    for (const path of ["/plan/onerhythm", "/"]) {
      await page.goto(`${PLAN}${path}`);
      const text = await page.evaluate(() => document.body.innerText);
      expect(runRules(`${await page.title()}\n${text}`, { target: path })).toEqual([]);
    }
  });

  for (const scheme of ["dark", "light"] as const) {
    test(`axe, ${scheme} theme: no serious or critical issues on the plan and Home`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      for (const path of ["/plan/onerhythm", "/"]) {
        await page.goto(`${PLAN}${path}`);
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
        const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        expect(blocking.map((v) => `${path} ${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
      }
    });
  }
});
