import { MANDELBROT } from "@/lib/figures/mandelbrot";
import { MandelbrotPlayer } from "./MandelbrotPlayer";

/** Agency's computed figure (PRD §08). Rendered only when its flag is on (P7). */
export function MandelbrotFigure() {
  const { start, end } = MANDELBROT;
  return (
    <figure className="figure mandelbrot" aria-labelledby="mandelbrot-caption">
      <MandelbrotPlayer>
        {/* eslint-disable-next-line @next/next/no-img-element -- a computed PNG served by this site */}
        <img
          className="figure-still figure-raster"
          src="/figures/mandelbrot-still.png"
          width={600}
          height={400}
          alt="Line art of the Mandelbrot set: the large heart-shaped cardioid with the round bulb to its left, edged by contour lines that crowd toward the boundary."
        />
      </MandelbrotPlayer>
      <figcaption id="mandelbrot-caption" className="figure-caption">
        <p>
          Computed for this site from the rule z → z² + c, using escape-time smooth counts and a distance estimate with escape
          radius 10⁶, drawn as monochrome boundary and contour lines. The view starts centred on c = {start.cx} + {start.cy}i,
          width {start.width.toFixed(1)}; the reader-started zoom ends at c = {end.cx.toFixed(5)} + {end.cy.toFixed(5)}i, width{" "}
          {end.width}.
        </p>
      </figcaption>
    </figure>
  );
}
