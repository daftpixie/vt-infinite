import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import { runRules } from "@/guards/rules.mjs";
import { mentionsSuicide } from "@/lib/crisis";
import type { Publication } from "./config";
import { htmlToText, truncate } from "./text";

/** The public projection of one stream item: metadata and a link, nothing else (SS-4). */
export type StreamItem = {
  /** Stable public key, derived from publication and GUID. */
  key: string;
  publication: string;
  guid: string;
  title: string;
  subtitle: string | null;
  url: string;
  publishedAt: string;
  /** The item mentions suicide, so any surface showing it carries the crisis block. */
  mentionsSuicide: boolean;
  /** Passes the homepage claim checks (SS-9). */
  homeEligible: boolean;
};

export type ParseIssue = { index: number; reason: string };

export type ParseResult =
  | { ok: true; items: StreamItem[]; issues: ParseIssue[]; withheld: number }
  | { ok: false; reason: string };

export const MAX_TITLE = 300;
export const MAX_SUBTITLE = 400;

/** Rules that withhold an item from every surface. */
const WITHHOLD_RULES = ["secrets", "private-env-identifiers", "long-numeric-id", "pbc-status", "byline"];
/** Rules that keep an item off Home, where institutional claims apply. */
const HOME_RULES = ["pbc-mention", "funding-ask", "clinical-function", "initiative-pairing"];

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (_name, jpath) => jpath === "rss.channel.item",
});

function text(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (v && typeof v === "object" && "#text" in v) return text((v as Record<string, unknown>)["#text"]);
  return "";
}

export function itemKey(publication: string, guid: string): string {
  return createHash("sha256").update(`${publication}\n${guid}`).digest("hex").slice(0, 16);
}

/**
 * Parse and validate an RSS 2.0 document for one allowlisted publication
 * (PRD SS-3). A document type declaration is refused outright, so no
 * external or internal entity can expand. Malformed items are dropped and
 * reported without failing the healthy rest of the stream.
 */
export function parseFeed(xml: string, pub: Publication, env: Readonly<Record<string, string | undefined>> = process.env): ParseResult {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) return { ok: false, reason: "document type declarations are not accepted" };
  let doc: unknown;
  try {
    doc = parser.parse(xml, true);
  } catch {
    return { ok: false, reason: "not well-formed XML" };
  }
  const channel = (doc as { rss?: { channel?: { item?: unknown[] } } })?.rss?.channel;
  if (!channel || typeof channel !== "object") return { ok: false, reason: "not an RSS 2.0 channel" };

  const host = new URL(pub.home).host;
  const raw = Array.isArray(channel.item) ? channel.item : [];
  const items: StreamItem[] = [];
  const issues: ParseIssue[] = [];
  const seen = new Set<string>();
  let withheld = 0;

  raw.forEach((entry, index) => {
    const it = (entry ?? {}) as Record<string, unknown>;
    const title = htmlToText(text(it.title));
    const link = text(it.link).trim();
    const guid = text(it.guid).trim() || link;
    const published = Date.parse(text(it.pubDate));
    const subtitle = htmlToText(text(it.description));

    if (!title) return issues.push({ index, reason: "missing title" });
    if (title.length > MAX_TITLE) return issues.push({ index, reason: "title too long" });
    let url: URL;
    try {
      url = new URL(link);
    } catch {
      return issues.push({ index, reason: "invalid link" });
    }
    if (url.protocol !== "https:" || url.host !== host || url.username || url.password) {
      return issues.push({ index, reason: "link outside the publication" });
    }
    if (!guid) return issues.push({ index, reason: "missing identity" });
    if (Number.isNaN(published)) return issues.push({ index, reason: "invalid publication time" });
    if (seen.has(guid)) return issues.push({ index, reason: "duplicate identity" });
    seen.add(guid);

    const shown = `${title}\n${subtitle}`;
    if (runRules(shown, { target: `stream:${pub.id}`, scopes: ["repo"], env, only: WITHHOLD_RULES }).length > 0) {
      withheld += 1;
      return;
    }
    url.hash = "";
    items.push({
      key: itemKey(pub.id, guid),
      publication: pub.id,
      guid,
      title,
      subtitle: subtitle ? truncate(subtitle, MAX_SUBTITLE) : null,
      url: url.toString(),
      publishedAt: new Date(published).toISOString(),
      mentionsSuicide: mentionsSuicide(title, subtitle),
      homeEligible: runRules(shown, { target: `stream:${pub.id}`, scopes: ["copy"], env, only: HOME_RULES }).length === 0,
    });
  });

  items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return { ok: true, items, issues, withheld };
}
