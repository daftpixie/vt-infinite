import type { ReactNode } from "react";

/**
 * Approved prose components for authored content (brand §10: source note,
 * method note; margin notes per the long-form layout). Their wording comes
 * from the author; these only set structure.
 */
export function MarginNote({ children }: { children?: ReactNode }) {
  return (
    <aside className="margin-note" aria-label="Note">
      {children}
    </aside>
  );
}

export function SourceNote({ children }: { children?: ReactNode }) {
  return (
    <aside className="source-note" aria-label="Source">
      {children}
    </aside>
  );
}

export function MethodNote({ children }: { children?: ReactNode }) {
  return (
    <section className="method-note" aria-label="Method note">
      {children}
    </section>
  );
}
