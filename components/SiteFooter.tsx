import Link from "next/link";
import { FOOTER_LINES } from "@/lib/site";
import { Placeholder } from "./Placeholder";
import { ThemeSwitch } from "./ThemeSwitch";

/** Footer contents per PRD §04. */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap footer-grid">
        <section aria-labelledby="footer-contact">
          <h2 id="footer-contact" className="label">
            Contact
          </h2>
          <p>
            <Placeholder id="contactEmail" inline />
          </p>
          <p>
            <Placeholder id="communityLink" inline />
          </p>
        </section>
        <nav aria-labelledby="footer-more">
          <h2 id="footer-more" className="label">
            More
          </h2>
          <ul className="footer-links" role="list">
            <li>
              <Link href="/marrs-rover">Marrs Rover</Link>
            </li>
            <li>
              <Link href="/governance">Proposed governance</Link>
            </li>
            <li>
              <Link href="/policies/comments">Comment policy</Link>
            </li>
            <li>
              <Link href="/policies/privacy">Privacy</Link>
            </li>
            <li>
              <Link href="/policies/terms">Terms</Link>
            </li>
          </ul>
        </nav>
        <div>
          <ThemeSwitch />
        </div>
        <div className="footer-lines">
          <p>{FOOTER_LINES.running}</p>
          <p>{FOOTER_LINES.close}</p>
          <p>
            <em>{FOOTER_LINES.colophon}</em>
          </p>
        </div>
      </div>
    </footer>
  );
}
