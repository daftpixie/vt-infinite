import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import type { Root as MdastRoot } from "mdast";
import { z } from "zod";
import { STREAMS } from "@/lib/streams/config";
import { isIsoWithOffset } from "./dates";
import { splitFrontmatter } from "./frontmatter";
import { ContentError, parseMdx, usesCrisisSupport } from "./mdx";

/** The approved byline (PRD Q-3). */
export const BYLINE = "Matthew J Adams";
/** Publication value for a piece first published on this site. */
export const SITE_PUBLICATION = "vt-infinite.com";
export const MIN_FINALIZATION_MS = 48 * 60 * 60 * 1000;

const iso = z.string().refine(isIsoWithOffset, "must be ISO 8601 with a time zone offset");
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase words joined by hyphens");
const assetPath = z.string().regex(/^assets\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/, "a file directly under assets/");

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);
const ALLOWED_ASSET_EXT = new Set([...IMAGE_EXT, ".pdf"]);

export const CorrectionSchema = z.strictObject({
  date: iso,
  kind: z.enum(["substantive", "style"]),
  explanation: z.string().min(1).max(2000),
  editor: z.string().min(1).max(120),
  earlierVersionUrl: z.url({ protocol: /^https$/ }).optional(),
});

export const EssayFrontmatterSchema = z
  .strictObject({
    title: z.string().min(1).max(200),
    subtitle: z.string().min(1).max(300).optional(),
    summary: z.string().min(1).max(500),
    slug,
    author: z.literal(BYLINE),
    publication: z.string(),
    status: z.enum(["draft", "held", "published"]),
    /** Private: validated here, never rendered or exported (W-2). */
    holdReason: z.string().min(1).optional(),
    publishAt: iso.optional(),
    finalSince: iso.optional(),
    /** The fact of a second read and when; never the reader's identity (W-3). */
    secondRead: z.strictObject({ recordedAt: iso }).optional(),
    firstPublishedUrl: z.url({ protocol: /^https$/ }).optional(),
    firstPublishedAt: iso.optional(),
    updatedAt: iso,
    corrections: z.array(CorrectionSchema).optional(),
    cover: z.strictObject({ src: assetPath, alt: z.string().min(1).max(500), credit: z.string().min(1).max(300) }).optional(),
    pdf: z.strictObject({ src: assetPath, label: z.string().min(1).max(120).optional() }).optional(),
    comments: z.enum(["closed", "open"]).default("closed"),
  })
  .superRefine((fm, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });
    const t = (s?: string) => (s ? Date.parse(s) : Number.NaN);
    const pubIds = new Set([SITE_PUBLICATION, ...STREAMS.publications.map((p) => p.id)]);
    if (!pubIds.has(fm.publication)) issue(`unknown publication ${JSON.stringify(fm.publication)}`);

    if (fm.status === "held" && !fm.holdReason) issue("a held piece needs a private holdReason");
    if (fm.status !== "held" && fm.holdReason) issue("holdReason is only for held pieces");

    const mirror = fm.publication !== SITE_PUBLICATION;
    if (mirror && !(fm.firstPublishedUrl && fm.firstPublishedAt)) issue("a mirror needs firstPublishedUrl and firstPublishedAt (W-4)");
    if (!mirror && (fm.firstPublishedUrl || fm.firstPublishedAt)) issue("a piece first published here has no firstPublished fields");
    if (Boolean(fm.firstPublishedUrl) !== Boolean(fm.firstPublishedAt)) issue("firstPublishedUrl and firstPublishedAt go together");
    if (mirror && fm.firstPublishedUrl) {
      const pub = STREAMS.publications.find((p) => p.id === fm.publication);
      if (pub && new URL(fm.firstPublishedUrl).host !== new URL(pub.home).host) issue("firstPublishedUrl must be on the publication's own site");
    }

    if (fm.status === "published") {
      if (!fm.publishAt || !fm.finalSince || !fm.secondRead) issue("a published piece needs publishAt, finalSince and secondRead (W-3)");
      else {
        // Elapsed time between instants, not calendar-date subtraction.
        if (t(fm.publishAt) - t(fm.finalSince) < MIN_FINALIZATION_MS) issue("publishAt must be at least 48 elapsed hours after finalSince (W-3)");
        const read = t(fm.secondRead.recordedAt);
        if (read < t(fm.finalSince) || read > t(fm.publishAt)) issue("the second read falls between finalSince and publishAt");
      }
      if (fm.publishAt && fm.firstPublishedAt && t(fm.publishAt) < t(fm.firstPublishedAt)) {
        issue("a local release cannot precede the first publication (W-4)");
      }
    }
    if (fm.comments === "open") issue("comments stay closed until participation clears R2");
  });

export type EssayFrontmatter = z.infer<typeof EssayFrontmatterSchema>;

/** The public shape of an essay. No hold reason, no draft fields. */
export type Essay = Omit<EssayFrontmatter, "holdReason" | "finalSince" | "secondRead" | "status" | "comments"> & {
  publishAt: string;
  tree: MdastRoot;
};

type Loaded = { fm: EssayFrontmatter; tree: MdastRoot; dir: string };

/**
 * Directory of essays. Tests point `ESSAYS_DIR` at fixtures; a fixtures
 * directory is marked with a `.fixtures` file and refused unless
 * `ALLOW_CONTENT_FIXTURES=true`, so fixtures never reach production output.
 */
