import { divergence, integrate, LORENZ } from "@/lib/figures/lorenz";
import { LorenzPlayer } from "./LorenzPlayer";

/** Downsampled still frame; the player redraws at full resolution. */
const STILL_STRIDE = 4;

function polyline(points: Float64Array): string {
  const out: string[] = [];
  for (let i = 0; i < points.length / 3; i += STILL_STRIDE) {
    const x = points[i * 3] as number;
    const z = points[i * 3 + 2] as number;
    out.push(`${x.toFixed(2)},${(50 - z).toFixed(2)}`);
  }
  return out.join(" ");
}

const fmt = (n: number) => n.toFixed(3);

/**
 * The Lorenz figure (PRD §08; brand §11). The still frame and caption are
 * server-rendered and complete without JavaScript; the player only adds a
 * reader-started animation with a pause control.
 */
export function LorenzFigure() {
  const run = integrate();
  const { firstExceeds, staysAboveFrom } = divergence(run);
  const end = LORENZ.steps * LORENZ.dt;
  const description =
    `Two curves trace the two-lobed Lorenz attractor, plotted as x against z. ` +
    `They overlap until t = ${firstExceeds === null ? "—" : fmt(firstExceeds)}, ` +
    `when the distance between them first exceeds 1, and they stay more than 1 apart from t = ${staysAboveFrom === null ? "—" : fmt(staysAboveFrom)} to t = ${end}.`;
  return (
    <figure className="figure lorenz" aria-labelledby="lorenz-caption">
      <LorenzPlayer>
        <svg className="figure-still" viewBox="-25 -2 50 54" role="img" aria-label={description} preserveAspectRatio="xMidYMid meet">
          <polyline points={polyline(run.a)} fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <polyline points={polyline(run.b)} fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        </svg>
      </LorenzPlayer>
      <figcaption id="lorenz-caption" className="figure-caption">
        <p>
          Computed on this page from the Lorenz equations with σ = 10, ρ = 28 and β = 8/3, by fourth-order Runge–Kutta with
          step 0.005 for 8,000 steps, from t = 0 to {end}. Both trajectories start at y = 1, z = 1; the solid line starts at
          x = 0.506127 and the dashed line at x = 0.506. The plot shows x against z.
        </p>
        <p>
          The 3D distance between them first exceeds 1 at t = {firstExceeds === null ? "—" : fmt(firstExceeds)} and stays above 1
          from t = {staysAboveFrom === null ? "—" : fmt(staysAboveFrom)}. A demonstration of sensitive dependence on initial
          conditions, not a reenactment of Lorenz&apos;s 1961 weather model.
        </p>
      </figcaption>
    </figure>
  );
}
