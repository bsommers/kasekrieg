# app-shell report

## What I built
- `index.html` (stage, `canvas#gl`, 480x270 `canvas#hud`, error overlay), `style.css` (letterboxed 16:9), `src/main.js` (~930 lines).
- Dynamic `import()` of every subsystem in try/catch; failures go to `__game.errors`, console and the on-screen overlay, with built-in fallbacks for settings, input, audio, atlas, font, hud, menus, screens, levels, and a **software raycaster** when the WebGL2 renderer is missing/throws.
- State machine: boot, title (attract camera on live game), menu, levelIntro, playing, paused, intermission, death, gameOver, victory. Fixed 60 Hz step (max 5/frame), rAF render, auto-quality (steps resolution from frame-time EMA).
- Bus wiring: `sfx`/`music` to audio, `flash`/`hurt` to renderer options, `*` to `hud.onEvent`.
- URL params: autostart, level, skill, god, quality, mute, demo, pos, seed. Debug handle `window.__game` per §13.
- Demo bot: BFS exploration biased to unvisited cells, faces and shoots visible enemies, opens doors, stuck-wiggle, heads for the exit switch after 25 s of level time.
- `test/app-shell.test.mjs`, `test/harness.html`, `test/fixtures/mock-game.js` (test-only mock sim on the real `world.js`, since `sim/game.js` was absent).

## Verification evidence
- Headless Chrome via `tools/shot.mjs`: boot with most modules missing degrades (overlay + fallbacks, no blank page).
- Harness with mock sim: autostart+demo plays and clears levels 1-3 in 45 s; title to menu to skill select to play with real `menus.js`; Escape pause/resume; death > gameOver > title; `pos=`, `god=`, `warp()` and `cmd()` verified. `node --test test/app-shell.test.mjs` passes. Real `hud.js` and `menus.js` rendered correctly (screenshots in `out/shots/app-shell/`).
- NOT verified: real `game.js`, `renderer.js`, `audio.js`, `screens.js`, `automap.js` (not present during my run). The WebGL path is untested.

## Deviations from the contract
- `createMenus` also receives `progress` (menus.js accepts it for the CONTINUE state).
- Extra tolerated menu action `{type:'level'}`; `__game.modules` and `__game.params` added.

## Mistakes I made and how I fixed them
- Resuming: found an existing main.js. A failed autostart left state at `boot` forever; fixed so the title is entered when `startGame` fails at boot.
- First bot never finished levels (pure exploration); added exit-seeking.

## Learnings for a future agent
- `shot.mjs` needs `--timeout` above `--wait`. An import map in `test/harness.html` substitutes missing modules without touching owned files.
- Bus `'*'` listeners receive `(type, payload)`.

## Requests for other modules
- renderer: `setOption('flash'|'hurt'|'wobble'|'crt', v)` is how the shell passes fx (flash as `[r,g,b,a]`).
- sim-player: set `game.status` to `'complete'` on exit and `'dead'` on death with `player.dead`; shell restarts the level itself via `loadLevel(idx,{keepPlayer:true})` if status stays `'dead'` and lives > 0.
- hud.js imports `./automap.js` apparently (404 seen) — hud agent should guard it.
