import { expect, test } from "@playwright/test";
import { CRISIS_TEXT, runRules } from "@/guards/rules.mjs";
import { CRISIS_SUPPORT_TEXT } from "@/lib/crisis";
import { PAGES_200, pageText } from "./helpers";

test.describe("rendered copy passes every guard", () => {
  for (const path of [...PAGES_200, "/does-not-exist", "/phial", "/words/synthetic-site-essay", "/words/synthetic-mirror", "/the-record/synthetic-entry"]) {
    test(path, async ({ page }) => {
      const res = await page.goto(path);
      // A crashed page must fail here, not pass the guards with an error screen.
      expect(res?.status()).toBeLessThan(500);
      const text = await pageText(page);
      const title = await page.title();
      expect(runRules(`${title}\n${text}`, { target: path })).toEqual([]);
    });
  }
});

test("Contact carries the crisis-support block, verbatim and selectable", async ({ page }) => {
  await page.goto("/contact");
  const block = page.locator("[data-crisis-support]");
  await expect(block.locator("p").first()).toHaveText(CRISIS_SUPPORT_TEXT);
  expect(CRISIS_SUPPORT_TEXT).toBe(CRISIS_TEXT);
  const userSelect = await block.locator("p").first().evaluate((el) => getComputedStyle(el).userSelect);
  expect(userSelect).not.toBe("none");
  await expect(block.getByText("988", { exact: false }).first()).toBeVisible();
});

test("byline, name and status labels", async ({ page }) => {
  await page.goto("/governance");
  await expect(page.locator("h1")).toHaveText("Proposed corporate governance");
  await expect(page.getByText("Proposed — not yet adopted")).toBeVisible();
  await page.goto("/marrs-rover");
  await expect(page.locator("h1")).toHaveText("Marrs Rover Block Explorer");
});
