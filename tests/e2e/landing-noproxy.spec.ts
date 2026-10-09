import { expect, test } from "@playwright/test";
import { LANDING_FONTS } from "@/lib/mode";
import { ROUTES } from "@/lib/routes";

/**
 * The route-level landing gate on its own (F5). This server runs a landing
 * build (SITE_MODE=landing when it was built, so its static pages were
 * prerendered in landing mode) with proxy.ts switched off
 * (`npm run build:noproxy`; next.config.ts). Every route in lib/routes.ts
 * must still answer its landing status, by the page, the route handler or
 * the build's rewrites alone.
 */
const NOPROXY_URL = `http://127.0.0.1:${Number(process.env.E2E_PORT ?? 3100) + 3}`;
test.use({ baseURL: NOPROXY_URL });

/** Titles a full-site page sets (F3); none may reach a landing 404. */
const FULL_SITE_TITLE = /Words|Code|The Record|Vibes|Agency|Contact|governance|OneRhythm|Marrs Rover|Terms|Comment policy|Privacy ·/;

test.describe("without the proxy, every route answers its landing status by itself", () => {
  test("the proxy really is off in this build", async ({ request }) => {
    // The proxy would answer 410 here; the route level has no such page, so 404.
    expect((await request.get("/phial", { maxRedirects: 0 })).status()).toBe(404);
    expect((await request.get("/words")).headers()["content-type"]).toContain("text/html");
  });

  for (const route of ROUTES) {
    test(`${route.path} → ${route.landing}`, async ({ request }) => {
      const res = await request.get(route.path, { maxRedirects: 0 });
      expect(res.status()).toBe(route.landing);
      if (route.landing === 404 && route.kind === "page") {
        const html = await res.text();
        const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
        expect(title, "a landing 404 carries no full-site title").not.toMatch(FULL_SITE_TITLE);
        expect(html).not.toContain('aria-label="Primary"');
        expect(html).toMatch(/<meta name="robots" content="noindex/);
      }
    });
  }

  test("the old redirects answer 404", async ({ request }) => {
    for (const path of ["/origin", "/partners"]) expect((await request.get(path, { maxRedirects: 0 })).status(), path).toBe(404);
  });

  test("public/ serves only the landing files and the fonts", async ({ request }) => {
    expect((await request.get("/fonts/OFL.txt")).status()).toBe(404);
    for (const f of LANDING_FONTS) expect((await request.get(f)).status(), f).toBe(200);
  });
});
