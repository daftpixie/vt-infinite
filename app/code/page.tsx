import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ExternalLink } from "@/components/ExternalLink";
import { PageShell } from "@/components/PageShell";
import { Placeholder } from "@/components/Placeholder";
import { readRepos } from "@/lib/code/repos";
import { formatDate } from "@/lib/content/dates";

export const metadata: Metadata = { title: "Code" };

/**
 * Approved public repositories only, each confirmed public at read time
 * (PRD G-1 to G-4). Stars, forks and followers are never shown.
 */
export default async function CodePage() {
  await connection();
  const repos = await readRepos();
  return (
    <PageShell title="Code">
      <h2>Repositories</h2>
      {repos.length === 0 ? (
        <>
          <p>No repositories are listed yet.</p>
          <Placeholder id="codeRepos" />
        </>
      ) : (
        <ol className="words-list">
          {repos.map((r) => (
            <li key={`${r.owner}/${r.repo}`} className="words-item">
              <h3 className="words-title">
                <ExternalLink href={`https://github.com/${r.owner}/${r.repo}`}>
                  {r.owner}/{r.repo}
                </ExternalLink>
              </h3>
              <p>{r.description}</p>
              <p className="label">
                {r.initiative} · {r.status}
                {r.statusNote ? ` (${r.statusNote})` : ""}, as of <time dateTime={r.statusDate}>{formatDate(`${r.statusDate}T12:00:00Z`)}</time> ·{" "}
                <ExternalLink href={r.evidenceUrl}>evidence</ExternalLink>
              </p>
              <p className="label">
                {[r.meta.license ?? "No license detected", r.meta.language, r.meta.pushedAt ? `last push ${formatDate(r.meta.pushedAt)}` : null]
                  .filter(Boolean)
                  .join(" · ")}
                {r.stale ? ` · details as of ${formatDate(r.meta.confirmedPublicAt)}` : ""}
              </p>
            </li>
          ))}
        </ol>
      )}
      <h2>The Record</h2>
      <p>
        <Link href="/the-record">Read the Record</Link>
      </p>
    </PageShell>
  );
}
