# KÄSEKRIEG: Claws of Marmalade — Architecture & Contracts

This file is the binding contract between all modules. If your module disagrees with it, your module is wrong.
If the contract itself is wrong or ambiguous, do the sensible thing, and record the deviation in your report
(`docs/swarm/reports/<agentId>.md`) so integration can reconcile it.

## 1. Vision

A first-person, grid-based maze shooter in the classic early-90s style, but **original in every asset**: you are
**Major Marmalade**, a big orange tabby cat with nine lives, clawing through **Schloss Gorgonzola**, fortress of
**Das Rattenreich** — an army of rats and mice in WWII-German-style field-grey uniforms who have stolen the
world's cheese. Six levels, a boss ("Der Große Käse"), secrets, treasure, keys.

Pillars:
1. **Ray traced, sparkly, still blocky.** A real-time GPU ray tracer (WebGL2 fragment shader, DDA through the
   grid): hard ray-traced shadows from many coloured dynamic lights, glossy reflections (marble, gold foil,
   mirrors), emissive molten cheese, moonlit courtyards, per-texel glints, bloom with star streaks. Rendered at
   low internal resolution and **texel-locked** (lighting evaluated at 1/64-unit texel centres) so everything
   reads as chunky pixels.
2. **Charm.** Cat + cheese everywhere: paws on screen, nine lives, hairball pistol, yarn bombs, laser pointer
   that mesmerises rats, tuna health, meow button.
3. **Zero assets, zero runtime dependencies.** All art is drawn by code into pixel buffers, all audio is
   synthesised. Plain ES modules, no bundler.

Hard rules for everyone:
- **Originality:** do not copy art, levels, music, names, characters or UI layout from any existing game.
- **Insignia:** the Rat Reich emblem is a **black cheese wedge (with holes) in a white disc on a red field**.
  Never draw swastikas, SS runes or any other real-world Nazi insignia. Uniform silhouettes (stahlhelm, peaked
  cap, field-grey tunic, jackboots, red armband with the cheese emblem) carry the theme.
- Browser code: ES2022 modules, no dependencies, no build step, must run from a static file server and from
  Electron. Sim code (`src/sim`, `src/core`, `src/levels`, `src/art`) must also run in Node (no DOM globals at
  import time).
- Touch only the files you own (§3). Never edit `src/core/defs.js`, `src/art/pixbuf.js` or this file.
- Sim randomness comes from `game.rng` only (never `Math.random`) so runs are reproducible.

## 2. Canonical data: `src/core/defs.js`

All names, legend characters, stats and the art checklist live in `src/core/defs.js`. Read it. Highlights:
`TILE=64`, `LIMITS`, `VIEW` (HUD virtual resolution 480×270, eye height, FOV), `WALLS`, `DOORS`, `FLATS`,
`ENEMIES`, `ITEMS`, `DECOR`, `FX`, `WEAPONS`, `PROJECTILES`, `THINGS` (level legend), `SFX`, `MUSIC`,
`HUD_IMAGES`, `SKILLS`, and `artManifest()` → the exact list of `{name, kind, w, h, frames, module}` every art
module must produce.

## 3. Layout & ownership

```
index.html, style.css, src/main.js      app-shell
src/core/defs.js, rng.js, events.js     orchestrator (frozen)
src/core/input.js, settings.js          core-input
src/art/pixbuf.js                       orchestrator (frozen)
src/art/<module>.js                     one art agent each (modules named in defs.ART_MODULES)
src/art/registry.js                     art-registry
src/render/renderer.js, shaders/*       render-core
src/render/postfx.js                    render-postfx
src/audio/audio.js, sfx.js              audio-sfx
src/audio/music.js, songs/*             audio-music
src/sim/world.js                        sim-world
src/sim/game.js, player.js, weapons.js, items.js     sim-player
src/sim/enemies.js, projectiles.js, effects.js       sim-enemies
src/ui/font.js                          ui-font
src/ui/hud.js, automap.js               ui-hud
src/ui/menus.js, screens.js             ui-menus
src/levels/e1m1.js … e1m6.js            one level agent each
src/levels/index.js, tools/validate-level.mjs        level-tools
tools/shot.mjs, tools/serve.mjs         tool-shot
desktop/**                              desktop-shell (+ native-windows, native-macos scripts under desktop/scripts/)
test/<area>.test.mjs                    whoever owns the area (node --test)
out/previews/<agentId>/, out/shots/<agentId>/   scratch output per agent (shown live on the tracker)
```

