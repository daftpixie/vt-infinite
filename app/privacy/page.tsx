import type { Metadata } from "next";
import { connection } from "next/server";
import { PrivacyNotice } from "@/components/landing/PrivacyNotice";
import { LANDING } from "@/lib/landing";
import { landingOnly } from "@/lib/mode-gate";

/** Indexable in landing mode only; the full build answers 404 here. */
export function generateMetadata(): Metadata {
  landingOnly();
  return { title: LANDING.privacyLabel, robots: { index: true, follow: true } };
}

/** The landing release's privacy notice. It exists only in landing mode. */
export default async function PrivacyPage() {
  await connection();
  landingOnly();
  return (
    <div className="wrap">
      <h1>{LANDING.privacyLabel}</h1>
      <PrivacyNotice />
    </div>
  );
}
