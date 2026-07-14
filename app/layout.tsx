import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";

const geistMono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "VT Infinite — Vigilance, made operational",
    template: "%s — VT Infinite"
  },
  description: "VT Infinite conducts frontier AI, deterministic tools, and human judgment into systems built for consequential questions.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={geistMono.variable}>{children}</body></html>;
}
