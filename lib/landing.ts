import { z } from "zod";
import raw from "@/content/landing.json" with { type: "json" };

/** A word as it appears on the page: letters, then at most a closing period. */
const word = z.string().regex(/^[A-Za-z]+\.?$/, "one word, optionally ending in a period");

/** An https address with no credentials, query or fragment, on a named host. */
const httpsUrl = z
  .string()
  .url()
  .refine((s) => {
    const u = new URL(s);
    return u.protocol === "https:" && !u.username && !u.password && !u.search && !u.hash && !u.port && /[a-z]/i.test(u.hostname.split(".").pop() ?? "");
  }, "an https address with no credentials, port, query or fragment");

const LandingSchema = z
  .object({
    note: z.string(),
    acrostic: z
      .array(
        z
          .object({
            across: word.refine((w) => !w.endsWith("."), "the across word carries no period; the page adds it, hidden from screen readers"),
            down: z.array(word).min(1),
          })
          .strict()
          .refine((i) => i.down.at(-1)!.endsWith("."), "each sentence ends with a period"),
      )
      .min(1),
    motto: z.string().min(1),
    /** The motto's language, as a BCP 47 tag (SC 3.1.2): "la" for Latin. */
    mottoLang: z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/, "a BCP 47 language tag"),
    links: z.array(z.object({ label: z.string().min(1), href: httpsUrl, customDomain: httpsUrl.optional() }).strict()).min(1),
    signupClosed: z.string().min(1),
    legalName: z.string().min(1),
    contactEmail: z.string().email(),
    privacyLabel: z.string().min(1),
  })
  .strict();

export type LandingContent = z.infer<typeof LandingSchema>;
export type AcrosticItem = LandingContent["acrostic"][number];

export function parseLanding(input: unknown): LandingContent {
  return LandingSchema.parse(input);
}

/** Parsed once; malformed configuration fails the build. */
export const LANDING: LandingContent = parseLanding(raw);

/** The sentence a screen reader hears for one column, e.g. "Heart defines the purpose." */
export function acrosticSentence(item: AcrosticItem): string {
  return [item.across, ...item.down].join(" ");
}

/** The heading that reads across, e.g. "Heart. Mind. Hands." */
export function acrosticHeading(items: readonly AcrosticItem[]): string {
  return items.map((i) => `${i.across}.`).join(" ");
}

/** Room each column keeps beyond its longest word, in characters, for text spacing (SC 1.4.12). */
export const ACROSTIC_HEADROOM = 2;

/**
 * JetBrains Mono's advance: every glyph is 600 of 1000 units wide
 * (public/fonts/JetBrainsMono-wght.woff2, hmtx). The threshold uses it in
 * em rather than the ch unit, which browsers may round (Chromium 153 makes
 * 1ch 10 px at 16 px, not 9.6 px), so the row holds wherever it fits.
 */
export const ACROSTIC_ADVANCE_EM = 0.6;

/**
 * The width below which the columns stack (globals.css, .acrostic-list):
 * every column its longest word plus ACROSTIC_HEADROOM characters, plus
 * the gaps, whose width the stylesheet sets. In em, so it scales with the
 * list's own size and with enlarged text.
 */
export function acrosticThreshold(items: readonly AcrosticItem[]): string {
  const longest = Math.max(...items.flatMap((i) => [`${i.across}.`, ...i.down]).map((w) => w.length));
  const em = Math.round(items.length * (longest + ACROSTIC_HEADROOM) * ACROSTIC_ADVANCE_EM * 1000) / 1000;
  return `calc(${em}em + ${items.length - 1} * var(--acrostic-gap))`;
}
