"use client";

import { useEffect, useRef, useState } from "react";
import type { NowPlayingResult } from "@/lib/now-playing/service";
import { NOW_PLAYING_API, NOW_PLAYING_POLL_MS } from "@/lib/now-playing/view";
import { startPlanPolling } from "@/lib/plan/poller";
import { NowPlayingBody } from "./NowPlayingBody";

/**
 * "Now playing" on `/` and /vibes (PRD S-3, S-6). The server renders it in
 * full, so it is complete without JavaScript. With JavaScript it asks the
 * site's own API every 30 s while the tab is visible and stops while it is
 * hidden; the browser never contacts Spotify. A 404 means the feature was
 * switched off: it leaves the page. Nothing moves or animates.
 */
export function NowPlaying({ initial }: { initial: NowPlayingResult }) {
  const [result, setResult] = useState<NowPlayingResult | null>(initial);
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const stop = startPlanPolling({
      doc: document,
      intervalMs: NOW_PLAYING_POLL_MS,
      fetchOnce: async () => {
        const res = await fetch(NOW_PLAYING_API, { cache: "no-store", headers: { Accept: "application/json" } });
        if (res.status === 404) {
          stop();
          setResult(null);
          return;
        }
        if (!res.ok) return;
        setResult((await res.json()) as NowPlayingResult);
      },
    });
    // Marks that polling has started (after hydration); without JavaScript it stays "off".
    if (root.current) root.current.dataset.nowPlayingLive = "on";
    return stop;
  }, []);
  if (!result) return null;
  return (
    <section ref={root} className="now-playing" aria-labelledby="now-playing-label" data-now-playing-live="off">
      <NowPlayingBody view={result.view} checkedAt={result.checkedAt} servedAt={result.servedAt} />
    </section>
  );
}
