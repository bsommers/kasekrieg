# art-fx report

## What I built
`src/art/fx.js`: all 12 `fx.*` sprites (yarnball 4, cheeseball 2, explosion 6, puff 4, spark 3, crumbs 3, fur 3, sparkle 4, laser_dot 2, stun 2, splash 3, muzzle 2). Helpers: irregular lit `blob`, stepped alpha `halo`, `star`, tapered `ray`, `solidOutline` (outline that ignores glow halos), `dissolve`. Emissive inks for fire/sparks/laser/muzzle; partial-alpha halos for glows; yarn faint emit 0.1. Build ~24 ms.

## Verification evidence
`node tools/sheet.mjs fx` prints OK; four look passes on out/previews/fx.png plus fx.mat.png; `test/art-fx.test.mjs` passes (manifest coverage, non-empty frames, determinism, <100 ms).

## Deviations from the contract
None. Halos use partial alpha (allowed for glows).

## Mistakes I made and how I fixed them
- `PixBuf.erase()` does not erase existing pixels (alpha 0 hits the blend branch with t=0). My `dissolve` zeroes the buffers directly.
- Cheeseball first looked like a skull (two symmetric holes); moved holes off-centre.
- Fur went from twig-like strokes to fish-like blobs to narrow tapered tufts; still a bit stylised at 1x.
- Outline drawn before dissolve, otherwise dark specks appear in holes.

## Learnings for a future agent
Use own pixel-zeroing for erasing. Outline only fully-transparent neighbours so soft halos stay unoutlined. Hash noise must be sampled per sector, not per pixel, for blobs to look chunky.

## Requests for other modules
None. Renderer should treat partial-alpha halo texels as glow (alpha blend) if it supports it; otherwise they alpha-test fine.
