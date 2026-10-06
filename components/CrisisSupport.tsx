import { CRISIS_SUPPORT_TEXT } from "@/lib/crisis";

/**
 * Crisis-support block (PRD C-4, Q-1). The wording is selectable text and
 * verbatim; the tel: links below it are a convenience only.
 */
export function CrisisSupport() {
  return (
    <aside className="crisis" aria-label="Crisis support" data-crisis-support="">
      <p>{CRISIS_SUPPORT_TEXT}</p>
      <p className="label">
        <a href="tel:988">Call 988</a> · <a href="tel:911">Call 911</a>
      </p>
    </aside>
  );
}
