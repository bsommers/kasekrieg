# CHECKPOINT — KÄSEKRIEG build (orchestrator state)

Updated: 2026-11-14 ~06:25Z. Repo: `/home/bill/src/fun/duum` (not a git repo; **do not commit unless asked**).

## User requests (verbatim, in order)
1. "using massive numbers of parallel subagents and choosing the best models like fable 5.2 and others suited for
   specific subagent tasks (haiku, sonnet, opus, fable 5.2, etc). do: We're making a Castle Wolfenstein style 3D
   maze game. The main character is a big orange cat. The enemies are large rats and mice wearing World War II
   Nazi soldier uniforms. There is cat themed and cheese themed in the video game. This is styled off of the
   Wolfenstein 3D games. The game has cheese themed cats and mice themes. It looks like Wolfenstein but the
   graphics are actually ray traced and sparkly. They still retain a blocky look though like the original
   Wolfenstein. WOW ME. build this all autonomously without asking me."
2. "also plan for and build a native binary for linux, macos, windows. we have the tools here to build and test
   in vms and ssh to bigmac"
3. "build a web-visualization and tracker for all of the subagents and this work and popit open"
4. "bigmac is at macbuild.local, available by ssh user@macbuild.local. Windows VM is here in ~/src/ subdir win-devvm/"
5. "after you're done. save that tracking protocol and tracker-dashboard for later reuse by other agent sessions.
   we'll make a repo in an appropriate sub dir of ~/src. save the plan and full build specifcation for what you do
   so we can redo it later on another system and set of agents. track your learnings and mistakes, and fixes so
   we can study and reuse later"

Authorizations: build autonomously without asking; use many subagents incl. fable/opus (overrides the CLAUDE.md
cheap-model default); use bigmac + Windows VM. NOT authorized: git commits/pushes, anything destructive outside
this repo. The new tracker repo under `~/src` is requested ("we'll make a repo") — create dir + `git init` at the
end, no remote/push.

## Decisions made
- Original game (no copied art/levels/music/UI/names). Title **KÄSEKRIEG: Claws of Marmalade**; hero Major
  Marmalade (orange tabby, nine lives); enemy faction Das Rattenreich. Emblem = black cheese wedge in white disc
  on red — **no swastikas / real Nazi insignia**; uniforms carry the theme.
- Tech: dependency-free ES modules, WebGL2 fragment-shader ray tracer (DDA grid, texel-locked lighting, shadows,
  reflections, glints, bloom), procedural pixel art via `PixBuf`, WebAudio synth. Native = **Electron** shell in
  `desktop/`, built natively on each OS (Linux here, Windows in VM, macOS on bigmac) with a `--smoke=<dir>` self-test.
- Contract = `ARCHITECTURE.md` + `src/core/defs.js` (both written, frozen).
- Prompts are saved as files (`docs/swarm/prompts/<id>.md`) and agents are spawned with "read and execute that
  file" → reproducible build spec. Every agent writes `docs/swarm/reports/<id>.md` (built / deviations /
  mistakes→fixes / learnings) and reports progress via `node tools/track.mjs`.

## Environment facts
- Node 26, Chrome headless WebGL2 on RX 7900 XTX: `google-chrome --headless=new --no-sandbox --use-angle=vulkan --enable-features=Vulkan`.
- macOS: `ssh user@macbuild.local` (M4 Pro, macOS 27, node 26 at /opt/homebrew/bin; bare `bigmac` does not resolve).
- Windows 11 VM: `cd ~/src/infra/win-devvm && ./vm.sh status|ssh|push|pull` — domain **started** at ~06:00Z.
- Tool registry: `python3 ~/src/swe-skills-2/scripts/tool-registry.py`.
- Tracker server running: pid 4162899, http://127.0.0.1:4780/ (restart: kill pid from `ss -ltnp | grep 4780`,
  then `setsid nohup node tools/tracker/server.mjs > .tracker/server.log 2>&1 < /dev/null &`). Use `?poll` for
  headless screenshots of it.

## Done so far
`ARCHITECTURE.md`, `src/core/defs.js`, `tools/track.mjs`, `tools/tracker/{server.mjs,index.html}` (agent `tracker`,
done), `package.json`, `.tracker/plan.json` (initial), memory file for build hosts.

## Remaining foundation (orchestrator, before the swarm)
1. `src/art/pixbuf.js` — PixBuf + `ink()`; API per ARCHITECTURE §5.1.
2. `src/core/rng.js` (`createRng(seed) → {next, range(a,b), int(a,b), pick(arr), chance(p)}`, mulberry32) and
   `src/core/events.js` (`createBus`).
3. `tools/sheet.mjs` — contact-sheet PNG writer (node:zlib), validates names against `artManifest()`.
4. `docs/swarm/manifest.mjs` (phases + agents + task text) and `tools/swarm-plan.mjs` (generates
   `.tracker/plan.json` + `docs/swarm/prompts/<id>.md` with a common preamble). `startedAt` must be real UTC
   (`2026-11-14T05:52:00Z`).
5. `docs/LEARNINGS.md` (running log), `.gitignore` (node_modules, dist, out, .tracker).
6. Launch wave 1 (all agents in one message), then update this file.

