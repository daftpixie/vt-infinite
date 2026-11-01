import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";
import { Placeholder } from "@/components/Placeholder";
import { fullSiteOnly } from "@/lib/mode-gate";
import { connection } from "next/server";
import { AnalyticsNotice } from "@/components/pulse/AnalyticsNotice";
import { collectionEnabled, publicPulseEnabled } from "@/lib/pulse/config";

export function generateMetadata(): Metadata {
  fullSiteOnly();
  return { title: "Privacy" };
}

export default async function PrivacyPage() {
  await connection();
  fullSiteOnly();
  return (
    <PageShell title="Privacy">
      <p>Site measurement notice · Version full-signal-1 · Collection {collectionEnabled() ? "on" : "off"} · Publication {publicPulseEnabled() ? "on" : "off"}</p>
      <AnalyticsNotice collection={collectionEnabled()} publication={publicPulseEnabled()} />
      <Placeholder id="policyPrivacy" />
    </PageShell>
  );
}