## 4. Units & conventions

- Map: `w×h` cells (≤64×64). Sim position `(x, y)` in cell units; `x` east, `y` south (row index). Cell of a
  point: `(Math.floor(x), Math.floor(y))`; cell centre `(cx+0.5, cy+0.5)`. Array index `i = cy*w + cx`.
- Height `h`: floor 0, ceiling 1. Eye height `VIEW.EYE`.
- Angle in radians, direction `(cos a, sin a)`: 0 = east, π/2 = south (clockwise on the map).
- Renderer 3D mapping: `X = x`, `Y = h` (up), `Z = y`.
- Time in seconds. Sim runs at a fixed 60 Hz step (`dt = 1/60`).
- Colours of lights are linear HDR RGB (≈0.5–3).

## 5. Art pipeline

### 5.1 PixBuf (`src/art/pixbuf.js`, frozen — read the file for the exact API)
A `PixBuf(w,h)` holds two byte planes: `rgba` (albedo + alpha) and `mat` (R = emissive, G = gloss/reflectivity,
B = sparkle density, A = 255). Drawing takes **inks**: `ink('#f90', {emit:0, gloss:0.2, spark:0.5})` or a bare
`'#rrggbb'` string. Primitives: `set, get, rect, frame, hline, vline, line, ellipse, ring, poly, blit, outline,
map, noise, setMat, clone, flipX`. Helpers: `shade, mix, ramp, hash2`. Works in Node and browser (no DOM).

### 5.2 Art modules
Each module `src/art/<module>.js` exports `build()` returning `{ [name]: PixBuf | PixBuf[] }` (array = animation
frames) covering exactly its names in `artManifest()`. Deterministic (seeded `hash2`, never `Math.random`).
`build()` must finish in well under 100 ms.
- `kind:'tile'` (walls, doors, flats): 64×64, opaque, **tileable** horizontally (walls) / both ways (flats).
- `kind:'sprite'` (enemies, items, decor, fx): 64×64, transparent background (alpha 0), subject **centred
  horizontally with feet on the bottom row**; hanging decor touches the top row. Hard alpha only (0 or 255),
  except fx glows.
- `kind:'image'` (HUD, weapon view-models): size given in the manifest.

### 5.3 Style guide (all art agents)
Chunky, readable, cheerful-but-menacing 16-bit-era pixel art; 1px dark outline on sprites (not pure black:
`#1a1420`); light from upper-left; 3–4-step shade ramps with hue shifting (shadows cooler, highlights warmer);
no anti-aliasing blur, no gradients-by-noise mush; dithering sparingly. Enemy proportions: head ≈ 1/3 of
height, mice have big round ears, rats long snouts and bare pink tails; sprites face the viewer.
Palette anchors: Marmalade orange `#f08a1c` / stripe `#c25a0e` / cream `#fde3b0`; cheddar `#f2a91e`;
swiss `#f6dc6a`; field grey `#6b7468` / dark `#474e47`; banner red `#c21f24`; steel `#8d98a8`; gold `#ffd23e`;
blue-cheese `#5a78b8`; fondue `#ffb21a` (emissive).
Materials make the ray tracer shine — use them deliberately: `emit` for lamps/flames/molten cheese/muzzle
flashes/eyes; `gloss` for metal, wax, polished stone, glass, wet things (0.15 subtle, 0.5 shiny, 1.0 mirror);
`spark` for gold, crystals, treasure, parmesan, glitter (0.2 occasional glint, 1.0 dazzling).

### 5.4 Self-review loop (mandatory for art agents)
`node tools/sheet.mjs <module> [--scale N]` renders `out/previews/<module>.png` (albedo contact sheet, one row
per name) and `<module>.mat.png` (materials), and prints missing/extra/wrong-size names. **Look at the PNG with
the Read tool and iterate** until every frame is clearly recognisable at 1× and attractive at 3×. Budget at
least three look-and-fix passes.

