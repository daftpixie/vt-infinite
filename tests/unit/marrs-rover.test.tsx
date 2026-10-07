import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEMO_LABEL } from "@/packages/ledger-proof/src/constants.ts";
import { sha256Hex } from "@/packages/ledger-proof/src/merkle.ts";
import { bundleFileBytes, listBundles, loadBundle, setBundleRootForTests } from "@/lib/marrs-rover/bundles";
import { applyFilters, correctionStatus, filterQuery, netByCurrency, netDisbursed, parseFilters, publications } from "@/lib/marrs-rover/explorer";
import { formatAmount, formatMovement, formatSigned } from "@/lib/marrs-rover/format";
import { EXPECTED_VERIFIER_RUN } from "@/lib/marrs-rover/verifier-output";
import type { LoadedBundle } from "@/lib/marrs-rover/types";

// Pages call connection(); outside a request it is a no-op here.
vi.mock("next/server", async (orig) => ({ ...(await orig<object>()), connection: async () => {} }));

const DIGEST = "5088d7d5d133b9fb2ee0bbcd60879a2dee52f704dfeb2bb37f245be974b314c5";
const FIXTURE = `fixtures/marrs-rover/bundles/demo/2000-Q1/${DIGEST}`;
const REF = { entityId: "demo", periodId: "2000-Q1", digest: DIGEST };
const X = { USD: 2, JPY: 0, EUR: 2 };

afterEach(() => setBundleRootForTests(null));

/** A copy of the bundle tree in a temporary root, for tampering. */
function copyRoot(): { root: string; dir: string } {
  const root = mkdtempSync(join(tmpdir(), "rover-"));
  const dir = join(root, "demo", "2000-Q1", DIGEST);
  cpSync(FIXTURE, dir, { recursive: true });
  return { root, dir };
}

function loaded(): LoadedBundle {
  const r = loadBundle(REF);
  if (!r.ok) throw new Error(r.reason);
  return r.bundle;
}

describe("money display (B8): integer minor units, no floating point, direction in words", () => {
  it("formats per currency exponent", () => {
    expect(formatAmount("125000", "USD", X)).toBe("$1,250.00");
    expect(formatAmount("5", "USD", X)).toBe("$0.05");
    expect(formatAmount("0", "USD", X)).toBe("$0.00");
    expect(formatAmount("1250", "JPY", X)).toBe("1,250 JPY");
    expect(formatAmount("99999", "EUR", X)).toBe("999.99 EUR");
  });
  it("stays exact beyond 2^53", () => {
    // 2^53 + 1 cents would round to an even number as a float.
    expect(formatAmount(2n ** 53n + 1n, "USD", X)).toBe("$90,071,992,547,409.93");
    // A 30-digit amount, built from an expression so no long digit run sits in the source (long-numeric-id guard).
    expect(formatAmount(BigInt("1".repeat(30)), "USD", X)).toBe("$1,111,111,111,111,111,111,111,111,111.11");
  });
  it("writes the sign and direction in words, not colour", () => {
    expect(formatSigned("-64000", "USD", X)).toBe("minus $640.00");
    expect(formatSigned("64000", "USD", X)).toBe("$640.00");
    expect(formatMovement("-64000", "USD", X)).toBe("$640.00 out");
    expect(formatMovement("64000", "USD", X)).toBe("$640.00 in");
    expect(formatMovement("0", "USD", X)).toBe("no cash movement");
  });
  it("refuses non-canonical amounts and unknown currencies", () => {
    expect(() => formatAmount("1.5", "USD", X)).toThrow();
    expect(() => formatAmount("012", "USD", X)).toThrow();
    expect(() => formatAmount("1", "GBP", X)).toThrow();
  });
});

