import { expect, test, type Page } from "@playwright/test";
import { PRIMARY_NAV } from "@/lib/site";
import { PAGES_200 } from "./helpers";

async function focused(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return { tag: el?.tagName ?? "", text: el?.textContent?.trim() ?? "", href: el?.getAttribute("href") ?? "", outline: el ? getComputedStyle(el).outlineStyle : "" };
  });
}

test("skip link comes first and moves focus to the main content", async ({ page }) => {
  await page.goto("/words");
  await page.keyboard.press("Tab");
  const first = await focused(page);
  expect(first.text).toBe("Skip to content");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
});

test("the six header links are reachable by Tab, in order, with a visible focus ring", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab"); // skip link
  for (const link of PRIMARY_NAV) {
    await page.keyboard.press("Tab");
    const f = await focused(page);
    expect(f.tag).toBe("A");
    expect(f.text).toBe(link.label);
    expect(f.outline).toBe("solid");
  }
});

test("Enter on a header link navigates", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  for (let i = 0; i < 3; i++) await page.keyboard.press("Tab"); // Home, Words, Code
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/code$/);
  await expect(page.locator("h1")).toHaveText("Code");
});

test.describe("aria-current marks the current page", () => {
  for (const link of PRIMARY_NAV) {
    test(link.href, async ({ page }) => {
      await page.goto(link.href);
      const nav = page.getByRole("navigation", { name: "Primary" });
      await expect(nav.locator('[aria-current="page"]')).toHaveText(link.label);
      await expect(nav.locator("[aria-current]")).toHaveCount(1);
    });
  }
  test("/the-record sits under Code", async ({ page }) => {
    await page.goto("/the-record");
    await expect(page.getByRole("navigation", { name: "Primary" }).locator('[aria-current="true"]')).toHaveText("Code");
  });
});

test("the theme switch is operable by keyboard", async ({ page }) => {
  await page.goto("/");
  const light = page.getByRole("button", { name: "Light" });
  await light.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(light).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "System" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
});

test.describe("header wraps on a 320 px screen without horizontal scrolling", () => {
  test.use({ viewport: { width: 320, height: 640 } });
  for (const path of PAGES_200) {
    test(path, async ({ page }) => {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      for (const link of PRIMARY_NAV) {
        await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: link.label, exact: true })).toBeVisible();
      }
    });
  }
});
