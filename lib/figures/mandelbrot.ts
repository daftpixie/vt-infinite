/**
 * Mandelbrot escape-time with a smooth count and a distance estimate
 * (PRD §08): bailout radius 10^6, main-cardioid and period-two-bulb skips.
 * A new implementation, not a port of the essay plate's kernel; it ships
 * disabled until Matthew accepts it or supplies that kernel (P7).
 */
export const MANDELBROT = {
  start: { cx: -0.75, cy: 0, width: 3.0 },
  end: { cx: -0.7432, cy: 0.13146, width: 0.0022 },
  bailout: 1e6,
  maxIterations: 1000,
} as const;

export type Sample = { inside: true } | { inside: false; smooth: number; distance: number };

/** Points known to be inside the main cardioid or the period-2 bulb. */
export function inMainCardioidOrBulb(x: number, y: number): boolean {
  const q = (x - 0.25) ** 2 + y * y;
  if (q * (q + (x - 0.25)) <= 0.25 * y * y) return true;
  return (x + 1) ** 2 + y * y <= 1 / 16;
}

export function sample(cx: number, cy: number, maxIterations: number = MANDELBROT.maxIterations, bailout: number = MANDELBROT.bailout): Sample {
  if (inMainCardioidOrBulb(cx, cy)) return { inside: true };
  let x = 0;
  let y = 0;
  // Derivative dz/dc for the distance estimate.
  let dx = 0;
  let dy = 0;
  const b2 = bailout * bailout;
  for (let n = 0; n < maxIterations; n++) {
    const ndx = 2 * (x * dx - y * dy) + 1;
    const ndy = 2 * (x * dy + y * dx);
    const nx = x * x - y * y + cx;
    const ny = 2 * x * y + cy;
    x = nx;
    y = ny;
    dx = ndx;
    dy = ndy;
    const r2 = x * x + y * y;
    if (r2 > b2) {
      const r = Math.sqrt(r2);
      const smooth = n + 1 - Math.log2(Math.log(r));
      const dr = Math.hypot(dx, dy);
      const distance = dr === 0 ? 0 : (r * Math.log(r)) / dr;
      return { inside: false, smooth, distance };
    }
  }
  return { inside: true };
}

/**
 * Monochrome line art for one frame: a pixel is ink when it lies within
 * `boundaryPx` pixels of the set boundary (by distance estimate) or on a
 * contour of the smooth count. Returns 1 for ink, 0 for ground.
 */
export function renderFrame(
  width: number,
  height: number,
  view: { cx: number; cy: number; width: number },
  opts: { maxIterations?: number; boundaryPx?: number; contourEvery?: number } = {},
): Uint8Array {
  const { maxIterations = MANDELBROT.maxIterations, boundaryPx = 0.75, contourEvery = 4 } = opts;
  const out = new Uint8Array(width * height);
  const px = view.width / width;
  const top = view.cy + (px * height) / 2;
  const left = view.cx - view.width / 2;
  const level = new Float64Array(width * height);
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const s = sample(left + (i + 0.5) * px, top - (j + 0.5) * px, maxIterations);
      const k = j * width + i;
      if (s.inside) {
        level[k] = -1;
        continue;
      }
      level[k] = Math.floor(s.smooth / contourEvery);
      if (s.distance < boundaryPx * px) out[k] = 1;
    }
  }
  // Contour lines where the banded level changes between neighbours.
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const k = j * width + i;
      const l = level[k] as number;
      if (l < 0) continue;
      const right = i + 1 < width ? (level[k + 1] as number) : l;
      const down = j + 1 < height ? (level[k + width] as number) : l;
      if ((right >= 0 && right !== l) || (down >= 0 && down !== l)) out[k] = 1;
    }
  }
  return out;
}

/** Geometric zoom from the start view to the end view, t in [0, 1]. */
export function zoomView(t: number): { cx: number; cy: number; width: number } {
  const { start, end } = MANDELBROT;
  const w = start.width * (end.width / start.width) ** t;
  const f = (start.width - w) / (start.width - end.width);
  return { cx: start.cx + (end.cx - start.cx) * f, cy: start.cy + (end.cy - start.cy) * f, width: w };
}
