# Learnings, mistakes & fixes — KÄSEKRIEG swarm build

Running log. Format: **what happened → why → fix / rule for next time**. Per-agent detail lives in
`docs/swarm/reports/<agentId>.md`.

## Orchestrator
1. **Bare hostname `bigmac` did not resolve** (not in `~/.ssh/config`, only mDNS/hosts as `macbuild.local`) →
   found via shell history → rule: probe hosts with `getent hosts` + history before assuming; use `user@macbuild.local`.
2. **Headless Chrome can render WebGL2 on the real GPU** with `--use-angle=vulkan --enable-features=Vulkan`
   (also `--use-gl=angle --use-angle=gl-egl`; `--enable-unsafe-swiftshader` for software). Verified before
   choosing a web stack → rule: prove the verify loop exists before committing to an architecture.
3. **`plan.json` `startedAt` was written as local time with a `Z` suffix** (5 h off) → tracker agent noticed the
   clock skew → fix: always produce timestamps with `new Date().toISOString()`, never by hand.
4. **Orchestrator context reached 79% before the swarm was launched** (large system prompt + long design
   reasoning + big contract files written inline) → fix: checkpoint (`docs/CHECKPOINT.md`) *before* the heavy
   writing, keep agent prompts in files generated from one manifest, and delegate foundation tools where a
   contract suffices.
5. **Server-Sent Events keep `--virtual-time-budget` screenshots from ever finishing** → tracker supports
   `?poll` to disable SSE for headless capture → rule: any page with a persistent connection needs a
   test-mode switch.
6. **Mid-flight scope additions** (native binaries, tracker, reusable spec) arrived while designing → the
   contract-first approach absorbed them as extra sections/agents without rework → rule: fix the contracts
   and ownership map first; scope then grows by adding rows, not by rewriting.