describe("bundle loading (B1)", () => {
  it("loads the sealed MR-48 bundle through the stage 4a library, every check passing", () => {
    expect(listBundles()).toEqual([REF]);
    const b = loaded();
    expect(b.events).toHaveLength(24);
    expect(b.files.map((f) => f.path)[0]).toBe("manifest.json");
    expect(b.files).toHaveLength(12);
    expect(b.manifest.events.root).toBe("c0de954323d3f888a9e59b561337a9caecc555d952096d16ec2ddaa7143312dd");
    for (const f of b.files) expect(sha256Hex(new Uint8Array(readFileSync(join(FIXTURE, f.path))))).toBe(f.sha256);
  });

  it("serves file bytes identical to the repository copy (B4)", () => {
    for (const f of loaded().files) {
      const served = bundleFileBytes(REF, f.path);
      expect(served && Buffer.from(served).equals(readFileSync(join(FIXTURE, f.path)))).toBe(true);
    }
    expect(bundleFileBytes(REF, "../../../../package.json")).toBeNull();
    expect(bundleFileBytes(REF, "notes.md")).toBeNull();
  });

  it("every file carries the demo label in its own bytes", () => {
    for (const f of loaded().files) expect(readFileSync(join(FIXTURE, f.path), "utf8"), f.path).toContain(DEMO_LABEL);
  });

  it("refuses an entity other than the demo, and malformed references", () => {
    expect(loadBundle({ ...REF, entityId: "real-entity" }).ok).toBe(false);
    expect(loadBundle({ ...REF, digest: "../x" }).ok).toBe(false);
    expect(loadBundle({ ...REF, periodId: "../../etc" }).ok).toBe(false);
  });
});

describe("a bundle that fails verification is never shown (B1, B9)", () => {
  const cases: Array<[string, (dir: string, root: string) => void, RegExp]> = [
    [
      "a changed amount",
      (d) => writeFileSync(join(d, "register.jsonl"), readFileSync(join(d, "register.jsonl"), "utf8").replace('"amountMinorUnits":"200000"', '"amountMinorUnits":"20000"')),
      /register\.jsonl does not match the SHA-256/,
    ],
    ["a deleted row", (d) => writeFileSync(join(d, "register.jsonl"), readFileSync(join(d, "register.jsonl"), "utf8").split("\n").slice(1).join("\n")), /register\.jsonl does not match/],
    ["an edited summary", (d) => writeFileSync(join(d, "summary.json"), readFileSync(join(d, "summary.json"), "utf8").replace('"3872844"', '"3872845"')), /summary\.json does not match/],
    ["a substituted manifest", (d) => writeFileSync(join(d, "manifest.json"), readFileSync(join(d, "manifest.json"), "utf8").replace("2000-04-14T16:00:00Z", "2000-04-15T16:00:00Z")), /manifest does not match the SHA-256 it was published under/],
    ["an extra file", (d) => writeFileSync(join(d, "notes.md"), "extra"), /does not hold exactly the files/],
    ["a missing file", (d) => rmSync(join(d, "exceptions.json")), /does not hold exactly the files/],
    [
      "a file replaced by a symbolic link",
      (d) => {
        rmSync(join(d, "budgets.json"));
        symlinkSync(join(process.cwd(), FIXTURE, "budgets.json"), join(d, "budgets.json"));
      },
      /other than plain files/,
    ],
    [
      "a bundle filed under the wrong period",
      (d, root) => {
        cpSync(d, join(root, "demo", "2000-Q2", DIGEST), { recursive: true });
        rmSync(join(root, "demo", "2000-Q1"), { recursive: true });
      },
      /names a different entity or period/,
    ],
  ];

  it.each(cases)("%s: withheld, with the reason in plain words", async (_, tamper, reason) => {
    const { root, dir } = copyRoot();
    tamper(dir, root);
    setBundleRootForTests(root);
    const pubs = publications();
    expect(pubs.ok).toEqual([]);
    expect(pubs.failed).toHaveLength(1);
    expect(pubs.failed[0]?.reason).toMatch(reason);
    // The reason never quotes file contents.
    expect(pubs.failed[0]?.reason).not.toMatch(/Synthetic|\$|[0-9]{4,}/);

    const failed = pubs.failed[0]!;
    const PeriodPage = (await import("@/app/marrs-rover/[entity]/periods/[period]/page")).default;
    const html = renderToStaticMarkup(
      await PeriodPage({ params: Promise.resolve({ entity: "demo", period: failed.periodId }), searchParams: Promise.resolve({}) }),
    );
    expect(html).toContain("Publication withheld");
    expect(html).toContain("The site never displays a publication whose files fail their checks.");
    expect(html).not.toContain("Cash at the end");
    expect(html).not.toContain("Synthetic Demo Organization");
    const overview = renderToStaticMarkup(await (await import("@/app/marrs-rover/page")).default({ searchParams: Promise.resolve({}) }));
    expect(overview).toContain("Publication withheld");
    expect(overview).not.toContain("Cash at the end");
    // Downloads of a withheld bundle are refused too.
    expect(bundleFileBytes({ ...REF, periodId: failed.periodId }, "register.csv")).toBeNull();
  });
});

