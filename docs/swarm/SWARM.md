# Swarm manifest — KÄSEKRIEG

Single source of truth for the agent swarm. `node tools/swarm-plan.mjs` turns this file into
`docs/swarm/prompts/<id>.md` (preamble + task + role appendix) and `.tracker/plan.json`.
Agent header: `## id | model | phase | role | Name`, then an `owns:` line, then the task.
Spawn each agent with: "Read /home/bill/src/fun/duum/docs/swarm/prompts/<id>.md and execute it exactly."

## @preamble
You are subagent `{{id}}` ({{name}}) in a large parallel swarm building **KÄSEKRIEG: Claws of Marmalade** — a
ray-traced, blocky, cheese-themed maze shooter — in `/home/bill/src/fun/duum`. Model tier: {{model}}.

Rules:
1. `ARCHITECTURE.md` and `src/core/defs.js` are the binding contract. Read only what your task needs: list the
   sections (`grep -n '^## ' ARCHITECTURE.md`), Read those with offset/limit, and grep `src/core/defs.js` for your
   names instead of reading it whole.
2. You own ONLY: {{owns}}. Besides those you may write your tests under `test/`, your report, and scratch output
   under `out/previews/{{id}}/` and `out/shots/{{id}}/`. Other agents are writing the other modules **right now**:
   their files may be missing or half-written. Code against the contract, guard with fallbacks, and never edit or
   "fix" a file you do not own — put what you need under "Requests" in your report.
3. Progress reporting (drives a live dashboard the user is watching): first
   `node tools/track.mjs {{id}} start "<plan in a few words>"`; then
   `node tools/track.mjs {{id}} progress <pct> "<what just landed>"` at 4 or more milestones; finally
   `node tools/track.mjs {{id}} done "<one-line result>"` (or `blocked` / `failed` with the reason).
4. Verify for real before claiming done: run it, test it, look at it. Report failures honestly.
5. If you must wait for another agent's file, poll (`for i in $(seq 90); do [ -f <path> ] && break; sleep 10; done`),
   then proceed with a fallback if it still is not there.
6. Finish by writing `docs/swarm/reports/{{id}}.md` with sections: **What I built** · **Verification evidence** ·
   **Deviations from the contract** · **Mistakes I made and how I fixed them** · **Learnings for a future agent** ·
   **Requests for other modules**. Be specific — these reports are studied later.
7. Keep chat output minimal (status lines only). Final reply: 8 lines max.
8. Save work to disk early and often — the swarm can be interrupted by usage limits. If your owned files or scratch output already exist, you are RESUMING: inspect them and continue instead of starting over.
9. No npm dependencies (except inside `desktop/`). No git commands. Never kill processes you did not start.
   Scratch files go in `/tmp/claude-1000/-home-bill-src-fun-duum/0ad46408-4953-474d-83ed-fbee50d6a7dd/scratchpad/{{id}}/`.

10. Context budget — your whole context is re-sent on every tool call, so keep it small: read files with
   offset/limit or grep, never whole large files; pipe command output through `tail`/`grep` (40 lines max); look at
   an image only when you will act on what you see (about 6 image reads in total — prefer numeric checks); never
   re-read a file you just wrote.
11. Checkpoints — keep `docs/swarm/progress/{{id}}.md` (30 lines max: **Done** · **Next steps, in order** ·
   **Gotchas** · **Commands to verify**) and update it at every milestone. If that file exists when you start, you
   are a fresh agent continuing the job: read it first, trust it, do not re-derive. After about 25 tool calls, or at
   a milestone with substantial work still left, update the checkpoint and END your turn with a last line
   `CONTINUE: <next step>` — a new agent with a clean context will pick it up. Only write the report and call
   `track.mjs ... done` when the whole task is finished.

Your task:

## @role:art
Art rules (mandatory): ARCHITECTURE §5.2–5.4. Produce exactly the names `artManifest()` lists for your module
(print them with `node -e "import('./src/core/defs.js').then(d=>console.log(d.artManifest().filter(a=>a.module==='<module>')))"`).
Run `node tools/sheet.mjs <module>` and **look at `out/previews/<module>.png` with the Read tool** after every
significant pass — at least three look-and-fix passes, plus one look at `<module>.mat.png`. Be a harsh art
director: is each frame recognisable at a glance? is the silhouette strong? light from upper-left? outline
complete? on-palette? do animation frames read as motion rather than noise? If a frame looks like a blob, redraw
it. Build small parametric helpers so frames stay consistent. Use materials (emit / gloss / spark) deliberately —
the ray tracer makes them glow, reflect and glitter. No real-world Nazi insignia; the emblem is the cheese wedge.
Done means: `sheet.mjs` prints OK and you would be proud to ship every row.

## @role:level
Level rules: ARCHITECTURE §6 and the legends in `defs.js` (`WALLS`, `DOORS`, `FLATS`, `THINGS`). Size 28–48 cells
per side. Design for fun: a clear critical path with loops rather than dead ends; 4–7 distinct rooms/areas, each
with its own wall + zone identity and lighting mood; light sources placed deliberately (pools of coloured light,
dark corners, 12–40 light-emitting things — lighting is the star of this renderer); at least 3 secrets (pushwalls
hiding treasure, ammo, health or a weapon); enemies at sensible posts and patrols with difficulty ramping along
the path; pickups paced so a careful player survives on "Alley Cat". The exit switch `X` is reachable only at the
end. Start with a comment block describing the intended walkthrough, key/door gating and where each secret is.
Validate with `node tools/validate-level.mjs src/levels/<id>.js` (agent `level-tools` is writing it concurrently:
draft first, poll for the tool, then fix every error and study the PNG it writes to `out/previews/levels/`).
Every row of `map`, `zonesMap` and `things` must have identical length — count carefully.

