import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PlausibleCollection } from "@/components/pulse/PlausibleCollection";

// A small hook host invokes the actual component effects with Next's pathname snapshots.
// It is an offline Node browser model, not a change to webdriver or blocking in a real browser.
const hooks = vi.hoisted(() => ({ pathname: "/", ref: { current: null as unknown }, effect: null as (() => (() => void)) | null }));
vi.mock("react", () => ({ useRef: () => hooks.ref, useEffect: (effect: () => () => void) => { hooks.effect = effect; } }));
vi.mock("next/navigation", () => ({ usePathname: () => hooks.pathname }));
let cleanup: (() => void) | undefined;
let location: URL;
let doc: { referrer: string; visibilityState: string; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> };
let windowListeners: Map<string, EventListener>;
let docListeners: Map<string, EventListener>;
let fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>;
function render(path: string) {
  cleanup?.(); location.href = new URL(path, location).href; hooks.pathname = location.pathname;
  PlausibleCollection({ domain: "synthetic.example", paths: ["/", "/privacy", "/words"] });
  cleanup = hooks.effect!();
}
function visibility(state: string) { doc.visibilityState = state; docListeners.get("visibilitychange")?.(new Event("visibilitychange")); }

beforeEach(() => {
  hooks.ref.current = null;
  location = new URL("https://synthetic.example/");
  windowListeners = new Map(); docListeners = new Map();
  const win = { localStorage: { getItem: () => null }, addEventListener: (name: string, cb: EventListener) => windowListeners.set(name, cb), removeEventListener: (name: string) => windowListeners.delete(name) };
  doc = { referrer: "https://ref.example/private?person=private#private", visibilityState: "visible", addEventListener: vi.fn((name: string, cb: EventListener) => docListeners.set(name, cb)), removeEventListener: vi.fn((name: string) => docListeners.delete(name)) };
  fetchImpl = vi.fn<typeof fetch>(async () => new Response(null, { status: 202 }));
  vi.stubGlobal("location", location); vi.stubGlobal("window", win); vi.stubGlobal("document", doc); vi.stubGlobal("navigator", {}); vi.stubGlobal("fetch", fetchImpl);
});
afterEach(() => { cleanup?.(); cleanup = undefined; vi.unstubAllGlobals(); });

it("binds initial, Next push/replace and popstate pathname changes without duplicate renders or strict-effect replay", () => {
  render("/?person=private#one");
  cleanup?.(); cleanup = hooks.effect!(); // React's effect replay preserves the ref.
  render("/?person=other#two");
  render("/privacy"); // Next push
  render("/admin?private#private"); // Next replace to private
  visibility("hidden"); visibility("visible");
  render("/privacy"); // back
  render("/admin"); // forward
  render("/words"); // public return
  expect(fetchImpl).toHaveBeenCalledTimes(4);
  expect(fetchImpl.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).url)).toEqual(["https://synthetic.example/", "https://synthetic.example/privacy", "https://synthetic.example/privacy", "https://synthetic.example/words"]);
  expect(docListeners.has("scroll")).toBe(false);
  expect(windowListeners.has("blur")).toBe(false);
});

it("waits for visibility, handles bfcache once and cleans up listeners", () => {
  doc.visibilityState = "hidden";
  render("/"); render("/privacy");
  expect(fetchImpl).not.toHaveBeenCalled();
  visibility("visible"); visibility("visible");
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  windowListeners.get("pageshow")?.({ persisted: true } as unknown as Event);
  visibility("visible");
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  cleanup?.();
  expect(docListeners.size).toBe(0); expect(windowListeners.size).toBe(0);
});
