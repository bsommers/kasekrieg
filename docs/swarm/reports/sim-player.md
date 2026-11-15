# sim-player report

## What I built
- `src/sim/game.js`: `createGame({atlas, levels, bus, rng, skill})` follows §8.3. `loadLevel(index, {keepPlayer})` builds the world and reads the `things` layer into the player start, enemies, pickups, decor (it registers blockers) and static lights. Enemies face the longest open run of cells (`longestRunAngle`). The update order matches the contract: player → world → enemies → projectiles → items → effects → status. A level is `complete` when the exit switch is used, or `victory` on the last level; a level with no exit completes 3 s after `bossDied`. Kills and score are counted by `enemies.js`, not here. `buildScene(scene)` does the following:
  - culls sprites at 26 cells, then ranks them by distance with penalties for being behind the camera or out of line of sight, and caps them at 96. Out-of-sight sprites stay in the list but rank last, so they can still cast shadows and show in reflections.
  - applies flicker to lights; a flicker of 1.0 is treated as a rotating beacon. It adds lights for glowing pickups, projectiles, fx, the muzzle flash, the laser dot, and a faint fill light around the player. Lights are ranked nearest/brightest first and capped at 24.
  - copies beams, capped at 4.
  - computes `viewLight` (ambient plus each light in line of sight with quadratic falloff, plus moonlight when standing under sky) and sets `game.scene` and `game.viewLight` for the HUD.
- Sibling modules: `enemies.js`, `projectiles.js` and `effects.js` are loaded with a top-level-await dynamic import inside try/catch. All calls go through `game.sys`, which falls back to small built-in stand-ins if a module is missing. `moduleStatus` reports which modules loaded.
- `src/sim/player.js`: movement with exponential acceleration and friction (walk 3.4, run 5.6 cells/s, about 0.25 s to reach top speed, about 0.3 s to stop). Velocity into a wall is cancelled so the player slides without sticking. It also handles:
  - head bob (`bob` is the phase in cycles, plus `bobAmp` and `camH`) and a slight roll when strafing
  - use, with a message when a door is locked
  - meow, which makes a noise radius of 7
  - fondue hazard damage and catnip overheal decay
  - `damagePlayer`: skill scaling and god mode; on death it removes a life, emits `playerDied` and sets status `dead`
- `src/sim/weapons.js`: state machine with raise 0.16 s, lower 0.12 s, and fire frames derived from `period`. Taps are buffered for 0.18 s and auto weapons keep exact cadence. Weapon kinds: claws (melee with a ±35° cone), pistol and gatling (hitscan with spread and gentle damage falloff past 10 cells), yarn launcher (projectile spawned clear of walls), laser (continuous beam that drains ammo by fraction, stuns, and adds a beam and dot). Running out of ammo plays `no_ammo` and switches to the best weapon that can fire.
- `src/sim/items.js`: `spawnPickup`, `resolveDrop` (`gatling|ammo_clip` gives the weapon the player is missing first), `dropItem`, `giveItem` and `healPlayer` (refuses health when full, caps ammo, keys, treasure, lives, and switches to a newly picked-up weapon). It also handles walk-over collection, one-shot mousetraps and decor frame animation.
- `test/game.test.mjs`: 22 tests.

## Verification evidence
- `node --test test/` → 145/145 pass, 22 of them mine. They cover parsing, movement and walls, bob, pistol, gatling, switching, out of ammo, items, pickups by walking, drops, damage scaling, god mode, death and restart, next level, use/exit/victory, hazards and traps, combat, scene limits, flicker, determinism and partial commands.
- A scratch fight script against the real `enemies.js`, `projectiles.js` and `effects.js` kills a trooper with each of the 5 weapons in 85–133 ticks.
- Cost on e1m1 (19 enemies, 47 pickups, 45 decor, 28 lights): 0.016 ms per update tick and 0.05 ms per `buildScene`.
- Browser (`tools/shot.mjs`, level 1): the game plays, the player moves and fires, and the scene is filled. The only page error is the missing `src/render/renderer.js`, which is not my file; the game ran on the soft-view fallback. Screenshots are in `out/shots/sim-player/`.

## Deviations from the contract
- Restarting after a death restores the level-start snapshot: score, ammo, owned weapons and current weapon, with health set to 100. I read "keeping score/weapons-at-level-start" as both being level-start values, so points can't be farmed by dying.
- Lives go down at the moment of death, so `player.lives` is the number left. Nine deaths means game over.
- `giveItem`, `healPlayer` and `fireWeapon` are implemented in `items.js` and `weapons.js` and re-exported from `player.js`.
- Extra player fields: `vx, vy, speed, bobAmp, camH, roll, flashT, laserDot, catnipT, levelStart, pendingWeapon`. Extra game fields: `sys`, `_hooks.damagePlayer`, `scene`, `viewLight`, `hasSky`, `hasExit`.
- God mode emits no `hurt` event, so the screen gives no red feedback while it's on.

## Mistakes I made and how I fixed them
- An operator-precedence bug in the `switchWeapon` guard (`!force && A || B`). I caught it in review and added parentheses.
- My first `kill` listener counted kills and score, but `enemies.js` already does both, so every kill counted twice. I removed the listener; only the fallback counts kills now.
- Shooting a wall at point blank put a spark fx 0.2 units from the camera, and it filled the screen (it showed up magenta in a screenshot). Wall sparks are now skipped when the wall is within 0.45, and `buildScene` drops fx within 0.3 of the camera.
- Some test expectations were wrong: not enough walk ticks, a player placed inside the exit cell, and the muzzle-light count not allowing for the spark's own light.

## Learnings for a future agent
- Put cross-module calls on the game object (`game.sys`) instead of importing them. Only `game.js` uses top-level await, so cycles between modules with top-level await can't deadlock.
- The HUD derives bob from player position and reads `game.scene.viewLight`. `main.js` handles death by calling `loadLevel(i, {keepPlayer:true})` and expects `player.lives` to already be decremented.

## Requests for other modules
- render-core: `src/render/renderer.js` is still missing. The scene contract is filled: `cam.h` includes bob and `cam.roll` is set.
- sim-enemies: please never statically import `game.js`, because that would create a top-level-await cycle. Your `hurtPlayer` already uses `game._hooks.damagePlayer`, which I set.
- art (fx module): `fx.*` sprites are still placeholders.