describe("register filters (B3, MR-11)", () => {
  it("filter the view, never the register, and keep totals per currency", () => {
    const b = loaded();
    const f = parseFilters(b, { program: "program-alpha", type: "disbursement" });
    const rows = applyFilters(b, f);
    expect(rows.map((e) => e.eventSequence)).toEqual(["11", "12", "17", "23"]);
    expect(netByCurrency(rows).get("USD")).toBe(-355000n);
    expect(b.events).toHaveLength(24);
  });
  it("ignore values that are not offered, rather than trusting them", () => {
    const b = loaded();
    const f = parseFilters(b, { program: "<script>", currency: "XXX", page: "-3", correction: "maybe" });
    expect(f).toMatchObject({ program: "", currency: "", page: 1, correction: "" });
    expect(applyFilters(b, f)).toHaveLength(24);
  });
  it("search covers public IDs and published purposes only", () => {
    const b = loaded();
    expect(applyFilters(b, parseFilters(b, { q: "loan proceeds" })).map((e) => e.eventSequence)).toEqual(["3"]);
    expect(applyFilters(b, parseFilters(b, { q: "2121f48f" })).map((e) => e.eventSequence)).toEqual(["17"]);
  });
  it("correction status follows the correction history", () => {
    const b = loaded();
    const status = Object.fromEntries(b.events.map((e) => [e.eventSequence, correctionStatus(b, e)]));
    expect(status["17"]).toBe("corrected");
    expect(status["22"]).toBe("correcting");
    expect(status["23"]).toBe("correcting");
    expect(status["1"]).toBe("none");
  });
  it("build query strings for no-JavaScript links", () => {
    expect(filterQuery({ program: "program-alpha", type: "", page: 1 })).toBe("?program=program-alpha");
    expect(filterQuery({ page: 2 })).toBe("?page=2");
  });
  it("budget comparisons net reversals out of spending", () => {
    const b = loaded();
    // 450.00 + 640.00 - 640.00 (reversal) + 460.00
    expect(netDisbursed(b, "program-alpha", "program-supplies", "USD")).toBe(91000n);
  });
});