## @role:lvlpolish
You are polishing ONE finished level so it looks and plays great on the real ray tracer. First read
`docs/swarm/LIGHTING.md` (the lighting recipe and how to take screenshots at a chosen position) and the header
comment of your level file. Then, in this order:
1. **Look:** take the start view and two other key rooms (3 screenshots). Apply the lighting recipe until each is
   readable, colourful and sparkly — no near-black floors or ceilings, light pools with visible shadows, emissive
   decor and glints in view. Re-shoot only the views you changed.
2. **Shape:** where a room is a bare rectangle, break it up with alcoves, pillars, wall stubs, decor clusters or a
   change of wall/floor texture. Keep the walkthrough and all key/door gating intact.
3. **Fit:** no squeeze points narrower than one free cell next to blocking decor on the main route.
4. **Economy (numbers, no playtest):** with a small script sum enemy hit points vs the damage available from
   placed ammo, and placed healing vs enemy count; fix gross shortages or gluts (skill 2 as the baseline).
5. **Gates:** `node tools/validate-level.mjs <file>` OK and `node tools/botplay.mjs --levels <n>` reaches the exit
   with 0 errors. Update the header comment if rooms changed.
Limit: 8 image reads. Do not edit any file but your level.

## art-walls-cheese | sonnet | p1 | art | Wall textures: cheese set
owns: src/art/walls_cheese.js
Module `walls_cheese`: the ten cheese-themed wall tiles. Walls must tile seamlessly left↔right. `wall.fondue_fall`
is a 4-frame seamless loop of flowing molten cheese (strong emit). `wall.gold_foil` and `wall.parmesan_block` are
the glitter showpieces; `wall.wax_rind` the gloss showpiece.

## art-walls-fort | sonnet | p1 | art | Wall textures: fortress set + doors
owns: src/art/walls_fort.js
Module `walls_fort`: fortress walls (stone, banner, wood, portrait, steel, pipes, bookshelf, mouse hole, poster,
mirror, cell bars, war map, trophy case, exit switch ×2 frames), the four doors and `door.jamb`. Walls tile
left↔right. `wall.mirror` needs a large gloss-1.0 dark mirror area inside an ornate frame (it becomes a true
ray-traced mirror). Banner/poster use the cheese-wedge emblem.

## art-flats | sonnet | p1 | art | Floor & ceiling textures
owns: src/art/flats.js
Module `flats`: all floors and ceilings; each must tile seamlessly in both directions. `flat.floor_fondue` is a
4-frame seamless bubbling loop (strong emit). `flat.floor_checker` and `flat.floor_gold` are reflection/sparkle
showpieces — set gloss/spark as described in defs.

## art-enemies-infantry | opus | p1 | art | Enemy sprites: mouse, trooper, officer
owns: src/art/enemies_infantry.js
Module `enemies_infantry`. First build a parametric upright rat-soldier rig (pose parameters → frame: legs, arms,
weapon, head tilt, tail), then three outfits on it: `mouse` (small grey private, huge ears, oversized helmet),
`trooper` (brown rat, greatcoat, SMG), `officer` (white rat, peaked cap, black leather coat, monocle). All
animations per `defs.ENEMIES`: idle, 4-frame walk cycle toward the viewer, attack = aim / FIRE (emissive muzzle
flash) / recover, pain, 4-frame death collapse, dead (lying at the bottom of the frame). Figures stand ~56 px tall.

## art-enemies-beasts | sonnet | p1 | art | Enemy sprites: sewer rat, panzer rat
owns: src/art/enemies_beasts.js
Module `enemies_beasts`: `sewer` — feral quadruped rat charging at the viewer (low, wide; attack = lunge, bite
with big teeth); `panzer` — hulking armoured rat with a shoulder cheese cannon (attack FIRE frame: emissive blast
from the cannon). Match the infantry style (outline, palette, proportions) described in ARCHITECTURE §5.3.

## art-boss | sonnet | p1 | art | Boss sprite: Der Große Käse
owns: src/art/boss.js
Module `boss`: the generalissimo, filling the whole 64×64 frame (he is drawn at 1.6× scale in game). Idle ×2
(cigar puff), walk ×4 (waddle), attack ×3 (twin gatlings: aim / FIRE with emissive flashes / recover), pain,
die ×5 (staggers, crown flies off, collapses in a burst of cheese), dead. Gold braid and crown sparkle.

## art-items | sonnet | p1 | art | Pickup sprites
owns: src/art/items.js
Module `items`: the sixteen pickups. Small objects sitting on the floor: bottom-centred, roughly 22–34 px tall,
instantly identifiable from across a room. Strong materials (gold sparkle, glossy tins, emissive catnip/battery).

## art-decor | sonnet | p1 | art | Decor sprites
owns: src/art/decor.js
Module `decor`: all scenery per `defs.DECOR` (frames as listed). `hang: true` pieces touch the top edge;
`pillar` spans the full frame height; lamps/flames/molten cheese are emissive; armour and glass glossy.

## art-fx | sonnet | p1 | art | Effect sprites
owns: src/art/fx.js
Module `fx`: projectiles, explosions, puffs, sparks, sparkles per `defs.FX`. Art is centred in the frame.
Emissive effects use high emit; glows may use partial alpha.

## art-weapons | opus | p1 | art | First-person weapon view-models
owns: src/art/weapons.js
Module `weapons`: 128×128 images `wpn.<id>.idle` and `wpn.<id>.fire` for the five weapons in `defs.WEAPONS`.
First-person view of big fluffy orange tabby paws (stripes, cream toes, pink beans where visible) holding each
weapon, anchored to the bottom edge, centred or slightly right. Fire frames show recoil / slash arcs / muzzle
flash (emissive). These are on screen all the time — make them gorgeous and funny.

