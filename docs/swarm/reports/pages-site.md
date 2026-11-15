# pages-site

## Built
- `docs/index.html` + `docs/site/{style.css,main.js,favicon.svg,img/}`: landing page (hero with PLAY IN BROWSER, stats, 8-shot gallery, features, 6 enemy sprites + 5 weapon sprites, controls table, three download cards pointing at releases/latest). Press Start 2P from Google Fonts with monospace fallback; CSS sparkle/sheen/bob animations, all disabled under prefers-reduced-motion; phone layout.
- `tools/build-site.mjs`: zero-dep copy of index.html, style.css, src/ (minus *-demo.html, *demo.js, tests) into `docs/play/` (56 files, ~970KB).
- `tools/export-sprites.mjs`: exports transparent upscaled idle sprites from src/art builders into docs/site/img (uses encodePNG from sheet.mjs).
- `docs/.nojekyll`; README top link to https://bsommers.github.io/kasekrieg/.
- Gallery re-uses `docs/screenshots/*.png` directly (not copied) plus 4 shots from out/shots copied to docs/site/img.

## Verified
- Served docs/ with python http.server; `/play/` rendered the Cheese Cellar HUD frame via tools/shot.mjs with 0 console errors (also `--strict` on the /docs/play path).
- Landing page screenshotted at 1280x900 (several scroll offsets) and 390x844 and inspected. Fixed: busy hero background (darkened, tagline backing panel), misaligned Download button, stats wrapping 3+1 on phone, sticky nav covering anchors.

## Mistakes
- `pkill -f` / `pgrep -f` with the pattern in my own command line matched and killed my shell (exit 144), twice. Avoid; track PIDs.
- atlas-sprites.png is a placeholder-colour grid, not useful; calling the art `build()` directly was the right route.

## Learnings
- shot.mjs has no full-page mode; use `--eval "scrollTo(0,N)"` per viewport.
- Facts used: 6 levels, 5 weapons (not 10), 8 songs, 6 enemy types.
- docs/play is a committed copy: rerun `node tools/build-site.mjs` whenever src/ changes.
