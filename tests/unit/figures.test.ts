import { describe, expect, it } from "vitest";
import { divergence, integrate, LORENZ, readoutState } from "@/lib/figures/lorenz";
import { inMainCardioidOrBulb, MANDELBROT, renderFrame, sample, zoomView } from "@/lib/figures/mandelbrot";
import { maskToPng } from "@/lib/figures/png";

describe("Lorenz (PRD §08, §02)", () => {
  const run = integrate();

  it("uses the specified system", () => {
    expect(LORENZ).toMatchObject({ sigma: 10, rho: 28, dt: 0.005, steps: 8000, startA: [0.506127, 1, 1], startB: [0.506, 1, 1] });
    expect(LORENZ.beta).toBeCloseTo(8 / 3, 15);
    expect(run.distance.length).toBe(8001);
    expect(run.distance[0]).toBeCloseTo(0.000127, 12);
  });

  it("reproduces the stated divergence: first exceeds 1 at t = 17.870, above 1 from t = 21.835 to 40", () => {
    const d = divergence(run);
    // Within one step of the specified step size.
    expect(Math.abs((d.firstExceeds as number) - 17.87)).toBeLessThanOrEqual(LORENZ.dt);
    expect(Math.abs((d.staysAboveFrom as number) - 21.835)).toBeLessThanOrEqual(LORENZ.dt);
    expect((d.firstExceeds as number).toFixed(2)).toBe("17.87");
    expect((d.staysAboveFrom as number).toFixed(2)).toBe("21.84");
  });

  it("reads Together, then Apart, then Close again", () => {
    expect(readoutState(run, 0)).toBe("Together");
    expect(readoutState(run, Math.round(17.87 / LORENZ.dt))).toBe("Apart");
    const between = Array.from({ length: Math.round(21.835 / LORENZ.dt) }, (_, i) => i).find(
      (i) => i > 17.87 / LORENZ.dt && (run.distance[i] as number) <= 1,
    );
    expect(between).toBeDefined();
    expect(readoutState(run, between as number)).toBe("Close again");
  });
});

describe("Mandelbrot (PRD §08)", () => {
  it("skips the main cardioid and the period-two bulb", () => {
    expect(inMainCardioidOrBulb(0, 0)).toBe(true);
    expect(inMainCardioidOrBulb(-1, 0)).toBe(true);
    expect(inMainCardioidOrBulb(0.5, 0.5)).toBe(false);
    expect(sample(0, 0)).toEqual({ inside: true });
  });

  it("escapes outside points with a smooth count and a positive distance estimate", () => {
    const s = sample(1, 1);
    expect(s.inside).toBe(false);
    if (!s.inside) {
      expect(s.smooth).toBeGreaterThan(0);
      expect(s.distance).toBeGreaterThan(0);
    }
    expect(MANDELBROT.bailout).toBe(1e6);
  });

  it("zooms from the start view to the specified end view", () => {
    expect(zoomView(0)).toEqual(MANDELBROT.start);
    const end = zoomView(1);
    expect(end.cx).toBeCloseTo(-0.7432, 12);
    expect(end.cy).toBeCloseTo(0.13146, 12);
    expect(end.width).toBeCloseTo(0.0022, 12);
  });

  it("renders monochrome line art with ink on the boundary", () => {
    const mask = renderFrame(60, 40, MANDELBROT.start, { maxIterations: 200 });
    const ink = mask.reduce((a, b) => a + b, 0);
    expect(ink).toBeGreaterThan(0);
    expect(ink).toBeLessThan(mask.length);
    expect(new Set(mask)).toEqual(new Set([0, 1]));
  });

  it("encodes a PNG", () => {
    const png = maskToPng(new Uint8Array([1, 0, 0, 1]), 2, 2);
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(png.readUInt32BE(16)).toBe(2);
  });
});
