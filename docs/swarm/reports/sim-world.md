# sim-world report

## What I built
`src/sim/world.js` (found already written when resumed; reviewed line by line against §6-7 and kept) and `test/world.test.mjs` (22 node tests).
Implements createWorld: parsing (walls, secret pushwalls, doors+locks, exit, zones, hazards, sky, sealed border), door orientation and
lifecycle (0.7 s slide, 4 s hold, no close on actors, reopen if actor enters), pushwalls (2 cells at 1 cell/s, pause for actors),
exit switch (swaps to frame +1), castRay (DDA + door slabs + mover AABBs), hasLOS, tryMove (AABB sub-stepped, per-axis sliding), distField (BFS, cached,
invalidated on any door/pushwall/blocker change), nextStep (8-neighbour, no corner cutting), soundMask.

## Verification evidence
`node --test test/world.test.mjs`: 22 pass, 0 fail. Covers parsing, orientation, door lifecycle/locks/actors, pushwall slide/secret count/blocking,
exit, castRay on walls/doors, hasLOS, tryMove sliding/corners/no tunnelling (6 u/s steps, 2-unit jumps), distField/nextStep paths, soundMask.

## Deviations from the contract
- Extra exports/fields: `DOOR_SPEED, DOOR_HOLD, PUSH_SPEED, PUSH_DIST, USE_RANGE, UNREACHABLE`, `world.hazard` (Float32Array), `world.version` (bumps on nav change), mover extras (`dx,dy,left,dcx,dcy`).
- Door geometry: slab at cell centre; gap opens at north (vertical) / west (horizontal) end. Renderer must match (documented at file top).
- `tryMove` `forEnemy` is accepted but physics identical.
- `use` reach is 1.5 cells; castRay miss returns side -1.
- Exit switch: tex set to `exit_switch + 1` (assumes frames are consecutive layers).

## Mistakes I made and how I fixed them
Test authoring: left placeholder junk tests and a wrong BFS distance (8 not 6); one door test stepped too few ticks. All fixed. No world.js bugs found.

## Learnings for a future agent
Door "opening" can complete within one 60 Hz tick when re-opening from 0.86; assert states with single-tick steps.

## Requests for other modules
- Renderer: honor the door slab geometry above; draw `world.movers` AABBs; animate exit switch via wallTex (frame +1).
- game.js: call `world.setBlocker` for blocking decor; pass `game` (player, enemies) to `world.update` so doors/pushwalls respect actors.
- Enemies: open doors via `world.openDoor(world.doors[world.doorAt[idx]])`.