## art-hud | sonnet | p1 | art | HUD art: cat portrait, logo, icons
owns: src/art/hud.js
Module `hud`: `hud.face` (23 frames of Major Marmalade, layout in `defs.HUD_IMAGES`), `hud.logo`, icons, cursor,
emblem. The face must be full of character at 32×32 and visibly more battered per tier. The logo is the first
thing the player sees.

## art-registry | sonnet | p1 | engine | Art registry & atlas builder
owns: src/art/registry.js, test/art.test.mjs, tools/atlas-sheet.mjs
ARCHITECTURE §5.5. Dynamic `import()` per module with try/catch; placeholders for anything missing or invalid;
works in Node and browser. `tools/atlas-sheet.mjs` dumps the assembled tile and sprite atlases to
`out/previews/atlas-tiles.png` / `atlas-sprites.png` (reuse `encodePNG` from `tools/sheet.mjs`) and prints a
per-module completeness table. `test/art.test.mjs` (node --test): atlas shape, layer order = manifest order,
anim counts, placeholder behaviour; a module that is still missing must be reported, not fail the test.

## ui-font | sonnet | p1 | ui | Bitmap font
owns: src/ui/font.js, test/font.test.mjs
ARCHITECTURE §12 `font.js`. 5×7 glyphs for ASCII 32–126 plus ÄÖÜäöüß, crisp at any integer scale; glyph data must
import in Node. `drawText` draws with `fillRect` runs (cache per colour/scale on an offscreen canvas when
available). Also export `glyphRows(ch)` for tests. Verify by rasterising a specimen to PNG (reuse `encodePNG`
from `tools/sheet.mjs`) in `out/previews/ui-font/` and looking at it.

## audio-sfx | sonnet | p1 | audio | Audio engine + synthesised SFX
owns: src/audio/audio.js, src/audio/sfx.js, src/audio/sfx-demo.html
ARCHITECTURE §10. All `defs.SFX` names, each a distinct, characterful synthesised sound (cat meows/yowls/purrs
with formant sweeps, squeaky rat barks, chunky weapons, satisfying pickups). `audio.music(name)` delegates to
`createMusic` from `./music.js` (dynamic import, optional). Verify in headless Chrome with `OfflineAudioContext`:
render every SFX and assert non-silent, peak < 1, sane duration; print a table.

## audio-music | sonnet | p1 | audio | Tracker engine + original soundtrack
owns: src/audio/music.js, src/audio/songs/, src/audio/music-demo.html
ARCHITECTURE §10 `music.js` plus eight **original** compositions (one module per `defs.MUSIC` name): `title`
heroic-comic march, `level_a` sneaky, `level_b` driving, `level_c` eerie, `boss` frantic, `intermission` jaunty,
`victory` fanfare, `gameover` short lament. Playful martial chiptune (pulse/triangle/noise + simple FM), loops of
40–90 s (jingles shorter), proper song structure with melody, bass, harmony and drums. Do not quote any existing
melody. Verify by offline-rendering each song in headless Chrome: non-silent, no clipping, clean loop seam.

## render-core | sonnet | p1 | engine | GPU ray tracer
owns: src/render/renderer.js, src/render/shaders/, src/render/demo.html, src/render/demo.js
ARCHITECTURE §9, §8.6, §5.5, §7 (world arrays). This is the heart of the game and the main wow factor: make it
beautiful, sparkly and fast. Build `demo.html`/`demo.js`: a synthetic showcase world and scene (walls, doors
half open, a mover, sprites, coloured lights, sky zone, mirror, fondue) that needs nothing from the sim; use
`buildAtlas()` from the registry when present, else a procedural fallback atlas. Screenshot with headless Chrome
(`google-chrome --headless=new --no-sandbox --use-angle=vulkan --enable-features=Vulkan --window-size=1280,720
--virtual-time-budget=4000 --screenshot=<png> <url>` behind `python3 -m http.server` on a free port, or
`tools/shot.mjs` once it exists) and **look at the result** — iterate many times on image quality. If
`postfx.js` is missing, fall back to an internal tonemap + nearest blit. Throw with the shader log on compile
errors. Measure and report frame time at each quality level.

## render-postfx | sonnet | p1 | engine | Post-processing: bloom, star streaks, tonemap
owns: src/render/postfx.js, src/render/postfx-demo.html
ARCHITECTURE §9 `postfx.js`. Build a demo page feeding a synthetic HDR texture (bright texels, gradients) and
verify with headless-Chrome screenshots that bloom, four-point star streaks, tonemap, dither, CRT option, flash,
hurt vignette and wobble all work and that the upscale stays crisp (nearest neighbour).

## app-shell | sonnet | p1 | engine | App shell, main loop, state machine
owns: index.html, style.css, src/main.js
ARCHITECTURE §13 (and every interface it wires: §5.5, §8, §9, §10, §11, §12). Load each subsystem with dynamic
`import()` inside try/catch so a missing module degrades (logged to `__game.errors`, on-screen overlay) instead
of a blank page. Implement the `demo=1` bot and all URL parameters. Verify with headless Chrome as far as the
modules present allow; re-test as more modules land during your run.

## core-input | sonnet | p1 | engine | Input & settings
owns: src/core/input.js, src/core/settings.js, test/settings.test.mjs
ARCHITECTURE §11. Edge-triggered fields must fire exactly once per press; mouse deltas accumulate between polls;
releasing pointer lock or blurring the window clears held keys. Settings/progress survive missing or throwing
`localStorage`.

