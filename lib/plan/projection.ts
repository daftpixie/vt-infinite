import { runRules } from "@/guards/rules.mjs";
import { mentionsSuicide } from "@/lib/crisis";
import type { PlanSource, RawTask } from "./asana";

/**
 * The public projection of the OneRhythm plan (PRD A-5, A-6). Only these
 * fields exist: title, done or open, due date and milestone. Provider IDs
 * never enter it; each item carries a public key generated on the server
 * (see keys.ts). Titles are plain text, at most 200 characters, and pass
 * the copy and private-identifier guards before they can be stored.
 */
export type PlanStep = {
  key: string;
  title: string;
  milestone: boolean;
  completed: boolean;
  /** YYYY-MM-DD, or null. */
  dueOn: string | null;
  mentionsSuicide: boolean;
};
export type PlanInitiative = PlanStep & { steps: PlanStep[] };
export type PlanProjection = {
  initiatives: PlanInitiative[];
  /** Items held back by the guards. Counts only; never their text. */
  withheld: { initiatives: number; steps: number };
};

export const MAX_TITLE = 200;
export const TARGET = "plan:onerhythm";

/** Guard rules applied to every title: private data, then the copy rules (crisis wording is handled by the block). */
export const PLAN_RULES = [
  "secrets",
  "private-env-identifiers",
  "long-numeric-id",
  "hashed-phrases",
  "byline",
  "pbc-status",
  "brand-words",
  "brand-names",
  "pbc-mention",
  "clinical-function",
  "funding-ask",
  "initiative-pairing",
] as const;

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Checks specific to the plan (PRD A-6, A-10): no private contact details or
 * links, no naming of the other initiative, no handoff or ownership claim,
 * and never the project's own identifier.
 */
function planChecks(title: string, env: Env): string[] {
  const hits: string[] = [];
  if (/\bMIRmade\b/i.test(title)) hits.push("plan-other-initiative");
  if (/\bhand(?:ed|s|ing)?[- ]?(?:off|over)\b|\bhandoff\b|\bhandover\b/i.test(title)) hits.push("plan-handoff");
  if (/\b(?:belongs?|belonging) to VT Infinite\b|\bowned by VT Infinite\b|\bVT Infinite(?:'s|’s) (?:own|permanently)\b/i.test(title)) hits.push("plan-ownership");
  if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(title)) hits.push("plan-email");
  // A run of nine or more digits (a phone number, an account number); dates have eight.
  if ([...title.matchAll(/\+?\d[\d\s().-]{7,}\d/g)].some((m) => m[0].replace(/\D/g, "").length >= 9)) hits.push("plan-phone-or-number");
  if (/\bhttps?:\/\/|\bwww\.|\basana\.com\b/i.test(title)) hits.push("plan-link");
  const project = env.ASANA_PLAN_PROJECT_ID;
  if (project && title.includes(project)) hits.push("plan-project-id");
  return hits;
}

/** Control, bidi-override and zero-width characters are removed; whitespace collapses. */
export function cleanTitle(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function limit(title: string): string {
  const chars = Array.from(title);
  return chars.length <= MAX_TITLE ? title : `${chars.slice(0, MAX_TITLE - 1).join("").trimEnd()}…`;
}

const MILESTONE_PREFIX = /^milestone\s*:\s*/i;

type Item = { title: string; milestone: boolean } | { withheld: string[] };

function projectTitle(task: RawTask, env: Env): Item {
  const cleaned = cleanTitle(task.name);
  const prefixed = MILESTONE_PREFIX.test(cleaned);
  const title = limit(cleaned.replace(MILESTONE_PREFIX, ""));
  if (!title) return { withheld: ["empty-title"] };
  const rules = [
    ...runRules(cleaned, { target: TARGET, scopes: ["repo", "copy"], env, only: PLAN_RULES }).map((f) => f.rule),
    ...planChecks(cleaned, env),
  ];
  if (rules.length) return { withheld: rules };
  return { title, milestone: prefixed || task.resource_subtype === "milestone" };
}

export type ProjectDeps = {
  /** Public key for a provider ID; generated and remembered server-side. */
  keyFor: (gid: string) => string;
  env?: Env;
  /** Receives rule IDs and counts only, never title text (PRD Q-9). */
  log?: (m: string) => void;
};

/**
 * Build the projection. A withheld step is left out of every count; a
 * withheld initiative takes its steps with it (PRD A-6). Order is the
 * source order; each subtask appears once, under its parent.
 */
export function projectPlan(source: PlanSource, deps: ProjectDeps): PlanProjection {
  const env = deps.env ?? process.env;
  const log = deps.log ?? ((m: string) => console.warn(m));
  const ruleCounts = new Map<string, number>();
  const note = (rules: string[]) => rules.forEach((r) => ruleCounts.set(r, (ruleCounts.get(r) ?? 0) + 1));
  const withheld = { initiatives: 0, steps: 0 };
  const initiatives: PlanInitiative[] = [];

  for (const { task, subtasks } of source) {
    const head = projectTitle(task, env);
    if ("withheld" in head) {
      note(head.withheld);
      withheld.initiatives += 1;
      continue;
    }
    const steps: PlanStep[] = [];
    for (const sub of subtasks) {
      const item = projectTitle(sub, env);
      if ("withheld" in item) {
        note(item.withheld);
        withheld.steps += 1;
        continue;
      }
      steps.push(toStep(sub, item, deps.keyFor));
    }
    initiatives.push({ ...toStep(task, head, deps.keyFor), steps });
  }
  if (ruleCounts.size) {
    log(`plan: withheld ${withheld.initiatives} initiative(s) and ${withheld.steps} step(s) for review; rules ${[...ruleCounts].map(([r, n]) => `${r}=${n}`).join(",")}`);
  }
  return { initiatives, withheld };
}

function toStep(task: RawTask, item: { title: string; milestone: boolean }, keyFor: (gid: string) => string): PlanStep {
  return {
    key: keyFor(task.gid),
    title: item.title,
    milestone: item.milestone,
    completed: task.completed,
    dueOn: task.due_on ?? null,
    mentionsSuicide: mentionsSuicide(item.title),
  };
}

/** Done and open counts of visible steps. Movement, not a weighted percentage (PRD §05). */
export function stepCounts(i: PlanInitiative): { done: number; open: number } {
  const done = i.steps.filter((s) => s.completed).length;
  return { done, open: i.steps.length - done };
}
