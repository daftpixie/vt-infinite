export const SITE_NAME = "VT Infinite";
export const SITE_FURNITURE = "VT ∞";

export function siteUrl(env: Readonly<Record<string, string | undefined>> = process.env): string {
  return (env.SITE_URL ?? "https://vt-infinite.com").replace(/\/+$/, "");
}

/** The six primary header links, in Matthew's order (PRD §04). */
export const PRIMARY_NAV = [
  { href: "/", label: "Home" },
  { href: "/words", label: "Words" },
  { href: "/code", label: "Code" },
  { href: "/vibes", label: "Vibes" },
  { href: "/agency", label: "Agency" },
  { href: "/contact", label: "Contact" },
] as const;

/**
 * Sections whose child routes belong to a primary link. The Record sits
 * under Code (PRD §24, P1).
 */
const SECTION_PREFIXES: Record<string, readonly string[]> = {
  "/words": ["/words"],
  "/code": ["/code", "/the-record"],
  "/vibes": ["/vibes"],
  "/agency": ["/agency"],
  "/contact": ["/contact"],
};

export function navState(href: string, pathname: string): "page" | "true" | undefined {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (path === href) return "page";
  const prefixes = SECTION_PREFIXES[href] ?? [];
  if (prefixes.some((p) => path === p || path.startsWith(`${p}/`))) return "true";
  return undefined;
}

export const FOOTER_LINES = {
  running: "Vigilance, operationalized.",
  close: "We build roofs, not empires.",
  colophon: "ad astra per aspera",
} as const;