## sim-world | sonnet | p1 | sim | World: grid, doors, pushwalls, rays, pathing
owns: src/sim/world.js, test/world.test.mjs
ARCHITECTURE §6–7. Texture ids via `atlas.tile(name)` (tests use a stub atlas). Thorough node tests: parsing,
door orientation and lifecycle, locked doors, pushwall slide and secret count, exit switch, `castRay` against
walls/doors, `hasLOS`, `tryMove` sliding and corner cases (no tunnelling at 60 Hz run speed), `distField`,
`nextStep`, `soundMask`.

## sim-player | opus | p1 | sim | Game orchestration, player, weapons, items
owns: src/sim/game.js, src/sim/player.js, src/sim/weapons.js, src/sim/items.js, test/game.test.mjs
ARCHITECTURE §8.2–8.4, §8.6 and `defs` (START, WEAPONS, ITEMS, DECOR, THINGS, SKILLS). `world.js` and
`enemies.js`/`projectiles.js`/`effects.js` are being written concurrently by `sim-world` and `sim-enemies` —
code to the documented signatures, then test against the real files once they appear. Movement should feel
great: acceleration/friction, run, head bob, snappy weapon timing. `buildScene`: cull sprites/lights by distance
and rough visibility, apply light flicker, add muzzle-flash and pickup lights, compute `viewLight`.

## sim-enemies | opus | p1 | sim | Enemy AI, projectiles, effects
owns: src/sim/enemies.js, src/sim/projectiles.js, src/sim/effects.js, test/enemies.test.mjs
ARCHITECTURE §8.5 and `defs` (ENEMIES, PROJECTILES, FX, SKILLS). Enemies must be fun to fight: telegraphed
attacks, flanking via the flow field, door opening, noise alerts, patrols; hit chance falls with distance and
player speed. Boss: two phases per `defs.ENEMIES.boss`. Laser hits stun ("mesmerised", `fx.stun` overhead).
Tests use a minimal fake `game` plus the real `world.js` when present.

## ui-hud | sonnet | p1 | ui | HUD, view-model, automap
owns: src/ui/hud.js, src/ui/automap.js, src/ui/hud-demo.html
ARCHITECTURE §12. Original layout. Build `hud-demo.html` with a mock game state cycling health, weapons, ammo,
keys, messages and damage, screenshot it in headless Chrome at 480×270 ×3 and iterate on the look. Use atlas
images when present, simple placeholders otherwise; `font.js` is being written concurrently.

## ui-menus | sonnet | p1 | ui | Menus & full-screen cards
owns: src/ui/menus.js, src/ui/screens.js, src/ui/menus-demo.html
ARCHITECTURE §12. Menus draw over a transparent background (the live ray-traced attract scene shows through)
with a soft dark scrim; the title shows `hud.logo`. Intermission tallies count up with ticks; victory and game
over cards have personality. Build `menus-demo.html`, screenshot every menu and screen, iterate on the look.

## level-1 | sonnet | p1 | level | E1M1 The Cheese Cellar
owns: src/levels/e1m1.js
The first impression: a cheddar-brick cellar under the fortress. ~30×30. Teaches doors, a pushwall secret near
the start, treasure, one gold-locked door. Enemies: ~14 mice, ~5 sewer rats, no heavier types. Music `level_a`.

## level-2 | sonnet | p1 | level | E1M2 Rat Barracks
owns: src/levels/e1m2.js
Fortress stone and wood: bunk rooms, mess hall with tables, radio room, armoury, officers' lounge. ~36×36.
~12 mice, ~10 troopers, 2 officers, a few sewer rats. Silver key gating. The gatling sits in a secret. Music `level_b`.

## level-3 | sonnet | p1 | level | E1M3 The Fondue Works
owns: src/levels/e1m3.js
Industrial: steel plate, pipes, fondue-fall walls, rivers of `flat.floor_fondue` (hazard) crossed by
`flat.floor_grate` walkways, cauldrons. ~38×38. Troopers, sewer rats, 3–4 panzers. Yarn launcher mid-level, gold
key. Music `level_c`.

## level-4 | sonnet | p1 | level | E1M4 Moonlit Hall of Mirrors
owns: src/levels/e1m4.js
The renderer showcase: polished checker-marble halls lined with `wall.mirror` and chandeliers, at least two
open-sky courtyards (zone ceil `flat.sky`) with pillars casting moon shadows, a carpeted gallery. ~40×40.
~8 officers, troopers, mice. Laser pointer pickup; both keys. Music `level_a`.

## level-5 | sonnet | p1 | level | E1M5 The Blue Vault
owns: src/levels/e1m5.js
Blue-cheese catacombs lit by `glow_cheese`, a parmesan crypt, and the gold-foil treasure vault (`flat.floor_gold`,
crowns). ~42×42. All enemy types. At least 6 secrets; both keys. Music `level_c`.

## level-6 | sonnet | p1 | level | E1M6 Throne of the Big Cheese
owns: src/levels/e1m6.js
Short approach, a generous armoury, then the throne arena: at least 14×14 open cells with pillars for cover,
patches of fondue, mouse-hole walls around it (the boss summons sewer rats), banners, red carpet. Boss `Z` on the
throne dais, a few troopers/panzers as honour guard. Exit switch behind the throne. ~32×32. Music `boss`.

