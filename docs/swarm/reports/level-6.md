# level-6 report — E1M6 Throne of the Big Cheese
## What I built
`src/levels/e1m6.js` (32x32, music `boss`), generated from a scratch node script: Cellar (start) -> Armoury (yarn launcher, gatling, laser) / Carpet Hall -> Antechamber -> silver door -> 16x16 throne arena (carpet, 4 fondue patches, pillars, mouse-hole walls, banners, gold dais, boss Z, 2 panzers + 3 troopers, exit X behind throne). Fondue Cellar (east) holds the silver key under panzer+officer guard. 4 secrets (pushwalls), 34 lights.
## Verification evidence
`node tools/validate-level.mjs src/levels/e1m6.js` -> OK, size 32x32, doors 7, secrets 4, lights 34, enemies 18. Preview PNG inspected: rooms and loop correct.
## Deviations from the contract
None. No sewer rats placed (boss summons them).
## Mistakes I made and how I fixed them
None hit; generating from rect helpers avoided row-length errors.
## Learnings for a future agent
Pushwall closets must be pre-carved outside the room (2 open cells) and ringed with walls. Generator approach (rect/put helpers that throw on thing-in-wall) is fast.
## Requests for other modules
None. Not playtested in-engine for boss difficulty.
