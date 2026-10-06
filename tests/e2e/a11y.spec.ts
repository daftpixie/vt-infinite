import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { PAGES_200 } from "./helpers";

const EXTRA = ["/does-not-exist", "/phial"];

for (const scheme of ["dark", "light"] as const) {
  test.describe(`axe, ${scheme} theme: no serious or critical issues`, () => {
    test.use({ colorScheme: scheme });
    for (const path of [...PAGES_200, ...EXTRA]) {
      test(path, async ({ page }) => {
        await page.goto(path);
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
        const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        expect(blocking.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
      });
    }
  });
}