## level-tools | sonnet | p1 | tooling | Level validator, preview renderer, level index
owns: tools/validate-level.mjs, src/levels/index.js, test/levels.test.mjs
`tools/validate-level.mjs <file...>` per ARCHITECTURE §6: equal row lengths, known characters, exactly one start,
solid border, door geometry, pushwall clearance, things only on open cells, known texture/zone names, exit
reachable from the start honouring key order (flood fill: pick up keys, then pass matching locks; pushwalls count
as passable for secrets but the critical path must not need one), every item/enemy reachable, counts summary
(enemies by type, items, secrets, lights). Clear messages with row/column and the offending row printed. Writes a
colour map preview to `out/previews/levels/<id>.png` (reuse `encodePNG` from `tools/sheet.mjs`; ≥8 px per cell,
distinct colours for walls/doors/pushwalls/enemies/items/lights/start/exit). Ship this FIRST — six level
designers are waiting on it — then `src/levels/index.js`: `export const levels` in `defs.LEVELS` order via
top-level-await dynamic imports, substituting a tiny built-in fallback level (and listing it in
`export const missing`) for any file that is absent or fails to import. `test/levels.test.mjs` validates every
level present.

## tool-shot | sonnet | p1 | tooling | Headless screenshot/driver tool + dev server
owns: tools/shot.mjs, tools/serve.mjs
ARCHITECTURE §15. Zero dependencies: launch Chrome with `--remote-debugging-port=0` and a temp `--user-data-dir`
under the scratchpad, read `DevToolsActivePort`, speak CDP over Node's built-in `WebSocket`. Accepts repo-relative
paths (served by an ephemeral static server on port 0 with correct MIME types) or absolute URLs. Options as
documented plus `--frames N --interval ms` (numbered screenshots), `--click x,y`, `--timeout ms`. Always kills
Chrome and removes the profile dir, even on failure. Prove it on a small WebGL2 page and on
`http://127.0.0.1:4780/?poll`.

## desktop-shell | sonnet | p1 | desktop | Electron shell + Linux build
owns: desktop/package.json, desktop/main.cjs, desktop/preload.cjs, desktop/build.mjs, desktop/placeholder.html, desktop/README.md, desktop/icon/
ARCHITECTURE §14. `npm install` only inside `desktop/`. Until the real game boots, smoke mode falls back to
`desktop/placeholder.html` (a WebGL2 page that sets `window.__game = { ready: true, errors: [], fps }`) whenever
the staged `index.html` does not define `__game` within 15 s — record which page was used in `smoke.json`.
Build and smoke-test the Linux x64 package here (`xvfb-run` or the live display) into `dist/`; record
`node tools/track.mjs --check build-linux …` and `--check smoke-linux …`, copy the smoke screenshot to
`out/shots/desktop-shell/`. As soon as `build.mjs` and smoke mode work, record
`node tools/track.mjs --check desktop-shell pass "ready"` — two other agents are polling for it.

## native-windows | sonnet | p1 | desktop | Windows build + smoke in the VM
owns: desktop/scripts/build-windows.sh, desktop/scripts/win/
Wait for `.tracker/checks/desktop-shell.json` to say pass (poll up to 45 min). Then write
`desktop/scripts/build-windows.sh` (run from this Linux host): ensure the VM is up
(`cd ~/src/infra/win-devvm && ./vm.sh status|start|wait`), push a staged source tarball, run `npm ci` and
`node build.mjs --platform win32 --arch x64` in the guest via `./vm.sh ssh`, run the packaged app with `--smoke`,
pull the zip into `dist/` and the smoke json/png into `out/shots/native-windows/`. An SSH session has no desktop:
if the app cannot create a window there, launch it in the interactive session (scheduled task with `/IT`, or
equivalent) and document what worked. Record `--check build-windows` and `--check smoke-windows`. Never
reprovision, reconfigure or destroy the VM; only use a `C:\Users\<user>\kaesekrieg-build` directory in the guest.

## native-macos | sonnet | p1 | desktop | macOS build + smoke on bigmac
owns: desktop/scripts/build-macos.sh, desktop/scripts/mac/
Wait for `.tracker/checks/desktop-shell.json` to say pass (poll up to 45 min). Then write
`desktop/scripts/build-macos.sh` (run from this Linux host): rsync a staged source tree to
`user@macbuild.local:~/build/kaesekrieg/` (Apple Silicon, node at `/opt/homebrew/bin` — use `zsh -lc`), `npm ci`,
`node build.mjs --platform darwin --arch arm64`, ad-hoc codesign (`codesign --force --deep -s -`), zip with
`ditto`, run the app binary with `--smoke`, pull the zip into `dist/` and smoke json/png into
`out/shots/native-macos/`. Record `--check build-macos` and `--check smoke-macos`. Touch nothing on the Mac
outside `~/build/kaesekrieg`.

## integ-lead | sonnet | p2 | integ | Integration: one playable game
owns: any file under src/, index.html, style.css, test/, tools/ (you are the only agent running — still keep edits minimal and local)
Wave 1 built every module in isolation against the contract. Make them one game that boots and plays from the
title screen to the end of level 6 in headless Chrome with the real ray tracer.

Read `docs/swarm/INTEGRATION-NOTES.md` first — it is your work list. For how to drive the game headlessly read
`docs/swarm/reports/tool-shot.md` and `docs/swarm/reports/app-shell.md` (URL params, `window.__game`). Read other
reports only when you touch that module.

Work in these stages. Finish a stage, update your checkpoint, and end your turn with `CONTINUE: stage <next>` —
each stage runs in a fresh context.
- **A — boot:** `index.html?autostart=1&level=1&mute=1` reaches gameplay with zero console errors on the real
  renderer (no soft-view fallback). Fix import/API mismatches. One screenshot.
