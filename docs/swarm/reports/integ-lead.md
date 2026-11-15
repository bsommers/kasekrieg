# integ-lead report

## What I built
- Integration of all wave-1 modules into one game: boots, plays title -> L1..L6 -> victory in headless Chrome with real WebGL.
- `tools/botplay.mjs`: in-page bot (god + keys, BFS over doors, treats world.blocker as impassable). `node tools/botplay.mjs [--levels 1,2] [--max 120]`; all 6 levels reachedExit=true (9-16 s each, 0 errors).
- main.js test hooks `G.audio`, `G.action(a)`.
- `index.html`: `<link rel="icon" href="data:,">` (the single page-load 404 was /favicon.ico).

## Verification evidence
- Stage A-D: see checkpoint history: boot 0 errors; doors/sprites/pushwall/exit switch visually verified; fire/kill/ammo, player damage, pickups, keys+locked door, death->respawn, intermission, next level, victory; audio unlock/listener/bus/pause/options persistence/automap OK.
- Stage E: `node --test test/` 173/173 pass. 60 s demo (god, walking, medium quality, L1): 3599 frames, 0 page errors; frame deltas p50 16.7 ms, p95 16.8, p99 16.8, max 33.4 ms (vsync-capped at 60 fps, so true GPU headroom not measured). After favicon fix: console fully empty.
- Music re-check: all 8 songs loadSong OK, names match playMusic calls (music.js as of 14:59). `docs/swarm/reports/audio-music.md` still did not exist, so final music.js behaviour is only verified at load/name level, not audibly.

## Deviations from the contract
None known.

## Contract changes
- None to defs.js/ARCHITECTURE.md across stages A-E. Only additive: main.js `G.audio`/`G.action` test hooks; index.html data-URI favicon.

## Mistakes I made and how I fixed them
- botplay BFS initially walked into blocking decor; fixed by treating world.blocker cells as impassable.
- Pause menu swallows input for ~0.12 s; tests needed to wait.

## Learnings for a future agent
- `shot.mjs --eval` needs `--wait-for "window.__game&&__game.audio"` or it runs before boot. G.cmd override lasts one frame, set it every rAF. Headless frame time is vsync-bound; use a lower-level timer to measure render cost.

## Requests for other modules
- audio-music owner: write reports/audio-music.md; audible music hookup unverified.
