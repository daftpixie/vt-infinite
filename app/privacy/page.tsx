import type { Metadata } from "next";
import { connection } from "next/server";
import { Placeholder } from "@/components/Placeholder";
import { LANDING } from "@/lib/landing";
import { landingOnly } from "@/lib/mode-gate";

export const metadata: Metadata = { title: LANDING.privacyLabel };

/**
 * The landing release's privacy notice (R14). It exists only in landing
 * mode. Until the versioned notice is written and reviewed by counsel it is
 * a placeholder, so the landing release check fails the build.
 */
export default async function PrivacyPage() {
  await connection();
  landingOnly();
  return (
    <div className="wrap">
      <h1>{LANDING.privacyLabel}</h1>
      <Placeholder id="landingPrivacyNotice" />
    </div>
  );
}