- **B — world on screen:** doors slide and match collision, pushwalls move, the exit switch animates, sprites
  (enemies, items, decor, fx) stand on the floor at the right size and face the camera, the weapon view-model and
  HUD draw over the 3D view. Screenshots: a door half-open, an enemy at 3 tiles, a pickup, a secret wall mid-push.
- **C — play loop:** input, firing, damage both ways, pickups, keys + locked doors, death + respawn, level exit →
  intermission → next level, final victory screen. Write `tools/botplay.mjs`: a headless bot (god mode allowed)
  that walks each of the 6 levels from start to exit switch using `world.nextStep`/`distField` and reports
  `{level, reachedExit, seconds, errors}`. All levels that exist must pass; list missing levels.
- **D — sound + UI:** audio unlock, listener, SFX on bus events, music per level/state, menus, pause, settings
  persistence, automap.
- **E — green:** `node --test test/` fully green (fix tests only when the contract legitimately changed — say why),
  a 60 s demo run with no console errors, frame time on `medium` quality recorded.

Rules: change the smallest thing that makes modules agree; when two modules disagree, the contract wins, and if
the contract is silent prefer the consumer's expectation. Log every cross-module change in your report under
**Contract changes** (file, what, why) — the build spec is updated from it. Do not polish art, balance or levels;
append anything you notice to the "Polish list" in `docs/swarm/INTEGRATION-NOTES.md`.

## tracker-repo | sonnet | p5 | docs | Reusable swarm-tracker repo
owns: /home/bill/src/ai/agents/swarm-tracker/ (a NEW directory outside this repo — create it; touch nothing else outside this repo)
The user wants the tracking protocol and dashboard from this build saved for reuse by other agent sessions and
projects. Extract them into a standalone, dependency-free repo at `/home/bill/src/ai/agents/swarm-tracker/`.
Read-only sources here: `tools/track.mjs`, `tools/tracker/server.mjs`, `tools/tracker/index.html`,
`tools/swarm-plan.mjs`, the `## @preamble` block of `docs/swarm/SWARM.md`, `docs/LEARNINGS.md`, and the last three
UPDATE sections of `docs/CHECKPOINT.md`. Do NOT modify this repo's copies; the running dashboard on port 4780 must
keep working — never kill it.

Deliver:
- `bin/track.mjs`, `bin/swarm-plan.mjs`, `dashboard/server.mjs`, `dashboard/index.html` — generalised: no
  KÄSEKRIEG names, no absolute or home-directory paths; project root from `TRACKER_ROOT` or the current directory;
  port from `TRACKER_PORT`; the project title comes from `plan.json`.
- `PROTOCOL.md` — the on-disk protocol precisely: `.tracker/plan.json` schema (phases, agents, fields),
  `.tracker/events/<agentId>.jsonl` line format and states, `.tracker/checks/<name>.json`, the HTTP/SSE API, `?poll`.
- `PLAYBOOK.md` — how to run a swarm with it, distilled from LEARNINGS.md into rules with the reason for each:
  contract-first with disjoint file ownership; one manifest → generated prompt files; concurrency cap and model
  tiers (cheapest adequate; what burned the usage limits); checkpoint files + `CONTINUE:` + fresh contexts instead
  of resuming transcripts; context-budget rules for agents; orchestrator checkpoint file and compaction;
  unit-test shared foundations before the swarm; stamp times with `date -u`.
- `templates/` — `SWARM.md` (manifest with the generic preamble incl. tracking, context-budget and checkpoint
  rules), `CHECKPOINT.md`, `LEARNINGS.md`, `INTEGRATION-NOTES.md`.
- `examples/demo/` — a tiny manifest plus a script that writes fake events so the dashboard can be seen populated.
- `README.md` — what it is, a 5-minute quickstart for adding it to a new project (copy-in and run-from-elsewhere
  via `TRACKER_ROOT`), a screenshot of the dashboard at `docs/dashboard.png`, and the file map.
- `test/` — `node --test` covering track.mjs writes, plan generation from the example manifest, and the server's
  JSON API on a temporary directory and a free port.
- `.gitignore`, `package.json` (`"type":"module"`, scripts `tracker`, `test`), an MIT `LICENSE` with holder
  "the swarm-tracker authors". Then `git init` in the new directory (this one git command is allowed) — do NOT
  commit, add a remote, or push.

Verify: tests pass; run the demo with `TRACKER_PORT=4791` and a temp `TRACKER_ROOT`, take the README screenshot
with headless Chrome and `?poll` (flags are in ARCHITECTURE.md §15 / `tools/shot.mjs`), look at it once, and stop
only the server you started. Your report still goes in this repo: `docs/swarm/reports/tracker-repo.md`.

## polish-global | sonnet | p3 | polish | Lighting: diagnose, fix, write the recipe
owns: src/levels/e1m1.js, docs/swarm/LIGHTING.md, lighting/exposure defaults in src/render/, light extraction in src/sim/game.js (buildScene) — minimal edits, re-run `node --test test/` after any src/ change
The renderer's own demo scene (`src/render/demo.html`, shot `out/shots/render-core/f0.png`) is bright, reflective
and sparkly. The real game is not: `out/shots/integ-lead/a1.png` (level 1 start) has a near-black floor and
ceiling and no sparkle. Find out why and fix it at the right layer.
1. Diagnose with numbers before looking at pictures: compare what the demo passes to the renderer (lights: count,
   colour, intensity, radius; ambient; exposure; sky; floor gloss) with what `buildScene` passes on level 1
   (`window.__game` in the page, via `tools/shot.mjs --eval`). Typical causes: light things not becoming scene
   lights, intensities/radii in different units, ambient or exposure defaults, matte flats where the demo is glossy.
