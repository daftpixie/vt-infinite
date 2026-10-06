import { PLACEHOLDERS, type PlaceholderId } from "@/lib/placeholders";

/** A visible marker for copy or facts that have not been supplied or approved. */
export function Placeholder({ id, inline = false }: { id: PlaceholderId; inline?: boolean }) {
  const p = PLACEHOLDERS[id];
  const text = `[Placeholder: ${p.what}. Owner: ${p.owner}.]`;
  return inline ? (
    <span className="placeholder-inline" data-placeholder={id}>
      {text}
    </span>
  ) : (
    <p className="placeholder" data-placeholder={id}>
      {text}
    </p>
  );
}
