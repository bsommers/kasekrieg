# LIGHTING — recipe for level-polish agents (reference: level 1)

## What was wrong (measured, not guessed)
- Scene lights, ambient, fog and quality in-game matched the demo: lights DID reach the renderer (11 of 29 per view).
- Real causes: (1) default floor/ceiling flats are dark and matte (`floor_dirt` lum .24 gloss 0, `ceil_stone` lum .20),
  so no reflections or glints; (2) light falloff `(1-x)^2/(1+5x)` is steep, radii in defs are tight, and rooms had
  1 light per ~50 cells; (3) tone-map exposure 1.0 put dim-lit dark albedo in the ACES toe (mean luma 0.04).
## Fixed globally (do not re-fix per level)
- `src/sim/game.js`: `LIGHT_RADIUS_SCALE = 1.4` (and `LIGHT_GAIN = 1.0`) apply to level light things, decor lights
  and pickup lights in `buildScene`. Dynamic fx/projectile/muzzle lights are untouched.
- `src/render/renderer.js`: default `post.exposure` 1.0 -> 1.35.
## Recipe
- Per room: one real light source per ~25-35 open cells; big halls (>80 cells) 3-4. Keep the player START view
  inside at least one light's radius (x1.4 scaled) - the start room needs a `!` or lamp in sight.
- Light things: `H` chandelier (warm 2.2/1.8/1.2, r5.5, hangs), `L` floor_lamp (warm), `c` candelabra (orange, flickers),
  `Q` cauldron (molten orange, r5), `g` glow_cheese (green accent), `q` alarm_light (red), `!` invisible fill
  (1.8/1.5/1.1, r5, h0.8). Pickups with `light` also glow. Max 16 lights per cell are honoured, 6 at medium quality.
- Colour mood: mostly warm amber; one cold accent (blue/green) per area; red only for alarm/danger rooms.
- Shadows are automatic (hard ray-traced) - place lights beside pillars/crates/barrels to cast them. Lights flood only
  through open cells, so a light behind a wall does not light the room next door; a shut door stops it.
- Reflections need floor `gloss` >= 0.10 (medium). Glossy flats: `floor_checker` .61, `floor_gold` .46,
  `floor_wood` .26, `floor_cheese_tile` .19 (bright, lum .65 - blows out under 2+ lights), `floor_grate` .31.
  Matte (avoid for hero rooms): `floor_dirt`, `floor_carpet`, `floor_stone` (.05).
- Wall glints/gloss: `wall.gold_foil` (spark .70), `wall.parmesan_block` (spark .20), `wall.wax_rind` (.72),
  `wall.mirror` (.66), `wall.steel_plate`/`pipes` (.4), `wall.trophy`, `wall.wood_portrait`. Floor glints: `floor_gold`
  (spark .81), `floor_checker`. Ceilings: `ceil_panel` .47, `ceil_lamp_panel` .41 (emissive), `ceil_wood` .17 (dark, good mood).
- Level 1 example: start room zone `w` (wood floor+ceiling) + one `!` + candelabra = dim, glossy, warm (mean luma ~0.28).
  Guard room (zone `c` cheese tile) ~0.31, Great Cellar ~0.22. Target mean luma 0.18-0.30, <10% pixels over 0.6.
- Per-level `ambient` stays tiny ([0.05,0.045,0.055]); do not raise it - flatten the mood. Add lights instead.
## Screenshot a level at a position and angle (x, y in cells; deg 0 = +x/east, 90 = +y/south)
`node tools/shot.mjs --url "/index.html?autostart=1&level=N&pos=X,Y,DEG" --wait 2500 --out out/shots/<you>/name.png`
(add `&quality=high` for the reflections the player gets on good GPUs; default is medium). Add
`--eval "JSON.stringify(__game.game.lights.length)"` for numbers; `__game.game.buildScene({})` returns the scene.
Validate/preview the map: `node tools/validate-level.mjs src/levels/e1mN.js`.
## Pitfalls
- Zone chars in `zonesMap` change BOTH floor and ceiling; bright zones (`c` cheese tile + `ceil_cheese`) clip to yellow.
- Do not edit `ambient` per level to fix a dark view; check light LOS (lights behind walls do nothing).
- The `!` light is fixed-strength: two of them in a 8x5 room is already too bright on cheese flats.
- Numbers before pictures: mean luma of the shot (see report) catches blown-out or black views cheaply.
- Looking straight into a lamp triggers bloom/star streaks - fine, but check the HUD stays readable.