describe("pages render from the fixture with the demo label in body and metadata (B2, B9)", () => {
  const pages: Array<[string, () => Promise<{ html: string; metadata: { description?: string | null; title?: unknown } }>]> = [
    ["overview", async () => {
      const m = await import("@/app/marrs-rover/page");
      return { html: renderToStaticMarkup(await m.default({ searchParams: Promise.resolve({}) })), metadata: m.metadata };
    }],
    ["period", async () => {
      const m = await import("@/app/marrs-rover/[entity]/periods/[period]/page");
      const params = Promise.resolve({ entity: "demo", period: "2000-Q1" });
      return { html: renderToStaticMarkup(await m.default({ params, searchParams: Promise.resolve({}) })), metadata: await m.generateMetadata({ params }) };
    }],
    ["event", async () => {
      const m = await import("@/app/marrs-rover/[entity]/events/[eventId]/page");
      const params = Promise.resolve({ entity: "demo", eventId: "2121f48f-0fa0-4236-a748-f77aac1546d7" });
      return { html: renderToStaticMarkup(await m.default({ params })), metadata: await m.generateMetadata({ params }) };
    }],
    ["budget", async () => {
      const m = await import("@/app/marrs-rover/[entity]/budgets/[budgetId]/page");
      const params = Promise.resolve({ entity: "demo", budgetId: "syn-budget-alpha" });
      return { html: renderToStaticMarkup(await m.default({ params })), metadata: await m.generateMetadata({ params }) };
    }],
    ["review", async () => {
      const m = await import("@/app/marrs-rover/reviews/[reviewId]/page");
      return { html: renderToStaticMarkup(await m.default({ params: Promise.resolve({ reviewId: "demo-2000-Q1" }) })), metadata: await m.generateMetadata() };
    }],
    ["verify", async () => {
      const m = await import("@/app/marrs-rover/verify/page");
      return { html: renderToStaticMarkup(await m.default()), metadata: m.metadata };
    }],
    ["method", async () => {
      const m = await import("@/app/marrs-rover/method/page");
      return { html: renderToStaticMarkup(m.default()), metadata: m.metadata };
    }],
  ];

  it.each(pages)("%s", async (_, render) => {
    const { html, metadata } = await render();
    expect(html).toContain(DEMO_LABEL.replace("'", "&#x27;"));
    expect(metadata.description).toContain(DEMO_LABEL);
    expect(String(metadata.title)).toMatch(/\(demo\)$/);
    // Never a single "verified" badge (MR-36, MR-46); placeholder text is not page copy.
    expect(html.replace(/<(p|span)[^>]*data-placeholder[^>]*>[^<]*<\/\1>/g, "")).not.toMatch(/\bverified\b/i);
  });

  it("shows plain meaning before any proof detail, and each evidence state on its own line (MR-4, MR-46)", async () => {
    const m = await import("@/app/marrs-rover/[entity]/events/[eventId]/page");
    const html = renderToStaticMarkup(await m.default({ params: Promise.resolve({ entity: "demo", eventId: "2121f48f-0fa0-4236-a748-f77aac1546d7" }) }));
    const at = (s: string) => html.indexOf(s);
    for (const term of ["<dt>Entity</dt>", "<dt>Reporting period</dt>", "<dt>Cutoff</dt>", "<dt>Financial basis</dt>", "<dt>Coverage</dt>", "Money movement", "<dt>Restrictions</dt>", "<dt>Unresolved issues</dt>"]) {
      expect(at(term), term).toBeGreaterThan(-1);
      expect(at(term), term).toBeLessThan(at("Inclusion proof</h2>"));
    }
    for (const state of ["Environment", "Publication", "Chain commitment", "Reconciliation", "Independent review", "Exceptions", "Freshness"]) expect(html).toContain(`<dt>${state}</dt>`);
    expect(html).toContain("Not attempted.");
    expect(html).toContain("Not examined.");
    // The correction journey: original, reversal and replacement are all linked.
    for (const id of ["1912db7a-d301-4060-82d1-9f0ddac195cf", "7f06561e-51eb-43a9-ba7c-25916cc1654a"]) expect(html).toContain(`/marrs-rover/demo/events/${id}`);
  });

  it("unknown IDs are not found", async () => {
    const ev = (await import("@/app/marrs-rover/[entity]/events/[eventId]/page")).default;
    await expect(ev({ params: Promise.resolve({ entity: "demo", eventId: "sample" }) })).rejects.toThrow();
    const pe = (await import("@/app/marrs-rover/[entity]/periods/[period]/page")).default;
    await expect(pe({ params: Promise.resolve({ entity: "demo", period: "1999-Q4" }), searchParams: Promise.resolve({}) })).rejects.toThrow();
    await expect(pe({ params: Promise.resolve({ entity: "acme", period: "2000-Q1" }), searchParams: Promise.resolve({}) })).rejects.toThrow();
  });
});

describe("Verify page (B5)", () => {
  it("its expected output is exactly what the CLI verifier prints for the downloaded bundle", () => {
    const work = mkdtempSync(join(tmpdir(), "rover-verify-"));
    cpSync(FIXTURE, join(work, DIGEST), { recursive: true });
    const r = spawnSync(process.execPath, [join(process.cwd(), "tools/ledger-verifier/verify.mjs"), DIGEST, "--expect", DIGEST], { cwd: work, encoding: "utf8" });
    expect(r.status).toBe(EXPECTED_VERIFIER_RUN.exitCode);
    expect(r.stdout).toBe(EXPECTED_VERIFIER_RUN.output);
    expect(EXPECTED_VERIFIER_RUN.digest).toBe(DIGEST);
  });

  it("lists a download command for every file, at its content-addressed path", async () => {
    const html = renderToStaticMarkup(await (await import("@/app/marrs-rover/verify/page")).default());
    for (const f of loaded().files) expect(html).toContain(`/marrs-rover/demo/bundles/${DIGEST}/${f.path}`);
    expect(html).toContain(`verify.mjs ${DIGEST} --expect ${DIGEST}`);
    expect(html).toContain('data-placeholder="roverVerifierSource"');
  });
});
