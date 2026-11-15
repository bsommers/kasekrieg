# level-tools report

## What I built
- `tools/validate-level.mjs`: CLI (`<file...> [--no-png] [--scale N] [--quiet]`, exit 1 on errors) and library (`validateLevel(def)`, `renderPreview`, `validateFile`, `classifyTile`, `formatReport`). Checks header fields/texture/music names, equal row lengths (map/things/zonesMap), unknown chars, one start, >=1 exit `X`, solid border, door geometry, pushwall clearance (front open + 2 open behind), things only on open cells, zone keys, size <= 64, key-ordered flood fill (critical path without pushwalls; secret pass with them), every item/enemy reachable, lock without key, counts summary. Messages carry (x,y) and print the offending row. Preview PNG to `out/previews/levels/<id>.png`, 16 px/cell.
- `src/levels/index.js`: `levels` (LEVELS order, TLA dynamic imports), `missing`, `makeFallbackLevel(id,name)` (valid 10x10 level with key, locked door, exit).
- `test/levels.test.mjs`: 15 tests (negative cases per rule, fallback, index, plus one test per level file present on disk).

## Verification evidence
`node --test test/` -> all pass (15). Fallback validates OK. Demo level with deliberate errors produced accurate messages; preview PNG inspected visually (walls, doors, locks, pushwall magenta, exit green, enemies red, start cyan with direction tick).

## Deviations from the contract
- Validation is 4-neighbour grid flood, not circle collision. Decor blockers are not considered for reachability.
- Light count = `!` things + decor with a `light` field.
- Extra errors beyond spec: unknown music, key/lock mismatch, 'x' (exit as pushwall).

## Mistakes I made and how I fixed them
- First fallback level had things misaligned with the border (key on a wall); validator caught it. A test case forgot to resize `things`.

## Learnings for a future agent
- Things and tile layers share coordinates; border cells of `things` must be '.'.
- A door's open sides must be plain open cells, so two adjacent doors are invalid.

## Requests for other modules
- None. sim-world should treat levels like the fallback (things layer exactly map-sized).
