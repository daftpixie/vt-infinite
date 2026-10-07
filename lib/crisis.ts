/**
 * House crisis-support wording (PRD C-4 and Q-1; brand copy rule 15).
 * Verbatim. Do not edit without Matthew's written approval.
 */
export const CRISIS_SUPPORT_TEXT =
  "If you are thinking about suicide, call or text 988 in the US, or your local crisis line. If your heart is in trouble right now, call 911 or your local emergency number, or follow the plan your care team gave you.";

/**
 * True when any of the given texts mentions suicide. Every surface that
 * shows such a text also shows CRISIS_SUPPORT_TEXT (PRD Q-1).
 */
export function mentionsSuicide(...texts: Array<string | null | undefined>): boolean {
  return texts.some((t) => typeof t === "string" && /suicid/i.test(t));
}

/**
 * Text for a surface that cannot carry the crisis block (meta descriptions,
 * feed descriptions): omitted when it mentions suicide. The page keeps it,
 * with the block.
 */
export function withoutCrisisBlock(text: string | null | undefined): string | undefined {
  return text && !mentionsSuicide(text) ? text : undefined;
}

/** Neutral document titles (PRD Q-1): a browser tab, history entry or bookmark cannot carry the crisis block. */
export const NEUTRAL_TITLES = {
  essay: "Essay · Matthew J Adams",
  record: "Record entry · VT ∞",
} as const;

/**
 * The <title> for a page whose heading may mention suicide. Such a title
 * stays on the page, beside the crisis block; the document title uses the
 * neutral form instead, set absolute so the site template is not appended.
 */
export function documentTitle(title: string, kind: keyof typeof NEUTRAL_TITLES): string | { absolute: string } {
  return mentionsSuicide(title) ? { absolute: NEUTRAL_TITLES[kind] } : title;
}
