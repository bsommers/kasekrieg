# render-core report

## What I built
`src/render/renderer.js` (WebGL2, createRenderer + pure createPacker), `src/render/shaders/trace.js` (single-pass fragment tracer:
DDA walls, floors/ceilings, sliding door slabs + jamb, pushwall movers, camera-facing alpha-tested sprites, sky + cheese moon,
<=24 lights with shadows incl. sprites, moonlight, emissive, one gloss-weighted reflection bounce, spark glints, fog, beams,
texel-locked shading, animated tiles, state tile for exit switch), postfx hookup (binds postfx.target, internal tonemap/blit fallback),
`src/render/demo.html/js` (synthetic showcase; procedural fallback atlas; URL params q/view/cam/t/bench/sheet), `test/render-core.test.mjs`.
Work was done across several agents; this final pass inventoried features, verified, fixed a demo camera, benchmarked and reported.

## Verification evidence
- Screenshots via tools/shot.mjs: out/shots/render-core/f0.png (hall), f1b.png (doors), others v0..v3, sheet1. Look rich: reflective marble, mirror, star-streak bloom, sprites, lights.
- Bench (RX 7900 XTX, Vulkan/ANGLE, avg/worst GPU ms, 36 sprites, 16 lights): low 0.23/0.34, medium 0.30/0.33, high 0.29/0.40, ultra 0.29/0.51. Far below 60fps budget; integrated-GPU numbers not measured.
- `node --test test/render-core.test.mjs`: 4 pass.

## Deviations from the contract
None known. renderer.stats has extra fields (cpuMs, gpuMs, post, ...); renderer also exposes `measure()`.

## Mistakes I made and how I fixed them
- demo view 1 camera sat inside a prop sprite (half screen of blue); moved the camera. Not a renderer bug.
- Initially tried `D.bench`; the demo global is `window.__demo`.

## Learnings for a future agent
- Use `tools/shot.mjs --eval "JSON.stringify(__demo.bench...)"` for numbers rather than reading images.
- Timer queries make gpuMs available; stats.ms prefers it.
- Door slab geometry must match the header comment in src/sim/world.js.

## Requests for other modules
None.
