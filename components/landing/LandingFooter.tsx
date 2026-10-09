import Link from "next/link";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { LANDING } from "@/lib/landing";

/** Landing release footer: the legal name, the privacy notice and the contact address as selectable text. Nothing else. */
export function LandingFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap landing-footer">
        <p>{LANDING.legalName}</p>
        <ul className="footer-links">
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
