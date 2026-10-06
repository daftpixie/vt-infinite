import type { Page } from "@playwright/test";
import { PAGES_200 } from "@/lib/routes";

export { PAGES_200 };

/** The visible text a reader gets, without scripts and styles. */
export async function pageText(page: Page): Promise<string> {
  return page.evaluate(() => document.body.innerText);
}
