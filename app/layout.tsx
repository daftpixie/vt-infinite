import type { Metadata } from "next";
import { FALLBACK_SOCIAL_IMAGE, FALLBACK_SOCIAL_IMAGE_ALT, SITE_NAME, SITE_URL } from "./constants";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "VT Infinite — Vigilance, made operational",
    template: "%s — VT Infinite"
  },
  description: "VT Infinite conducts frontier AI, deterministic tools, and human judgment into systems built for consequential questions.",
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: "/",
    images: [{ url: FALLBACK_SOCIAL_IMAGE, width: 1024, height: 1024, alt: FALLBACK_SOCIAL_IMAGE_ALT }]
  },
  twitter: {
    card: "summary_large_image",
    images: [{ url: FALLBACK_SOCIAL_IMAGE, alt: FALLBACK_SOCIAL_IMAGE_ALT }]
  },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
