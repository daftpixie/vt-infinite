#!/usr/bin/env python3
# Builds public/brand/*.svg. See public/brand/README.md.
"""Build the VT Infinite vector master from the brand reference §07/§13 measurements.

Units: one module m = 1/9 of the ring's outer radius; origin = the circles' centre; y down.
Outputs single-path SVGs (no masks, no strokes) painted with currentColor.
"""
import math, io, sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.recordingPen import RecordingPen
import pathops

OUT = sys.argv[1]
FONT = sys.argv[2]

def circle(r, n=0):
    p = pathops.Path()
    # four cubic arcs, k = 0.5522847498
    k = 0.5522847498 * r
    p.moveTo(r, 0)
    p.cubicTo(r, k, k, r, 0, r)
    p.cubicTo(-k, r, -r, k, -r, 0)
    p.cubicTo(-r, -k, -k, -r, 0, -r)
    p.cubicTo(k, -r, r, -k, r, 0)
    p.close()
    return p

def poly(pts):
    p = pathops.Path()
    p.moveTo(*pts[0])
    for q in pts[1:]:
        p.lineTo(*q)
    p.close()
    return p

def op(a, b, kind):
    return pathops.op(a, b, kind)

U, D, I = pathops.PathOp.UNION, pathops.PathOp.DIFFERENCE, pathops.PathOp.INTERSECTION

def thick_polyline(a, apex, b, w):
    """Outline of a two-segment polyline a-apex-b, width w, butt caps, mitred join."""
    h = w / 2
    def nrm(p, q):
        dx, dy = q[0] - p[0], q[1] - p[1]
        L = math.hypot(dx, dy)
        return (-dy / L, dx / L)
    n1 = nrm(a, apex)
    n2 = nrm(apex, b)
    def off(p, n, s):
        return (p[0] + n[0] * h * s, p[1] + n[1] * h * s)
    def inter(p1, p2, p3, p4):
        x1, y1 = p1; x2, y2 = p2; x3, y3 = p3; x4, y4 = p4
        den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
        t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den
        return (x1 + t * (x2 - x1), y1 + t * (y2 - y1))
    pts = []
    for s in (1, -1):
        A1, A2 = off(a, n1, s), off(apex, n1, s)
        B1, B2 = off(apex, n2, s), off(b, n2, s)
        J = inter(A1, A2, B1, B2)
        pts.append((A1, J, B2))
    (a_p, j_p, b_p), (a_m, j_m, b_m) = pts
    return poly([a_p, j_p, b_p, b_m, j_m, a_m])

def roof(width):
    return thick_polyline((-13.300, 1.016), (0, -13.147), (13.300, 1.016), width)

def tri(apex_y, top_y):
    return poly([(0, apex_y), (-10, top_y), (10, top_y)])

def mark_full():
    ring = op(circle(9), circle(8), D)
    disc = circle(7)
    R = disc
    R = op(R, op(tri(9.744, -9.714), disc, I), D)
    R = op(R, op(tri(7.617, -11.841), disc, I), U)
    R = op(R, op(tri(4.782, -14.676), disc, I), D)
    R = op(R, op(tri(3.646, -15.812), disc, I), U)
    R = op(R, poly([(-0.368, 6.9), (0, 7.617), (0.368, 6.9)]), U)
    m = op(ring, roof(1.0), U)
    m = op(m, R, U)
    return m

def mark_small():
    """D4 (a): the roof over a solid disc; roof stroke 1.6 m, disc 7.6 m."""
    return op(roof(1.6), circle(7.6), U)

def wordmark(text, cap_m, font_path):
    f = TTFont(font_path)
    if "fvar" in f:
        f = instancer.instantiateVariableFont(f, {"wght": 800})
    gs = f.getGlyphSet()
    cmap = f.getBestCmap()
    # cap height from the H glyph's bounding box
    from fontTools.pens.boundsPen import BoundsPen
    bp = BoundsPen(gs); gs[cmap[ord("H")]].draw(bp)
    cap_units = bp.bounds[3]
    s = cap_m / cap_units
    hmtx = f["hmtx"]
    x = 0.0
    out = pathops.Path()
    for ch in text:
        gname = cmap[ord(ch)]
        adv = hmtx[gname][0]
        if ch != " ":
            pp = pathops.Path()
            pen = pp.getPen(glyphSet=gs)
            tp = TransformPen(pen, (s, 0, 0, -s, x * s, 0))
            gs[gname].draw(tp)
            out = op(out, pp, U)
        x += adv
    # baseline at y=0, caps rise to y=-cap_m
    return out

def bounds(p):
    return p.bounds  # (xmin, ymin, xmax, ymax)

def translate(p, dx, dy):
    q = pathops.Path()
    pen = q.getPen()
    p.draw(TransformPen(pen, (1, 0, 0, 1, dx, dy)))
    return q

def to_d(p, nd=3):
    pen = SVGPathPen(None, ntos=lambda v: (f"{v:.{nd}f}").rstrip("0").rstrip(".") if "." in f"{v:.{nd}f}" else f"{v:.{nd}f}")
    p.draw(pen)
    return pen.getCommands()

def svg(p, title, clear=4.0, extra=""):
    x0, y0, x1, y1 = bounds(p)
    vb = (x0 - clear, y0 - clear, (x1 - x0) + 2 * clear, (y1 - y0) + 2 * clear)
    vbs = " ".join(f"{v:.3f}" for v in vb)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vbs}" role="img" aria-label="VT Infinite">'
            f'<title>{title}</title>{extra}'
            f'<path fill="currentColor" fill-rule="nonzero" d="{to_d(p)}"/></svg>\n')

CAP = 3.91          # m, measured cap height
GAP = 3.14          # m, mark to wordmark
MARK_BOTTOM = 9.0   # ring's outer edge

full = mark_full()
small = mark_small()
wm = wordmark("VT INFINITE", CAP, FONT)
wx0, wy0, wx1, wy1 = bounds(wm)

# Stacked: wordmark ink centred on the mark's axis (x = 0), cap top GAP below the mark.
stacked_wm = translate(wm, -(wx0 + wx1) / 2, MARK_BOTTOM + GAP + CAP)
stacked = op(full, stacked_wm, U)

# Horizontal: wordmark to the right, GAP from the mark's right edge, caps centred on the mark's height.
mx0, my0, mx1, my1 = bounds(full)
mid = (my0 + my1) / 2
horiz_wm = translate(wm, mx1 + GAP - wx0, mid + CAP / 2)
horiz = op(full, horiz_wm, U)

files = {
    "vt-infinite-mark.svg": svg(full, "VT Infinite"),
    "vt-infinite-mark-small.svg": svg(small, "VT Infinite", clear=1.0),
    "vt-infinite-lockup-stacked.svg": svg(stacked, "VT Infinite"),
    "vt-infinite-lockup-horizontal.svg": svg(horiz, "VT Infinite"),
}
for name, s in files.items():
    open(f"{OUT}/{name}", "w").write(s)
    print(name, len(s), "bytes")
print("wordmark ink width m:", round(wx1 - wx0, 3), "cap units scale ok")
print("full mark bounds:", [round(v, 3) for v in bounds(full)])
