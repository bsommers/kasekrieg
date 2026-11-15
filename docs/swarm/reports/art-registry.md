# art-registry report

## What I built
- `src/art/registry.js`: `buildAtlas(onProgress?, opts?)` per ARCHITECTURE §5.5. Dynamic `import('./<mod>.js')` per module in try/catch; per-name validation (exists, frame count, PixBuf shape, size); invalid/missing names get a hashed-hue checker placeholder and go into `atlas.missing`. Layer 0 of tiles/sprites = magenta/black checker. Layers follow `artManifest()` order; `tiles.anim[firstLayer]=frames` (others 1); `sprites.index/frames` maps. Extra: `atlas.report` (per-module status/ok/total/ms/errors), `opts.{modules,importer,manifest}` hooks for tests, exported `makePlaceholder`. `sprite(name, frame)` clamps frame into range.
- `tools/atlas-sheet.mjs`: writes `out/previews/atlas-tiles.png` / `atlas-sprites.png` (uses `encodePNG` from `tools/sheet.mjs`), prints completeness table.
- `test/art.test.mjs`: 10 tests (shape, order, anim, placeholders, injected broken/partial modules, progress).

## Verification evidence
`node --test test/art.test.mjs`: 10/10 pass. At the time of the run no art module files existed, so all 11 were reported `unavailable`, 150 names placeholdered, build 18 ms; contact-sheet PNGs written and viewed. Not yet verified against real art modules.

## Deviations from the contract
- Added `atlas.report` and a 2nd optional `opts` arg (backward compatible).
- Sprite placeholders have a transparent margin (not fully opaque) so they read as a box.
- Atlas `rgba`/`mat` are Uint8Array copies (PixBuf planes are Uint8ClampedArray).

## Mistakes I made and how I fixed them
- First draft had a pointless `manifest.filter(... || a.kind)` and a stray `hash2` re-export; removed.

## Learnings for a future agent
- Layout (counts/indices) is independent of which art exists, so renderer/sim can rely on indices even with missing modules.
- Re-run `node tools/atlas-sheet.mjs` once art modules land to see real completeness.

## Requests for other modules
- None. Art modules must export `build()` returning exact manifest names/frames/sizes; anything else is placeholdered.
