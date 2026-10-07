import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { DEMO_LABEL } from "@/packages/ledger-proof/src/constants.ts";

/** Stage 4b: the Marrs Rover explorer over the sealed synthetic MR-48 bundle. Demo data only. */
const DIGEST = "5088d7d5d133b9fb2ee0bbcd60879a2dee52f704dfeb2bb37f245be974b314c5";
const FIXTURE = `fixtures/marrs-rover/bundles/demo/2000-Q1/${DIGEST}`;
const PERIOD = "/marrs-rover/demo/periods/2000-Q1";
const ROVER_PAGES = [
  "/marrs-rover",
  PERIOD,
  `${PERIOD}?program=program-alpha&type=disbursement`,
  "/marrs-rover/demo/events/2121f48f-0fa0-4236-a748-f77aac1546d7",
  "/marrs-rover/demo/budgets/syn-budget-alpha",
  "/marrs-rover/reviews/demo-2000-Q1",
  "/marrs-rover/verify",
  "/marrs-rover/method",
];
const FILES = readFileSync(join(FIXTURE, "manifest.json"), "utf8").match(/"path":"[^"]+"/g)!.map((m) => m.slice(8, -1));

test.describe("every explorer page carries the demo label, in the page and in its metadata", () => {
  for (const path of ROVER_PAGES) {
    test(path, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page.getByRole("note", { name: "Demo data" })).toContainText(DEMO_LABEL);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", new RegExp(`^${DEMO_LABEL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
      expect(await page.title()).toMatch(/\(demo\)/);
      await expect(page.locator("h1")).toHaveCount(1);
    });
  }
});

test.describe("register filters work without JavaScript (MR-11)", () => {
  test.use({ javaScriptEnabled: false });

  test("a query-string form filters the view and states what the totals cover", async ({ page }) => {
    await page.goto(PERIOD);
    const form = page.getByRole("form", { name: "Filter the register" });
    await form.getByLabel("Program").selectOption("program-alpha");
    await form.getByLabel("Event type").selectOption("disbursement");
    await form.getByRole("button", { name: "Apply filters" }).click();
    await expect(page).toHaveURL(/program=program-alpha/);
    await expect(page).toHaveURL(/type=disbursement/);
    const rows = page.getByRole("region", { name: "Register table" }).locator("tbody tr");
    await expect(rows).toHaveCount(4);
    await expect(page.getByRole("status")).toContainText("4 of 24 events match the filters.");
    await expect(page.getByRole("status")).toContainText("$3,550.00 out (USD)");
    await expect(page.getByRole("status")).toContainText("covers the filtered events, not the period");
    // The period totals still cover the full register.
    await expect(page.getByRole("region", { name: "Money movement in USD" })).toContainText("$51,728.44");
  });

  test("the table has a caption, column headers with scope, and row headers", async ({ page }) => {
    await page.goto(PERIOD);
    const table = page.getByRole("region", { name: "Register table" }).locator("table");
    await expect(table.locator("caption")).toContainText("Register, 2000-Q1: events 1 to 10 of 24");
    await expect(table.locator('thead th[scope="col"]')).toHaveCount(9);
    await expect(table.locator('tbody th[scope="row"]')).toHaveCount(10);
  });

  test("pages through the register with plain links", async ({ page }) => {
    await page.goto(PERIOD);
    await page.getByRole("navigation", { name: "Register pages" }).getByRole("link", { name: "Page 3" }).click();
    await expect(page).toHaveURL(/page=3/);
    await expect(page.getByRole("region", { name: "Register table" }).locator("tbody tr")).toHaveCount(4);
  });

  test("an unknown period in the form moves to a period that exists, keeping the filters", async ({ page }) => {
    await page.goto(`${PERIOD}?period=1999-Q4&program=program-beta`);
    await expect(page).toHaveURL(new RegExp(`${PERIOD}\\?program=program-beta$`));
  });

  test("the overview chooses an entity and period with a plain form", async ({ page }) => {
    await page.goto("/marrs-rover");
    await page.getByLabel("Reporting period").selectOption("2000-Q1");
    await page.getByRole("button", { name: "Show this period" }).click();
    await expect(page).toHaveURL(/\/marrs-rover\?entity=demo&period=2000-Q1$/);
    await expect(page.getByRole("heading", { name: "Synthetic Demo Organization (fictional), 2000-Q1" })).toBeVisible();
  });
});

