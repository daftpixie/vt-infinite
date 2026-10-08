# VT Infinite mark — vector master

Approved by Matthew J Adams on 8 October 2026.

| File | Use |
|---|---|
| `vt-infinite-lockup-stacked.svg` | Primary: the mark over the wordmark, on one axis |
| `vt-infinite-mark.svg` | The mark alone, where the name is already present |
| `vt-infinite-lockup-horizontal.svg` | Site header lockup |
| `vt-infinite-mark-small.svg` | 32 px and under (favicon, avatar): the roof over a solid disc |

Each file is one filled path painted with `currentColor`, so it inverts with the theme: white on black is primary, black on white is its exact inversion. The viewBox includes the 4-module clear space (1 module for the small mark). Alt text: "VT Infinite".

**Construction.** Rebuilt from measurements of the original raster mark: the module is one-ninth of the ring's outer radius; the disc is 7 modules, the ring runs from 8 to 9, and each roof line is tangent to the ring. The wordmark is set in JetBrains Mono ExtraBold (SIL Open Font License, see `public/fonts/OFL.txt`) and centred on the mark's axis. Rendered at the original's scale, the master overlaps it 97.1% and every differing pixel lies within 1 pixel of an edge.

**Provenance.** The original mark was generated with Nano Banana 2 from Matthew J Adams's prompt (30 September 2026). His words on ownership: "what I build is owned by all." No copyright is claimed in the artwork.

**Rebuilding.** `tools/brand/build-mark.py` regenerates these files from the geometry and the site's own font file (Python, with `fonttools`, `brotli` and `skia-pathops`):

    python3 tools/brand/build-mark.py public/brand public/fonts/JetBrainsMono-wght.woff2

Don't stretch, re-angle, recolour, outline or retype the mark.