### 5.5 Registry (`src/art/registry.js`)
`async buildAtlas(onProgress?) → atlas`. Dynamically imports every module in `defs.ART_MODULES` inside
try/catch; any missing/invalid name gets a generated placeholder (hashed colour + checker) and is listed in
`atlas.missing`, so the game always boots.
```
atlas = {
  tiles:   { count, rgba: Uint8Array(count*64*64*4), mat: Uint8Array(same), index: Map<name, layer>, anim: Uint8Array(count) /* frames in the animation starting at this layer, 1 = static */ },
  sprites: { count, rgba, mat, index: Map<name, firstLayer>, frames: Map<name, count> },
  images:  Map<name, PixBuf[]>,        // HUD/view-model art, arbitrary size
  missing: string[],
  tile(name) → layer, sprite(name, frame=0) → layer   // throw-free: unknown names return layer 0 (placeholder)
}
```
Layer order = `artManifest()` order (deterministic). Layer 0 of each array is the placeholder.

## 6. Level format (`src/levels/e1mN.js`, `export default {...}`)

```js
export default {
  id: 'e1m1', name: 'The Cheese Cellar', intro: 'one-line flavour text', par: 120, music: 'level_a',
  wall: 'wall.cheddar_brick',                 // texture for '#'
  floor: 'flat.floor_dirt', ceil: 'flat.ceil_stone',   // defaults for zone '.'
  zones: { a: { floor: 'flat.floor_checker', ceil: 'flat.ceil_lamp_panel' }, k: { floor: 'flat.floor_stone', ceil: 'flat.sky' } },
  ambient: [0.05, 0.045, 0.06],               // base light (keep low — lights do the work)
  fog: { color: [0.02, 0.02, 0.03], density: 0.035 },
  sky: { moonDir: [0.45, 0.8, 0.35], moonColor: [0.55, 0.65, 1.0] },   // only matters with 'flat.sky' zones
  map:    [ "########", ... ],   // tile layer, all rows equal length
  zonesMap: [ "........", ... ], // optional, same size: '.' default or a key of zones
  things: [ "........", ... ],   // same size: '.' or ' ' = nothing, else a char from defs.THINGS
};
```
Tile layer characters: `.` open; `#` or space = level default wall; `A`–`Z` = wall from `defs.WALLS`
(`X` = exit switch: a wall the player *uses* to finish the level); the **lowercase** of a wall letter = a secret
pushwall with that texture (`#` cannot be a pushwall; use a letter); `+` wooden door, `=` steel door, `1` door
locked with the gold key, `2` silver. A door cell needs walls on two opposite sides and open cells on the other
two. A pushwall slides 2 cells directly away from the player, so it needs 2 open cells behind it. The outer
border must be solid. Rules enforced by `node tools/validate-level.mjs src/levels/e1mN.js`, which also checks
reachability with key ordering and writes `out/previews/levels/<id>.png`.

## 7. World (`src/sim/world.js`)

