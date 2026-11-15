# Integration notes (collected by the orchestrator from the wave-1 reports)
Each line is a cross-module fact or an unverified claim. Fix or verify each; tick it off in your checkpoint.

## App shell (`src/main.js`)
1. Call `input.poll()` AND `input.menu()` every frame; set `input.sensitivity` from settings.
9. The shell was only tested against `test/fixtures/mock-game.js` — the real WebGL path is untested.
10. Forward bus events `msg, hurt, pickup, flash, weapon, secret, playerDied` to `hud.onEvent`; draw the automap after `hud.draw`.
11. Menus return volume as ONE option action `{master,sfx,music}`. Extra API: `menus.close()`, `menus.current`, `screens.active`, confirmQuit.
13. `audio.unlock()` on the first user gesture; `audio.setListener(x,y,angle)` every frame.
14. `boss_fire` and `enemy_smg` are single-shot sounds — play once per shot.

## Renderer ↔ sim
2. Door slab geometry must match the comment block at the top of `src/sim/world.js`; draw `world.movers` (pushwalls);
   the exit switch animates by swapping to `exit_switch+1` (consecutive atlas layers).
6. Bind `postfx.target`, set the viewport to w×h before tracing, call `postfx.resize(w,h,canvasW,canvasH)` on size change.
21. Until render-core landed the game only ran on the soft-view fallback — lighting on real levels is unseen.
23. Enemies, boss, fx, decor and item sprites have never been seen in the real renderer.

## Sim
3. `game.js` must call `world.setBlocker` for blocking decor and pass `game` into `world.update`.
19. Rule choices: death restores level-start score + weapons; lives decrement at death (9 deaths = game over); god mode emits no `hurt`.
20. `enemies.js` must NOT import `game.js` directly (module-load hang).
22. sim-enemies contract changes: `damageEnemy` returns a killed bool; `makeNoise` takes an optional `source`;
    `enemies.js` counts kills + score itself; player damage path = `game._hooks.damagePlayer` → `player.damagePlayer` → fallback.
25. Infantry attack anim: frame 1 is the ONLY muzzle-flash frame (flick 1↔0 for the trooper burst). Do not spawn
    dropped-gun sprites for corpses (gear is drawn in the `dead` frame).
27. `docs/swarm/reports/art-weapons.md` has a fire-frame timing note for the player weapon view-model.

## Levels
5. The validator ignores player radius and blocking decor — playtest for squeeze points.
15. Level lighting and balance are untuned in the real renderer.

## Unverified claims to re-check
7/16. Re-run `node --test test/` — some agents never saw their pass count.
12/29. HUD + menus were laid out against placeholder art; check sizes/anchors against the real `src/art/hud.js` and
       `src/art/weapons.js`. The font has no degree sign.
17. Panzer rat material sheet unchecked. 18. `decor.mat.png` unopened.

## Polish list (not for integration — leave for the polish wave)
4 fortress walls had one review pass · 8 `flat.floor_gold` busy at 1×, postfx dither unverified, cheese-wall seams
only checked numerically · 15 SFX never listened to · 17 sewer rat plush, die frames blobby · 24 `fx.fur` weak ·
26 mouse pistol / officer luger hard to read at 1× · 28 level-2 rooms are plain rectangles.
· 30 level-4 rooms are plain rectangles too; untested whether chandelier/candelabra decor blocks movement or patrol paths.
· 31 (orchestrator, from out/shots/integ-lead/a1.png) the level-1 start room is far too dark on the real renderer — ceiling
and floor are nearly black, none of the sparkle from the renderer demo shows. Needs more/brighter lights or a higher
ambient floor; check every level's start view for the same.
