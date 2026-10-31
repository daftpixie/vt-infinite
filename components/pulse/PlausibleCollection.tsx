"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";

/** Next's layout Script cache loads once, including when returning from a private path. */
export function PlausibleCollection({ src, paths }: { src: string; paths: readonly string[] }) {
  const pathname = usePathname();
  return paths.includes(pathname) ? <Script id="plausible-pageviews" src={src} strategy="afterInteractive" /> : null;
}