```js
createWorld(levelDef, atlas, bus) → world
world: {
  w, h, def,
  cells:   Uint8Array(w*h),    // CELL.OPEN=0, WALL=1, DOOR=2, PUSH=3 (resting secret wall), EXIT=4 (switch wall)
  wallTex: Uint16Array(w*h),   // tile layer for wall/door/push/exit cells
  floorTex, ceilTex: Uint16Array(w*h),   // ceilTex = defs.SKY (0xFFFF) for open sky
  jambTex: number,             // tile layer of 'door.jamb'
  doors: [{ cx, cy, vertical /* true: slab spans north–south, passage is east–west */, open /*0..1*/, lock /*null|'gold'|'silver'*/, state /*'closed'|'opening'|'open'|'closing'*/, tex, timer }],
  doorAt: Int16Array(w*h),     // door index or -1
  movers: [{ x0, y0, x1, y1, tex }],     // pushwalls in motion (AABB in map units); their cells are OPEN in `cells` while moving but still block movement/sight
  blocker: Uint8Array(w*h),    // 1 = blocking decor (blocks movement only)
  secretsTotal, secretsFound, exitTriggered,
  // queries
  idx(cx,cy), inBounds(cx,cy),
  isSolid(cx,cy),                       // wall/push/exit/out-of-bounds/moving pushwall
  blocksMove(cx,cy, forEnemyPath=false),// solid, blocker, or door with open < 0.8 (forEnemyPath: unlocked doors do NOT block)
  blocksSight(cx,cy),                   // solid or door with open < 0.5
  hazardAt(x,y) → damage per second (from defs.FLATS hazard of the floor),
  castRay(x,y, dx,dy, maxDist) → { hit, dist, x, y, cx, cy, side /*0: hit a west/east face, 1: north/south*/, door /*door|null*/ },
  hasLOS(x0,y0,x1,y1) → bool,
  tryMove(ent /*{x,y,radius}*/, dx, dy, forEnemy=false) → { x, y, hit }   // slides along walls; mutates ent.x/y
  // actions
  use(x,y,angle, keys /*{gold,silver}*/) → { kind:'none'|'door'|'locked'|'pushwall'|'exit', lock? },
  openDoor(door), setBlocker(cx,cy,on),
  update(dt, game),                     // door timers (auto-close after 4 s if the cell is empty of actors), pushwall motion (2 cells at 1 cell/s), emits bus events
  // navigation
  distField(cx,cy) → Uint16Array,       // BFS steps to target through enemy-passable cells (65535 = unreachable); cached until doors/pushwalls change
  nextStep(field, cx,cy) → {cx,cy}|null,
  soundMask(cx,cy, range) → Uint8Array, // cells that hear a noise: flood through non-solid cells, closed doors stop it
}
```
World emits on the bus: `sfx` (door_open, door_close, door_locked, pushwall, switch), `secret`, `exit`.

## 8. Simulation

### 8.1 Bus (`src/core/events.js`): `createBus() → { on(type, fn) → unsubscribe, emit(type, payload) }`
Event types: `sfx {name, x?, y?, vol?}` · `msg {text, kind:'info'|'pickup'|'secret'|'warn'}` · `flash {r,g,b,a}` ·
`hurt {amount, angle /*direction the damage came from, radians, world*/}` · `pickup {id}` · `kill {type}` ·
`secret {}` · `exit {}` · `levelComplete {stats}` · `playerDied {livesLeft}` · `bossDied {}` · `weapon {index}` ·
`music {name}`.

### 8.2 Command (input → sim), a plain object each tick
`cmd = { forward /*-1..1*/, strafe /*-1..1, +right*/, turn /*radians to add this tick*/, run, fire, use /*edge*/, weapon /*-1 or slot 0..4, edge*/, next /*-1,0,1 edge*/, meow /*edge*/ }`

### 8.3 Game (`src/sim/game.js`)
```js
createGame({ atlas, levels, bus, rng, skill }) → game
game: {
  bus, rng, atlas, skill, time, tick,
  levelIndex, world, player,
  enemies: [], projectiles: [], pickups: [], decor: [], effects: [], lights: [] /* static level lights */, beams: [],
  stats: { kills, killsTotal, treasure, treasureTotal, secrets, secretsTotal, time, par },
  status: 'playing' | 'dead' | 'complete' | 'victory',
  loadLevel(index, { keepPlayer }), update(dt, cmd), buildScene(scene) → scene,
  cheats: { god, noclip, noTarget },
}
```
Update order per tick: player → world → enemies → projectiles → items → effects → status checks.
`loadLevel` builds the world, then parses the `things` layer via `defs.THINGS` into enemies / pickups / decor /
lights and registers blockers. Guards and patrols initially face the longest open run of cells.

Drawable entities all carry `spr = { frame /*sprite layer*/, size /*world units*/, h /*bottom height*/, flipX, glow /*0..1 extra emissive*/, alpha }`.

### 8.4 Player (`src/sim/player.js`, `weapons.js`, `items.js`)
`player = { x, y, angle, radius:0.27, health, lives, score, ammo:{hair,yarn,cell}, owned:[bool×5], weapon, wstate:{phase:'ready'|'fire'|'raise'|'lower', t, frame /*view-model frame within current anim*/, anim:'idle'|'fire'}, keys:{gold,silver}, bob, hurtT, dead, deadT, stepT }`
Exports: `createPlayer()`, `placePlayer(game, x, y, angle)`, `updatePlayer(game, dt, cmd)`,
`damagePlayer(game, amount, srcX, srcY)`, `healPlayer(game, amount, max)`, `giveItem(game, itemId) → bool`
(false if it cannot be picked up, e.g. health full), `fireWeapon(game)`.
Nine lives: on death lose a life; with lives left the level restarts keeping score/weapons-at-level-start; at
zero → game over.

