/** Shown on every route shell until its content is approved for release. */
export function Unreleased() {
  return (
    <div className="notice" role="note" aria-label="Release status">
      <p className="label">Not yet released</p>
      <p>
        This page is a shell in the rebuild of vt-infinite.com. Its content has not been approved for
        publication, so the gaps below are marked rather than filled.
      </p>
    </div>
  );
}
