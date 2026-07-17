import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const RECORD_DIR = path.join(process.cwd(), "content", "record");
export const RECORD_PUBLIC_DIR = path.join(process.cwd(), "public");
export const RESERVED_RECORD_SLUGS = new Set(["feed.xml"]);

export type RecordStatus = "draft" | "published";

export interface RecordPost {
  slug: string;
  title: string;
  date: string;
  summary: string;
  author: string;
  status: RecordStatus;
  updated?: string;
  socialImage?: string;
  socialImageAlt?: string;
  body: string;
}

export interface RecordReadOptions {
  directory?: string;
  publicDirectory?: string;
  includeUnpublished?: boolean;
  today?: string;
}

const ALLOWED_KEYS = new Set([
  "title",
  "date",
  "summary",
  "author",
  "status",
  "updated",
  "socialImage",
  "socialImageAlt"
]);
const REQUIRED_KEYS = ["title", "date", "summary", "author", "status"] as const;
const ISO_CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RECORD_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function fail(file: string, message: string): never {
  throw new Error(`content/record/${file}: ${message}`);
}

function unquote(value: string): string {
  const v = value.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1).trim();
  }
  return v;
}

function isRealCalendarDate(value: string): boolean {
  if (!ISO_CALENDAR_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function validateDate(file: string, field: "date" | "updated", value: string): void {
  if (!isRealCalendarDate(value)) {
    fail(file, `frontmatter "${field}" must be a real ISO calendar date in YYYY-MM-DD form, got ${JSON.stringify(value)}`);
  }
}

export function validateRecordSlug(slug: string, file = `${slug}.mdx`): void {
  if (!slug) fail(file, "filename produces an empty slug");
  if (RESERVED_RECORD_SLUGS.has(slug)) {
    fail(file, `slug "${slug}" is reserved by an existing /the-record route`);
  }
  if (!RECORD_SLUG.test(slug)) {
    fail(file, `slug "${slug}" must contain only lowercase letters, numbers, and single hyphens`);
  }
}

export function resolveRecordAssetPath(slug: string, source: string, publicDirectory = RECORD_PUBLIC_DIR): string {
  const prefix = `/record/${slug}/`;
  if (!source.startsWith(prefix)) {
    throw new Error(`asset ${JSON.stringify(source)} must be inside ${prefix}`);
  }
  if (source.includes("\\") || source.includes("?") || source.includes("#") || source.includes("%") || /\s/.test(source)) {
    throw new Error(`asset ${JSON.stringify(source)} contains unsupported path characters`);
  }

  const relative = source.slice(prefix.length);
  const segments = relative.split("/");
  if (!relative || segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`asset ${JSON.stringify(source)} must name a file below ${prefix}`);
  }

  const intendedDirectory = path.resolve(publicDirectory, "record", slug);
  const resolved = path.resolve(intendedDirectory, ...segments);
  if (!resolved.startsWith(`${intendedDirectory}${path.sep}`)) {
    throw new Error(`asset ${JSON.stringify(source)} escapes ${prefix}`);
  }
  return resolved;
}

// Strict single-line `key: value` frontmatter. No YAML dependency; unknown or
// malformed keys are build errors so typos cannot silently drop fields.
function parsePost(file: string, raw: string, publicDirectory: string): Omit<RecordPost, "slug"> {
  const slug = file.slice(0, -4);
  validateRecordSlug(slug, file);

  const text = raw.replace(/\r\n/g, "\n");
  if (!text.startsWith("---\n")) fail(file, 'must start with a "---" frontmatter block (see _TEMPLATE.mdx)');
  const end = text.indexOf("\n---\n", 4);
  if (end === -1) fail(file, 'frontmatter block is never closed with "---"');

  const fields: Record<string, string> = {};
  for (const line of text.slice(4, end).split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_]+):(.*)$/);
    if (!match) fail(file, `frontmatter line is not "key: value": ${JSON.stringify(line)}`);
    const key = match[1];
    if (!ALLOWED_KEYS.has(key)) {
      fail(file, `unknown frontmatter key "${key}" (allowed: ${[...ALLOWED_KEYS].join(", ")})`);
    }
    if (key in fields) fail(file, `duplicate frontmatter key "${key}"`);
    fields[key] = unquote(match[2]);
  }

  for (const key of REQUIRED_KEYS) {
    if (!fields[key]) fail(file, `frontmatter "${key}" is required and must not be empty`);
  }

  validateDate(file, "date", fields.date);
  if (fields.updated) {
    validateDate(file, "updated", fields.updated);
    if (fields.updated < fields.date) fail(file, 'frontmatter "updated" must not be earlier than "date"');
  }

  if (fields.status !== "draft" && fields.status !== "published") {
    fail(file, `frontmatter "status" must be "draft" or "published", got ${JSON.stringify(fields.status)}`);
  }

  const hasSocialImage = Boolean(fields.socialImage);
  const hasSocialImageAlt = Boolean(fields.socialImageAlt);
  if (hasSocialImage !== hasSocialImageAlt) {
    fail(file, 'frontmatter "socialImage" and "socialImageAlt" must be supplied together');
  }
  if (hasSocialImage) {
    let socialImageFile: string;
    try {
      socialImageFile = resolveRecordAssetPath(slug, fields.socialImage, publicDirectory);
    } catch (error) {
      fail(file, error instanceof Error ? error.message : "social image path is invalid");
    }
    if (!fs.existsSync(socialImageFile) || !fs.statSync(socialImageFile).isFile()) {
      fail(file, `social image ${JSON.stringify(fields.socialImage)} does not identify a file in public/record/${slug}/`);
    }
  }

  return {
    title: fields.title,
    date: fields.date,
    summary: fields.summary,
    author: fields.author,
    status: fields.status,
    updated: fields.updated || undefined,
    socialImage: fields.socialImage || undefined,
    socialImageAlt: fields.socialImageAlt || undefined,
    body: text.slice(end + 5)
  };
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isRecordPostPublic(post: RecordPost, today = todayUtc()): boolean {
  return post.status === "published" && post.date <= today;
}

