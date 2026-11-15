# level-1 report (E1M1 The Cheese Cellar)

## What I built
`src/levels/e1m1.js`: 32x32 level, 11 areas (start storeroom, guard room, barrel hall, great cellar, blue cave, fondue gallery, exit hall + 3 secret rooms), 10 doors (one gold), 3 pushwall secrets (start closet, crate depot with yarn launcher, gold vault with extra life/crown), 14 mice + 5 sewer rats, 28 light sources, 20 treasures. Two loops (start-guard-cellar-barrel hall; guard-blue cave-cellar). Walkthrough comment block at top of the file. The map was produced by a scratch generator (painted rooms, auto-lettered walls) kept outside the repo; the shipped file is plain static arrays.

## Verification evidence
`node tools/validate-level.mjs src/levels/e1m1.js` -> OK, no warnings (secrets 3, lights 28, enemies mouse:14 sewer:5). Preview PNG inspected (`out/previews/levels/e1m1.png`). `node --test test/levels.test.mjs` 16/16 pass. `createWorld` on the level loads headless (32x32, 3 secrets, 10 doors). Not looked at in the live renderer.

## Deviations from the contract
None. Exit switch X sits in the border row (y=1 inner wall row is the room wall; X at (16,1) is on the north edge of the exit hall).

## Mistakes I made and how I fixed them
First draft had 7 sewer rats (extra spawns in the fondue gallery); trimmed to 5.

## Learnings for a future agent
Generating the grid from room rectangles avoids row-length errors. Pushwalls travel 2 cells: keep those cells clear of items. Fondue floor zone 'p' is a hazard: keep the key walkway between pools.

## Requests for other modules
None. Lighting/balance has not been tuned in the live renderer; someone should take a shot of each room.
