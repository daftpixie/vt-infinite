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
