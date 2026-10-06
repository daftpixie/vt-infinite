import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Root as MdastRoot } from "mdast";
import { z } from "zod";
import { mentionsSuicide } from "@/lib/crisis";
import { isIsoWithOffset } from "./dates";
import { contentDir, CorrectionSchema } from "./essays";
import { splitFrontmatter } from "./frontmatter";
import { ContentError, parseMdx, usesCrisisSupport } from "./mdx";

const iso = z.string().refine(isIsoWithOffset, "must be ISO 8601 with a time zone offset");

/**
 * A Record entry (PRD §07; brand §05 "The Record"): what changed, the
 * evidence, who decided, and what is still open, with any correction first.
 * Historical entries are re-entered only when Matthew selects them (DN-5);
 * they keep their original slug and, where one existed, their feed GUID.
 */
export const RecordFrontmatterSchema = z
  .strictObject({
    title: z.string().min(1).max(200),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    summary: z.string().min(1).max(500),
    status: z.enum(["draft", "held", "published"]),
    holdReason: z.string().min(1).optional(),
    publishAt: iso.optional(),
    updatedAt: iso,
    decidedBy: z.string().min(1).max(200),
    evidence: z.array(z.strictObject({ label: z.string().min(1).max(200), url: z.url({ protocol: /^https$/ }), date: iso })).min(1),
    open: z.string().min(1).max(2000),
    corrections: z.array(CorrectionSchema).optional(),
    republication: z.strictObject({ originalPublishedAt: iso, legacyGuid: z.string().min(1).max(500).optional() }).optional(),
  })
  .superRefine((fm, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });
    if (fm.status === "held" && !fm.holdReason) issue("a held entry needs a private holdReason");
    if (fm.status !== "held" && fm.holdReason) issue("holdReason is only for held entries");
    if (fm.status === "published" && !fm.publishAt) issue("a published entry needs publishAt");
  });

export type RecordFrontmatter = z.infer<typeof RecordFrontmatterSchema>;
export type RecordEntry = Omit<RecordFrontmatter, "holdReason" | "status"> & { publishAt: string; tree: MdastRoot };

export function loadAllRecord(root: string = contentDir("RECORD_DIR", "content/record")): Array<{ fm: RecordFrontmatter; tree: MdastRoot }> {
  if (!existsSync(root)) return [];
  const problems: string[] = [];
  const out: Array<{ fm: RecordFrontmatter; tree: MdastRoot }> = [];
  for (const name of readdirSync(root).filter((n) => !n.startsWith(".") && n !== "README.md")) {
    const file = join(root, name);
    if (!statSync(file).isFile() || !name.endsWith(".mdx")) {
      problems.push(`${name}: Record entries are single .mdx files`);
      continue;
    }
    const fileSlug = name.slice(0, -4);
    try {
      const { data, body } = splitFrontmatter(readFileSync(file, "utf8"));
      const parsed = RecordFrontmatterSchema.safeParse(data);
      const tree = parseMdx(body);
      if (!parsed.success) {
        problems.push(`${name}: ${parsed.error.issues.map((i) => `${i.path.join(".") || "frontmatter"}: ${i.message}`).join("; ")}`);
        continue;
      }
      if (parsed.data.slug !== fileSlug) problems.push(`${name}: slug ${parsed.data.slug} does not match the file name`);
      // The body places the block itself; the page attaches it for the other fields.
      if (mentionsSuicide(body) && !usesCrisisSupport(tree)) problems.push(`${name}: mentions suicide without <CrisisSupport />`);
      out.push({ fm: parsed.data, tree });
    } catch (err) {
      problems.push(`${name}: ${(err as Error).message}`);
    }
  }
  if (problems.length) throw new ContentError(problems.join("\n"));
  return out;
}

export function publishedRecord(now: Date = new Date(), root?: string): RecordEntry[] {
  return loadAllRecord(root)
    .filter(({ fm }) => fm.status === "published" && fm.publishAt && Date.parse(fm.publishAt) <= now.getTime())
    .map(({ fm, tree }) => ({
      title: fm.title,
      slug: fm.slug,
      summary: fm.summary,
      publishAt: fm.publishAt as string,
      updatedAt: fm.updatedAt,
      decidedBy: fm.decidedBy,
      evidence: fm.evidence,
      open: fm.open,
      corrections: fm.corrections,
      republication: fm.republication,
      tree,
    }))
    .sort((a, b) => b.publishAt.localeCompare(a.publishAt));
}

export function findRecord(slug: string, now: Date = new Date(), root?: string): RecordEntry | null {
  return publishedRecord(now, root).find((e) => e.slug === slug) ?? null;
}
