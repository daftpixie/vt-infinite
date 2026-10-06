/**
 * The controlled status vocabulary for initiatives and repositories
 * (brand reference §05). A label always carries its date and evidence.
 */
export const STATUS_LABELS = ["Concept", "Research design", "In build", "Built, not deployed", "Pilot", "Live", "Paused"] as const;

export type StatusLabel = (typeof STATUS_LABELS)[number] | `Stewarded by ${string}`;

export function isStatusLabel(s: string): s is StatusLabel {
  return (STATUS_LABELS as readonly string[]).includes(s) || /^Stewarded by \S.{0,118}$/.test(s);
}

/** A status older than this prompts review (PRD Q-5). */
export const STATUS_REVIEW_AFTER_DAYS = 90;