### 8.5 Enemies (`src/sim/enemies.js`), projectiles, effects
`enemy = { type, def, x, y, angle, radius, hp, state:'stand'|'patrol'|'chase'|'attack'|'pain'|'stun'|'die'|'dead', t, alerted, spr, ... }`
Exports: `spawnEnemy(game, type, x, y, { patrol })`, `updateEnemies(game, dt)`,
`damageEnemy(game, enemy, amount, { stun, fromX, fromY }) → boolean` (true if this hit killed the enemy), `pickEnemyOnRay(game, x, y, dx, dy, maxDist) → { enemy, dist } | null`
(nearest living enemy whose body the ray hits before any wall), `enemiesInRadius(game, x, y, r) → enemy[]`,
`makeNoise(game, x, y, range, source?)` (alerts enemies that can hear it; optional `source` is the emitting entity).
Kills and score are counted by `enemies.js` itself (no listener elsewhere may count them again). Enemy damage to the
player goes through `game._hooks.damagePlayer` -> `player.damagePlayer` -> built-in fallback. `enemies.js` must not
import `game.js` (module-load hang); reach other systems through `game.sys` / `game._hooks`.
`projectiles.js`: `spawnProjectile(game, kind /*key of defs.PROJECTILES*/, x, y, h, angle, owner /*'player'|enemy*/)`, `updateProjectiles(game, dt)`.
`effects.js`: `spawnFx(game, name /*key of defs.FX*/, x, y, h, { size, life, vx, vy, vh, light })`, `updateEffects(game, dt)`,
`addBeam(game, {x0,y0,h0,x1,y1,h1,r,g,b,width,life})`.
AI: sight (LOS + facing cone unless alerted) and hearing; reaction delay; chase via `world.distField` flow to the
player; open doors; attack with wind-up (telegraphed — never instant unavoidable damage); pain flinch; death
drops `def.drop`. Boss has phases (see defs). Laser stuns ("mesmerised") instead of flinching.

### 8.6 Scene (sim → renderer), filled by `game.buildScene(scene)`
```js
scene = {
  time,
  cam: { x, y, h, angle, fov, roll },
  world,                                    // renderer re-reads cells/doors/movers every frame (tiny)
  sprites: [{ x, y, h, size, frame, flipX, glow, alpha }],   // ≤ LIMITS.SPRITES, culled to those near/visible
  lights:  [{ x, y, h, r, g, b, radius }],                   // ≤ LIMITS.LIGHTS, nearest/brightest first; flicker already applied
  beams:   [{ x0,y0,h0, x1,y1,h1, r,g,b, width }],           // ≤ LIMITS.BEAMS
  ambient: [r,g,b], fog: { color:[r,g,b], density }, sky: { moonDir, moonColor } | null,
  viewLight: [r,g,b],                       // approximate light at the player, for tinting the 2D view-model
}
```

## 9. Renderer (`src/render/renderer.js`)

