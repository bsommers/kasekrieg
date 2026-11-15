# art-enemies-infantry — report

## What I built
`src/art/enemies_infantry.js`: `build()` returns all 18 manifest names (`mouse|trooper|officer` × `idle 1, walk 4, attack 3, pain 1, die 4, dead 1`), 54 frames of 64×64.
- **Parametric rig.** A pose (`feet[]`, `bob`, `sway`, `hem`, `tilt/hx/hy` for the head, `face`, `mode` for arms and weapon, `recoil`, `tail/tailUp`, `R:{rot,sq}` for whole-body rotation and squash, `loot`) goes through an outfit kit (`KITS`) and comes out as a back-to-front list of analytic primitives: ellipses, tapered capsules, and polygons with optional spherical normals (`en`). The rasteriser inverse-maps each pixel into figure space, so the rotated and squashed collapse frames stay crisp. It shades each primitive against a fixed upper-left light into 3–5 step hue-shifted ramps. Primitives with `edge` get an inner 1px contour. Primitives with `post:true` (whiskers, muzzle flash) are drawn after the `#1a1420` outline so they stay hair-thin or glow without a dark border.
- **Outfits.**
  - mouse: grey, oversized stahlhelm, huge round ears, tunic, tiny pistol, two-handed aim.
  - trooper: brown rat, greatcoat with green collar, belt and mag pouches, SMG at port arms when idle, fired from the hip aimed at the viewer.
  - officer: white rat, peaked cap with a gold cheese-wedge badge, glossy black leather coat over a tunic and tie, gold monocle with a chain, luger raised beside the head, other hand on the hip, sneer.
  - All three wear a red armband with a white disc and dark wedge pixel. No real insignia.
- **Animations.**
  - walk: 4-frame toward-viewer cycle. The forward foot is lower and larger, the lifted foot is raised, with bob, sway, hem swing and tail sway.
  - attack: aim / FIRE (emissive star flash, emit 0.9–1.0 plus spark) / recover (gun kicked up, grey smoke puffs).
  - pain: head jerked, eyes squeezed, mouth open, arms flung.
  - die: shot and flailing, knees buckle, tipping at 0.85 rad, nearly flat at 1.32 rad.
  - dead: lying across the bottom of the frame with legs bent, X eyes and tongue out. The helmet or cap and the weapon lie on the floor just behind the body.
- **Materials.**
  - emit: muzzle flash; red eye glints on the rats (0.75).
  - gloss: helmets 0.32, boots and leather 0.45–0.5, gun metal 0.6, wet pink nose 0.45, visor 0.7, monocle glass 1.0.
  - spark: gold badge and monocle rim, buckles.
- `test/art-enemies-infantry.test.mjs` checks: names, frame counts and sizes; hard alpha; feet on row 63; no frame touching the side columns; FIRE frames are emissive and aim frames are not; determinism; build time.

## Verification evidence
- `node tools/sheet.mjs enemies_infantry` → `OK: all 18 manifest names present with correct sizes/frames.`
- `node --test test/art-enemies-infantry.test.mjs` → 4/4 pass. Full `node --test test/` → 151/151 pass.
- Cold `build()` takes about 45–52 ms (it was 105–118 ms before optimisation).
- I did 4 look-and-fix passes on per-type sheets (`out/previews/art-enemies-infantry/<type>/`) plus the full `out/previews/enemies_infantry.png`, and one pass on `enemies_infantry.mat.png`. The material sheet shows emissive only on the flash and eyes, and gloss on helmets, boots and guns.

## Deviations from the contract
- None to the API. The mouse is about 46 px tall, not 56, to read as a "small private" (defs gives it `size 0.9`, which shrinks it further in-game). The trooper and officer are about 54–56 px.
- Lying and collapse frames are auto-fitted into columns 2..61 and rest on the bottom row. Standing frames keep the feet anchored at x≈32 with no horizontal centring, so the sprite does not jitter between frames.

## Mistakes I made and how I fixed them
1. First pass: the helmet skirt was a filled polygon and the dome ellipse hung below the brim, so it covered the whole face (no eyes). I rebuilt the helmet as one arc polygon with a cut-away front brim and spherical normals, and placed the eyes just under the brim.
2. Rat ears were hidden behind the helmet. They are now drawn after the hat so they poke out at the sides, which also strengthens the silhouette.
3. The tail was a jagged "check-mark" polyline. I replaced it with a cubic Bézier, tapered, lying on the floor with a curled tip.
4. The armband and its disc were so large they read as a red flower. I shrank the band and made the emblem a 2×2 white block with one dark pixel.
5. In the dead frame the hat was drawn under the body, so it was invisible. Hats are now removed from the head (`hatOff`) and placed behind the body (higher on screen means further away).
6. My side-clamp ignored the outline pixel and post-outline whiskers, so frames touched column 63. I now clamp the body to 2..61 and include the post layer in the bbox.
7. The build was too slow (about 110 ms cold). Causes were per-pixel array allocation from `X.inv`, `PixBuf.blit`/`get` allocating an object per pixel, destructuring in the polygon loop, and `Math.hypot`. I inlined the inverse transform, cached trig per primitive, reused the scratch buffers, and added a typed-array `copyOver`.
8. `r1 ?? r0` inside an object literal shorthand is a syntax error. Write `r1: r1 ?? r0`.

## Learnings for a future agent
- An analytic-primitive rig with inverse-mapped rasterisation is a good fit for 64 px sprites. Rotation and squash for death frames come for free and need no pixel rotation. Keep single-pixel details at half-integer figure coordinates: pixel centres sit at .5 when the feet are at y=0 and the centre is at x=32.
- Draw fine features (whiskers) and glows (muzzle flash) after the outline. Otherwise the outline triples their thickness.
- In front-view enemies, a hat that covers the eyes kills readability. The eyes plus a red emissive glint are what make the face read at 1×.
- A cold `build()` is much slower than a warm one. Measure in a fresh `node` process.

## Requests for other modules
- **sim-enemies:** the attack frame order is `[aim, FIRE, recover]`, and only frame 1 is emissive. For the trooper's 3-shot burst, flick between frames 1 and 0 per shot. `dead` frames include the dropped gear, so do not spawn separate gun sprites.
- **render-core:** the muzzle flash pixels have `spark` 0.3–0.5 and `emit` ≥ 0.9. Eye glints are single emissive pixels (0.75), and they should survive texel-locked shading.