export function isRecordPreview(): boolean {
  return process.env.NODE_ENV === "development";
}

export function getRecordPosts(options: RecordReadOptions = {}): RecordPost[] {
  const directory = options.directory ?? RECORD_DIR;
  const publicDirectory = options.publicDirectory ?? RECORD_PUBLIC_DIR;
  const includeUnpublished = options.includeUnpublished ?? false;
  const today = options.today ?? todayUtc();
  if (!fs.existsSync(directory)) return [];

  const posts: RecordPost[] = [];
  const slugs = new Set<string>();
  for (const file of fs.readdirSync(directory).sort()) {
    if (!file.endsWith(".mdx") || file.startsWith("_")) continue;
    const slug = file.slice(0, -4);
    validateRecordSlug(slug, file);
    if (slugs.has(slug)) fail(file, `duplicate slug "${slug}"`);
    slugs.add(slug);
    const raw = fs.readFileSync(path.join(directory, file), "utf8");
    posts.push({ slug, ...parsePost(file, raw, publicDirectory) });
  }

  return posts
    .filter((post) => includeUnpublished || isRecordPostPublic(post, today))
    .sort((a, b) => (a.date === b.date ? b.slug.localeCompare(a.slug) : b.date.localeCompare(a.date)));
}

export function getVisibleRecordPosts(): RecordPost[] {
  return getRecordPosts({ includeUnpublished: isRecordPreview() });
}

export function getRecordPost(slug: string, options: RecordReadOptions = {}): RecordPost | undefined {
  if (!slug || !RECORD_SLUG.test(slug) || RESERVED_RECORD_SLUGS.has(slug)) return undefined;
  return getRecordPosts(options).find((post) => post.slug === slug);
}

export function getVisibleRecordPost(slug: string): RecordPost | undefined {
  return getRecordPost(slug, { includeUnpublished: isRecordPreview() });
}

export function recordDateTime(date: string): string {
  return `${date}T12:00:00.000Z`;
}

// Short hash of the last commit touching the post file, computed at build time.
// Returns null (and the provenance line is omitted) when the file is not yet
// committed or git is unavailable in the build environment. Never fabricated.
export function lastCommitShortHash(slug: string): string | null {
  try {
    const out = execFileSync("git", ["log", "-1", "--format=%h", "--", `content/record/${slug}.mdx`], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "ignore"]
    })
      .toString()
      .trim();
    return out || null;
  } catch {
    return null;
  }
}
