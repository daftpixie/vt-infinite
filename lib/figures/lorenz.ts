/**
 * The Lorenz system, computed from its equations (PRD §08; brand §11):
 * sigma 10, rho 28, beta 8/3, fourth-order Runge-Kutta, dt 0.005, 8,000
 * steps from t = 0 to 40, two starts 0.000127 apart in x.
 */
export const LORENZ = {
  sigma: 10,
  rho: 28,
  beta: 8 / 3,
  dt: 0.005,
  steps: 8000,
  startA: [0.506127, 1, 1] as const,
  startB: [0.506, 1, 1] as const,
} as const;

type Vec = readonly [number, number, number];

function deriv([x, y, z]: Vec): Vec {
  return [LORENZ.sigma * (y - x), x * (LORENZ.rho - z) - y, x * y - LORENZ.beta * z];
}

function rk4(p: Vec, dt: number): Vec {
  const k1 = deriv(p);
  const k2 = deriv([p[0] + (dt / 2) * k1[0], p[1] + (dt / 2) * k1[1], p[2] + (dt / 2) * k1[2]]);
  const k3 = deriv([p[0] + (dt / 2) * k2[0], p[1] + (dt / 2) * k2[1], p[2] + (dt / 2) * k2[2]]);
  const k4 = deriv([p[0] + dt * k3[0], p[1] + dt * k3[1], p[2] + dt * k3[2]]);
  return [
    p[0] + (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
    p[1] + (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
    p[2] + (dt / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]),
  ];
}

export type LorenzRun = {
  /** Step index i is time i * dt; arrays hold steps + 1 points. */
  a: Float64Array; // x, y, z interleaved
  b: Float64Array;
  distance: Float64Array;
};

export function integrate(steps: number = LORENZ.steps, dt: number = LORENZ.dt): LorenzRun {
  const a = new Float64Array((steps + 1) * 3);
  const b = new Float64Array((steps + 1) * 3);
  const distance = new Float64Array(steps + 1);
  let pa: Vec = LORENZ.startA;
  let pb: Vec = LORENZ.startB;
  for (let i = 0; i <= steps; i++) {
    a.set(pa, i * 3);
    b.set(pb, i * 3);
    distance[i] = Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]);
    pa = rk4(pa, dt);
    pb = rk4(pb, dt);
  }
  return { a, b, distance };
}

export type Divergence = {
  /** First time the 3D distance exceeds `threshold`. */
  firstExceeds: number | null;
  /** Start of the final run above `threshold` that lasts to the end. */
  staysAboveFrom: number | null;
};

export function divergence(run: LorenzRun, threshold = 1, dt: number = LORENZ.dt): Divergence {
  const d = run.distance;
  let first: number | null = null;
  for (let i = 0; i < d.length; i++) {
    if ((d[i] as number) > threshold) {
      first = i;
      break;
    }
  }
  let stays: number | null = null;
  for (let i = d.length - 1; i >= 0 && (d[i] as number) > threshold; i--) stays = i;
  return { firstExceeds: first === null ? null : first * dt, staysAboveFrom: stays === null ? null : stays * dt };
}

/** Readout state for the distance between the trajectories (PRD §08). */
export function readoutState(run: LorenzRun, step: number, threshold = 1): "Together" | "Apart" | "Close again" {
  const d = run.distance;
  if ((d[step] as number) > threshold) return "Apart";
  for (let i = 0; i < step; i++) if ((d[i] as number) > threshold) return "Close again";
  return "Together";
}