```js
createRenderer(canvas, atlas, { quality }) → renderer        // throws Error('WEBGL2_UNAVAILABLE') if no WebGL2
renderer: { render(scene), resize(), setQuality(q /*'low'|'medium'|'high'|'ultra'*/), setOption(key, value), stats: { ms, width, height, renderer /*GL string*/ }, dispose() }
```
Internal resolutions: low 320×180, medium 480×270, high 640×360, ultra 960×540; nearest-neighbour upscale.
Must trace, per pixel: walls (DDA), floors/ceilings, sliding doors (thin slab at the cell centre + `door.jamb`
on the neighbouring wall faces), moving pushwalls (`world.movers` AABBs), camera-facing sprite billboards
(perpendicular to the camera forward vector; alpha-tested), sky. Lighting: ambient + ≤24 point lights with
ray-traced shadows (walls, doors, **and sprites**), moonlight through `flat.sky` cells, emissive texels, one
reflection bounce weighted by `gloss` (sprites and lights visible in reflections), per-texel `spark` glints that
twinkle with view angle and time, distance fog, beams as glowing volumetric lines. Texel-locked shading.
Animated tiles: `layer + floor(time*6) % atlas.tiles.anim[layer]`.
Lighting constants (polish-global, `docs/swarm/LIGHTING.md`): `src/sim/game.js` `buildScene` scales all level, decor and
pickup lights by `LIGHT_RADIUS_SCALE = 1.4` and `LIGHT_GAIN = 1.0`; default exposure in `src/render/renderer.js` is 1.35.
Target mean luma of a start view is about 0.2-0.3 (measured 0.28 at the E1M1 start, 0.31 guard room, 0.22 Great Cellar).
Performance target: 60 fps at medium on an integrated GPU, with 96 sprites and 24 lights — build per-frame
acceleration data on the CPU (e.g. per-cell sprite and light lists in a small data texture).

`src/render/postfx.js`: `createPostFX(gl) → { resize(w, h, outW, outH), target /*FBO to render the HDR scene into (RGBA16F, w×h)*/, draw({ time, exposure, bloom, crt, flash:[r,g,b,a], hurt /*0..1 red vignette*/, wobble /*0..1 catnip/death warp*/ }), dispose() }`
— bloom with 4-point star streaks on the brightest texels, filmic tonemap, subtle ordered dither, optional
scanline/CRT, nearest-neighbour upscale to the default framebuffer. The renderer owns the frame: it binds
`postfx.target`, traces, then calls `postfx.draw(opts)` using values set via `renderer.setOption`.

## 10. Audio (`src/audio/`)

```js
createAudio() → audio
audio: { unlock() /*call from a user gesture*/, sfx(name, { x, y, vol }?), setListener(x, y, angle), music(name|null), setVolume({ master, sfx, music }), suspend(), resume(), ready }
```
`sfx.js`: every name in `defs.SFX`, synthesised with WebAudio (no samples). Positional sounds: equal-power pan
from listener-relative angle + distance attenuation. Unknown names are a silent no-op. Everything must be a
no-op without throwing when `AudioContext` is unavailable (Node, headless).
`music.js`: `createMusic(ctx, destination) → { play(name), stop(), setVolume(v), current }` — an original
tracker-style chiptune engine with one song module per `defs.MUSIC` name in `src/audio/songs/<name>.js`.
Seamless looping, ~250 ms crossfade on change.

## 11. Input & settings (`src/core/`)

`createInput(canvas) → { poll() → cmd (§8.2), menu() → { up, down, left, right, accept, back, pause, map } (edges), requestLock(), locked, sensitivity, dispose() }`
Keys: WASD/arrows move+turn, mouse turn (pointer lock), Shift run, Ctrl/LMB fire, Space/E use, 1–5 weapons,
wheel/Q next weapon, M meow, Tab automap, Esc/P pause. Gamepad supported if cheap.
`settings.js`: `loadSettings() / saveSettings(s)` (localStorage, try/catch, defaults): `{ quality:'auto', sensitivity:1, volume:{master:.8,sfx:.9,music:.6}, fov:1.5, crt:false, showFps:false, skill:1 }` and `loadProgress()/saveProgress()`.

## 12. UI (`src/ui/`) — everything draws into the 480×270 `#hud` canvas (2D, pixelated)

