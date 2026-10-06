import type { ReactNode } from "react";

/** External destinations carry ↗ and say so to screen readers (brand §05; PRD Q-8). No new tab. */
export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} rel="noopener">
      {children}
      {" ↗"}
      <span className="visually-hidden"> (opens another site)</span>
    </a>
  );
}
