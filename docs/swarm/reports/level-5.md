# level-5 report (E1M5 The Blue Vault)

## What I built
`src/levels/e1m5.js`: 42x42, 9 areas (Entry Crypt, Catacomb Hall, Moldy Ossuary, Blue Cavern, Parmesan Crypt, Gold-Foil Vault, Exit Room, Wax Armory, Mould Gallery), 10 doors, silver key in Ossuary -> silver door -> crypt with gold key -> gold door -> vault -> exit room with X. 6 pushwall secrets, 26 enemies of all 5 types, 38 light things, 15 treasures. Generated from a scratch script (rooms ring-painted, doors/closets/things placed with collision checks).

## Verification evidence
`node tools/validate-level.mjs src/levels/e1m5.js` -> OK; 42x42, doors 10, exits 1, secrets 6, lights 38, treasure 15. Preview PNG not visually inspected.

## Deviations from the contract
None known.

## Mistakes I made and how I fixed them
First draft had 66 light things (brief says 12-40); thinned glow_cheese/candelabras to 38.

## Learnings for a future agent
Generate the grid from room rectangles rather than hand-typing rows; keep secret closets in unused map margins so pushwalls cannot bypass key doors.

## Requests for other modules
None.
