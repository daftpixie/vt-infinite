import Link from "next/link";
import { CONTACT_EMAIL, SOLVE_EVERYTHING_LAB } from "./constants";

export function Header() {
  return (
    <header className="site-header shell">
      <Link className="wordmark" href="/" aria-label="VT Infinite home">VT INFINITE</Link>
      <nav aria-label="Primary navigation">
        <Link href="/origin">Origin</Link>
        <Link href="/phial">Phial</Link>
        <Link href="/partners">Partners</Link>
        <Link href="/the-record">The Record</Link>
        <a href={SOLVE_EVERYTHING_LAB} target="_blank" rel="noreferrer">Lab</a>
      </nav>
    </header>
  );
}

export function ContactActions({ inverse = false }: { inverse?: boolean }) {
  const buttonClass = inverse ? "button button-inverse" : "button button-solid";
  return (
    <div className="actions">
      <a className={buttonClass} href={`mailto:${CONTACT_EMAIL}`}>Email Matthew</a>
      <a className="button" href={SOLVE_EVERYTHING_LAB} target="_blank" rel="noreferrer">Solve Everything Lab</a>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="site-footer shell">
      <div>
        <p className="wordmark">VT INFINITE</p>
        <p>Vigilance in service of what we love.</p>
      </div>
      <div className="footer-links">
        <Link href="/origin">Origin</Link>
        <Link href="/phial">Phial</Link>
        <Link href="/partners">Partners</Link>
        <Link href="/the-record">The Record</Link>
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        <a href={SOLVE_EVERYTHING_LAB} target="_blank" rel="noreferrer">Solve Everything Lab</a>
      </div>
      <p className="copyright">© 2026 VT Infinite. Ad astra per aspera.</p>
    </footer>
  );
}
