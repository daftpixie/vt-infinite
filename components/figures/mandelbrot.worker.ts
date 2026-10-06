/// <reference lib="webworker" />
import { renderFrame, zoomView } from "@/lib/figures/mandelbrot";

/** Renders frames off the main thread (PRD §08). */
self.onmessage = (e: MessageEvent<{ id: number; t: number; width: number; height: number }>) => {
  const { id, t, width, height } = e.data;
  const mask = renderFrame(width, height, zoomView(t));
  (self as unknown as Worker).postMessage({ id, mask, width, height }, [mask.buffer]);
};