export function contentDir(envName: "ESSAYS_DIR" | "RECORD_DIR", fallback: string, env: Readonly<Record<string, string | undefined>> = process.env): string {
  const dir = resolve(/*turbopackIgnore: true*/ env[envName] ?? fallback);
  if (existsSync(join(dir, ".fixtures")) && env.ALLOW_CONTENT_FIXTURES !== "true") {
    throw new ContentError(`${dir} holds test fixtures; set ALLOW_CONTENT_FIXTURES=true only in tests`);
  }
  return dir;
}

function checkAssets(dir: string, fm: EssayFrontmatter): string[] {
  const problems: string[] = [];
  const assets = join(dir, "assets");
  if (existsSync(assets)) {
    for (const name of readdirSync(assets)) {
      const full = join(assets, name);
      if (!statSync(full).isFile()) problems.push(`assets/${name} is not a plain file`);
      else if (!ALLOWED_ASSET_EXT.has(extname(name).toLowerCase())) problems.push(`assets/${name} has a disallowed type`);
    }
  }
  const needFile = (src: string, kinds: Set<string>) => {
    if (!kinds.has(extname(src).toLowerCase())) problems.push(`${src} has the wrong type`);
    else if (!existsSync(join(dir, src))) problems.push(`${src} does not exist`);
  };
  if (fm.cover) needFile(fm.cover.src, IMAGE_EXT);
  if (fm.pdf) needFile(fm.pdf.src, new Set([".pdf"]));
  return problems;
}

/** Validate one essay directory. Throws ContentError naming every problem. */
export function loadEssayDir(dir: string, dirSlug: string): Loaded {
  const file = join(dir, "index.mdx");
  if (!existsSync(file)) throw new ContentError(`${dirSlug}: missing index.mdx`);
  const extra = readdirSync(dir).filter((n) => n !== "index.mdx" && n !== "assets");
  const problems: string[] = extra.map((n) => `unexpected file ${n} (one file per slug)`);
  let fm: EssayFrontmatter | null = null;
  let tree: MdastRoot | null = null;
  try {
    const { data, body } = splitFrontmatter(readFileSync(file, "utf8"));
    const parsed = EssayFrontmatterSchema.safeParse(data);
    if (!parsed.success) problems.push(...parsed.error.issues.map((i) => `${i.path.join(".") || "frontmatter"}: ${i.message}`));
    else fm = parsed.data;
    tree = parseMdx(body);
    const text = `${fm?.title ?? ""} ${fm?.subtitle ?? ""} ${body}`;
    if (/suicid/i.test(text) && !usesCrisisSupport(tree)) problems.push("mentions suicide without <CrisisSupport /> (Q-1)");
  } catch (err) {
    problems.push((err as Error).message);
  }
  if (fm && fm.slug !== dirSlug) problems.push(`slug ${fm.slug} does not match its directory ${dirSlug}`);
  if (fm) problems.push(...checkAssets(dir, fm));
  if (problems.length || !fm || !tree) throw new ContentError(`${dirSlug}: ${problems.join("; ")}`);
  return { fm, tree, dir };
}

/** Every essay, validated. Any invalid file fails the whole load (W-2). */
export function loadAllEssays(root: string = contentDir("ESSAYS_DIR", "content/essays")): Loaded[] {
  if (!existsSync(root)) return [];
  const slugs = readdirSync(root).filter((n) => !n.startsWith(".") && n !== "README.md");
  const seen = new Set<string>();
  const loaded: Loaded[] = [];
  const problems: string[] = [];
  for (const s of slugs) {
    if (!statSync(join(root, s)).isDirectory()) {
      problems.push(`${s}: essays live in a directory per slug`);
      continue;
    }
    if (seen.has(s.toLowerCase())) problems.push(`${s}: duplicate slug`);
    seen.add(s.toLowerCase());
    try {
      loaded.push(loadEssayDir(join(root, s), s));
    } catch (err) {
      problems.push((err as Error).message);
    }
  }
  if (problems.length) throw new ContentError(problems.join("\n"));
  return loaded;
}

function toPublic({ fm, tree }: Loaded): Essay {
  // Built field by field so private and workflow fields cannot leak (W-2).
  return {
    title: fm.title,
    subtitle: fm.subtitle,
    summary: fm.summary,
    slug: fm.slug,
    author: fm.author,
    publication: fm.publication,
    publishAt: fm.publishAt as string,
    firstPublishedUrl: fm.firstPublishedUrl,
    firstPublishedAt: fm.firstPublishedAt,
    updatedAt: fm.updatedAt,
    corrections: fm.corrections,
    cover: fm.cover,
    pdf: fm.pdf,
    tree,
  };
}

/** Published essays whose release time has passed, newest first. */
export function publishedEssays(now: Date = new Date(), root?: string): Essay[] {
  return loadAllEssays(root)
    .filter((e) => e.fm.status === "published" && e.fm.publishAt && Date.parse(e.fm.publishAt) <= now.getTime())
    .map(toPublic)
    .sort((a, b) => b.publishAt.localeCompare(a.publishAt));
}

export function findEssay(slugValue: string, now: Date = new Date(), root?: string): Essay | null {
  return publishedEssays(now, root).find((e) => e.slug === slugValue) ?? null;
}

/** Absolute path of a public essay asset, or null. Only files named in frontmatter are served (W-5). */
export function essayAssetPath(slugValue: string, file: string, now: Date = new Date(), root: string = contentDir("ESSAYS_DIR", "content/essays")): string | null {
  const essay = findEssay(slugValue, now, root);
  if (!essay) return null;
  const allowed = [essay.cover?.src, essay.pdf?.src].filter(Boolean).map((s) => (s as string).slice("assets/".length));
  if (!allowed.includes(file)) return null;
  return join(root, slugValue, "assets", file);
}
