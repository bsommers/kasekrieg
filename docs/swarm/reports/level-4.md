# level-4 report (E1M4 Moonlit Hall of Mirrors)

## What I built
`src/levels/e1m4.js`: 42x42, 9 rooms (Foyer, South Mirror Hall, Great Mirror Hall, Portrait Gallery, Library, Moon Court (sky), Exit Hall, Armory, Blue Court (sky)),
10 doors, silver key (Library) -> Great Hall silver door -> Moon Court gold key -> gold door -> Exit Hall X. 4 pushwall secrets, 24 enemies (8 each officer/trooper/mouse), 38 light things, laser in Armory. Walkthrough in the file header. Generated from a scratch script (rooms + placement list) then emitted as literal arrays.

## Verification evidence
`node tools/validate-level.mjs src/levels/e1m4.js` -> OK, 42x42, doors 10, exits 1, secrets 4, lights 38, treasure 8, previewed PNG viewed. Not run in the actual renderer.

## Deviations from the contract
None known. Rooms are plain rectangles (preview looks boxy); pillars carry the interior variety.

## Mistakes I made and how I fixed them
First draft had 59 light things (over the 12-40 target); dropped 21 candelabra/lamps.

## Learnings for a future agent
Generating the three grids from a room list + placement helper (which throws on bad cells) avoids row-length errors. Secret closets need 2 open cells behind the pushwall, so the map is 42 wide/tall to leave closet room outside the rooms.

## Requests for other modules
None. Not verified: whether chandelier/candelabra decor blocks movement or enemy patrol paths in-game.
