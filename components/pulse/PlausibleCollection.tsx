"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { collectionBlocked, createPageviewCollector, sendPageview } from "@/lib/pulse/collection";

/** One root-layout collector observes Next pathname changes, including push/replace and back/forward. */
export function PlausibleCollection({ domain, paths }: { domain: string; paths: readonly string[] }) {
  const pathname = usePathname();
  const active = useRef<{ key: string; collector: ReturnType<typeof createPageviewCollector> } | null>(null);
  useEffect(() => {
    const key = JSON.stringify([domain, paths]);
    if (active.current?.key !== key) active.current = { key, collector: createPageviewCollector({ domain, paths, origin: location.origin, send: (event) => { void sendPageview(event); } }) };
    const collector = active.current.collector;
    const observe = () => collector.visit({ url: location.href, referrer: document.referrer, visible: document.visibilityState === "visible", blocked: collectionBlocked(window, navigator, location) });
    const restored = (event: PageTransitionEvent) => { if (event.persisted) { collector.restored(); observe(); } };
    observe();
    document.addEventListener("visibilitychange", observe);
    window.addEventListener("pageshow", restored);
    return () => { document.removeEventListener("visibilitychange", observe); window.removeEventListener("pageshow", restored); };
  }, [pathname, domain, paths]);
  return null;
}
