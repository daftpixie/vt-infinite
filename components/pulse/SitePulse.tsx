"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { startPlanPolling } from "@/lib/plan/poller";
import { HISTORY_FRESH_MS, HOUR_MS, PULSE_API, RECENT_FRESH_MS, restalePulse, trafficWavePath, type PulseResult } from "@/lib/pulse/model";
import { formatDate } from "@/lib/content/dates";

function Stamp({ at, timezone, compact = false }: { at: string; timezone: string; compact?: boolean }) {
  const clock = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "short" }).format(new Date(at));
  return <time dateTime={at}>{compact ? "" : `${formatDate(at, timezone)}, `}{clock}</time>;
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
      <div className="pulse-bpm">
        <p className="pulse-rate"><strong>{recent ? number(recent.bpm) : "Unavailable"}</strong>{recent ? " BPM" : ""}</p>
        <p>BPM — Beats per minute. A five-minute average: pageviews in the preceding 5 minutes ÷ 5.</p>
      </div>
      <figure className="pulse-trace">
        <figcaption>Stylized EKG-inspired traffic trace · 1 motif per 1-hour bucket</figcaption>
        {history ? <>
          <div className="pulse-trace-frame" data-sweeping={running && !reduced ? "true" : "false"}>
            <svg viewBox="0 0 720 144" role="img" aria-labelledby="pulse-trace-title pulse-trace-description">
              <title id="pulse-trace-title">EKG-inspired traffic trace</title>
              <desc id="pulse-trace-description">{history.total} pageviews in 24 consecutive 1-hour buckets. One stylized motif per bucket; amplitude follows its count. Zero traffic stays flat. Glyph shapes and positions are schematic, with no individual arrival times or physiological meaning. Original counts are in the disclosure below.</desc>
              <line x1="0" x2="720" y1="93.6" y2="93.6" className="pulse-axis-line" />
              <path d={trafficWavePath(history.buckets)} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
              <line className="pulse-sweep" x1="0" x2="0" y1="8" y2="136" stroke="currentColor" strokeWidth="1" aria-hidden="true" />
            </svg>
          </div>
          <div className="pulse-time-axis" aria-label="Trace time axis"><Stamp at={history.start} timezone={timezone} /><span aria-hidden="true">→</span><Stamp at={history.end} timezone={timezone} /></div>
          <div className="figure-controls" hidden={!ready}>
            <button className="button" type="button" disabled={reduced} aria-pressed={running} onClick={() => setRunning((on) => !on)}>{running ? "Pause sweep" : "Start sweep"}</button>
            {reduced ? <span className="pulse-control-note">Reduced motion: still trace.</span> : null}
          </div>
        </> : <p>Rhythm strip unavailable. Last successful update: none available.</p>}
      </figure>
      <div className="pulse-windows pulse-meta">
        <p>{recent ? <>5-minute window: <Stamp at={recent.start} timezone={timezone} compact={formatDate(recent.start, timezone) === formatDate(recent.end, timezone)} /> – <Stamp at={recent.end} timezone={timezone} />. Updated <Stamp at={recent.readAt} timezone={timezone} compact={formatDate(recent.readAt, timezone) === formatDate(recent.end, timezone)} /> · {result.recent.status}.</> : "Recent pageviews unavailable. Last successful update: none available."}</p>
        {history ? <p>Trace updated <Stamp at={history.readAt} timezone={timezone} /> · {result.history.status}.</p> : null}
      </div>
      {expanded ? <>
        <div className="pulse-metrics">
          <div><h3>Cardiac output</h3><p className="pulse-value">{history ? `${number(history.total)} pageviews` : "Unavailable"}</p><p>Total pageviews in the displayed 24-hour window.</p></div>
          <div><h3>Stress test</h3><p className="pulse-value">{history ? `${number(history.peak)} pageviews/hour` : "Unavailable"}</p><p>Peak among the 24 displayed hourly buckets. Traffic volume only.</p></div>
        </div>
        <div className="pulse-circulation">
          <h3>Circulation</h3>
          <p>Aggregate referral-source pageviews in the same 24-hour window.</p>
          {history ? <>
            {history.sources.length ? <ul className="pulse-sources">{history.sources.map((source) => <li key={source.label}><span>{source.label}</span><strong>{number(source.pageviews)} pageviews</strong></li>)}</ul> : <p>No source counts meet the publication threshold.</p>}
            {history.sourcesSuppressed ? <p className="pulse-meta">Small source counts are withheld.</p> : null}
          </> : <p>Referral-source counts unavailable.</p>}
        </div>
      </> : null}
      <details className="pulse-details">
        <summary>Read the counts and method</summary>
        <p>Source: Plausible. Reporting timezone: {timezone}. Pageviews count page loads, not distinct people.</p>
        <p>{result.definitions.bpm}</p>
        <p>{result.definitions.rhythm} Each glyph represents one full bucket, regardless of its count. Its horizontal coordinates are a fixed schematic design, not event times. Its amplitude is count ÷ displayed peak × the drawing height scale. The stylized P/QRS/T-like shape has no physiological or diagnostic meaning. Zero counts draw only a flat line.</p>
        <p>Windows include their start and exclude their end. Every bucket is exactly {HOUR_MS / 60_000} elapsed minutes, including clock changes. The sweep highlights recorded data without changing values. Recent counts refresh about every {ages.recent} seconds; history and sources about every {ages.history / 60} minutes. Stale timestamps remain the original successful read times.</p>
        {expanded ? <>
          <p>{result.definitions.output}</p><p>{result.definitions.peak}</p><p>{result.definitions.sources}</p>
          <p>Sources below 5 pageviews and unrecognized values are grouped as “Other sources”. A grouped total below 5 is withheld. Individual referral URLs and campaign values are never published.</p>
        </> : null}
        {history ? <table className="pulse-counts">
          <caption>Original pageviews · {timezone} · 1-hour buckets</caption>
          <thead><tr><th scope="col">Hour beginning</th><th scope="col">Pageviews</th></tr></thead>
          <tbody>{history.buckets.map((bucket) => <tr key={bucket.start}><th scope="row"><Stamp at={bucket.start} timezone={timezone} /></th><td>{number(bucket.pageviews)}</td></tr>)}</tbody>
        </table> : <p>Original counts unavailable; no zero counts can be inferred.</p>}
      </details>
      <noscript><p>This is a still snapshot. The disclosure works without JavaScript; reload for a newer read.</p></noscript>
    </section>
  );
}
