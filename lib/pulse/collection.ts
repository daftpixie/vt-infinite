/** Supported browser Events API transport. No vendor script, identifiers, properties or engagement capture. */
export const COLLECTION_ENDPOINT = "https://plausible.io/api/event";
export type Pageview = { name: "pageview"; domain: string; url: string; referrer?: string };
export type VisitContext = { url: string; referrer: string; visible: boolean; blocked: boolean };

/** Latest route and its sent bit only: transient navigation deduplication, never a visitor history. */
export function createPageviewCollector(config: { domain: string; paths: readonly string[]; origin: string; send: (event: Pageview) => void }) {
  const allowed = new Set(config.paths);
  let currentPath: string | null = null;
  let sent = false;
  return {
    visit(context: VisitContext): void {
      let url: URL;
      try { url = new URL(context.url); } catch { currentPath = null; sent = false; return; }
      // Never retain even the latest private path in analytics state.
      if (context.blocked || url.origin !== config.origin || url.protocol !== "https:" || url.username || url.password || !allowed.has(url.pathname)) { currentPath = null; sent = false; return; }
      if (url.pathname !== currentPath) { currentPath = url.pathname; sent = false; }
      if (sent || !context.visible) return;
      sent = true;
      url.search = "";
      url.hash = "";
      const event: Pageview = { name: "pageview", domain: config.domain, url: url.href };
      try {
        const ref = new URL(context.referrer);
        if ((ref.protocol === "https:" || ref.protocol === "http:") && ref.origin !== config.origin) event.referrer = ref.origin;
      } catch { /* Missing/invalid referrer is omitted. */ }
      config.send(event);
    },
    /** A real back/forward-cache document restoration is a new view of that document. */
    restored(): void { currentPath = null; sent = false; },
  };
}

/** Native direct request: no proxy, retries, cookies, persistent IDs or raw referrer header. */
export async function sendPageview(event: Pageview, fetchImpl: typeof fetch = fetch): Promise<void> {
  try {
    await fetchImpl(COLLECTION_ENDPOINT, {
      method: "POST", headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ name: "pageview", domain: event.domain, url: event.url, ...(event.referrer ? { referrer: event.referrer } : {}) }),
      keepalive: true, credentials: "omit", referrerPolicy: "no-referrer", redirect: "error",
    });
  } catch { /* Blocking and delivery failures are respected; no logging or retry. */ }
}

/** Same opt-out key as Plausible; read only. No application analytics storage is written. */
export function collectionBlocked(win: Window, nav: Navigator, location: Location): boolean {
  if (location.protocol !== "https:" || /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])$/i.test(location.hostname) || location.hostname.endsWith(".localhost")) return true;
  if (nav.webdriver || nav.doNotTrack === "1" || (nav as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl) return true;
  const automated = win as Window & { _phantom?: unknown; __nightmare?: unknown; Cypress?: unknown };
  if (automated._phantom || automated.__nightmare || automated.Cypress) return true;
  try { return win.localStorage.getItem("plausible_ignore") === "true"; } catch { return true; }
}
