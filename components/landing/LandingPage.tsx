import type { CSSProperties } from "react";
import { ExternalLink } from "@/components/ExternalLink";
import { acrosticHeading, acrosticThreshold, LANDING, type AcrosticItem } from "@/lib/landing";
import { BrandLockup } from "./BrandLockup";

/**
 * One column of the acrostic. The sentence is a single run of inline text,
 * so a screen reader hears it as one sentence; the column is min-content
 * wide, so CSS (not <br>) puts each word on its own line. The period after
 * the bold word is visual only. The bold is set in CSS, not <strong>: it is
 * layout rather than emphasis, and <strong> would split the sentence into
 * two nodes in the accessibility tree.
 */
function AcrosticColumn({ item }: { item: AcrosticItem }) {
  return (
    <li className="acrostic-item">
      <span className="acrostic-text">
        <span className="acrostic-across">
          {item.across}
          <span aria-hidden="true">.</span>
        </span>{" "}
        {item.down.join(" ")}
      </span>
    </li>
  );
}

/** The landing release's page at `/` (SITE_MODE=landing). Copy and links come from content/landing.json. */
export function LandingPage() {
  const heading = acrosticHeading(LANDING.acrostic);
  return (
    <div className="wrap landing">
      <h1 className="landing-mark">
        <BrandLockup />
      </h1>

      {/* A div, not a labelled section: the hidden heading is the one announcement of "Heart. Mind. Hands.". */}
      <div className="acrostic">
        <h2 className="visually-hidden">
          {heading}
        </h2>
        {/* role="list" keeps list semantics in Safari, which drops them when list-style is none. */}
        <ol className="acrostic-list" role="list" style={{ "--acrostic-threshold": acrosticThreshold(LANDING.acrostic) } as CSSProperties}>
          {LANDING.acrostic.map((item) => (
            <AcrosticColumn key={item.across} item={item} />
          ))}
        </ol>
      </div>

      <p className="motto" lang={LANDING.mottoLang}>
        {LANDING.motto}
      </p>

      <ul className="landing-links" role="list">
        {LANDING.links.map((l) => (
          <li key={l.href}>
            <ExternalLink href={l.href}>{l.label}</ExternalLink>
          </li>
        ))}
      </ul>

      <p className="landing-signup" data-signup="closed">
        {LANDING.signupClosed}
      </p>
    </div>
  );
}
