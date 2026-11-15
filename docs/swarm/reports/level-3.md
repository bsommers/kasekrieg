# level-3 report — E1M3 The Fondue Works

## What I built
`src/levels/e1m3.js`: 38x38 industrial level with 6 areas (Dock, River Hall, Cauldron Room, Pump Station, Foundry, Control Room) plus a Sewer Cellar. Fondue rivers (zone floor_fondue) crossed by grate walkways, fondue-fall walls, gold-key gating (key in Foundry, door to the exit Control Room), yarn launcher in the Pump Station, 3 pushwall secrets, 22 enemies (11 troopers, 4 panzers, 6 sewer rats, 1 mouse), 39 light sources. Walkthrough comment block is at the top of the file.

## Verification evidence
`node tools/validate-level.mjs src/levels/e1m3.js` -> OK; size 38x38, doors 8, exits 1, secrets 3, lights 39, treasure 15. Preview PNG inspected once (out/previews/levels/e1m3.png): layout, key and door positions as intended.

## Deviations from the contract
None known. Only 1 mouse; the brief lists troopers/rats/panzers only.

## Mistakes I made and how I fixed them
- Generated the grids with a script; undefined wall chars (zone '.' door cells) made one row 35 wide. Fixed with a default wall.
- First draft had 55 lights (over the 12-40 target); removed fill lights and some lamps to reach 39.

## Learnings for a future agent
Generate grids programmatically (carve rooms, auto-paint walls by adjacent zone) to avoid row-length errors; pushwall niches need 2 open cells plus solid surround, so leave 4-wide solid gaps between rooms.

## Requests for other modules
None.
