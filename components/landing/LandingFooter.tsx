import Link from "next/link";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { LANDING } from "@/lib/landing";

/**
 * Landing release footer: the legal name, a way home, the privacy notice
 * and the contact address as selectable text. The same on every page,
 * the 404 included (SC 3.2.6).
 */
export function LandingFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap landing-footer">
        <p>{LANDING.legalName}</p>
        <ul className="footer-links" role="list">
          <li>
            <Link href="/">Home</Link>
          </li>
          <li>
            <Link href="/privacy">{LANDING.privacyLabel}</Link>
          </li>
          <li>
            <a href={`mailto:${LANDING.contactEmail}`}>{LANDING.contactEmail}</a>
          </li>
        </ul>
        <ThemeSwitch />
      </div>
    </footer>
  );
}