2. Fix the cause in shared code or defaults so all six levels benefit; only then tune level 1's own lights.
3. Make level 1 the reference: start view plus two rooms look as good as the demo while staying a dim cheese
   cellar in mood. Before/after screenshots in `out/shots/polish-global/`.
4. Write `docs/swarm/LIGHTING.md` (60 lines max) for six level-polish agents: what was wrong and fixed globally;
   the recipe (lights per room size, which light things and colours, how to get shadows, reflections and glints,
   which wall/flat/decor names sparkle); the exact command to screenshot a level at a position and angle; pitfalls.
Do not touch levels 2–6. Limit: 10 image reads.

## polish-level-1 | sonnet | p3 | lvlpolish | Polish E1M1 The Cheese Cellar
owns: src/levels/e1m1.js
Level 1 is the first impression and already the lighting reference — concentrate on shape, dressing and economy.

## polish-level-2 | sonnet | p3 | lvlpolish | Polish E1M2 Rat Barracks
owns: src/levels/e1m2.js
Known weak spot: most rooms are plain rectangles (only the cellar has wall stubs).

## polish-level-3 | sonnet | p3 | lvlpolish | Polish E1M3 The Fondue Works
owns: src/levels/e1m3.js
The molten fondue river should glow and light the River Hall from below.

## polish-level-4 | sonnet | p3 | lvlpolish | Polish E1M4 Moonlit Hall of Mirrors
owns: src/levels/e1m4.js
Known weak spot: plain rectangular rooms. This is the showpiece for reflections and moon shadows — the two sky
courts and the mirror halls must look spectacular. Check chandelier/candelabra decor does not block the route.

## polish-level-5 | sonnet | p3 | lvlpolish | Polish E1M5 The Blue Vault
owns: src/levels/e1m5.js
Nobody has looked at this level's preview yet — start with `out/previews/level-5/` (or regenerate it).

## polish-level-6 | sonnet | p3 | lvlpolish | Polish E1M6 Throne of the Big Cheese
owns: src/levels/e1m6.js
The throne arena is the finale: gold, banners, fondue glow. Boss difficulty is untested — run the economy check
against the boss's hit points and make sure the arena has cover and enough ammo.

