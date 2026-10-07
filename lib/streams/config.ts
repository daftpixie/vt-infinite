import { z } from "zod";
import raw from "@/content/streams.json" with { type: "json" };

/**
 * Allowlisted publication streams (PRD SS-1). Names and URLs are fixed
 * inputs, never request parameters. A disabled publication is never fetched
 * or shown. `withdrawn` removes an item from every surface at once (SS-6);
 * it records only identities, never reasons or private URLs.
 */
const httpsUrl = z.url({ protocol: /^https$/ });

export const PublicationSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]{1,64}$/),
  name: z.string().min(1).max(120),
  home: httpsUrl,
  feed: httpsUrl,
  enabled: z.boolean(),
});

export const StreamsConfigSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    publications: z.array(PublicationSchema),
    withdrawn: z.array(z.strictObject({ publication: z.string(), guid: z.string().min(1) })),
  })
  .superRefine((cfg, ctx) => {
    const ids = new Set<string>();
    for (const p of cfg.publications) {
      if (ids.has(p.id)) ctx.addIssue({ code: "custom", message: `duplicate publication id ${p.id}` });
      ids.add(p.id);
      // The feed is always https://<home host>/feed: on substack.com today, and on
      // the publication's www host once a custom domain is configured. Item links
      // must then match that host exactly (parse.ts), so a change of host is one
      // edit to content/streams.json.
      const home = new URL(p.home);
      if (home.pathname !== "/" || home.search || home.hash || home.port || home.username || home.password) {
        ctx.addIssue({ code: "custom", message: `${p.id}: home must be a bare https origin` });
      }
      if (p.feed !== `${home.origin}/feed`) {
        ctx.addIssue({ code: "custom", message: `${p.id}: feed must be ${home.origin}/feed` });
      }
    }
    for (const w of cfg.withdrawn) {
      if (!ids.has(w.publication)) ctx.addIssue({ code: "custom", message: `withdrawn item names unknown publication ${w.publication}` });
    }
  });

export type Publication = z.infer<typeof PublicationSchema>;
export type StreamsConfig = z.infer<typeof StreamsConfigSchema>;

export const STREAMS: StreamsConfig = StreamsConfigSchema.parse(raw);

export function enabledPublications(cfg: StreamsConfig = STREAMS): Publication[] {
  return cfg.publications.filter((p) => p.enabled);
}

export function isWithdrawn(publication: string, guid: string, cfg: StreamsConfig = STREAMS): boolean {
  return cfg.withdrawn.some((w) => w.publication === publication && w.guid === guid);
}
