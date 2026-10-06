"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

const FRAMES = 90;
const noop = () => () => {};

/**
 * Reader-started zoom rendered in a worker (PRD §08). Under reduced motion
 * the still frame stays and no zoom is offered. Hidden tabs pause.
 */
export function MandelbrotPlayer({ children }: { children: ReactNode }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const reduce = useSyncExternalStore(noop, () => window.matchMedia("(prefers-reduced-motion: reduce)").matches, () => false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const frameRef = useRef(0);
  const [phase, setPhase] = useState<"idle" | "playing" | "paused" | "done">("idle");
  const playingRef = useRef(false);

  useEffect(() => {
    const onHidden = () => {
      if (document.hidden && playingRef.current) {
        playingRef.current = false;
        setPhase("paused");
      }
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      workerRef.current?.terminate();
    };
  }, []);

  const requestFrame = () => {
    const canvas = canvasRef.current;
    const worker = workerRef.current;
    if (!canvas || !worker || !playingRef.current) return;
    // Measure the visible frame: the canvas itself is hidden until the first frame lands.
    const frameWidth = canvas.parentElement?.getBoundingClientRect().width ?? 0;
    const width = Math.max(60, Math.min(480, Math.round(frameWidth)));
    const height = Math.round((width * 2) / 3);
    worker.postMessage({ id: frameRef.current, t: frameRef.current / (FRAMES - 1), width, height });
  };

  const start = () => {
    if (!workerRef.current) {
      const worker = new Worker(new URL("./mandelbrot.worker.ts", import.meta.url));
      worker.onmessage = (e: MessageEvent<{ mask: Uint8Array; width: number; height: number }>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const { mask, width, height } = e.data;
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const img = ctx.createImageData(width, height);
        // Opaque white ink on black ground; the light theme inverts it in CSS.
        for (let i = 0; i < mask.length; i++) {
          const v = mask[i] ? 255 : 0;
          img.data.set([v, v, v, 255], i * 4);
        }
        ctx.putImageData(img, 0, 0);
        frameRef.current += 1;
        if (frameRef.current >= FRAMES) {
          playingRef.current = false;
          setPhase("done");
          return;
        }
        requestFrame();
      };
      workerRef.current = worker;
    }
    if (phase === "done" || phase === "idle") frameRef.current = 0;
    playingRef.current = true;
    setPhase("playing");
    requestFrame();
  };

  const pause = () => {
    playingRef.current = false;
    setPhase("paused");
  };

  return (
    <>
      <div className="figure-frame figure-frame-wide">
        {children}
        <canvas ref={canvasRef} className="figure-canvas figure-raster" hidden={phase === "idle"} aria-hidden="true" />
      </div>
      <div className="figure-controls" hidden={!mounted || reduce}>
        {phase === "playing" ? (
          <button type="button" className="button" onClick={pause}>
            Pause
          </button>
        ) : (
          <button type="button" className="button" onClick={start}>
            {phase === "paused" ? "Resume the zoom" : phase === "done" ? "Zoom again" : "Start the zoom"}
          </button>
        )}
      </div>
    </>
  );
}
