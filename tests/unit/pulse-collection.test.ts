import { afterEach, describe, expect, it, vi } from "vitest";
import { COLLECTION_ENDPOINT, collectionBlocked, createPageviewCollector, sendPageview, type Pageview } from "@/lib/pulse/collection";

const origin = "https://synthetic.example";
const paths = ["/", "/privacy", "/words"];
const context = (path: string, extra = {}) => ({ url: `${origin}${path}`, referrer: "https://ref.example/person?campaign=identifying#private", visible: true, blocked: false, ...extra });

function setup() {
  const requests: Array<{ url: string; init: RequestInit; body: Pageview }> = [];
  const transport = vi.fn<typeof fetch>(async (url, init) => {
    requests.push({ url: String(url), init: init!, body: JSON.parse(String(init?.body)) });
    return new Response(null, { status: 202 });
  });
  const collector = createPageviewCollector({ domain: "synthetic.example", origin, paths, send: (event) => { void sendPageview(event, transport); } });
  return { collector, requests, transport };
}

afterEach(() => vi.unstubAllGlobals());

describe("direct Events API collection, offline intercepted transport", () => {
  it("counts initial/push/replace/back/forward and private returns once, ignoring same-path renders, queries and fragments", () => {
    const { collector, requests } = setup();
    for (const path of ["/?utm_source=person#private", "/?other=1#next", "/privacy?email=private", "/privacy#same", "/admin?private#secret", "/api/pulse", "/privacy", "/words", "/privacy", "/words"]) collector.visit(context(path));
    expect(requests.map((r) => new URL(r.body.url).pathname)).toEqual(["/", "/privacy", "/privacy", "/words", "/privacy", "/words"]);
    for (const request of requests) {
      expect(request.url).toBe(COLLECTION_ENDPOINT);
      expect(request.body).toEqual({ name: "pageview", domain: "synthetic.example", url: new URL(request.body.url).origin + new URL(request.body.url).pathname, referrer: "https://ref.example" });
      expect(Object.keys(request.body).sort()).toEqual(["domain", "name", "referrer", "url"]);
      expect(request.init).toMatchObject({ method: "POST", headers: { "Content-Type": "text/plain" }, credentials: "omit", referrerPolicy: "no-referrer", redirect: "error", keepalive: true });
      expect(JSON.stringify(request.body)).not.toMatch(/campaign|identifying|email|#|\?|person/);
    }
  });

  it("defers hidden initial/navigation views, never emits hidden/private activity, and does not record scroll/blur/time", () => {
    const { collector, requests } = setup();
    collector.visit(context("/", { visible: false }));
    collector.visit(context("/privacy", { visible: false }));
    expect(requests).toHaveLength(0);
    collector.visit(context("/privacy"));
    for (let i = 0; i < 4; i++) collector.visit(context("/privacy")); // Scroll, blur, rerender and time passing do not change a pathname.
    expect(requests).toHaveLength(1);
    collector.visit(context("/admin", { visible: false }));
    collector.visit(context("/admin"));
    collector.visit(context("/admin?query=private#fragment"));
    expect(requests).toHaveLength(1);
    collector.visit(context("/privacy"));
    expect(requests).toHaveLength(2);
  });

  it("counts a real bfcache restoration once, without retrying blocked or failed delivery", async () => {
    const { collector, requests } = setup();
    collector.visit(context("/"));
    collector.restored(); collector.visit(context("/")); collector.visit(context("/"));
    expect(requests).toHaveLength(2);
    const blocked = vi.fn<typeof fetch>(async () => { throw new Error("blocked locally"); });
    const other = createPageviewCollector({ domain: "synthetic.example", origin, paths, send: (event) => { void sendPageview(event, blocked); } });
    other.visit(context("/")); other.visit(context("/#same"));
    await Promise.resolve();
    expect(blocked).toHaveBeenCalledTimes(1);
  });

  it("omits internal and invalid referrers, and excludes non-public and foreign URLs", () => {
    const { collector, requests } = setup();
    collector.visit(context("/", { referrer: `${origin}/admin?private` }));
    expect(requests[0]!.body).not.toHaveProperty("referrer");
    for (const path of ["/admin", "/ADMIN", "/admin/child", "/api/pulse", "/unknown", "/governance/demo"]) collector.visit(context(path));
    collector.visit(context("/privacy", { url: "https://foreign.example/privacy" }));
    collector.visit(context("/words", { url: "http://synthetic.example/words" }));
    expect(requests).toHaveLength(1);
    collector.visit(context("/privacy", { referrer: "javascript:private" }));
    expect(requests[1]!.body).not.toHaveProperty("referrer");
  });

  it("performs no delivery when the privacy gate blocks a visit", () => {
    const { collector, transport } = setup();
    collector.visit(context("/", { blocked: true }));
    collector.visit(context("/privacy", { blocked: true }));
    expect(transport).not.toHaveBeenCalled();
  });

  it("projects transport field names even if an internal caller adds forbidden properties", async () => {
    const { transport, requests } = setup();
    const event = { name: "pageview" as const, domain: "synthetic.example", url: `${origin}/`, props: { patient: "synthetic-private" }, persistent_id: "synthetic-private" };
    await sendPageview(event, transport);
    expect(Object.keys(requests[0]!.body).sort()).toEqual(["domain", "name", "url"]);
    expect(JSON.stringify(requests[0]!.body)).not.toContain("synthetic-private");
  });
});

describe("visitor blocking and storage boundaries", () => {
  const location = new URL(origin) as unknown as Location;
  const windowWith = (value: string | null) => ({ localStorage: { getItem: vi.fn(() => value) } }) as unknown as Window;
  it("only reads the existing opt-out key, and respects automation, DNT, GPC, localhost and unavailable storage", () => {
    const win = windowWith(null);
    expect(collectionBlocked(win, {} as Navigator, location)).toBe(false);
    expect(win.localStorage.getItem).toHaveBeenCalledWith("plausible_ignore");
    expect(collectionBlocked(windowWith("true"), {} as Navigator, location)).toBe(true);
    for (const nav of [{ webdriver: true }, { doNotTrack: "1" }, { globalPrivacyControl: true }]) expect(collectionBlocked(win, nav as unknown as Navigator, location)).toBe(true);
    for (const url of ["http://localhost/", "https://127.0.0.1/", "https://localhost/", "https://test.localhost/"]) expect(collectionBlocked(win, {} as Navigator, new URL(url) as unknown as Location)).toBe(true);
    expect(collectionBlocked({ localStorage: { getItem() { throw new Error("storage blocked"); } } } as unknown as Window, {} as Navigator, location)).toBe(true);
  });
});
