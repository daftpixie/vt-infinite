import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The approved stacked lockup (public/brand), inlined as the file stands. It carries its own role="img" and the label "VT Infinite". */
export const LOCKUP_FILE = "public/brand/vt-infinite-lockup-stacked.svg";

let cached: string | null = null;

export function lockupSvg(): string {
  cached ??= readFileSync(join(process.cwd(), LOCKUP_FILE), "utf8").trim();
  return cached;
}

/**
 * The mark paints with currentColor, so it takes the figure color and
 * inverts with the theme. A span (display: block in CSS), since it sits
 * inside the page's h1, which takes phrasing content only.
 */
export function BrandLockup() {
  return <span className="landing-lockup" dangerouslySetInnerHTML={{ __html: lockupSvg() }} />;
}
