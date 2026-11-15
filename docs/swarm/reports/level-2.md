# level-2 report — E1M2 Rat Barracks

## What I built
`src/levels/e1m2.js`: 36x36 fortress level, music `level_b`. Rooms: Gatehouse (start), Bunk Hall, Armoury (optional),
Mess Hall, Drill Yard, Radio Room (silver key), Officers' Lounge (exit X at 19,0, behind silver door 19,12), Sewer Cellar.
28 enemies (12 mice, 10 troopers, 2 officers, 4 sewer), 40 light emitters, 3 pushwall secrets (gatling in the Armoury
niche; catnip/ammo/brie off the Mess east wall; extra life off the Mess south wall). Walkthrough is in the file header.
Generated from a small painter script (scratch only) and emitted as literal rows.

## Verification evidence
- `node tools/validate-level.mjs src/levels/e1m2.js`: OK, 0 errors, 0 warnings, exit reachable via silver key without secrets.
- `node --test test/levels.test.mjs`: 17/17 pass.
- Headless shot `out/shots/level-2/start.png` (level=2, god): level loads and renders; gatehouse mice, banners, candelabra visible.
- Preview copy: `out/previews/level-2/e1m2.png`.

## Deviations from the contract
None. Zone keys used: g b a m l r y c s.

## Mistakes I made and how I fixed them
First draft had 45 lights (target 12-40); removed 5 candelabra. Rooms were plain rectangles; added wall stubs in the cellar only.

## Learnings for a future agent
Make walls 3-4 cells thick where pushwall pockets go (pocket must not touch open cells). Door corridors through thick walls work well.
Pocket shape: 2 cells behind the pushwall plus the 2 side cells of the first one.

## Requests for other modules
None. Not play-tested for balance beyond static review; bunk hall and armoury remain fairly rectangular.
