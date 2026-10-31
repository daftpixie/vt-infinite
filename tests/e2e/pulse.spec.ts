import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { runRules } from "@/guards/rules.mjs";
import { syntheticPulse } from "../pulse-synthetic";

const port = Number(process.env.E2E_PORT ?? 3100);
const landing = `http://127.0.0.1:${port + 6}`;
const full = `http://127.0.0.1:${port + 7}`;

for (const [name, origin] of [["compact", landing], ["expanded", full]] as const) {
  for (const scheme of ["dark", "light"] as const) {
    test(`${name}, ${scheme}: original counts, keyboard focus, reflow and axe`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "no-preference" });
      const origins = new Set<string>();
      page.on("request", (r) => origins.add(new URL(r.url()).origin));
      await page.goto(origin);
      const pulse = page.getByRole("region", { name: "The Signal" });
      await expect(pulse).toBeVisible();
      await expect(pulse).toContainText("1.4 BPM");
      await expect(pulse).toContainText("Data status: stale");
      await expect(pulse.locator("[data-sweeping]")).toHaveAttribute("data-sweeping", "false");
      const start = pulse.getByRole("button", { name: "Start sweep" });
      await start.focus();
      expect(await start.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
      await page.keyboard.press("Enter");
      await expect(pulse.getByRole("button", { name: "Pause sweep" })).toBeVisible();
      await page.keyboard.press("Enter");
      await expect(start).toBeVisible();
      const summary = pulse.locator("summary");
      if (!await pulse.locator("details").getAttribute("open").then((v) => v !== null)) await summary.click();
      await expect(pulse.getByRole("table")).toBeVisible();
      expect(await pulse.locator("tbody tr").count()).toBe(24);
      const violations = (await new AxeBuilder({ page }).include(".site-pulse").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.filter((v) => v.impact === "critical" || v.impact === "serious");
      expect(violations).toEqual([]);
      expect(runRules(await pulse.innerText(), { target: "/" })).toEqual([]);
      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      }
      expect([...origins]).toEqual([origin]);
    });
  }
}

test("reduced motion prevents the sweep and no JavaScript retains the static table", async ({ page, browser }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(landing);
  await expect(page.getByRole("button", { name: "Start sweep" })).toBeDisabled();
  const context = await browser.newContext({ javaScriptEnabled: false });
  const still = await context.newPage();
  await still.goto(landing);
  const pulse = still.getByRole("region", { name: "The Signal" });
  await expect(pulse).toContainText("1.4 BPM");
  await expect(pulse.getByRole("button")).toBeHidden();
  await pulse.locator("summary").click();
  await expect(pulse.getByRole("table")).toBeVisible();
  await context.close();
});

test("polling stops while hidden, updates without pageviews, and removes disabled publication", async ({ page }) => {
  await page.clock.install();
  let polls = 0;
  await page.route(`${landing}/api/pulse`, async (route) => {
    polls++;
    await route.fulfill({ status: polls > 1 ? 404 : 200, contentType: "application/json", body: JSON.stringify(syntheticPulse()) });
  });
  await page.goto(landing);
  await expect(page.locator(".site-pulse")).toHaveAttribute("data-polling", "on");
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
  await page.clock.fastForward(120_000);
  expect(polls).toBe(0);
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }); document.dispatchEvent(new Event("visibilitychange")); });
  await page.clock.fastForward(1);
  await expect.poll(() => polls).toBe(1);
  await page.clock.fastForward(60_000);
  await expect(page.locator(".site-pulse")).toHaveCount(0);
});

test("off API is closed, publication opens no unrelated landing routes and accepts no query", async ({ request }) => {
  const off = await request.get(`http://127.0.0.1:${port}/api/pulse`);
  expect(off.status()).toBe(404);
  expect((await request.get(`${landing}/api/pulse`)).headers()["cache-control"]).toBe("no-store");
  expect((await request.get(`${landing}/api/pulse?site_id=anything`)).status()).toBe(400);
  for (const path of ["/words", "/admin", "/api/plan/onerhythm", "/api/pulse/x"]) expect((await request.get(`${landing}${path}`)).status()).toBe(404);
  const data = await (await request.get(`${landing}/api/pulse`)).text();
  expect(data).not.toMatch(/Authorization|apiKey|synthetic-stats-credential|synthetic\.example|site_id/);
});

test("client bundles contain no Stats API configuration or credentials", async ({ page, request }) => {
  await page.goto(full);
  const scripts = await page.locator('script[src^="/_next/"]').evaluateAll((els) => els.map((el) => (el as HTMLScriptElement).src));
  expect(scripts.length).toBeGreaterThan(0);
  for (const src of scripts) {
    const body = await (await request.get(src)).text();
    expect(body).not.toMatch(/PLAUSIBLE_API_KEY|synthetic-stats-credential|api\/v2\/query/);
  }
});

test("capture review screenshots from synthetic snapshots", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  for (const [name, origin] of [["compact", landing], ["expanded", full]] as const) {
    await page.goto(origin);
    await page.getByRole("region", { name: "The Signal" }).screenshot({ path: test.info().outputPath(`signal-${name}.png`) });
  }
});
