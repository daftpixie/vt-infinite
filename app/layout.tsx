import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteNav } from "@/components/SiteNav";
import { THEME_BOOT_SCRIPT } from "@/components/ThemeSwitch";
import { isLanding } from "@/lib/mode";
import { SITE_FURNITURE, SITE_NAME, siteUrl } from "@/lib/site";
import "./globals.css";

export function generateMetadata(): Metadata {
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: SITE_NAME, template: `%s · ${SITE_FURNITURE}` },
    // Unreleased: keep every route out of search indexes until cutover.
    robots: { index: false, follow: false },
    // The landing release uses the approved small mark (public/brand) as its favicon.
    ...(isLanding() ? { icons: { icon: { url: "/brand/vt-infinite-mark-small.svg", type: "image/svg+xml" } } } : {}),
  };
}

export const viewport: Viewport = {
  colorScheme: "dark light",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // The landing release has no header or primary navigation: every other page answers 404 there.
  if (isLanding()) {
    return (
      <html lang="en" suppressHydrationWarning>
        <head>
          <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        </head>
        <body>
          <a className="skip-link" href="#main">
            Skip to content
          </a>
          <main id="main" tabIndex={-1}>
            {children}
          </main>
          <LandingFooter />
        </body>
      </html>
    );
  }
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <header className="site-header">
          <div className="wrap">
            <p className="site-name">{SITE_NAME}</p>
            <SiteNav />
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