## Swarm roster — wave 1 (id · model · owns)
Art (all must self-review with `tools/sheet.mjs` + Read on the PNG):
- art-walls-cheese · fable · src/art/walls_cheese.js
- art-walls-fort · fable · src/art/walls_fort.js (walls F…X, doors, jamb)
- art-flats · opus · src/art/flats.js
- art-enemies-infantry · fable · src/art/enemies_infantry.js (shared rat rig → mouse, trooper, officer)
- art-enemies-beasts · fable · src/art/enemies_beasts.js (sewer, panzer)
- art-boss · fable · src/art/boss.js
- art-items · opus · src/art/items.js
- art-decor · opus · src/art/decor.js
- art-fx · sonnet · src/art/fx.js
- art-weapons · fable · src/art/weapons.js (128×128 paw view-models)
- art-hud · fable · src/art/hud.js (faces, logo, icons)
- art-registry · sonnet · src/art/registry.js, test/art.test.mjs
- ui-font · sonnet · src/ui/font.js
Audio:
- audio-sfx · opus · src/audio/audio.js, sfx.js
- audio-music · fable · src/audio/music.js, songs/*
Engine:
- render-core · fable · src/render/renderer.js, shaders/*
- render-postfx · opus · src/render/postfx.js
- app-shell · opus · index.html, style.css, src/main.js
- core-input · sonnet · src/core/input.js, settings.js
Sim (node-testable, `test/*.test.mjs`):
- sim-world · opus · src/sim/world.js
- sim-player · fable · src/sim/game.js, player.js, weapons.js, items.js
- sim-enemies · fable · src/sim/enemies.js, projectiles.js, effects.js
UI:
- ui-hud · opus · src/ui/hud.js, automap.js
- ui-menus · opus · src/ui/menus.js, screens.js
Levels (validate with tools/validate-level.mjs once it exists; draft first):
- level-1 · fable · e1m1 The Cheese Cellar (intro: mice, a few sewer rats; teaches doors/secret/treasure)
- level-2 · opus · e1m2 Rat Barracks (troopers, bunks, mess hall; gold key; gatling in a secret)
- level-3 · opus · e1m3 The Fondue Works (fondue hazard rivers, pipes/steel; panzers; yarn launcher)
- level-4 · fable · e1m4 Moonlit Hall of Mirrors (sky courtyards, mirror walls, checker marble; officers; laser)
- level-5 · opus · e1m5 The Blue Vault (blue cheese catacombs + gold vault; many secrets; both keys)
- level-6 · opus · e1m6 Throne of the Big Cheese (boss arena, pillars, fondue moat)
- level-tools · sonnet · tools/validate-level.mjs, src/levels/index.js
Tools / desktop:
- tool-shot · sonnet · tools/shot.mjs, tools/serve.mjs (zero-dep CDP driver)
- desktop-shell · opus · desktop/** + Linux build + smoke (placeholder page until the game boots)
- native-windows · sonnet · desktop/scripts/win-* (prove build+smoke pipeline in the VM)
- native-macos · sonnet · desktop/scripts/mac-* (prove build+smoke pipeline on bigmac)

## Later waves
- Wave 2: `integ-lead` (fable) — make the whole game boot and play in headless Chrome; fix cross-module
  mismatches; all tests green; all 6 levels load; smoke clean.
- Wave 3 (parallel, area-owned): visual polish w/ screenshots (fable), gameplay balance + headless bot playthrough
  `tools/botplay.mjs` (opus), UI polish (opus), audio polish (sonnet), per-level QA ×6 (sonnet), perf (opus),
  code review → fixes (sonnet).
- Wave 4: native builds with the real game on Linux/Windows/macOS (3 agents) → `dist/`; checks
  `build-<os>` / `smoke-<os>`.
- Wave 5: docs — `README.md`, `docs/BUILD-SPEC.md` (full reproducible spec: environment, phases, manifest,
  prompts, gates), `docs/LEARNINGS.md` aggregated from all reports; extract tracker (`tools/track.mjs`,
  `tools/tracker/`, protocol doc, `swarm-plan.mjs`) into a new repo under `~/src/ai/…` (check `ls ~/src ~/src/ai`
  for the right home; `git init`, no push). Final verification by orchestrator; open the game for the user.

## Exact next command
Write `src/art/pixbuf.js`, then items 2–6 of "Remaining foundation" above.

## UPDATE 2026-11-14 ~06:45Z — foundation finished, wave 1 launch issued
- Written since the first checkpoint: `src/art/pixbuf.js`, `src/core/{rng,events}.js`, `tools/sheet.mjs`,
  `docs/swarm/SWARM.md` (manifest: preamble + role appendices + 35 agent tasks), `tools/swarm-plan.mjs`
  (→ `docs/swarm/prompts/<id>.md` + `.tracker/plan.json`), `docs/LEARNINGS.md`, `.gitignore`.
- Wave 1 = all 35 agents in SWARM.md, each spawned as `general-purpose` with its model and the prompt
  "Read /home/bill/src/fun/duum/docs/swarm/prompts/<id>.md and execute it exactly."
- After a context reset: `ls .tracker/events/` shows who actually started; `ls docs/swarm/reports/` shows who
  finished. Respawn any agent with no events using the same one-line prompt. Completion notifications arrive
  automatically — do not poll transcripts.
- Windows VM: running, `tools: DONE`.
- **Next**: as agents finish, skim `docs/swarm/reports/*.md` (Deviations + Requests), then add wave-2 agent
  `integ-lead` (fable) to SWARM.md (phase p2), regenerate with
  `node tools/swarm-plan.mjs --phase p1=done,p2=active`, spawn it. Then waves 3–5 per the plan above.
  Keep `docs/LEARNINGS.md` updated; final deliverables include `docs/BUILD-SPEC.md` and the tracker repo.

## UPDATE 2026-11-14 ~09:40Z — relaunch after usage-limit reset
First wave-1 launch failed: 20 agents started then died on the 5-hour limit, 15 rejected by the 20-agent cap.
Models rebalanced in SWARM.md (see LEARNINGS #9), prompts regenerated. Relaunching in two batches:
- Batch 1a (20): render-core, render-postfx, sim-world, sim-player, sim-enemies, app-shell, core-input,
  art-registry, ui-font, tool-shot, level-tools, audio-sfx, audio-music, ui-hud, ui-menus, art-walls-cheese,
  art-walls-fort, art-flats, art-enemies-infantry, desktop-shell.
- Batch 1b (15, launch as 1a agents finish): art-enemies-beasts, art-boss, art-items, art-decor, art-fx,
  art-weapons, art-hud, level-1…level-6, native-windows, native-macos.
Spawn prompt: "Read /home/bill/src/fun/duum/docs/swarm/prompts/<id>.md and execute it exactly." with the model
from SWARM.md. Track who is done via `ls docs/swarm/reports/` and tracker events.

## UPDATE ~10:00Z — batch 1a running, backfilling 1b one-for-one
Batch 1a: all 20 launched OK. Done so far: art-registry (registry + atlas tool + 10/10 tests; all art still
placeholders until art modules land — re-run `node tools/atlas-sheet.mjs` later).
Backfill rule: each time a 1a agent finishes, launch the next 1b agent in this order:
art-enemies-beasts (launched), art-weapons, art-hud, art-boss, level-1, level-4, art-items, art-decor, art-fx,
level-2, level-3, level-5, level-6, native-windows, native-macos.
Truth for who is done: `ls docs/swarm/reports/`; who started: `ls .tracker/events/`.

## UPDATE 2026-11-14 ~14:20Z — after second usage-limit hit; LEAN PLAN (supersedes batch notes above)
DONE (reports exist): art-registry, ui-font, tool-shot, core-input, level-tools. Everything else in SWARM.md is
NOT done (some have partial files on disk; prompts tell agents to resume from existing files).
Rules now: **max 8 agents running**, models per SWARM.md v3 (fable: render-core; opus: sim-player, sim-enemies,
art-enemies-infantry, art-weapons, art-hud; sonnet: rest). User said: "keep going, launch the rest as slots
free up".
Running since ~14:20Z (8): render-core, sim-world, sim-player, sim-enemies, app-shell, art-walls-fort,
art-flats, art-enemies-infantry.
QUEUE — launch the next one each time a slot frees: render-postfx, art-walls-cheese, ui-hud, ui-menus,
audio-sfx, level-1, art-items, art-decor, art-enemies-beasts, art-weapons, art-hud, art-boss, art-fx,
audio-music, level-2, level-3, level-4, level-5, level-6, desktop-shell, native-windows, native-macos.
Then waves 2–5 as planned (integ-lead etc.), sized to the budget. If the limit hits again: after reset, respawn
whatever has no report in `docs/swarm/reports/`.

## UPDATE ~14:35Z
DONE now (7): art-registry, ui-font, tool-shot, core-input, level-tools, art-walls-fort, sim-world.
Running (8): render-core, sim-player, sim-enemies, app-shell, art-flats, art-enemies-infantry, render-postfx,
art-walls-cheese. Queue continues from: ui-hud, ui-menus, audio-sfx, level-1, … (order in the previous UPDATE).
Integration notes to hand to `integ-lead`: (1) app-shell must call input.poll() AND input.menu() every frame,
set input.sensitivity from settings; (2) renderer must match sim-world's door slab geometry (documented at the
top of src/sim/world.js), draw world.movers, animate the exit switch (texture swaps to exit_switch+1 =
consecutive atlas layers); (3) game.js must call world.setBlocker for blocking decor and pass game into
world.update; (4) art-walls-fort had only one review pass — needs art polish; (5) level validator ignores
player radius and blocking decor — playtest for squeeze points.

## UPDATE ~14:45Z
DONE (10): art-registry, ui-font, tool-shot, core-input, level-tools, art-walls-fort, sim-world, render-postfx,
art-flats, art-walls-cheese.
Running (8): render-core, sim-player, sim-enemies, app-shell, art-enemies-infantry, ui-hud, ui-menus, audio-sfx.
Queue (next first): level-1, art-items, art-decor, art-enemies-beasts, art-weapons, art-hud, art-boss, art-fx,
audio-music, level-2, level-3, level-4, level-5, level-6, desktop-shell, native-windows, native-macos.
More integration notes: (6) render-core must bind postfx.target, set viewport w×h before tracing, call
postfx.resize(w,h,canvasW,canvasH) on size change; (7) test/flats.test.mjs pass count unconfirmed — re-run
`node --test test/`; (8) flat.floor_gold busy at 1×, postfx dither unverified, cheese-wall seams only checked
numerically — polish wave.

## UPDATE ~15:00Z
DONE (14): art-registry, ui-font, tool-shot, core-input, level-tools, art-walls-fort, sim-world, render-postfx,
art-flats, art-walls-cheese, ui-hud, app-shell, ui-menus (+ tracker).
Running (8): render-core, sim-player, sim-enemies, art-enemies-infantry, audio-sfx, level-1, art-items, art-decor.
Queue (next first): art-enemies-beasts, art-weapons, art-hud, art-boss, art-fx, audio-music, level-2, level-3,
level-4, level-5, level-6, desktop-shell, native-windows, native-macos.
More integration notes: (9) app-shell only tested against test/fixtures/mock-game.js — real WebGL path
untested; hud.js should guard its automap.js import; (10) app shell must forward bus events msg, hurt, pickup,
flash, weapon, secret, playerDied to hud.onEvent and draw the automap after hud.draw; (11) menus return volume
as one option action with {master,sfx,music}; extra API menus.close()/current, screens.active, confirmQuit;
(12) HUD/menus verified only with placeholder art — re-check once art-hud and art-weapons land; font has no
degree sign.

## UPDATE ~15:10Z
DONE (16): art-registry, ui-font, tool-shot, core-input, level-tools, art-walls-fort, sim-world, render-postfx,
art-flats, art-walls-cheese, ui-hud, app-shell, ui-menus, level-1, audio-sfx (+ tracker).
Running (8): render-core, sim-player, sim-enemies, art-enemies-infantry, art-items, art-decor,
art-enemies-beasts, art-weapons.
Queue (next first): art-hud, art-boss, art-fx, audio-music, level-2, level-3, level-4, level-5, level-6,
desktop-shell, native-windows, native-macos.
More integration notes: (13) app shell: audio.unlock() on first user gesture, audio.setListener(x,y,angle)
every frame; (14) boss_fire and enemy_smg are single-shot sounds — play once per shot; (15) SFX verified by
numbers only (nobody has listened); level-1 not yet seen in the renderer (lighting/balance untuned).

## UPDATE 2026-11-14T19:55Z — third limit hit, user lowered concurrency
User instruction (verbatim, latest wins): "backoff to 3 parallel subagents; lower pace" then
"backoff to 4 parallel subagents; lower pace". **New cap: max 4 subagents running. Lower pace.**
Third 5-hour-limit hit killed 6 agents mid-run (8 concurrent incl. 1 fable + 4 opus was still too much).
Limit reset 19:10Z. Stopped agents are RESUMED with SendMessage to their agent id (keeps their context), not respawned.
DONE (18): art-registry, ui-font, tool-shot, core-input, level-tools, art-walls-fort, sim-world, render-postfx,
art-flats, art-walls-cheese, ui-hud, app-shell, ui-menus, level-1, audio-sfx, art-items, art-enemies-beasts (+ tracker).
Running (4, resumed 19:53Z): render-core a44e2d14162cf1212 (fable), sim-player a2bd887c6be19751d (opus, ~90%),
sim-enemies a7317cf8337a2ff78 (opus, ~70%), art-decor a517ca19f82d25f08 (sonnet, ~70%).
Stopped, resume next via SendMessage: art-enemies-infantry a31e48d1d1380dc59 (opus, ~25%),
art-weapons a82ca211235c680e1 (opus, just started).
Queue after those (fresh spawns): art-hud (opus), art-boss, art-fx, audio-music, level-2..level-6,
desktop-shell, native-windows, native-macos (sonnet).
More integration notes: (16) art-items: re-run `node --test test/art-items.test.mjs` (pass count unconfirmed);
keys/crown/laser sprites are 36–41 px tall (brief said ~34); (17) art-enemies-beasts: panzer material sheet
unchecked, no tests, sewer rat a bit plush and its die frames blobby — polish wave.

## UPDATE 2026-11-14T19:58Z
DONE +1: art-decor (19 total). Launched art-fx (sonnet, fresh). Running (4): render-core, sim-player, sim-enemies, art-fx.
Next: resume art-enemies-infantry a31e48d1d1380dc59 when an opus slot frees (keep ≤1 fable + ≤2–3 opus), then
art-weapons a82ca211235c680e1, then queue: art-hud, art-boss, audio-music, level-2..6, desktop-shell, native-*.
Note (18): art-decor — decor.mat.png itself not opened (custom material grid checked instead).

## UPDATE 2026-11-14T20:02Z
DONE +1: sim-player (20 total; 145 tests pass per its report). Resumed art-enemies-infantry a31e48d1d1380dc59.
Running (4): render-core (fable), sim-enemies (opus), art-enemies-infantry (opus), art-fx (sonnet a8c887fd1a0d23108).
Next: resume art-weapons a82ca211235c680e1, then queue: art-hud, art-boss, audio-music, level-2..6, desktop-shell, native-*.
Integration notes: (19) sim-player rule choices — death restores level-start score+weapons, lives decrement at
death (9 deaths = game over), god mode emits no hurt event; (20) enemies.js must NOT import game.js directly
(module-load hang risk) — verify once sim-enemies lands; (21) game has only run on the soft-view fallback —
real renderer lighting unseen until render-core delivers src/render/renderer.js.

## UPDATE 2026-11-14T20:06Z
DONE +1: sim-enemies (21 total; 22/22 enemy tests). Resumed art-weapons a82ca211235c680e1.
Running (4): render-core (fable), art-enemies-infantry (opus), art-weapons (opus), art-fx (sonnet).
Queue (fresh spawns, next first): art-hud (opus), art-boss, audio-music, level-2..6, desktop-shell,
native-windows, native-macos (sonnet).
Integration notes: (22) sim-enemies contract changes — damageEnemy returns killed bool; makeNoise takes optional
source; enemies.js counts kills+score itself; player damage path = game._hooks.damagePlayer → player.damagePlayer
→ fallback. Add these to ARCHITECTURE.md §8 in the docs wave. (23) enemies not yet seen in browser/screenshots.

## UPDATE 2026-11-14T20:20Z
DONE +1: art-fx (22 total). Launched art-boss (sonnet a71d3c3f0fb6bd176).
Running (4): render-core (fable), art-enemies-infantry (opus), art-weapons (opus), art-boss (sonnet).
Queue (fresh spawns, next first): art-hud (opus — wait for an opus slot), audio-music, level-2..6, desktop-shell,
native-windows, native-macos (sonnet).
Orchestrator fix: `PixBuf.set` ignored alpha-0 inks on filled pixels, so `erase()` was a no-op (found by art-fx).
Fixed in src/art/pixbuf.js (one condition). 4 finished frames changed, all benign and checked by eye:
decor.flag_stand (swallow-tail notch now cut), wall.poster (torn corner), item.key_silver, item.gatling.
`node --test test/`: 150/151 pass; the 1 failure is art-enemies-infantry's own in-progress test (mouse.die[2] clipped).
Notes: (24) fx.fur is the weakest fx frame — polish wave.

## UPDATE 2026-11-14T20:25Z
DONE +1: art-boss (23 total; 17 frames, not yet seen in game). Launched audio-music (sonnet).
Running (4): render-core (fable), art-enemies-infantry (opus), art-weapons (opus), audio-music (sonnet).
Queue (fresh spawns, next first): art-hud (opus — wait for an opus slot), level-2..6, desktop-shell,
native-windows, native-macos (sonnet).

## UPDATE 2026-11-14T20:30Z
DONE +1: art-enemies-infantry (24 total; suite 151/151 per its report). Launched art-hud (opus).
Running (4): render-core (fable), art-weapons (opus), art-hud (opus), audio-music (sonnet).
Queue (fresh spawns, next first): level-2..6, desktop-shell, native-windows, native-macos (sonnet).
Integration notes: (25) infantry attack anim — frame 1 is the ONLY muzzle-flash frame (flick 1↔0 for trooper
burst); do not spawn separate dropped-gun sprites for corpses (gear is drawn in the `dead` frame); (26) mouse is
~46 px tall on purpose (brief said 56); mouse idle pistol and officer raised luger hard to read at 1× — polish.

## UPDATE 2026-11-14T20:36Z
DONE +1: art-weapons (25 total; 10 view-model images, in-game shot at out/shots/art-weapons/ingame.png). Launched level-2 (sonnet).
Running (4): render-core (fable), art-hud (opus), audio-music (sonnet), level-2 (sonnet).
Queue (fresh spawns, next first): level-3..6, desktop-shell, native-windows, native-macos (sonnet).
Integration note: (27) art-weapons report has a fire-frame playback timing note for sim-player — read
docs/swarm/reports/art-weapons.md during integration.

## UPDATE 2026-11-14T20:41Z
DONE +1: level-2 (26 total; validator 0 errors, levels test 17/17, balance not play-tested). Launched level-3 (sonnet).
Running (4): render-core (fable), art-hud (opus), audio-music (sonnet), level-3 (sonnet).
Queue (fresh spawns, next first): level-4..6, desktop-shell, native-windows, native-macos (sonnet).
Note: (28) level-2 rooms are mostly plain rectangles (only the cellar has wall stubs) — level-QA/polish wave.

## UPDATE 2026-11-14T20:33:58Z — fourth limit hit; cheapest-models + fresh-context plan (v4)
(Timestamps in the five UPDATEs above were guessed ~40 min fast; this one is from `date -u`. Always use `date -u`.)
User instruction (verbatim): "backoff to 4 parallel subagents; lower pace ; use the cheapest models possible while
still getting good results. compact or clear subagents after a checkpoint in the subagent to save context. tell me
your % complete status on the whole project before you begin". Status told to user: ~45% of whole project.
Fourth limit hit ~20:00Z (10 min after the reset): 5-hour limit resets 19:10 ET (00:10Z); **Fable limit resets
06:00 ET Nov 15** — no fable subagents.
DONE (25 of 35 wave-1): art-registry, ui-font, tool-shot, core-input, level-tools, art-walls-fort, sim-world,
render-postfx, art-flats, art-walls-cheese, ui-hud, app-shell, ui-menus, level-1, audio-sfx, art-items,
art-enemies-beasts, art-decor, sim-player, sim-enemies, art-fx, art-boss, art-enemies-infantry, art-weapons, level-2.
Partly built (cut off): render-core (~30%, first frame renders), art-hud (hud.js drafted, unreviewed),
audio-music (engine only), level-3 (nothing).
PLAN v4:
- All remaining agents on **sonnet** (SWARM.md updated: render-core fable→sonnet, art-hud opus→sonnet). Haiku only
  for mechanical doc aggregation. Max 4 running.
- **Do not SendMessage-resume** cut-off agents (re-sends 100–190k transcripts). Spawn a FRESH agent with the same
  prompt; it reads `docs/swarm/progress/<id>.md` (preamble rules 10–11: context budget + checkpoint file; agent
  ends its turn with `CONTINUE: <next step>` after ~25 tool calls → orchestrator spawns a fresh one).
- Orchestrator seeded progress files for render-core, art-hud, audio-music.
- native-windows / native-macos are deferred to wave 4 (build once, with the real game). desktop-shell after levels.
Queue (fresh sonnet spawns, next first): render-core, art-hud, audio-music, level-3, level-4, level-5, level-6,
desktop-shell. Then wave 2 integ-lead (sonnet, staged with checkpoints).
Spawn prompt: "Read /home/bill/src/fun/duum/docs/swarm/prompts/<id>.md and execute it exactly. Keep chat output minimal."

## UPDATE 2026-11-14T20:35:15Z
Subagents ARE running despite the 5-hour-limit notice (art-hud finished in 24 s / 50k tokens on the fresh-context plan).
DONE +1: art-hud (26 of 35). Launched level-4.
Running (4, all sonnet, fresh): render-core, audio-music, level-3, level-4. Queue: level-5, level-6, desktop-shell.
Orchestrator checks on art-hud: art/ui-hud/menus tests 16/16; looked at out/previews/hud.png — cat portraits and
icons read well. Fixed the logo myself (claw gouges hid the "IE" of KRIEG → now thin scored cuts, src/art/hud.js
slash()). Still open for polish: (29) art-hud never checked sizes/anchors against src/ui/hud.js + menus.js, .mat
sheet unseen, portrait frames not reviewed up close.
Tool gotcha: `tools/sheet.mjs --out` is relative to the repo root (an absolute path created ./tmp/... inside the repo; removed).

## UPDATE 2026-11-14T20:36:24Z
User: "keep going, launch the rest as slots free up" (again; cap stays 4, sonnet, fresh contexts).
DONE +1: render-core (27 of 35). All features verified by its agent in screenshots; frame time 0.3 ms on the RX 7900 XTX
(integrated GPU untested); test/render-core.test.mjs 4/4. I looked at out/shots/render-core/f0.png: reflective
marble floor, glints, sprite reflections — looks strong. Launched level-5.
Running (4): audio-music, level-3, level-4, level-5. Queue: level-6, desktop-shell.
Wave 2 is prepared: `integ-lead` (sonnet, p2, staged A–E with CONTINUE checkpoints) is in SWARM.md, prompt at
docs/swarm/prompts/integ-lead.md, work list at docs/swarm/INTEGRATION-NOTES.md (replaces the numbered notes
scattered through this file). Launch it when levels 3–6 and audio-music are done; before launch run
`node tools/swarm-plan.mjs --phase p1=done,p2=active`. While integ-lead runs, run NO other agent that edits src/.

## UPDATE 2026-11-14T20:36:32Z
DONE +1: level-4 (28 of 35; validator OK; not run in the renderer). Launched level-6.
Running (4): audio-music, level-3, level-5, level-6. Queue: desktop-shell. Then integ-lead (see previous UPDATE).

## UPDATE 2026-11-14T20:37:08Z
DONE +1: level-3 (29 of 35; validator OK; not playtested). Launched desktop-shell (owns only desktop/, may overlap integ-lead).
Running (4): audio-music, level-5, level-6, desktop-shell. Queue: empty for wave 1 (native-windows/macos deferred to wave 4).
Next: when audio-music + level-5 + level-6 are done → `node tools/swarm-plan.mjs --phase p1=done,p2=active` → spawn integ-lead.

## UPDATE 2026-11-14T20:38:11Z
DONE +1: level-6 (30 of 35; validator OK; boss difficulty unplaytested). Launched integ-lead stage A (wave 2 begins;
told not to touch src/levels/e1m5.js or src/audio/music.js until those agents' reports exist).
Running (4): audio-music, level-5, desktop-shell, integ-lead. integ-lead is staged: each time it ends with
"CONTINUE: stage X", spawn a fresh sonnet agent with the same prompt.

## UPDATE 2026-11-14T20:38:21Z
DONE +1: level-5 (31 of 35; validator OK; preview PNG not looked at, not playtested). All 6 levels now exist.
Running (3): audio-music, desktop-shell, integ-lead (stage A). Slot 4 left empty on purpose (lower pace; nothing
else is safe to run beside integ-lead except docs/tracker-repo work, which the user asked for "after you're done").

## UPDATE 2026-11-14T20:38:50Z
integ-lead stage A DONE with no code changes: real game boots to level 1 on the WebGL ray tracer, zero errors
(out/shots/integ-lead/a1.png — HUD, cat portrait, pistol paw, walls, a mouse all draw; scene is too dark → polish note 31).
Launched integ-lead stage B (fresh sonnet). Running (3): audio-music, desktop-shell, integ-lead B.

## UPDATE 2026-11-14T20:39:47Z
DONE +1: desktop-shell (32 of 35). Linux x64 package builds (`node desktop/build.mjs --platform linux --arch x64` →
dist/Kaesekrieg-linux-x64/) and smoke passes with the REAL game (software GL 28.6 fps, 0 errors).
Gotchas: electron packager hangs on Node 26 (build.mjs re-runs under nvm Node 20/22/24); the Linux binary needs
`--no-sandbox` (chrome-sandbox not setuid) → wave 4 TODO: ship a launcher script so the user can just double-click/run.
Launched native-macos now (pipeline only; rebuild after the game is final). native-windows next, one at a time
(both may touch desktop/build.mjs).
Running (3): audio-music, integ-lead B, native-macos.

## UPDATE 2026-11-14T20:40:01Z
integ-lead stage B DONE, no code changes: doors, sprites, pushwalls, exit switch all correct on the real renderer
(out/shots/integ-lead/b1..b4). Possible issue to check in C: intermission stats box empty 300 ms after exit.
Launched integ-lead stage C (fresh sonnet; play loop + tools/botplay.mjs).
Running (3): audio-music, integ-lead C, native-macos. Next after native-macos: native-windows.

## UPDATE 2026-11-14T20:41:49Z
DONE +1: native-macos (33 of 35). One command: `desktop/scripts/build-macos.sh` (rsync → bigmac ~/build/kaesekrieg,
private Node 22.12 in its .node/, build darwin-arm64, ad-hoc codesign, ditto zip, --smoke, pull back) ≈ 66 s.
Output dist/Kaesekrieg-darwin-arm64.zip (111 MB); smoke ok, real game, 21.9 fps software GL, 0 errors.
Limit: ad-hoc signed only → Gatekeeper needs right-click Open or `xattr -dr com.apple.quarantine`. (README note for wave 5.)
Launched native-windows. Running (3): audio-music, integ-lead C, native-windows.
Wave 4 is then just: re-run build.mjs (linux) + build-macos.sh + build-windows.sh after the game is final, + Linux launcher script.

## UPDATE 2026-11-14T20:43:03Z
integ-lead stage C part 1 DONE: `node tools/botplay.mjs [--levels 1,2] [--max 120]` — bot (god mode, both keys
granted, own door-passable BFS that skips world.blocker cells) reaches the exit on all 6 levels, 0 console errors,
9–16 s each. Not yet verified: combat both ways, pickups, real key→door, death/respawn, intermission stats,
level→level, victory screen, notes 1/10/11/13 in main.js. No contract changes yet.
Launched integ-lead "stage C (rest)". Running (3): audio-music, integ-lead C2, native-windows.

## UPDATE 2026-11-14T20:44:20Z
DONE +1: native-windows (34 of 35). One command: `desktop/scripts/build-windows.sh` (starts VM if needed, pushes to
C:\Users\dev\kaesekrieg-build, private Node 22.12, build win32-x64, zip, Kaesekrieg.exe --smoke, pull back) ≈ 70 s.
Output dist/Kaesekrieg-win32-x64.zip (138 MB, unsigned → SmartScreen warning); smoke ok, real game, 33.6 fps
software D3D11, 0 errors. Guest quirk: PowerShell Restricted policy → everything via cmd /c and .cmd files.
All three OS build pipelines now pass with the real (pre-polish) game.
Running (2): audio-music, integ-lead C2.

## UPDATE 2026-11-14T20:44:44Z
Launched tracker-repo (sonnet, p5): extracts the tracker + protocol + playbook + templates into the NEW repo
/home/bill/src/ai/agents/swarm-tracker/ (git init only — no commit/remote/push). Prompt: docs/swarm/prompts/tracker-repo.md.
At the very end, re-sync its PLAYBOOK.md with the final docs/LEARNINGS.md.
Running (3): audio-music, integ-lead C2, tracker-repo.
Remaining after these: integ D, integ E → polish wave (lighting first: note 31) → final rebuilds on 3 OSes +
Linux launcher → README.md + docs/BUILD-SPEC.md → final verification + open the game.

## UPDATE 2026-11-14T20:45:41Z
integ-lead stage C DONE, no source changes. Verified in the real game by scripted --eval runs, 0 console errors:
firing/enemy damage, player damage w/o god mode, pickups, real gold key → locked door, death/respawn (lives 9→8),
intermission card (stats animate in — the "empty box" was the animation), level 1→2, VICTORY after level 6.
Launched integ-lead stage D (sound + UI). audio-music still verifying its 8 songs (55%).
Running (3): audio-music, integ-lead D, tracker-repo.
Pace note: the fresh-context sonnet agents finish in 1–3 min at 50–70k tokens each; the whole run since 20:34Z
(13 agents) took ~11 min of wall time.

## UPDATE 2026-11-14T20:48:21Z
DONE: tracker-repo → /home/bill/src/ai/agents/swarm-tracker/ (git init, nothing committed; npm test 8/8; README
screenshot; PROTOCOL.md, PLAYBOOK.md, templates/, examples/demo). Extras: `## @meta` manifest section,
TRACKER_CODE_DIRS, swarm-plan --manifest/--out. TODO at the end: re-sync PLAYBOOK.md with final LEARNINGS.md.
Polish wave (p3) is in SWARM.md: polish-global (lighting diagnosis + docs/swarm/LIGHTING.md recipe, level 1 as
reference) → then polish-level-1..6 (role lvlpolish; one level file each; can run 3–4 in parallel AFTER
polish-global is done). Later: polish-ui (HUD/menu anchors vs real art, title screen), polish-art (sprite fix
list in INTEGRATION-NOTES polish list), final-qa.
Launched polish-global. Running (3): audio-music, integ-lead D, polish-global.

## UPDATE 2026-11-14T20:48:32Z
integ-lead stage D DONE, no fixes needed (notes 1/10/11/13/14 already correct in src/main.js). Verified by --eval:
audio unlock on first key, bus sfx/music → audio, setListener per frame, menus/pause/quit flow, settings persist
(localStorage kasekrieg.settings.v1), automap toggle, all 8 songs load by the names main.js plays.
Only code change: test hooks `__game.audio`, `__game.action(a)` in src/main.js. Open: one 404 per page load (favicon?).
Launched integ-lead stage E (final). Running (4): audio-music, integ-lead E, polish-global.
(3 running; audio-music has been verifying songs since 20:35Z — if it dies or stalls, spawn fresh from docs/swarm/progress/audio-music.md.)

## UPDATE 2026-11-14T20:50:52Z
**WAVE 2 (integration) DONE.** integ-lead stage E: `node --test test/` 173/173; 60 s demo 0 console errors
(frame p50 16.7 ms = headless 60 fps cap); favicon 404 fixed in index.html; botplay reaches exit on all 6 levels.
No contract changes in any stage (only __game.audio/__game.action test hooks + favicon link). Report:
docs/swarm/reports/integ-lead.md. Music: loads by name, playback unverified (audio-music still running).
Polish wave: launched polish-ui (staged A/B) and polish-art (staged, one module per stage) — both in SWARM.md.
Running (4): audio-music, polish-global, polish-ui, polish-art. Next: polish-level-1..6 after polish-global;
re-spawn polish-ui / polish-art on each CONTINUE.

## UPDATE 2026-11-14T20:52:12Z
DONE: polish-global. Cause of the darkness: dark matte default flats (floor_dirt, ceil_stone), tight light radii vs
steep falloff, exposure 1.0 — lights WERE reaching the renderer. Fix: buildScene scales light radius ×1.4
(LIGHT_RADIUS_SCALE in src/sim/game.js); renderer default exposure 1.35; level-1 start room now wood zone + a fill
light. Start-view mean luma 0.039 → 0.28; tests 173/173. Recipe: docs/swarm/LIGHTING.md (40 lines).
I looked at out/shots/polish-global/i_s.png — glossy reflective wood floor, bright sparkly cheese walls: looks great.
polish-art stage 1 done (enemies_beasts); stage 2 running (enemies_infantry, fx, walls_fort).
REQUEST to pass to polish-art when it reaches `flats`: give floor_dirt, floor_stone, ceil_stone gloss 0.12–0.2 and
sparse spark so cellar levels reflect (from polish-global).
Launched polish-level-1. Running (4): audio-music, polish-ui A, polish-art 2, polish-level-1.
Queue: polish-level-4, -2, -3, -5, -6 (one per free slot); polish-ui B; polish-art flats+decor.

## UPDATE 2026-11-14T20:53:34Z
DONE: polish-art (all 6 modules; report docs/swarm/reports/polish-art.md). polish-ui stage A done (weapon x offset
+24→+10 in src/ui/hud.js; automap opaque backdrop), stage B running.
Orchestrator edit: polish-art finished `flats` before I could pass on polish-global's request, so I added
`sheen()` in src/art/flats.js — floor_dirt/floor_stone/ceil_stone now have gloss ~0.11/0.19/0.09 and sparse spark
(were 0.00/0.05/0.03, no spark). flats + art tests 12/12. Not yet looked at in the renderer.
Launched polish-level-4. Running (4): audio-music, polish-ui B, polish-level-1, polish-level-4.
Queue: polish-level-2, -3, -5, -6.

## UPDATE 2026-11-14T20:53:47Z
DONE: polish-level-1 (Fondue Gallery brightened, pillars in Blue Cave + Exit Hall; economy fine: 19 enemies/420 HP
vs 180 hairballs, 10 heals; validator 0 errors; botplay OK). audio-music is alive (touched music-demo.html 20:48Z).
Launched polish-level-2. Running (4): audio-music, polish-ui B, polish-level-4, polish-level-2.
Queue: polish-level-3, -5, -6.

## UPDATE 2026-11-14T20:55:21Z
DONE: polish-level-4 (Moon Court floor → flat.floor_checker + pillars/flags/candelabra, reflections good; Blue Court
+2 pillars not re-shot; ammo glut ~360 hairballs vs ~100 needed left as is; validator 0 errors; botplay OK).
Launched polish-level-3. Running (4): audio-music, polish-ui B, polish-level-2, polish-level-3. Queue: polish-level-5, -6.

## UPDATE 2026-11-14T20:56:12Z
DONE: polish-ui (stage B needed no code changes; game over + victory screens not screenshotted). I looked at
out/shots/polish-ui/title.png — live ray-traced backdrop, gold logo, "PRESS ENTER TO POUNCE": good.
Launched polish-level-5. Running (4): audio-music, polish-level-2, -3, -5. Queue: polish-level-6.
Final wave is in SWARM.md: final-qa (p4; fighting bot --fight, fairness, soak; staged) and docs-final (p5; README,
docs/BUILD-SPEC.md, learnings from reports, ARCHITECTURE §8 fix; staged). Launch docs-final when a slot frees after
polish-level-6 is launched; launch final-qa only after ALL level polish is done.
Orchestrator end tasks (no agent): Linux launcher script (--no-sandbox), rebuild 3 OSes
(`node desktop/build.mjs --platform linux --arch x64`, `desktop/scripts/build-macos.sh`, `desktop/scripts/build-windows.sh`),
re-sync swarm-tracker PLAYBOOK.md with final LEARNINGS.md, final test run, open the game for the user.

## UPDATE 2026-11-14T20:56:16Z
DONE: polish-level-2 (wall stubs/pillars in six bare rooms; Gatehouse start → checker floor + wood ceiling;
economy by arithmetic OK; validator OK; botplay OK). Launched polish-level-6 (last level).
Running (4): audio-music, polish-level-3, -5, -6. Next free slot → docs-final; when all level polish is done → final-qa.

## UPDATE 2026-11-14T20:57:34Z
DONE: polish-level-3 (dock start → floor_grate + lamp-panel ceiling + fill light; River Hall lit from below; Pump
Station fill light never re-shot; economy rough sum OK; validator OK; botplay OK).
Launched docs-final stage 1 (README; told the Linux launcher will be dist/Kaesekrieg-linux-x64/kaesekrieg.sh).
Running (4): audio-music, polish-level-5, polish-level-6, docs-final 1. Then: final-qa after levels 5+6 are done.

## UPDATE 2026-11-14T20:57:50Z
DONE: polish-level-5 (start room fill light + lamp + candelabra; Gold Vault toned down, 4 pillars; +2 tuna;
validator OK; botplay OK). Launched final-qa stage 1 (fighting bot; told not to edit e1m6.js until its polish report exists).
Orchestrator edit: desktop/build.mjs now writes dist/Kaesekrieg-linux-x64/kaesekrieg.sh (exec binary --no-sandbox)
after a linux package — NOT yet rebuilt/tested; do at the final rebuild.
Running (4): audio-music, polish-level-6, docs-final 1, final-qa 1.

## UPDATE 2026-11-14T20:57:56Z
DONE: polish-level-6 (cellar start → wood floor + fill light; 4 crate cover blocks in the arena; arena ammo damage
832 → 2350 vs 1490 enemy HP, healing 45 → 140; validator OK; botplay OK). ALL SIX LEVELS POLISHED.
Running (3): audio-music, docs-final 1, final-qa 1. Nothing queued; respawn docs-final / final-qa on each CONTINUE.

## UPDATE 2026-11-14T21:00:21Z
DONE: docs-final (all 3 stages in one go): README.md + docs/screenshots/ (4 shots, chosen blind — LOOK AT THEM),
docs/BUILD-SPEC.md (cost table mostly "not recorded"), LEARNINGS.md "From the agent reports", ARCHITECTURE.md §8.5
(sim-enemies API) + §9 (lighting constants).
Running (2): audio-music, final-qa 1.
ORCHESTRATOR END LIST (after final-qa + audio-music finish):
 1. Append audio-music + final-qa + docs-final learnings to LEARNINGS.md; fix README test count from a real run.
 2. Add the token/time table to BUILD-SPEC.md from the task notifications (numbers below).
 3. Look at the 4 README screenshots once (one contact image).
 4. Rebuild: `node desktop/build.mjs --platform linux --arch x64` (+ test kaesekrieg.sh --smoke under xvfb),
    `desktop/scripts/build-macos.sh`, `desktop/scripts/build-windows.sh`; record checks with tools/track.mjs --check.
 5. Re-sync ~/src/ai/agents/swarm-tracker/PLAYBOOK.md with final LEARNINGS (items 12–14+).
 6. Final `node --test test/`, botplay all levels; mark phases done in plan.json; open the game for the user.
Token/time per agent (from notifications; tokens, seconds): art-items 116k/308 · art-enemies-beasts 103k/208 ·
art-decor 137k (resumed) · sim-player 180k (resumed) · sim-enemies 169k (resumed) · art-fx 110k/137 · art-boss 90k/116 ·
art-enemies-infantry 189k (resumed) · art-weapons 154k (resumed) · level-2 99k/177 · art-hud 50k/24 (fresh) ·
render-core 67k/120 (fresh) · level-4 69k/118 · level-3 77k/183 · level-6 65k/89 · level-5 66k/113 ·
desktop-shell 63k/146 · native-macos 52k/110 · native-windows 57k/129 · integ A 51k/29 · B 64k/71 · C1 62k/175 ·
C2 68k/145 · D 67k/155 · E 52k/113 · tracker-repo 92k/166 · polish-global 103k/219 · polish-art 65k/45 + 78k/80 ·
polish-ui 79k/117 + 64k/158 · polish-level-1 68k/89 · -4 71k/102 · -2 69k/113 · -3 66k/126 · -5 66k/114 · -6 66k/87.

## UPDATE 2026-11-15T01:09Z — session resumed; endgame
Tests 173/173 (verified). Fresh sonnet agents spawned: audio-music a15e5ff2822251924, final-qa a689d16db88953fa8 (resume from docs/swarm/progress/<id>.md; if cut off, spawn fresh).
Orchestrator end list (items 1-6 under 21:00Z UPDATE) still open: README test count, BUILD-SPEC cost table, look at screenshots, rebuild 3 OSes after agents finish, PLAYBOOK re-sync, final run + open game.

## UPDATE 2026-11-15T01:31:59Z — sixth limit hit (01:21Z), reset 01:30Z
User: "keep going, launch the rest as slots free up". The two fresh agents from 01:09Z were cut off at 01:21Z
(window drained in ~11 min with only 2 sonnet agents + the orchestrator at 255k context on a cold cache → the
ORCHESTRATOR is now the main cost; compact it).
State from their checkpoints: audio-music 70% (8 songs written, render check running, report not written);
final-qa 40% (botplay --fight works, level 1 passes; all-levels run + stage 2/3 not done).
Spawning fresh sonnet agents again for audio-music and final-qa (same prompts; they read docs/swarm/progress/<id>.md).
When BOTH are done → spawn `release-final` (sonnet; prompt docs/swarm/prompts/release-final.md — does the whole
orchestrator end list: tests, learnings append, BUILD-SPEC cost table, screenshot check, 3 rebuilds + smoke,
PLAYBOOK re-sync). After it: orchestrator only verifies its report, marks phases done
(`node tools/swarm-plan.mjs --phase p4=done,p5=done`), and opens the game for the user
(`dist/Kaesekrieg-linux-x64/kaesekrieg.sh` or `node tools/serve.mjs` + browser).

## UPDATE 2026-11-15T01:34:43Z
DONE: final-qa (report docs/swarm/reports/final-qa.md). Fighting bot (no god mode, real keys, skill 2): levels 1–5
exit in 3/3 runs, health ≥ 84, ammo never dry; level 6 beaten 2/3 incl. boss (needs --max 300; the failed seed 106
died 5× and ran out of ammo at the boss). Soak low+ultra 120 s per level: 0 console errors in 12 runs. Tests 173/173.
No src changes. Open suggestion: one extra ammo pickup in the level-6 boss arena (→ give to release-final as its
only allowed src edit; validate + botplay after).
Running (1): audio-music (fresh, a5c9c9ff588ee4df7). When it reports → spawn release-final with the note above.

## UPDATE 2026-11-15T01:40:42Z
DONE: audio-music (35 of 35 wave-1 pieces). All 8 songs render offline with no clipping/NaN, loops within limits;
test/audio-music.test.mjs 9/9. Deviation: songs live in src/audio/music.js, not src/audio/songs/. Nobody has LISTENED.
Launched release-final (sonnet; + the one level-6 ammo pickup from final-qa). Running (1): release-final.
If it ends with CONTINUE → spawn fresh with the same prompt. When done: read docs/swarm/reports/release-final.md,
`node tools/swarm-plan.mjs --phase p4=done,p5=done`, open the game for the user, final summary.

## UPDATE 2026-11-15T01:46:54Z — PROJECT COMPLETE
release-final DONE (docs/swarm/reports/release-final.md): +1 ammo_box in the level-6 arena; tests 173/173; god-mode
botplay 6/6; README/BUILD-SPEC/LEARNINGS updated; screenshots checked (automap replaced); all three packages rebuilt
and smoke-tested with 0 errors (dist/Kaesekrieg-linux-x64/ + kaesekrieg.sh launcher, dist/Kaesekrieg-darwin-arm64.zip,
dist/Kaesekrieg-win32-x64.zip); swarm-tracker PLAYBOOK re-synced (npm test 8/8; still uncommitted).
All phases p0–p5 marked done in .tracker/plan.json. LEARNINGS item 15 added. No git commits anywhere.
Left running: tracker dashboard on :4780; Windows VM (was started for the build — user may stop it with
`cd ~/src/infra/win-devvm && ./vm.sh stop`).
Known open points: nobody has listened to SFX/music; balance checked only by a bot; game-over/victory screens not
screenshotted; macOS ad-hoc signed, Windows unsigned; integrated-GPU performance untested.