7. **Launching 35 agents in one message: 20 started, 15 were rejected ("Concurrent subagent limit reached … 20")**
   → rule: max 20 concurrent subagents (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`); plan waves of ≤20 and backfill
   as agents finish.
8. **All 20 running agents died within minutes with HTTP 429 "You've hit your 5-hour limit"** — the orchestrator's
   own long, ~200k-token context (re-sent every turn on the top model) plus a 140k-token dashboard agent had
   already consumed most of the window, and 20 simultaneous top-tier agents finished it off. ~3 h lost waiting
   for the reset. → rules: (a) do the expensive design work in a *small* context and write it to files early;
   (b) checkpoint and compact *before* launching a swarm; (c) budget tiers — top model only for the quality-critical
   core, mid model for bulk art/levels, small model for tooling; (d) make every agent resumable (save early,
   "if files exist you are resuming"), which the prompt preamble now says; (e) launch critical-path agents first.
9. **Model rebalance after the limit hit**: fable kept for render-core, sim-player, sim-enemies,
   art-enemies-infantry, art-boss, art-weapons, art-hud, audio-music; walls/beasts/levels 1+4 → opus;
   levels 2/3/5/6 → sonnet (the validator guards correctness).
10. **Second limit hit (window 2): 20 concurrent agents drained the whole 5-hour window in a few minutes.** Only the
    five small sonnet agents (70–95k tokens each) finished; 15 opus/fable agents died mid-work. The orchestrator's
    own ~250k-token context, re-sent on every wake-up, is also a major drain. → rules: concurrency does not
    create budget — total tokens do; half-finished agents waste their start-up cost on every restart. Run ≤8 at
    a time, critical path first, so each window ends with *finished* modules. Top model only for the one piece
    that defines the product (ray tracer); mid model for sim + the on-screen-always art; small model for the
    rest. Compact the orchestrator before a swarm, and wake it as rarely as possible.
11. **Model plan v3** (after hit 2): fable = render-core; opus = sim-player, sim-enemies, art-enemies-infantry,
    art-weapons, art-hud; sonnet = everything else.

## 12. Third limit hit — 8 concurrent was still too many (2026-11-14 ~15:15Z)
- **What happened:** with 8 agents running (1 fable, 4 opus, 3 sonnet) the 5-hour window drained again; 6 agents
  died mid-task. Two cheap sonnet art agents finished just before.
- **User's fix:** "backoff to 4 parallel subagents; lower pace".
- **Rules going forward:** cap 4 running; at most 1 fable + 2 opus at once; fill the rest with sonnet.
- **Resume, don't respawn:** a limit-killed agent keeps its transcript. `SendMessage` to its agent id continues it
  from where it stopped, which is cheaper than a fresh agent re-reading the contract and re-deriving its state.
  Record agent ids in the checkpoint so this survives an orchestrator compaction.
- **Orchestrator cost:** the orchestrator's own context (300k tokens, re-sent on every completion notice) was a
  large share of the burn. Compact the orchestrator before each wave, and keep per-notice turns to one launch
  plus one checkpoint append.

## 13. A bug in the frozen shared library went unnoticed by five agents (2026-11-14 ~20:15Z)
- **What happened:** `PixBuf.erase()` did nothing on filled pixels (`set` sent alpha-0 inks down the blend path).
  Three art agents called it, saw no effect, and either worked around it or accepted the result. Only the sixth
  (art-fx) reported it.
- **Fix:** one condition in `PixBuf.set`. Hashed every finished art frame before and after; 4 frames changed, all
  improvements, checked by eye in a before/after sheet.
- **Rules:** (a) unit-test the frozen foundation before launching a swarm on it — every method, not a demo sprite;
  (b) tell agents in the preamble to report shared-library defects in their final message, not only work around
  them; (c) when fixing shared code mid-swarm, hash dependants before/after so the blast radius is known.

## 14. Fourth limit hit — resuming agents is what drained it (2026-11-14T20:33:58Z)
- **What happened:** after the reset I resumed six cut-off agents with SendMessage and spawned six fresh ones, four
  at a time. The window was gone in about ten minutes, and the separate Fable cap was hit too.
- **Why:** every resumed agent re-sent a 100–190k-token transcript on a cold cache, on its original (expensive)
  model. The orchestrator itself (Fable, ~110k context) woke up on every completion notice.
- **User's fix:** "use the cheapest models possible while still getting good results. compact or clear subagents
  after a checkpoint in the subagent to save context."
- **Rules (model plan v4):** sonnet for everything that remains; no top-tier subagents. Agents keep a 30-line
  checkpoint file and stop after a milestone; a fresh agent continues from the file. Never resume a big transcript.
  Agents read only the contract sections they need and cap image reads. This reverses learning 12's "resume, don't
  respawn" — that held only for agents a few tool calls from done.
- **Also:** I wrote guessed timestamps into the checkpoint (about 40 minutes fast). Stamp with `date -u`.

## From the agent reports
Distilled from the **Mistakes** and **Learnings** sections of `docs/swarm/reports/*.md` (agent id in brackets). Reports for audio-music and final-qa did not exist when this was written.

### Pixel art and procedural sprites
- Draw an edge once per shape (one polygon), not once per stamp; stacked outlined blobs give zigzag stripes [art-boss].
- Do not carve shapes with erase; build the final silhouette instead. `PixBuf.erase()` also had a defect (see section 13) [art-decor, art-fx].
- Squash/shear warps smear death frames. Translate the sprite down and cover it with a foreground heap; or rotate nearest-neighbour about the body centre, re-ground, and draw the outline after the transform [art-boss, art-enemies-beasts, art-enemies-infantry].
- Draw fine features (whiskers) and glows (muzzle flash) after the outline, or the outline triples their thickness. Outline only fully transparent neighbours so soft halos stay clean; outline before dissolving, or specks appear in holes [art-enemies-infantry, art-fx].
- A hat or helmet covering the eyes kills readability at 1x. Eyes plus a red emissive glint make a face read. Draw ears after the hat so they poke out [art-enemies-infantry].
- Emblems and fine detail at 64 px: draw explicitly in flat colours with a dark outline; slope/emboss shading turns to mud [art-walls-cheese]. Keep large red emblems small or they read as flowers [art-enemies-infantry]. Overlay effects must stay thin over lettering [art-hud].
- `Ramp()` lightens strongly: choose darker bases than the target. Low-contrast whites (brie on a plate) need distinct ramps [art-enemies-beasts, art-items].
- `PixBuf.poly` fills up to but excluding the max vertex row; to touch row 63 use y=63. Single-pixel details sit at half-integer coordinates when feet are at y=0 and centre x=32 [art-items, art-enemies-infantry].
- Seamless tiles: integer-period sines, modulo-lattice noise, animation phase advancing by 2pi/N per frame [art-flats]. Hash noise per sector, not per pixel, for chunky blobs [art-fx].
- Iterate by eye on a custom grid renderer at 3-5x; `tools/sheet.mjs` makes one very tall strip [art-decor, art-items, art-walls-fort].
- Shapes that read as something else on first pass (cake, skull, plush toy, butter block, flower) were common; plan one redraw per hero sprite [art-decor, art-fx, art-enemies-beasts, art-items].

### Performance and measurement
- `PixBuf.get`/`blit`/`outline` allocate per pixel. Use raw-array or typed-array variants (`outlineFast`, `blitFast`, `copyOver`), inline the inverse transform, cache trig per primitive, avoid `Math.hypot` in hot loops [art-weapons, art-enemies-infantry].
- A cold first `build()` is far slower than a warm one (100-260 ms). Measure in a fresh process, after a warm-up call for budget tests [art-walls-fort, art-enemies-infantry].
- Measure with numbers: mean luma from a small PNG decoder, `__demo.bench`, `gpuMs` from timer queries. Headless frame time is vsync-bound [polish-global, render-core, integ-lead]. PIL was not installed on the host, so Python luma checks failed [polish-level-1, polish-level-5].

### Shaders and rendering
- Compile-test shaders in the real browser early. GLSL ES 3.00 forbids swizzling scalars and comparing int to float; a never-run postfx shader failed to compile [render-postfx].
- Bloom with large areas above HDR 4 blows to white; set exposure sensibly (about 1 for lit levels) [render-postfx]. Final lighting constants are in ARCHITECTURE section 9.
- Check the camera before blaming the renderer: a demo view sat inside a prop sprite [render-core].
- A wall spark spawned 0.2 units from the camera filled the screen; skip sparks within 0.45 of walls and drop fx within 0.3 of the camera [sim-player].
- Door slab geometry in the renderer must match the header comment in `src/sim/world.js` [render-core].

### Lighting
- First lighting pass overshot (mean luma 0.71): gain 1.3, exposure 1.7, cheese-tile floor, two fill lights. Settled at exposure 1.35, `LIGHT_GAIN` 1.0, `LIGHT_RADIUS_SCALE` 1.4, a wood floor and one fill light, giving 0.2-0.3 [polish-global].
- Cheese flats (luma about 0.65) clip quickly; wood is the best dim-mood glossy floor; gold floors stay very bright even under a wood ceiling [polish-global, polish-level-5].
- The real gaps in a dark scene were matte flats, tight light radii against a steep falloff, and exposure 1.0 [polish-global].

### Simulation and module integration
- Put cross-module calls on the game object (`game.sys`, `game._hooks`) instead of importing; only `game.js` uses top-level await, and cycles through modules with top-level await can deadlock [sim-player, sim-enemies].
- One system must own each counter. Kills and score were counted twice (listener plus `enemies.js`) [sim-player].
- Check operator precedence in guards (`!force && A || B`) [sim-player].
- Doors: `world.blocksMove(..., true)` treats unlocked doors as passable, so AI must `openDoor` and wait for `open >= 0.8`. A door can finish opening inside one tick; assert with single-tick steps [sim-enemies, sim-world].
- A continuous laser calls `damageEnemy` every tick; key stun and effects off state changes, not hits [sim-enemies].
- Ranged enemies correctly stop at their preferred distance; write tests for behaviour, not for what you assumed [sim-enemies].
- Choosing a neighbour over `distField` with crowd penalties spreads groups better than `world.nextStep` [sim-enemies].
- Input: do not clear another consumer's latch inside `poll()`/`menu()`; use time-to-live expiry. `localStorage` access itself can throw [core-input]. Menus swallow input edges for 0.12 s after opening; tests must wait [ui-menus, integ-lead].
- When the shell is built before the modules, an import map in the test harness can substitute missing modules without touching owned files [app-shell]. A failed autostart must still enter the title state [app-shell].
- Bot navigation must treat `world.blocker` cells (blocking decor) as impassable [integ-lead].

### UI
- Bitmap font advance is 6 px (budget `chars*6*scale`); the 5x7 font has no degree sign; check `glyphChars()` before using symbols [ui-hud, ui-menus, ui-font].
- Screens null themselves after returning 'done' and level intros auto-dismiss (capture at t<4.2) [ui-menus]. Early intermission/death screenshots looked faded because they were captured during the fade-in [polish-ui].
- The registry fills missing images with a checker; the HUD should consult `atlas.missing` for its own placeholders [ui-hud]. Do not hold a stale reference after `Object.assign(game, ...)` [ui-hud].
- Descender letters use rows 1-6 so g can look like 9 at 1x [ui-font].

### Levels
- Generate grids from room rectangles with helpers that throw on a bad cell; hand-typed rows and undefined wall chars produced rows of the wrong width [level-1, level-3, level-4, level-5, level-6].
- Light budget is 12-40 per level; every first draft overshot (45-66 lights) [level-2 ... level-5].
- Pushwalls: pocket of two open cells behind the wall plus the side cells, ringed by solid walls, leave 4-wide solid gaps between rooms; keep pocket cells free of items and out of key-door bypass paths; keep closets in unused map margins [level-2, level-3, level-4, level-5, level-6].
- Things rows and map rows are 1:1; in the files the things rows carry a 5-character prefix, so script edits need a column offset of 5 (this broke polish-level-2/3/4). Run `validate-level` immediately after every edit [polish-level-2, polish-level-3, polish-level-4].
- `p` is the panzer rat; decor pillars are `I` [polish-level-5]. Two adjacent doors are invalid [level-tools]. Border cells of `things` must be `.` [level-tools].
- Economy and boss notes: the 1100 hp boss is mostly beaten with laser/yarn carried from the Armoury; phase-2 summons add hp not counted [polish-level-6]. Seven sewer rats in the first draft was too many [level-1].

### Tooling
- `tools/shot.mjs`: `--timeout` must exceed `--wait`; `--eval` needs `--wait-for "window.__game&&__game.audio"` or it runs before boot; `--eval` awaits promises (works for OfflineAudioContext). Filter the `/favicon.ico` 404 or `--strict` always fails. Kill the whole process group (`process.kill(-pid)`). Piping into `head` masks the exit code [app-shell, integ-lead, audio-sfx, tool-shot].
- Reach hard screens with `--eval "window.__game.game.status='complete'|'dead'"`; pack several shots into one image read with ImageMagick montage [polish-ui]. `?pos=x,y,deg` positions the camera [polish-global]. Overriding `G.cmd` lasts one frame [integ-lead].
- Audio: formant voices are much quieter than other sounds (add a boost); very short sounds (under 20 ms) are inaudible; render offline at 44.1 kHz; envelope ramps must stay above 0 and the first `setValueAtTime` precedes the ramps [audio-sfx].
- Tracker: LOC counting uses `TRACKER_CODE_DIRS`; `/files/` serves only `out/` and `dist/` [tracker-repo].

### Native builds
- `@electron/packager` hangs on Node 25/26 (extract-zip). Use Node 20/22/24; `build.mjs` re-execs under nvm, the Mac and Windows scripts fetch a private Node 22.12 into their build dir [desktop-shell, native-macos, native-windows].
- Linux Electron needs `--no-sandbox` on the command line; setting it from app code is too late [desktop-shell].
- Windows guest: PowerShell restricted policy blocks `.ps1`/`npm.ps1`, so use `cmd /c` and `.cmd` files; `curl.exe` and `bsdtar` are built in [native-windows]. Smoke tests work over plain ssh on both macOS and Windows [native-macos, native-windows].
- Signing: macOS zip is ad-hoc signed (Gatekeeper: right-click Open or `xattr -dr com.apple.quarantine`); Windows zip is unsigned (SmartScreen) [native-macos, native-windows].

### Process mistakes across agents
- Resuming over a half-finished file: read it, run it, then continue. A previous agent's 788-line draft had never been run [art-hud, art-walls-cheese, app-shell, render-postfx].
- Tests with placeholder junk or wrong expectations (BFS distance, too few walk ticks, player inside the exit cell) [core-input, sim-world, sim-player, art-items].
- Out-of-budget image reads: agents that could not view their final tweak relied on numeric tests; say so in the report [polish-art, polish-level-1].
- Headless software-mode renders of all 8 songs in one page exceed 200 s: analyse per song, one chrome per song in parallel (`--gpu none`, `--timeout 570000`); judge loops by relative RMS error, not max-diff (sub-sample noise shifts) [audio-music].
- Bots/soaks run in real time: 12 parallel bots starve the CPU and the sim lags, so run <=6 at once; a short `--max` (150 s) on the boss level reads as a failure, use >=300 [final-qa].
- Mistake: a fight-bot verdict is only as good as its time cap; a timeout is not a block. Check the log before calling a level broken [final-qa].
- Tracker timestamps include limit-reset waits and no token counts exist: record usage per agent at the time, or the cost table stays "not recorded" [docs-final].
- Mistake: wrong tool name on the first edit (`bash` vs `Bash`) [docs-final].

## 15. Limit hits five and six — the orchestrator became the main cost (2026-11-15T01:46:54Z)
- **What happened:** with plan v4 (sonnet only, fresh contexts, 50–100k tokens per agent) about 40 agents ran in
  roughly 30 minutes of wall time on one window. The window still ran out twice more near the end, the last time
  with only two sonnet agents running.
- **Why:** the orchestrator ran on the top-tier model with a 250k-token context, re-sent on every completion
  notice; after each idle gap the cache was cold, so each wake-up cost a full re-read.
- **Rules:** compact the orchestrator between waves (not only when warned); keep the checkpoint file good enough
  that compaction loses nothing; batch several small jobs into one agent so there are fewer completion notices;
  give the close-out list (tests, rebuilds, docs fixes) to one cheap agent instead of doing it in the
  orchestrator's context; consider running the orchestrator itself on a mid-tier model once the plan is fixed.
- **What worked:** staged agents that end with `CONTINUE:` and a 30-line checkpoint — every cut-off agent was
  continued by a fresh one without loss. Scripted in-page assertions instead of screenshots kept QA agents small.
