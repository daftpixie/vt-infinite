import type { ReactNode } from "react";

/**
 * External destinations carry ↗ and say so to screen readers (brand §05;
 * PRD Q-8). The arrow is hidden from them, since the words say it. No new tab.
 */
export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} rel="noopener">
      {children}
      <span aria-hidden="true">{" ↗"}</span>
      <span className="visually-hidden"> (opens another site)</span>
    </a>
  );
}
