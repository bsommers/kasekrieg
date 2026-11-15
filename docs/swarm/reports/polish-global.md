# polish-global report

## What I built
- Diagnosis: in-game scene (ambient .05, fog, 11 lights per view, intensities ~2, radii 4-5) matched the demo; the real
  gaps were matte/dark default flats, tight radii vs. a steep falloff, and exposure 1.0 (mean luma 0.039 at level start).
- `src/sim/game.js`: `LIGHT_RADIUS_SCALE=1.4`, `LIGHT_GAIN=1.0` applied to level/decor/pickup lights in `buildScene`.
- `src/render/renderer.js`: default exposure 1.35.
- `src/levels/e1m1.js`: start room zone -> `w` (wood, glossy), one `!` fill light at (7,26).
- `docs/swarm/LIGHTING.md` (recipe for six level agents).

## Verification evidence
- Mean luma (y 100..H-120) start view: 0.039 before -> 0.28 after; Guard room 0.31; Great Cellar 0.22. dark<.06 fell 79% -> 14%.
- `node --test test/`: 173 pass, 0 fail. `validate-level.mjs src/levels/e1m1.js` OK (29 lights).
- Shots: `out/shots/polish-global/before_a1.png`, `i_s.png` (start after), `after_guard.png`, `after_great.png`.

## Deviations from the contract
- Lights now scaled in `buildScene` (documented constants) rather than in defs, so all levels benefit.

## Mistakes I made and how I fixed them
- First pass (gain 1.3, exposure 1.7, cheese-tile start room, two `!`) blew out to mean luma 0.71; backed off to
  exposure 1.35, gain 1.0, wood zone, one `!`.

## Learnings for a future agent
- Measure mean luma with a small PNG decoder rather than viewing images. `?pos=x,y,deg` positions the camera.
- Cheese flats (lum .65) clip quickly; wood is the best dim-mood glossy floor.

## Requests for other modules
- art-flats: give `floor_dirt` / `floor_stone` / `ceil_stone` some gloss (0.12-0.2) and sparse spark so cellar levels reflect.
- main.js owner: nothing required; exposure could be exposed as a setting.
