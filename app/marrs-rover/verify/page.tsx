import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { filePath, Hash, periodPath, RoverShell, roverMetadata, Withheld } from "@/components/rover";
import { defaultSelection, periodBundles, publications } from "@/lib/marrs-rover/explorer";
import { VERIFIER_ARCHIVE_NAME, VERIFIER_ARCHIVE_PATH, verifierArchive } from "@/lib/marrs-rover/verifier-archive";
import { EXPECTED_VERIFIER_RUN } from "@/lib/marrs-rover/verifier-output";
import { siteUrl } from "@/lib/site";
import { fullSiteOnly } from "@/lib/mode-gate";

export function generateMetadata(): Metadata {
  fullSiteOnly();
  return roverMetadata("Verify a Marrs Rover publication", "How to check a synthetic demo publication yourself with the standalone verifier.");
}

/**
 * Verify (PRD MR-14, MR-34): how to download a bundle and check it with the
 * standalone CLI verifier, without trusting this site. The browser verifier
 * comes in a later stage.
 */
export default async function VerifyPage() {
  await connection();
  fullSiteOnly();
  const pubs = publications();
  const sel = defaultSelection(pubs);
  const b = sel ? periodBundles(pubs, sel.entityId, sel.periodId)[0] : undefined;
  const base = siteUrl();
  const download = b ? [`mkdir ${b.digest}`, `cd ${b.digest}`, ...b.files.map((f) => `curl -fsSO ${base}${filePath(b, f.path)}`), "cd .."].join("\n") : "";
  const run = b ? `node ledger-verifier/verify.mjs ${b.digest} --expect ${b.digest}` : "";
  const archive = verifierArchive();
  const getVerifier = [`curl -fsSO ${base}${VERIFIER_ARCHIVE_PATH}`, `sha256sum ${VERIFIER_ARCHIVE_NAME}`, `tar -xf ${VERIFIER_ARCHIVE_NAME}`].join("\n");
  const expected = b && b.digest === EXPECTED_VERIFIER_RUN.digest ? EXPECTED_VERIFIER_RUN.output : null;

  return (
    <RoverShell title="Verify a Marrs Rover publication" current="/marrs-rover/verify">
      <p>
        You can check a Marrs Rover publication without trusting this website. You download its files, then run a small, separate program on your own computer that
        recomputes every digest, proof and total from those files alone. It makes no network request.
      </p>
      <Withheld failures={pubs.failed} />
      {!b ? (
        <p>No demo publication can be shown at the moment, so there is nothing to download.</p>
      ) : (
        <>
          <h2>01 / 06 What you need</h2>
          <ul>
            <li>Node.js 22 or later.</li>
            <li>A terminal, with curl and tar (both included with macOS, Windows 10 and later, and most Linux systems).</li>
            <li>An empty folder to work in. Run every command below from it.</li>
          </ul>

          <h2>02 / 06 Download the verifier and check it</h2>
          <p>
            The verifier is a small program in plain JavaScript with no dependencies, licensed under Apache-2.0 (the license is in the download). It comes as one
            archive, <a href={VERIFIER_ARCHIVE_PATH}>{VERIFIER_ARCHIVE_NAME}</a> ({archive.size.toLocaleString("en-US")} bytes), whose SHA-256 is{" "}
            <Hash value={archive.sha256} />. The archive is rebuilt from the same source the same way every time, so this value changes only when the verifier
            changes.
          </p>
          <pre className="code-block" tabIndex={0} aria-label="Verifier download commands">
            <code>{getVerifier}</code>
          </pre>
          <p>
            Before you extract it, the SHA-256 the second command prints must equal the value above. On macOS use <code>shasum -a 256</code>; in PowerShell,{" "}
            <code>Get-FileHash -Algorithm SHA256</code>. A match shows the file is the one this site serves, undamaged. It does not show that the program is
            trustworthy: for that, read its source, which is short and in the <code>ledger-verifier</code> folder the third command creates.
          </p>

          <h2>03 / 06 Download the publication</h2>
          <p>
            The demo publication for {b.manifest.periodId} lives at an address named for its manifest&rsquo;s SHA-256, <Hash value={b.digest} />. These commands make
            a folder with that name and download every file into it, unchanged. The files are also listed, with their digests, on the{" "}
            <Link href={`${periodPath(b)}#files`}>period page</Link>.
          </p>
          <pre className="code-block" tabIndex={0} aria-label="Download commands">
            <code>{download}</code>
          </pre>
          <p>
            On Windows, run the same commands in PowerShell with <code>curl.exe</code> in place of <code>curl</code>.
          </p>

          <h2>04 / 06 Check which publication you have</h2>
          <p>The folder&rsquo;s name is a claim. Check it: the SHA-256 of the manifest must equal it.</p>
          <pre className="code-block" tabIndex={0} aria-label="Digest command">
            <code>{`sha256sum ${b.digest}/manifest.json`}</code>
          </pre>
          <p>
            On macOS use <code>shasum -a 256</code>; in PowerShell, <code>Get-FileHash -Algorithm SHA256</code>. The result must be <Hash value={b.digest} />. If you got
            that value from somewhere other than this site, such as a publication receipt, compare against that instead.
          </p>

          <h2>05 / 06 Run the verifier</h2>
          <p>From the same folder, which now holds both the <code>ledger-verifier</code> folder and the publication&rsquo;s folder:</p>
          <pre className="code-block" tabIndex={0} aria-label="Verifier command">
            <code>{run}</code>
          </pre>
          <p>
            <code>--expect</code> makes the verifier also require that the manifest is the one you meant to check. Without it, a passing result shows only that the
            files agree with each other.
          </p>

          <h2>06 / 06 Read the result</h2>
          {expected ? (
            <>
              <p>For this demo publication, the verifier prints exactly this and exits with status 0:</p>
              <pre className="code-block" tabIndex={0} aria-label="Expected verifier output">
                <code>{expected}</code>
              </pre>
            </>
          ) : (
            <p>Run it and read each line with the meanings below.</p>
          )}
          <dl className="facts">
            <dt>Bundle</dt>
            <dd>VALID means every file matches the manifest, and the events give the published root. INVALID names the file or rule that failed.</dd>
            <dt>Inclusion proofs</dt>
            <dd>VALID means each event&rsquo;s own bytes lead to the published root along its stated path.</dd>
            <dt>Chain commitment</dt>
            <dd>NOT ATTEMPTED, always, for now: no chain is involved in this demo.</dd>
            <dt>Balance checks</dt>
            <dd>PASSED means every total, bucket and restricted fund recomputes exactly from the full register. Arithmetic failures are reported apart from digest failures.</dd>
            <dt>Reconciliation evidence</dt>
            <dd>What the publication states about matching its records to bank statements, and the open exceptions. It is reported, not judged.</dd>
            <dt>Independent report</dt>
            <dd>ABSENT here: no outside reviewer has examined this publication.</dd>
            <dt>Which publication</dt>
            <dd>MATCHED when the manifest&rsquo;s SHA-256 equals the value you gave with --expect.</dd>
          </dl>
          <p>
            The exit status is 0 when the bundle, its proofs and its arithmetic all pass, 1 when any of them fails, 2 for a mistake in the command, and 3 when the
            verifier could not finish (nothing was checked).
          </p>

          <h2>What a failure looks like</h2>
          <p>
            Change one amount in <code>register.jsonl</code> and run the verifier again. It reports the bundle as INVALID (the file no longer matches its SHA-256), the
            proof for that event as INVALID, and the balance checks as FAILED, and exits with status 1. A changed amount, a deleted or duplicated row, a reordered
            sequence, an altered proof path and a substituted manifest are each caught.
          </p>

          <h2>What a passing result does not show</h2>
          <p>
            A passing result shows that these files match this manifest and its root, and that the totals add up. It does not show that the source records are genuine,
            that every account is included, that amounts are classified correctly, or that anyone has audited the books. The{" "}
            <Link href="/marrs-rover/method">Method page</Link> explains these limits.
          </p>
          <p>A browser-based verifier will follow in a later stage. Until then, the command-line verifier is the way to check a publication independently.</p>
        </>
      )}
    </RoverShell>
  );
}
