# ui-hud report

## What I built
- `src/ui/hud.js` (already present from an interrupted earlier run; I resumed, reviewed and adjusted layout): `createHud(atlas) -> { draw(ctx, game, dt), onEvent(type, payload), state }`. Score plaque + nine life pips (top-left), level name + gold/silver key slots (top-right), cat portrait in cheese medallion + health number + 10-segment cheese bar (bottom-left; catnip overflow glows green), weapon icon/name/slot pips/ammo/gauge (bottom-right), bobbing 128px view-model at 1.5x tinted by `scene.viewLight`, crosshair, damage-direction arcs, message ticker (dedupes repeats, "SECRET!" scale 2), edge flashes. Also exports `createImageCache`, `text`, `textWidth`. Falls back to canvas-drawn placeholders for any `hud.*`/`wpn.*` image listed in `atlas.missing`, and to canvas text when `font.js` is absent.
- `src/ui/automap.js`: `drawAutomap(ctx, game)`, `markExplored(game)` (called by hud.draw each frame; LOS reveal radius 6, per-world WeakMap), plus `revealAll`, `resetExplored`, `getExplored`. Shows walls, doors (gold/silver/steel/wood tint, open amount), exit, player arrow, kills/treasure/secrets footer. Pushwalls look like walls; enemies/items never shown.
- `src/ui/hud-demo.html`: mock game cycling health tiers, weapons 0-4, ammo, keys, messages, hurt arcs, pickups, death. Live loop by default; `?t=<sec>` renders a deterministic frame, `?automap=1` the map. `window.__demo.ready/errors/render(t,{automap})`.
- `test/ui-hud.test.mjs` (2 tests, pass).

## Verification evidence
`node --test test/ui-hud.test.mjs` passes. Headless Chrome via tools/shot.mjs at 1440x810 (480x270 x3): viewed t=1.6, 3.8, 7.0, 8.5 and automap; saved in `out/shots/ui-hud/`, copies in `out/previews/ui-hud/{hud,automap}.png`. No page errors. Real hud/weapons art did not exist yet, so all verification used the built-in placeholders.

## Deviations from the contract
- `draw()` returns nothing but the hud object also exposes `state`. `hud.draw` calls `markExplored` itself; the shell must call `drawAutomap` AFTER hud.draw (or instead of it) when Tab is held.
- Raise/lower slide assumes ~0.2 s per phase since the HUD cannot know durations.

## Mistakes I made and how I fixed them
- First screenshot: "HEALTH" label collided with the 100 number and "HAIRBALL PISTOL" overflowed its plaque; widened both plaques (112 / 138 px).
- Demo held a stale player reference after `Object.assign(game, ...)`, so score never animated; now resets in place.
- Automap backdrop was too transparent over the HUD and the arrow too big; alpha 0.93, arrow radius cs*0.5.

## Learnings for a future agent
- registry fills missing images with a checker placeholder; HUD must consult `atlas.missing` to prefer its own placeholders.
- Bitmap font advance is 6 px: budget text widths as chars*6*scale.
- Dead face uses frame 21 but placeholder just shows closed eyes.

## Requests for other modules
- app-shell: call `hud.onEvent` for bus `msg, hurt, pickup, flash, weapon, secret, playerDied`; draw automap after hud when Tab is held.
- sim-player: set `player.wstate.frame` within the fire anim and `scene.viewLight`/`game.viewLight` for tinting.
- art-hud / art-weapons: once present, re-check the portrait/medallion fit (32x32 face at mx-16,my-16) and paw alignment (view-model drawn 192px, offset +24 x).
