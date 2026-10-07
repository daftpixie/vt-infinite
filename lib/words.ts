import type { Essay } from "@/lib/content/essays";
import { SITE_PUBLICATION } from "@/lib/content/essays";
import { mentionsSuicide } from "@/lib/crisis";
import { passesHomeChecks } from "@/lib/home-checks";
import { STREAMS } from "@/lib/streams/config";
import type { StreamView } from "@/lib/streams/service";

export type WordsEntry = {
  key: string;
  title: string;
  subtitle: string | null;
  date: string;
  publicationId: string;
  publicationName: string;
  href: string;
  /** Links to a page on this site rather than to the first publication. */
  local: boolean;
  mentionsSuicide: boolean;
  homeEligible: boolean;
};

export function publicationName(id: string): string {
  if (id === SITE_PUBLICATION) return "vt-infinite.com";
  return STREAMS.publications.find((p) => p.id === id)?.name ?? id;
}

/**
 * One newest-first list across local essays and enabled streams (PRD §05,
 * §06). A stream post with an approved local mirror links locally; any other
 * post links to its first publication. Each post appears once.
 */
export function buildWordsEntries(essays: Essay[], streams: StreamView[]): WordsEntry[] {
  const mirrored = new Set(essays.map((e) => e.firstPublishedUrl).filter(Boolean) as string[]);
  const entries: WordsEntry[] = essays.map((e) => ({
    key: `essay:${e.slug}`,
    title: e.title,
    subtitle: e.subtitle ?? null,
    date: e.firstPublishedAt ?? e.publishAt,
    publicationId: e.publication,
    publicationName: publicationName(e.publication),
    href: `/words/${e.slug}`,
    local: true,
    mentionsSuicide: mentionsSuicide(e.title, e.subtitle),
    // Local essays pass the same homepage claim checks as stream posts (SS-9).
    homeEligible: passesHomeChecks([e.title, e.subtitle, e.summary].filter(Boolean).join("\n"), `essay:${e.slug}`),
  }));
  for (const s of streams) {
    if (s.status === "unavailable") continue;
    for (const item of s.items) {
      if (mirrored.has(item.url)) continue;
      entries.push({
        key: `stream:${item.key}`,
        title: item.title,
        subtitle: item.subtitle,
        date: item.publishedAt,
        publicationId: item.publication,
        publicationName: s.publication.name,
        href: item.url,
        local: false,
        mentionsSuicide: item.mentionsSuicide,
        homeEligible: item.homeEligible,
      });
    }
  }
  return entries.sort((a, b) => b.date.localeCompare(a.date));
}

export function latestForHome(entries: WordsEntry[], count = 3): WordsEntry[] {
  return entries.filter((e) => e.homeEligible).slice(0, count);
}
