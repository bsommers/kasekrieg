# art-decor report

## What I built
`src/art/decor.js` exporting `build()` with all 23 `decor.*` names (27 frames) per `defs.DECOR`. Helpers: `ball` (upper-left-lit shaded ellipse), `cyl`/`cylH` (column/row shaded cylinders), `wedge` (cheese emblem), `flame` (emissive candle), `wheel` (cheese wheel), `leaf`, `rp` (ramp + material). Hang pieces (chandelier, cage_kitten, hanging_cheese, alarm_light) touch row 0; pillar spans rows 0-63. Emissive: flames, lamp shade, molten cheese, glow cheese, alarm dome, radio lamp. Glossy: armour, milk, iron, brass. Build ~17 ms.

## Verification evidence
`node tools/sheet.mjs decor` prints OK (all names/frames/sizes). Viewed previews (out/previews/decor.png, out/previews/art-decor/*.png incl. custom grid and material grid) over 3 look-and-fix passes plus a material pass.

## Deviations from the contract
None. Previews copied to out/previews/decor*.png as well as art-decor/.

## Mistakes I made and how I fixed them
- First cheese_stack looked like a cake and the quarter-cut erase failed; redrew top wheel as a half-wheel showing a flat cut face.
- Radio headphones were a blob; redrew as a band plus cups lying on the desk.
- Cauldron used the grey iron ramp; switched to a dark local ramp. Crate paw was hidden by the X; enlarged paw, thinner X.
- Candelabra frames were near-identical; varied flame lean/size.

## Learnings for a future agent
- sheet.mjs output is a very tall strip; a custom grid renderer at 3-5x is far easier to review.
- Carving shapes via erase is fragile; construct the final silhouette instead.
- Hard alpha + outline() makes thin 1px parts (fish bones, wire) read fine.

## Requests for other modules
- Renderer: decor sprites are frame-indexed; trap pieces use frame 1 = sprung. Hanging pieces should be placed with h so the top touches the ceiling.
- scratch_post/bunk/crate have near-zero materials by design.
