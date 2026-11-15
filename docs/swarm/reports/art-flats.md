# art-flats report

## What I built
`src/art/flats.js`: all 15 manifest names (9 floors incl. 4-frame fondue, 5 ceilings, lamp panel; manifest lists 15, not 14). Periodic value-noise and voronoi helpers (`vnoise`, `voronoi`) plus wrapped primitives (`wset`, `wdisc`, `wball`) keep every pattern seamless. Materials: checker gloss 0.6, gold gloss 0.5/spark ~1, fondue emit ~0.85-1, lamp emit 1, grate gloss 0.7, steel 0.5, blue spark 0.1-0.5.

## Verification evidence
`node tools/sheet.mjs flats` prints OK (build ~30 ms). `test/flats.test.mjs` checks names, frames, opacity, determinism, build time, and a seam-contrast heuristic. Three look passes on flats.png, one on flats.mat.png.

## Deviations from the contract
None. Manifest has 15 flats.

## Mistakes I made and how I fixed them
Fondue first had dotted contour lines that read as noise; removed. Ceil_wood was near-black; brightened ramps.

## Learnings for a future agent
Use integer-period sines and modulo-lattice noise for seamless tiles. Fondue loop is exact because all phase terms advance by 2π/4 per frame. Charred-fleck drift is 16 px per frame (wrap-exact).

## Requests for other modules
None. Caveats: gold floor is busy at 1x; ceil_wood is dark by design.
