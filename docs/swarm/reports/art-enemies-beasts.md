# art-enemies-beasts report

## What I built
`src/art/enemies_beasts.js`: sewer (idle/walk4/attack2/pain/die3/dead) and panzer (idle/walk4/attack3/pain/die4/dead). Parametric pose functions (`sewerPose`, `panzerPose`), lit-shape helpers (`blob`, `lpoly`, upper-left 4-step ramps), `transform()` rotate/ground helper for death frames. Materials: red eyes emissive, steel/brass gloss, gold tag spark, molten cheese + muzzle blast emissive, cheese puddle on panzer.dead.

## Verification evidence
`node tools/sheet.mjs enemies_beasts` prints OK (12 names, build ~35 ms). Three look passes on the PNG plus the sewer mat sheet.

## Deviations from the contract
None.

## Mistakes I made and how I fixed them
- First sewer read as a cute upright plush: darkened fur, lowered/widened head, bigger teeth/mouth.
- Rotated death frames clipped off-canvas because the pivot was at the feet: pivot moved to the body centre, then re-grounded.
- Panzer cannon barrel was hidden by its own pauldron and steel was too white: reordered draw, added gun-metal ramp, darkened steel.

## Learnings for a future agent
Rotate nearest-neighbour about the body centre, then re-ground; draw outline after transform. Ramp() lightens strongly; pick darker bases than the target.

## Requests for other modules
None. Panzer FIRE frame is attack[1]; muzzle is at the sprite's left (~x 9, y 21).