`font.js`: `drawText(ctx, text, x, y, { scale=1, color='#fff', shadow='#000'|null, align='left'|'center'|'right' })`, `measureText(text, scale) → px`; built-in 5×7 bitmap font incl. ÄÖÜäöüß and punctuation.
`hud.js`: `createHud(atlas) → { draw(ctx, game, dt), onEvent(type, payload) }` — original layout (not a copy of any
game's status bar): cat portrait + health bottom-left, ammo/weapon bottom-right, score + nine life pips
top-left, keys + level name top-right, view-model paws bottom-centre (128×128 `wpn.*` images, bobbing, tinted
by `scene.viewLight`), crosshair, messages, damage-direction arcs, pickup/hurt flashes.
`automap.js`: `drawAutomap(ctx, game)` — explored cells only.
`menus.js` / `screens.js`: `createMenus({ atlas, audio, settings }) → { open(name), update(dt, menuInput) → action|null, draw(ctx, t), active }`
with menus `title, main, skill, options, controls, pause`; actions `{type:'new', skill} | {type:'continue'} | {type:'resume'} | {type:'quit'} | {type:'option', key, value}`.
`createScreens({ atlas }) → { show(name, data), update(dt, menuInput) → 'done'|null, draw(ctx, t) }` with screens
`levelIntro, intermission /*kills/treasure/secrets/time tally*/, death, gameOver, victory`.

## 13. App shell (`index.html`, `style.css`, `src/main.js`)

DOM: `#stage` (letterboxed 16:9) containing `canvas#gl` (WebGL2, `image-rendering: pixelated`) and
`canvas#hud` (480×270 backing store, stretched over the stage, pixelated).
States: `boot (art build + progress) → title (live ray-traced attract camera) → menu → levelIntro → playing ⇄ paused → intermission → … → victory`, `death → retry | gameOver`.
Fixed-step sim (60 Hz, max 5 steps per frame), render every rAF; `quality:'auto'` steps resolution down/up from
measured frame time. Wires bus `sfx`/`music` → audio, bus → hud.
URL params (for tools and smoke tests; must work without any user gesture): `autostart=1` (skip menus),
`level=1..6`, `skill=0..3`, `god=1`, `quality=…`, `mute=1`, `demo=1` (a simple bot plays: wander, face and shoot
visible enemies, open doors), `pos=x,y,angleDeg` (teleport after load), `seed=n`.
Debug handle: `window.__game = { ready /*true once a level is rendering*/, state, game, renderer, errors: [], fps, start(level, skill), cmd(partial) /*override input for one tick*/, warp(x,y,angleDeg) }`.
Uncaught errors and unhandled rejections are pushed to `__game.errors` and shown in an on-screen error overlay.

## 14. Desktop (`desktop/`) — Electron shell, built natively on each OS

`desktop/package.json` (electron + packager as devDependencies — the game itself stays dependency-free),
`desktop/main.cjs` (serves the game from a privileged `app://` protocol; fullscreen toggle F11; no menu bar),
`desktop/build.mjs --platform linux|win32|darwin --arch x64|arm64` (stages `index.html, style.css, src/` into the
app and packages into `dist/`). Smoke mode: `<binary> --smoke=<dir>` loads
`?autostart=1&level=1&demo=1&mute=1&quality=low`, waits for `__game.ready` plus 5 s, writes `<dir>/smoke.json`
(`{ ok, gl, fps, errors, platform, arch }`) and `<dir>/smoke.png` (via `capturePage`), exits 0/1. In smoke mode
enable software GL fallbacks (`enable-unsafe-swiftshader`, `ignore-gpu-blocklist`) so GPU-less VMs work.
Build hosts: Linux here; Windows in the VM (`cd ~/src/infra/win-devvm && ./vm.sh ssh|push|pull`);
macOS on `ssh user@macbuild.local` (Apple Silicon; ad-hoc codesign the bundle).

## 15. Tooling

- `node tools/sheet.mjs <artModule>` — art contact sheets (§5.4).
- `node tools/validate-level.mjs <file>` — level validation + PNG preview (§6).
- `node tools/shot.mjs --url "/index.html?autostart=1&level=1" --out out/shots/<agentId>/x.png [--size 1280x720] [--wait-for "<js expr>"] [--wait ms] [--eval "<js expr>"] [--keys "w:800,ArrowLeft:300"] [--strict]`
  — starts its own static server, drives headless Chrome on the real GPU (`--use-angle=vulkan
  --enable-features=Vulkan`) over the DevTools protocol, saves a screenshot, prints console output, page
  errors and the eval result as JSON; `--strict` exits 1 on any page error.
- `node tools/serve.mjs [port=4781]` — static dev server for humans.
- `node --test test/` — unit tests (sim must be testable headless).
- Tracker: `node tools/track.mjs <agentId> <start|progress|done|blocked|failed|note> [pct] "<msg>"` and
  `node tools/track.mjs --check <name> <pass|fail|running|skip> "<detail>"`. Dashboard: http://127.0.0.1:4780/
