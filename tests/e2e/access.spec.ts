import { expect, test } from "@playwright/test";
import { GATED_PREFIXES } from "@/lib/access";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

test.describe("admin denies everything server-side", () => {
  for (const path of ["/admin", "/admin/", "/admin/comments", "/admin/settings/flags", "/api/admin", "/api/admin/settings"]) {
    for (const method of METHODS) {
      test(`${method} ${path} → 404`, async ({ request }) => {
        // A trailing slash is normalised by a 308 first; the final answer must be 404.
        const res = await request.fetch(path, { method, maxRedirects: 2, data: method === "GET" ? undefined : "{}" });
        expect(res.status()).toBe(404);
        expect(await res.text()).not.toMatch(/admin/i);
      });
    }
  }
});

test.describe("flags off: gated routes and APIs return 404", () => {
  const paths = [
    ...GATED_PREFIXES.map((g) => g.prefix),
    ...GATED_PREFIXES.map((g) => `${g.prefix}/child`),
    "/plan/onerhythm?enabled=true",
    "/governance/demo?preview=1",
    "/marrs-rover/vt-infinite/periods/2026-q3",
    "/marrs-rover/vt-infinite/events/x",
    "/marrs-rover/vt-infinite/budgets/x",
    "/marrs-rover/reviews/x",
    "/api/marrs-rover/vt-infinite",
  ];
  for (const path of paths) {
    test(`${path} → 404`, async ({ request }) => {
      for (const method of ["GET", "POST"] as const) {
        const res = await request.fetch(path, { method, maxRedirects: 0, headers: { "x-feature-flag": "true" } });
        expect(res.status(), `${method} ${path}`).toBe(404);
      }
    });
  }
});

test("a flag cannot be switched on from the browser", async ({ page, context }) => {
  await context.addCookies([{ name: "PLAN_ENABLED", value: "true", url: "http://127.0.0.1" }]);
  const res = await page.goto("/plan/onerhythm?PLAN_ENABLED=true");
  expect(res?.status()).toBe(404);
});