## polish-ui | sonnet | p3 | polish | UI polish against the real art
owns: src/ui/*.js, style.css (and the smallest possible edits in src/main.js if a screen needs different data)
The HUD, menus and cards were laid out against placeholder art. The real art (`src/art/hud.js`: logo, cat
portrait, icons, emblem; `src/art/weapons.js`: paw view-models) has landed. Make every screen look finished at
the 480×270 UI resolution.
1. Drive the game with `tools/shot.mjs` (see `docs/swarm/reports/tool-shot.md`; `window.__game.action(a)` and URL
   params get you to each state) and screenshot: title, main menu, skill select, options, in-game HUD (idle and
   firing, each of the 5 weapons in ONE contact shot if you can), automap, pause, intermission, death, game over,
   victory.
2. Fix what is wrong: overflow, clipped or overlapping text, art drawn at the wrong size or anchor, weapon
   view-model position/bob, portrait not reacting to damage, unreadable contrast, empty-looking screens.
3. The title screen is the first thing the user sees — logo large and centred, a little motion (sparkle, drips or
   a slow background), a clear "press any key".
Work in two stages with `CONTINUE:` between them (A: in-game HUD + weapons + automap; B: title, menus, cards).
Limit: 8 image reads per stage. `node --test test/` must stay green.

## polish-art | sonnet | p3 | polish | Sprite and texture fix list
owns: src/art/walls_fort.js, src/art/flats.js, src/art/enemies_beasts.js, src/art/enemies_infantry.js, src/art/fx.js, src/art/decor.js
The art agents flagged their own weak spots. Fix them, one module per stage, ending each stage with `CONTINUE:`
(fresh context per module). For each module: `node tools/sheet.mjs <module>` → look once → fix → look once more;
also open the `.mat.png` once where it is listed as unchecked. Keep every sprite's size, anchor, frame count and
name unchanged; the module's tests and `node --test test/art.test.mjs` must pass.
- `enemies_beasts`: sewer rat reads plush, its die frames are blobby; panzer material sheet never checked.
- `enemies_infantry`: mouse idle pistol and officer raised luger are hard to see at 1× (contrast/outline).
- `fx`: `fx.fur` is weak (should read as a puff of grey fur tufts).
- `walls_fort`: had only one review pass — check tiling seams, contrast and that door textures read as doors.
- `flats`: `flat.floor_gold` is too busy at 1×.
- `decor`: `decor.mat.png` never opened — check emissive/gloss/spark values are sensible.
Limit: 3 image reads per module. Do not redesign anything that already reads well.

## final-qa | sonnet | p4 | qa | Final QA: can a player actually finish it?
owns: tools/botplay.mjs, test/, and bug fixes anywhere under src/ (smallest possible; say what and why in the report)
The game is integrated and polished; tests are green and a god-mode bot reaches every exit. What nobody has
checked is whether it is fair and bug-free for a real player. No art or layout work.
Stage 1 — fighting bot: add `--fight` to `tools/botplay.mjs`: no god mode, no granted keys, skill 2. The bot
collects keys on the way (BFS to key, then door), turns to face and shoots visible enemies (pick the best weapon
with ammo), walks over pickups near its route. Report per level `{reachedExit, deaths, healthAtExit, ammoAtExit,
kills/total, seconds}`. Run each level 3 times with different `seed`s.
Stage 2 — act on it: a level where the bot dies in all 3 runs, runs dry of ammo, or cannot reach a key is a
finding. Fix real bugs (stuck spots, unreachable keys, enemies shooting through walls, doors that trap) in code;
fix gross unfairness with the smallest level edit (move/add a pickup, remove one enemy) — keep
`tools/validate-level.mjs` and the god-mode bot passing. The boss fight on level 6 must be winnable by the bot at
least once in 3 runs; if not, tune the boss numbers in `src/core/defs.js` (say exactly what changed).
Stage 3 — sweep: 2-minute soak per level with the fighting bot at `quality=low` and `ultra`, zero console
errors; `node --test test/` green; list anything suspicious you saw but did not fix.
End each stage with `CONTINUE:` unless everything is finished. Limit: 4 image reads in total — this is a numbers job.

## docs-final | sonnet | p5 | docs | README, build spec, learnings
owns: README.md, docs/BUILD-SPEC.md, docs/LEARNINGS.md (append/reorganise only — keep every existing item), ARCHITECTURE.md (only the corrections listed below), docs/screenshots/
The user asked to "save the plan and full build specification for what you do so we can redo it later on another
system and set of agents" and to "track your learnings and mistakes, and fixes so we can study and reuse later".
Stage 1 — `README.md` for a player and a developer: what the game is (2 sentences), 4 screenshots copied into
`docs/screenshots/` (pick from `out/shots/polish-global/`, `out/shots/polish-ui/`, `out/shots/render-core/` —
choose by file name and the reports, look at no more than 4), how to run in a browser
(`node tools/serve.mjs`), controls (from `src/core/input.js`/settings), URL parameters, the three desktop builds
(commands and outputs from `docs/swarm/reports/desktop-shell.md`, `native-macos.md`, `native-windows.md`,
including the first-run notes: Linux launcher, macOS Gatekeeper, Windows SmartScreen), tests and tools, repo map.
Stage 2 — `docs/BUILD-SPEC.md`: everything needed to rebuild this from an empty directory with a different
orchestrator and agents: goals and the user's requirements (quote them from `docs/CHECKPOINT.md`); decisions and
why; environment and hosts; the phase plan as actually executed (p0 foundation → p1 modules → p2 integration →
p3 polish → p4 QA + native → p5 docs) with for each phase its agents (from `docs/swarm/SWARM.md` — reference the
manifest and generated prompts, do not paste them), entry and exit gates and the exact commands; the orchestration
rules that ended up working (concurrency, model tiers, checkpoints, fresh contexts); what the orchestrator did by
hand; a time/cost table (agents, tokens and seconds are in the tracker events and reports where recorded — say
"not recorded" otherwise); known limitations.
Stage 3 — learnings: append to `docs/LEARNINGS.md` a section "From the agent reports": grep every
`docs/swarm/reports/*.md` for its **Mistakes** and **Learnings** sections and distil them into grouped, de-duplicated
bullets with the source agent id. Then fix `ARCHITECTURE.md` §8 for the four sim-enemies API changes listed in
`docs/swarm/INTEGRATION-NOTES.md` item 22 and note the lighting constants from `docs/swarm/reports/polish-global.md`.
End each stage with `CONTINUE:`. Plain, specific writing; no marketing language.

## release-final | sonnet | p5 | release | Final verification, rebuilds and wrap-up
owns: README.md, docs/BUILD-SPEC.md, docs/LEARNINGS.md (append only), docs/screenshots/, dist/ (through the build scripts only), /home/bill/src/ai/agents/swarm-tracker/PLAYBOOK.md
Everything is built, integrated, polished and QA'd. Close the project out. No code changes under src/ — if a
gate fails, stop and report it. Work through this list in order, ticking each off in your checkpoint:
1. `node --test test/` green; `node tools/botplay.mjs` (god mode) reaches the exit on all 6 levels. Put the real
   test count in `README.md`.
2. Append the **Mistakes** / **Learnings** of `docs/swarm/reports/audio-music.md`, `final-qa.md` and
   `docs-final.md` to the "From the agent reports" section of `docs/LEARNINGS.md` (same style, with agent ids).
3. `docs/BUILD-SPEC.md` cost table: replace "not recorded" with the per-agent tokens/seconds listed in
   `docs/CHECKPOINT.md` (search "Token/time per agent"), and add a short table of the usage-limit hits (when, how
   many agents were running, which models, what changed afterwards) from `docs/LEARNINGS.md` items 8–14 and later.
4. README screenshots: build ONE contact image of the files in `docs/screenshots/` and look at it once. Replace
   any that is dark, mid-fade or wrong with a better shot from `out/shots/polish-*/`.
5. Rebuild all three desktop packages with the final game and smoke-test each:
   Linux `node desktop/build.mjs --platform linux --arch x64`, then
   `xvfb-run -a dist/Kaesekrieg-linux-x64/kaesekrieg.sh --smoke=<dir>` (the launcher is new and untested — fix
   `desktop/build.mjs` if it does not work); macOS `desktop/scripts/build-macos.sh`; Windows
   `desktop/scripts/build-windows.sh`. For each record
   `node tools/track.mjs --check build-<os> pass|fail "<detail>"` and `--check smoke-<os> ...` (ok, page, fps,
   errors from smoke.json). List artifact paths and sizes.
6. Re-sync `/home/bill/src/ai/agents/swarm-tracker/PLAYBOOK.md` with `docs/LEARNINGS.md` items 12 and later
   (rule + reason, generic wording, no project names or absolute paths). Run that repo's `npm test`. No git
   commit, remote or push.
7. Write `docs/swarm/reports/release-final.md`: a final status table (gate, result, evidence) and anything left open.
Do not open GUI windows on this machine. End with `CONTINUE:` after step 4 if you are past ~25 tool calls.