test("keyboard: reach the register filters, choose a program and apply them", async ({ page }) => {
  await page.goto(PERIOD);
  const program = page.locator("#f-program");
  for (let i = 0; i < 200 && !(await program.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
  await expect(program).toBeFocused();
  expect(await program.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
  // Options: all programs, general, program alpha, program beta.
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowDown");
  await expect(program).toHaveValue("program-beta");
  const apply = page.getByRole("button", { name: "Apply filters" });
  for (let i = 0; i < 20 && !(await apply.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
  await expect(apply).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/program=program-beta/);
  await expect(page.getByRole("status")).toContainText("events match the filters.");
});

test.describe("downloads (MR-30, MR-31)", () => {
  test("every file is served byte for byte from its content-addressed path, beside its SHA-256", async ({ page, request }) => {
    await page.goto(PERIOD);
    const files = page.getByRole("region", { name: "Files of this publication" });
    for (const name of ["manifest.json", ...FILES]) {
      const res = await request.get(`/marrs-rover/demo/bundles/${DIGEST}/${name}`);
      expect(res.status(), name).toBe(200);
      const body = await res.body();
      expect(body.equals(readFileSync(join(FIXTURE, name))), name).toBe(true);
      expect(body.toString("utf8"), name).toContain(DEMO_LABEL);
      const sha = createHash("sha256").update(body).digest("hex");
      await expect(files.getByRole("row", { name: new RegExp(name.replace(".", "\\.")) })).toContainText(sha);
      expect(res.headers()["content-disposition"]).toContain(`filename="${name}"`);
    }
  });

  test("the CSV export is linked from the register", async ({ page }) => {
    await page.goto(PERIOD);
    await expect(page.getByRole("link", { name: "Download the full register as CSV" })).toHaveAttribute("href", `/marrs-rover/demo/bundles/${DIGEST}/register.csv`);
  });

  test("nothing outside the manifest is served", async ({ request }) => {
    for (const path of [`/marrs-rover/demo/bundles/${DIGEST}/notes.md`, `/marrs-rover/demo/bundles/${DIGEST}/..%2F..%2Fpackage.json`, "/marrs-rover/demo/bundles/abc/register.csv"]) {
      expect((await request.get(path)).status(), path).toBe(404);
    }
  });
});

test("Home, Code and the footer point to the explorer with the approved demo wording (MR-2)", async ({ page }) => {
  for (const path of ["/", "/code"]) {
    await page.goto(path);
    const link = page.getByRole("main").getByRole("link", { name: "Explore the working demo." });
    await expect(link).toHaveAttribute("href", "/marrs-rover");
    await expect(page.getByRole("main")).toContainText("Explore the working demo. Sample finances, not VT Infinite’s accounts.");
    await expect(page.locator("footer").getByRole("link", { name: "Marrs Rover" })).toHaveAttribute("href", "/marrs-rover");
  }
  await page.goto("/");
  await expect(page.getByRole("link", { name: "See how Marrs Rover will show where resources go, starting with a labeled demo." })).toHaveAttribute("href", "/marrs-rover");
});

test("evidence states are separate lines in words, never one verified badge (MR-46)", async ({ page }) => {
  await page.goto(PERIOD);
  const states = page.locator("#evidence-states + p + dl");
  const expected: Array<[string, string]> = [
    ["Chain commitment", "Not attempted."],
    ["Independent review", "Not examined."],
    ["Reconciliation", "Partially reconciled"],
    ["Exceptions", "1 exception open."],
  ];
  for (const [term, value] of expected) {
    await expect(states.locator("dt", { hasText: term }).locator("xpath=following-sibling::dd[1]")).toContainText(value);
  }
  // Placeholder text (for example the contact email's) is not page copy.
  const copy = await page.evaluate(() => {
    const main = document.querySelector("main")!.cloneNode(true) as HTMLElement;
    main.querySelectorAll("[data-placeholder]").forEach((el) => el.remove());
    return main.textContent ?? "";
  });
  expect(copy).not.toMatch(/\bverified\b/i);
});

for (const scheme of ["dark", "light"] as const) {
  test(`axe, ${scheme} theme: filtered register and no-match state`, async ({ page }) => {
    test.info().annotations.push({ type: "theme", description: scheme });
    await page.emulateMedia({ colorScheme: scheme });
    for (const path of [`${PERIOD}?program=program-alpha&type=disbursement`, `${PERIOD}?q=nothing-matches-this`, `${PERIOD}?page=3`]) {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(blocking.map((v) => `${path} ${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
    }
  });
}
