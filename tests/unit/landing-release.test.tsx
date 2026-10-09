import { spawnSync } from "node:child_process";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Placeholder } from "@/components/Placeholder";
import { gonePageHtml, landingNotFoundHtml } from "@/lib/gone";
import { PLACEHOLDERS, type PlaceholderId } from "@/lib/placeholders";
import { LANDING_PAGES_200 } from "@/lib/routes";

/**
 * Landing release gate (L3). With SITE_MODE=landing, no placeholder may
 * render on any route the landing release serves: its pages inside the
 * root layout, and the 404 and 410 pages the proxy answers with.
 *
 * The gate itself runs only where SITE_MODE is "landing" in the real
 * environment: the build runs this file first in that case
 * (scripts/check-release.mjs, the `prebuild` script), so a landing build
 * with a placeholder still showing fails. CI runs in full mode and checks
 * that the gate can see what it must.
 */

// Pages call connection(); outside a request it is a no-op here.
vi.mock("next/server", async (orig) => ({ ...(await orig<object>()), connection: async () => {} }));

const LANDING_HERE = process.env.SITE_MODE === "landing";

/** Every landing page, by path. A new landing page must be added here, or the first test fails. */
const LOADERS: Record<string, () => Promise<{ default: () => Promise<ReactNode> | ReactNode }>> = {
  "/": () => import("@/app/page"),
  "/privacy": () => import("@/app/privacy/page"),
};

function placeholderIds(html: string): string[] {
  return [...html.matchAll(/data-placeholder="([^"]+)"/g)].map((m) => m[1] as string);
}

/** Each landing page rendered inside the root layout, in landing mode. */
async function landingSurfaces(): Promise<Record<string, string>> {
  vi.stubEnv("SITE_MODE", "landing");
  const { default: RootLayout } = await import("@/app/layout");
  const out: Record<string, string> = {};
  for (const path of LANDING_PAGES_200) {
    const load = LOADERS[path];
    if (!load) throw new Error(`no loader for landing page ${path}`);
    const page = await (await load()).default();
    out[path] = renderToStaticMarkup(<RootLayout>{page}</RootLayout>);
  }
  out["404 (proxy)"] = landingNotFoundHtml();
  out["410 (proxy)"] = gonePageHtml(true);
  const { default: NotFound } = await import("@/app/not-found");
  out["404 (route)"] = renderToStaticMarkup(<RootLayout>{NotFound()}</RootLayout>);
  return out;
}

function found(surfaces: Record<string, string>): Record<string, string[]> {
  return Object.fromEntries(Object.entries(surfaces).map(([k, html]) => [k, placeholderIds(html)] as const).filter(([, ids]) => ids.length > 0));
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("landing release gate (L3)", () => {
  it("checks every landing page in lib/routes.ts, and renders them in landing mode", async () => {
    expect(Object.keys(LOADERS).sort()).toEqual([...LANDING_PAGES_200].sort());
    const s = await landingSurfaces();
    expect(s["/"]).toContain("Heart. Mind. Hands.");
    expect(s["/"]).not.toContain('aria-label="Primary"');
    expect(s["/privacy"]).toContain("<h1>Privacy notice</h1>");
    expect(s["/privacy"]).toContain("Version landing-1");
  });

  it("sees a placeholder wherever one renders, block or inline", () => {
    const [id] = Object.keys(PLACEHOLDERS) as PlaceholderId[];
    if (!id) return;
    const html = renderToStaticMarkup(
      <>
        <Placeholder id={id} />
        <Placeholder id={id} inline />
      </>,
    );
    expect(placeholderIds(html)).toEqual([id, id]);
  });

  // The landing privacy notice ("landing-1") closed the last gap.
  it("finds no outstanding gaps", async () => {
    expect(found(await landingSurfaces())).toEqual({});
  });

  it.runIf(LANDING_HERE)("with SITE_MODE=landing, no placeholder renders on any landing route", async () => {
    expect(found(await landingSurfaces()), "placeholders on landing routes").toEqual({});
  });
});

describe("the release check script", () => {
  const run = (env: Record<string, string>) =>
    spawnSync(process.execPath, ["scripts/check-release.mjs"], { env: { ...process.env, PLAN_ENABLED: "", SITE_MODE: "", ...env }, encoding: "utf8" });

  it("in full mode does nothing for the landing release", () => {
    const r = run({});
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("SITE_MODE is not landing; nothing to check for the landing release.");
  });

  it("fails on an unknown SITE_MODE, without echoing it", () => {
    const r = run({ SITE_MODE: "Landing" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('SITE_MODE must be unset, "full" or "landing"');
    expect(r.stderr).not.toContain("Landing");
  });

  // Runs this file again with SITE_MODE=landing, so not from inside that run.
  it.skipIf(LANDING_HERE)("with SITE_MODE=landing passes now that no placeholder renders", () => {
    const r = run({ SITE_MODE: "landing" });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("release check: landing release: passed.");
  }, 120_000);

  it("refuses the test-only no-proxy build on Vercel", () => {
    const r = run({ VT_TEST_BUILD_WITHOUT_PROXY: "1", VERCEL: "1" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("must never be set on Vercel");
  });
});
