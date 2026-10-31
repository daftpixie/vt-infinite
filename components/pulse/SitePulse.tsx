"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { startPlanPolling } from "@/lib/plan/poller";
import { HISTORY_FRESH_MS, HOUR_MS, PULSE_API, RECENT_FRESH_MS, restalePulse, tracePoints, type PulseResult } from "@/lib/pulse/model";
import { formatDateTime } from "@/lib/content/dates";

function Stamp({ at, timezone }: { at: string; timezone: string }) {
  return <time dateTime={at}>{formatDateTime(at, timezone)}</time>;
}

const hydratedSubscribe = () => () => {};
const motionQuery = "(prefers-reduced-motion: reduce)";
function subscribeMotion(change: () => void) {
  const media = matchMedia(motionQuery);
  media.addEventListener("change", change);
  return () => media.removeEventListener("change", change);
}

/** SSR supplies all text, values, time axes and native details/tables. Animation never changes a count. */
export function SitePulse({ initial, variant }: { initial: PulseResult; variant: "compact" | "expanded" }) {
  const [result, setResult] = useState<PulseResult | null>(initial);
  const [running, setRunning] = useState(false);
  const ready = useSyncExternalStore(hydratedSubscribe, () => true, () => false);
  const reduced = useSyncExternalStore(subscribeMotion, () => matchMedia(motionQuery).matches, () => true);
  const root = useRef<HTMLElement>(null);
  const clock = useRef({ serverAt: Date.parse(initial.servedAt), monotonicAt: 0 });

  useEffect(() => {
    const media = matchMedia(motionQuery);
    const update = () => { if (media.matches) setRunning(false); };
    clock.current.monotonicAt = performance.now();
    media.addEventListener("change", update);
    const hide = () => { if (document.visibilityState !== "visible") setRunning(false); };
    document.addEventListener("visibilitychange", hide);
    const stop = startPlanPolling({
      doc: document, intervalMs: RECENT_FRESH_MS,
      fetchOnce: async () => {
        // Age values even when polling fails. Use elapsed time against the server clock.
        try {
          const response = await fetch(PULSE_API, { cache: "no-store", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
          if (response.status === 404) { stop(); setResult(null); return; }
          if (!response.ok) throw new Error("unavailable");
          const next = await response.json() as PulseResult;
          clock.current = { serverAt: Date.parse(next.servedAt), monotonicAt: performance.now() };
          setResult(next);
        } catch {
          setResult((previous) => previous ? restalePulse(previous, clock.current.serverAt + performance.now() - clock.current.monotonicAt) : null);
        }
      },
    });
    if (root.current) root.current.dataset.polling = "on";
    return () => { stop(); media.removeEventListener("change", update); document.removeEventListener("visibilitychange", hide); };
  }, []);

  if (!result) return null;
  const recent = result.recent.data;
  const history = result.history.data;
  const timezone = result.timezone;
  const expanded = variant === "expanded";
  const number = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(n);
  const ages = { recent: RECENT_FRESH_MS / 1000, history: HISTORY_FRESH_MS / 1000 };

  return (
    <section ref={root} className={`site-pulse site-pulse-${variant}`} aria-labelledby="signal-heading" data-polling="off">
      <div className="pulse-heading">
        <h2 id="signal-heading">The Signal</h2>
        <p className="label">Data status: {result.status}</p>
      </div>
      <p className="pulse-intro">Aggregate pageviews from Plausible.</p>
      <div className="pulse-bpm">
        <p><strong>{recent ? number(recent.bpm) : "Unavailable"}</strong>{recent ? " BPM" : ""}</p>
        <p>{result.definitions.bpm}</p>
        {recent ? <p className="pulse-meta">Reporting window: <Stamp at={recent.start} timezone={timezone} /> to <Stamp at={recent.end} timezone={timezone} />. Recent data: {result.recent.status}. Last successful update: <Stamp at={recent.readAt} timezone={timezone} />.</p> : <p>Recent pageviews unavailable. Last successful update: none available.</p>}
      </div>

      <figure className="pulse-trace">
        <figcaption>{result.definitions.rhythm}</figcaption>
        {history ? (
          <>
            <div className="pulse-trace-frame" data-sweeping={running && !reduced ? "true" : "false"}>
              <svg viewBox="0 0 720 120" role="img" aria-labelledby="pulse-trace-title pulse-trace-description">
                <title id="pulse-trace-title">EKG-inspired traffic trace</title>
                <desc id="pulse-trace-description">{history.total} pageviews across 24 consecutive 1-hour buckets. Highest bucket: {history.peak} pageviews. Original counts are in the table below. The line joins bucket totals and shows no individual event times.</desc>
                <line x1="0" x2="720" y1="108" y2="108" className="pulse-axis-line" />
                <polyline points={tracePoints(history.buckets)} fill="none" stroke="currentColor" strokeWidth="2" />
                {history.buckets.map((b, i) => <circle key={b.start} cx={(i + 0.5) / 24 * 720} cy={108 - b.pageviews / Math.max(1, history.peak) * 96} r="2" fill="currentColor" />)}
                <line className="pulse-sweep" x1="0" x2="0" y1="8" y2="112" stroke="currentColor" strokeWidth="1" aria-hidden="true" />
              </svg>
            </div>
            <div className="pulse-time-axis" aria-label="Trace time axis"><Stamp at={history.start} timezone={timezone} /><span>→</span><Stamp at={history.end} timezone={timezone} /></div>
            <div className="figure-controls" hidden={!ready}>
              <button className="button" type="button" disabled={reduced} aria-pressed={running} onClick={() => setRunning((on) => !on)}>{running ? "Pause sweep" : "Start sweep"}</button>
              <span>{reduced ? "Reduced motion: still trace." : "Sweep highlights the recorded trace; it does not show live events."}</span>
            </div>
            <p className="pulse-meta">Trace data: {result.history.status}. Last successful update: <Stamp at={history.readAt} timezone={timezone} />.</p>
            <details className="pulse-details" open={expanded || undefined}>
              <summary>Read the original hourly counts</summary>
              <p>Each point is one observed bucket total. Points are equally spaced in elapsed time. Height = count ÷ displayed peak × available height, from a zero baseline. Lines connect totals; no event times or medical classifications are inferred.</p>
              <p>Windows include their start and exclude their end. Recent counts refresh about every {ages.recent} seconds; history and sources about every {ages.history / 60} minutes. Last successful timestamps stay unchanged when data is stale.</p>
              <table className="pulse-counts">
                <caption>Rhythm strip counts · {timezone} · 1-hour buckets</caption>
                <thead><tr><th scope="col">Hour beginning</th><th scope="col">Pageviews</th></tr></thead>
                <tbody>{history.buckets.map((b) => <tr key={b.start}><th scope="row"><Stamp at={b.start} timezone={timezone} /></th><td>{number(b.pageviews)}</td></tr>)}</tbody>
              </table>
            </details>
          </>
        ) : <p>Rhythm strip unavailable. No traffic trace or zero count can be inferred. Last successful update: none available.</p>}
      </figure>

      {expanded ? <>
        <div className="pulse-metrics">
          <div><h3>Cardiac output</h3><p className="pulse-value">{history ? number(history.total) : "Unavailable"}</p><p>{result.definitions.output}</p></div>
          <div><h3>Stress test</h3><p className="pulse-value">{history ? number(history.peak) : "Unavailable"}</p><p>{result.definitions.peak}</p><p>Peak among the 24 displayed consecutive 1-hour buckets.</p></div>
        </div>
        <h3>Traffic history</h3>
        <p>The trace and original-count table show the same 24-hour history. Each bucket spans exactly {HOUR_MS / 60_000} elapsed minutes, including clock changes.</p>
        <h3>Circulation</h3>
        <p>{result.definitions.sources}</p>
        {history ? <>
          {history.sources.length ? <ul className="pulse-sources">{history.sources.map((s) => <li key={s.label}><span>{s.label}</span><strong>{number(s.pageviews)} pageviews</strong></li>)}</ul> : <p>No source counts meet the publication threshold.</p>}
          <p>Sources below 5 pageviews and unrecognized sources are grouped as “Other sources”. A grouped total below 5 is withheld. Individual referral URLs and campaign values are never published.{history.sourcesSuppressed ? " A small grouped total is withheld in this snapshot." : ""}</p>
        </> : <p>Referral-source counts unavailable.</p>}
      </> : null}
      <p className="pulse-meta">Reporting timezone: {timezone}. Pageviews count page loads, not distinct people.</p>
      <noscript><p>This is a still snapshot. The counts and details work without JavaScript; reload the page for a newer read.</p></noscript>
    </section>
  );
}
