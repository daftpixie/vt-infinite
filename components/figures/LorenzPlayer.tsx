"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { integrate, LORENZ, readoutState, type LorenzRun } from "@/lib/figures/lorenz";

const STEPS_PER_SECOND = 400;

let cachedRun: LorenzRun | null = null;
/** Computed once per page, on first use. */
function getRun(): LorenzRun {
  cachedRun ??= integrate();
  return cachedRun;
}

function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function draw(canvas: HTMLCanvasElement, run: LorenzRun, upTo: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  const scale = Math.min(canvas.width / 50, canvas.height / 54);
  const ox = (canvas.width - 50 * scale) / 2;
  const oy = (canvas.height - 54 * scale) / 2;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = getComputedStyle(canvas).color;
  ctx.lineWidth = dpr;
  for (const [pts, dashed] of [
    [run.a, false],
    [run.b, true],
  ] as const) {
    ctx.setLineDash(dashed ? [3 * dpr, 3 * dpr] : []);
    ctx.beginPath();
    for (let i = 0; i <= upTo; i++) {
      const x = ox + ((pts[i * 3] as number) + 25) * scale;
      const y = oy + (52 - (pts[i * 3 + 2] as number)) * scale;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

type Phase = "idle" | "playing" | "paused" | "done";

/**
 * Reader-started animation (PRD §08; brand §11 motion). Nothing moves until
 * the reader starts it; it pauses on request and when the tab is hidden;
 * under reduced motion it shows the final frame without animating.
 */
export function LorenzPlayer({ children }: { children: ReactNode }) {
  const mounted = useSyncExternalStore(subscribeReducedMotion, () => true, () => false);
  const reduce = useSyncExternalStore(subscribeReducedMotion, reducedMotion, () => false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [step, setStep] = useState(0);

  // The animation loop runs only while playing.
  useEffect(() => {
    if (phase !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const run = getRun();
    let current = step;
    let last: number | null = null;
    let frame = requestAnimationFrame(function tick(now) {
      const advance = last === null ? 1 : Math.max(1, Math.round(((now - last) / 1000) * STEPS_PER_SECOND));
      last = now;
      current = Math.min(LORENZ.steps, current + advance);
      draw(canvas, run, current);
      setStep(current);
      if (current >= LORENZ.steps) setPhase("done");
      else frame = requestAnimationFrame(tick);
    });
    const onHidden = () => {
      if (document.hidden) setPhase("paused");
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onHidden);
    };
    // `step` is read once when play starts; the loop owns it afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const start = () => {
    if (reduce) {
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.hidden = false;
        draw(canvas, getRun(), LORENZ.steps);
      }
      setStep(LORENZ.steps);
      setPhase("done");
      return;
    }
    if (phase === "idle" || phase === "done") setStep(0);
    setPhase("playing");
  };

  const active = phase !== "idle";
  const run = active ? getRun() : null;
  const d = run ? (run.distance[step] as number) : 0.000127;
  const state = run ? readoutState(run, step) : "Together";

  return (
    <>
      <div className="figure-frame">
        {children}
        <canvas ref={canvasRef} className="figure-canvas" hidden={!active} aria-hidden="true" />
      </div>
      <div className="figure-controls" hidden={!mounted}>
        {phase === "playing" ? (
          <button type="button" className="button" onClick={() => setPhase("paused")}>
            Pause
          </button>
        ) : (
          <button type="button" className="button" onClick={start}>
            {phase === "paused" ? "Resume" : phase === "done" ? "Play again" : reduce ? "Show the result" : "Start the demonstration"}
          </button>
        )}
        <p className="figure-readout label" aria-live={phase === "playing" ? "off" : "polite"}>
          t = {(step * LORENZ.dt).toFixed(3)} · distance {d < 0.001 ? d.toFixed(6) : d.toFixed(3)} · {state}
        </p>
      </div>
    </>
  );
}
