# Build specification — KÄSEKRIEG: Claws of Marmalade

Purpose: rebuild this project from an empty directory with a different orchestrator, agents or machine. Companion files: `ARCHITECTURE.md` (module contract), `docs/CHECKPOINT.md` (orchestrator log, verbatim user requests), `docs/swarm/SWARM.md` (agent manifest), `docs/swarm/prompts/<id>.md` (generated agent prompts), `docs/swarm/reports/<id>.md` (what each agent did), `docs/LEARNINGS.md` (mistakes and rules). Nothing in those is pasted here; this file says how they fit together and in what order to run them.

## 1. Goals and user requirements

Verbatim from `docs/CHECKPOINT.md` ("User requests"), abridged only where marked:

1. "using massive numbers of parallel subagents and choosing the best models like fable 5.2 and others suited for specific subagent tasks (haiku, sonnet, opus, fable 5.2, etc). do: We're making a Castle Wolfenstein style 3D maze game. The main character is a big orange cat. The enemies are large rats and mice wearing World War II Nazi soldier uniforms. There is cat themed and cheese themed in the video game. This is styled off of the Wolfenstein 3D games. [...] It looks like Wolfenstein but the graphics are actually ray traced and sparkly. They still retain a blocky look though like the original Wolfenstein. WOW ME. build this all autonomously without asking me."
2. "also plan for and build a native binary for linux, macos, windows. we have the tools here to build and test in vms and ssh to bigmac"
3. "build a web-visualization and tracker for all of the subagents and this work and popit open"
4. "bigmac is at macbuild.local, available by ssh user@macbuild.local. Windows VM is here in ~/src/ subdir win-devvm/"
5. "after you're done. save that tracking protocol and tracker-dashboard for later reuse by other agent sessions. we'll make a repo in an appropriate sub dir of ~/src. save the plan and full build specifcation for what you do so we can redo it later on another system and set of agents. track your learnings and mistakes, and fixes so we can study and reuse later"

Later instructions that changed the plan: "backoff to 3 parallel subagents; lower pace", then "backoff to 4 parallel subagents; lower pace"; then "use the cheapest models possible while still getting good results. compact or clear subagents after a checkpoint in the subagent to save context."

Authorizations: build without asking; many subagents including top-tier models; use bigmac and the Windows VM. Not authorized: git commits or pushes, destructive actions outside the repo. The tracker repo under `~/src` is the one permitted new directory (`git init` only, no remote).

Deliverable: a playable six-level game (E1M1 to E1M6, boss on E1M6), a native build for Linux, macOS and Windows, a live agent dashboard, a reusable tracker repo, and these docs.

## 2. Decisions and why

| Decision | Reason |
|---|---|
| Original game: no copied art, levels, music or names. Title "KÄSEKRIEG: Claws of Marmalade", hero Major Marmalade (orange tabby, nine lives), enemy faction Das Rattenreich. Emblem is a black cheese wedge in a white disc on red; no swastikas or real insignia | Avoid copying a commercial game; uniforms carry the WWII theme without real hate symbols |
| Dependency-free ES modules, no bundler, no npm outside `desktop/` | Agents can run and test anything with plain `node` and a static server; nothing to install on a new machine |
| WebGL2 fragment-shader ray tracer on a grid (DDA), texel-locked lighting, shadows, reflections, glints, bloom | "Ray traced and sparkly" while staying blocky: one ray per pixel column cell, quantised lighting |
| All art procedural (`PixBuf` pixel buffers, code-generated sprites and textures) | No asset pipeline, deterministic, agents can write art as code and check it with contact sheets |
| WebAudio synthesis for SFX and a tracker engine for music | No audio files to source |
| Contract-first: `ARCHITECTURE.md` + `src/core/defs.js` frozen before any agent starts; one owner per file | 35 agents can work in parallel without merge conflicts; scope grows by adding rows to the manifest |
| Prompts generated from one manifest (`SWARM.md` -> `tools/swarm-plan.mjs`) and spawned as "read and execute that file" | Reproducible on any orchestrator; the prompts are the build spec |
| Every agent writes a report (built / evidence / deviations / mistakes / learnings / requests) and reports progress with `tools/track.mjs` | Feeds the dashboard and the learnings; deviations are visible |
| Native = Electron, built on each OS (Linux here, Windows in a VM, macOS over ssh) with a `--smoke=<dir>` self-test | A smoke test that boots the real game proves the package works; building natively avoids cross-compile problems |
| Validators over taste for levels: `tools/validate-level.mjs` and a god-mode bot (`tools/botplay.mjs`) | Cheap models can write levels safely if a tool checks them |

## 3. Environment and hosts

- Linux dev box, Node 26 (Node 20/22/24 via nvm for packaging; `@electron/packager` hangs on Node >= 25). Chrome headless with WebGL2 on GPU: `google-chrome --headless=new --no-sandbox --use-angle=vulkan --enable-features=Vulkan` (software fallback: `--enable-unsafe-swiftshader`). Prove this verify loop works before choosing a stack.
- macOS: `ssh user@macbuild.local` (the bare name `bigmac` does not resolve). Apple silicon, Node 26 only; the build script fetches Node 22.12 into `~/build/kaesekrieg`.
- Windows 11 VM: `~/src/infra/win-devvm` (`./vm.sh status|start|wait|ssh|push|pull`). Default guest shell is PowerShell with a restricted policy, so build scripts use `cmd /c` and `.cmd` files.
- Tool registry for finding local tools: `python3 ~/src/swe-skills-2/scripts/tool-registry.py`.
- Tracker dashboard: `node tools/tracker/server.mjs` -> http://127.0.0.1:4780/ (`?poll` disables server-sent events for headless screenshots). Events are appended to `.tracker/events/<agent>.jsonl`, plan in `.tracker/plan.json`.
- Generated agent timestamps: always `date -u` / `toISOString()`, never hand-written.

## 4. Phase plan as executed

Agent lists are in `docs/swarm/SWARM.md` (header `## id | model | phase | role | name`). Spawn command for every agent: "Read /home/bill/src/fun/duum/docs/swarm/prompts/<id>.md and execute it exactly."

### p0 Foundation (orchestrator, by hand)
Wrote `ARCHITECTURE.md`, `src/core/defs.js`, `package.json`, `tools/track.mjs`, `tools/tracker/{server.mjs,index.html}` (a tracker agent), `docs/swarm/SWARM.md`, `tools/swarm-plan.mjs`, `src/art/pixbuf.js`.
- Entry: user request. Exit gate: `node tools/swarm-plan.mjs` generates 48 prompts and `.tracker/plan.json`; `node tools/tracker/server.mjs` serves a dashboard that shows the plan; defs and architecture reviewed once.
- Lesson: unit-test the frozen foundation (every `PixBuf` method) before launching; a defect in `PixBuf.set` went unnoticed by five agents (LEARNINGS 13).

### p1 Modules (35 agents, in isolation against the contract)
- art: art-walls-cheese, art-walls-fort, art-flats, art-enemies-infantry, art-enemies-beasts, art-boss, art-items, art-decor, art-fx, art-weapons, art-hud, art-registry
- engine: render-core, render-postfx, app-shell, core-input
- sim: sim-world, sim-player, sim-enemies
- ui: ui-font, ui-hud, ui-menus
- audio: audio-sfx, audio-music
- levels: level-1 ... level-6, plus level-tools (validator, preview, level index)
- tooling: tool-shot (headless screenshot driver and `tools/serve.mjs`)
- desktop: desktop-shell, native-windows, native-macos
- Entry gate: p0 exit. Exit gate per agent: its report exists in `docs/swarm/reports/` and tracker shows `done`. Exit gate for the phase: every manifest id has a report. Per-module commands: `node --test test/<id>.test.mjs`, `node tools/sheet.mjs <artModule>`, `node tools/validate-level.mjs src/levels/e1mN.js`, `node desktop/build.mjs --platform linux --arch x64`.
- The orchestrator collected cross-module facts and unverified claims from the reports into `docs/swarm/INTEGRATION-NOTES.md`.

### p2 Integration (integ-lead, alone)
Make the modules one game that boots and plays title to end of level 6 in headless Chrome with the real ray tracer. Work list is `docs/swarm/INTEGRATION-NOTES.md`.
- Entry: all p1 reports. Exit: `node --test test/` green; `node tools/shot.mjs --url "/index.html?autostart=1&level=1" --out out/shots/x.png --strict` produces a frame with no console errors; `node tools/botplay.mjs` (god mode) reaches every exit.

### p3 Polish (9 agents)
polish-global (lighting constants and recipe, `docs/swarm/LIGHTING.md`), polish-level-1 ... polish-level-6 (apply the recipe per level), polish-ui (HUD and menus against the real art), polish-art.
- Entry: p2 exit. Exit: `node tools/validate-level.mjs` and the god-mode bot pass on each level; mean luma of each start view measured (target roughly 0.2-0.3, see LEARNINGS and `polish-global.md`).
- Trigger: the orchestrator saw `out/shots/integ-lead/a1.png` and found the first room almost black (integration note 31); this is why polish-global exists.

### p4 QA and native builds
- final-qa (fighting bot `--fight`, fairness, soak at `quality=low` and `ultra`).
- Native rebuild by the orchestrator: `node desktop/build.mjs --platform linux --arch x64` (writes `kaesekrieg.sh` with `--no-sandbox`), `desktop/scripts/build-macos.sh`, `desktop/scripts/build-windows.sh`. Exit: each records `build-<os>` and `smoke-<os>` checks as pass in the tracker; smoke.json has `ok:true`, `page:"index.html"`, 0 errors.

### p5 Docs
tracker-repo (standalone copy of the tracker at `~/src/ai/agents/swarm-tracker/`), docs-final (README, this file, learnings, architecture fixes).

## 5. Orchestration rules that worked

- Contract and ownership first; agents never edit files they do not own and put needs under "Requests" in their report.
- Prompts are files generated from one manifest; spawn text is one line.
- Concurrency: 20 simultaneous agents drained the 5-hour usage window in minutes, twice. What ended up working: at most 4 running, a 5th only when one finishes.
- Model tiers: top model only for the piece that defines the product (the ray tracer), mid tier (opus) for sim and always-visible art, sonnet for everything else. After the fourth limit hit: sonnet only. Validators and bots let a cheap model produce correct levels.
- Agents keep a 30-line checkpoint file (`docs/swarm/progress/<id>.md`) and end their turn with `CONTINUE: <step>` after about 25 tool calls; a fresh agent with a clean context continues from the file. Do not resume big transcripts with SendMessage unless the agent is a few calls from done.
- Agents cap image reads (about 6) and measure with numbers (mean luma from a small PNG decoder) instead.
- Orchestrator context is a cost too: checkpoint to `docs/CHECKPOINT.md` before heavy writing, compact before each wave, one launch plus one checkpoint append per completion notice.
- Report timestamps from `date -u`.

## 6. What the orchestrator did by hand

Foundation (p0); the model rebalancing and relaunches after each limit hit; the integration-notes file; the lighting trigger finding (dark start room); building the macOS and Windows packages and the Linux launcher (`kaesekrieg.sh` added to `desktop/build.mjs` output); re-syncing the reusable tracker's PLAYBOOK with `docs/LEARNINGS.md`; final full test run; opening the game for the user; the tracker server restart procedure.

## 7. Time and cost

Dollars were not recorded. Token counts per agent were copied by hand from task notifications (table below; "not recorded" where none was captured), plus rough figures in `docs/LEARNINGS.md` such as 70-95k tokens for small sonnet agents and a 100-190k transcript for large ones. Wall time below is first to last tracker event on 2026-11-14 UTC and includes waiting for four usage-limit resets, so it is not working time. Tracker timestamps for the early agents partly come from hand-written values (see LEARNINGS).

| Group | Agents | Model | Wall time (first to last event) | Tokens |
|---|---|---|---|---|
| p0 foundation + tracker | orchestrator, tracker | top | 06:04 to ~06:17 | not recorded |
| p1 quick (cheap, finished in a first window) | art-registry, ui-font, tool-shot, core-input, level-tools | sonnet | 1-2 min active each | not recorded (about 70-95k each) |
| p1 first-window finishers | app-shell, art-flats, art-walls-fort/cheese, audio-sfx, render-postfx, sim-world, ui-hud, ui-menus, level-1, art-enemies-beasts, art-items | sonnet | started 09:12, done 14:13-14:22 | not recorded, except art-items 116k / 308 s; art-enemies-beasts 103k / 208 s |
| p1 large | render-core, sim-player, sim-enemies, art-enemies-infantry, art-weapons, art-boss, art-hud, audio-music, desktop-shell, art-decor | fable/opus then sonnet | started 09:12-14:17, done 19:51-20:54 (audio-music still open at 20:54) | render-core 67k / 120 s; art-hud 50k / 24 s; desktop-shell 63k / 146 s; art-boss 90k / 116 s; art-decor 137k (resumed); sim-player 180k (resumed); sim-enemies 169k (resumed); art-enemies-infantry 189k (resumed); art-weapons 154k (resumed); audio-music not recorded |
| p1 late | art-fx, level-2 ... level-6 | sonnet | 1-3 min each, 19:52-20:37 | art-fx 110k / 137 s; level-2 99k / 177 s; level-3 77k / 183 s; level-4 69k / 118 s; level-5 66k / 113 s; level-6 65k / 89 s |
| p2 integ-lead | 1 | sonnet | 12 min (20:38-20:50) | integ A 51k / 29 s; B 64k / 71 s; C1 62k / 175 s; C2 68k / 145 s; D 67k / 155 s; E 52k / 113 s |
| p3 polish | 9 | sonnet | 1-5 min each, 20:48-20:57 | polish-global 103k / 219 s; polish-art 65k / 45 s + 78k / 80 s; polish-ui 79k / 117 s + 64k / 158 s; polish-level-1 68k / 89 s; -2 69k / 113 s; -3 66k / 126 s; -4 71k / 102 s; -5 66k / 114 s; -6 66k / 87 s |
| p5 docs | tracker-repo (3 min), docs-final | sonnet | 20:44 onward | tracker-repo 92k / 166 s; docs-final not recorded |
| Usage-limit hits | 4 | n/a | 5-hour windows; about 3 hours lost after the first | n/a |

Note: agents on a fresh context at ~50-70k tokens each were far cheaper than resumed ones at 100-190k.

Totals: 48 generated prompts, 50 tracker agent files, 45 reports at the time of writing.

### 7.1 Token estimate per phase (added after the build)

"Recorded" = from task notifications (subagent tokens, mostly cached input re-read each tool call, so not billable-equivalent to output). "Est." = unrecorded agents priced at the typical 90k for a sonnet-size task (100k for tracker/docs-final, 150k audio-music, 200k final-qa). Dollars cannot be derived: the model mix per agent was not logged.

| Phase | Recorded | Est. (unrecorded agents) | Phase total |
|---|---|---|---|
| p0 foundation + tracker agent | 0 | ~100k (tracker agent; orchestrator unmeasured) | ~0.1M |
| p1 quick x5 | 0 | ~400k | ~0.4M |
| p1 first-window finishers x12 | 219k | ~900k | ~1.1M |
| p1 large x10 (incl. 5 resumed at 137-189k) | 1,099k | ~150k (audio-music) | ~1.25M |
| p1 late x7 | 486k | 0 | ~0.5M |
| p2 integ-lead A-E | 364k | 0 | ~0.4M |
| p3 polish x11 runs | 795k | 0 | ~0.8M |
| p4 final-qa | 0 | ~200k | ~0.2M |
| p5 docs + tracker-repo + git publish + cost table | 92k + 52k + 46k | ~100k (docs-final) | ~0.3M |
| **Subagents, completed work** | **~3.15M** | **~1.85M** | **~5.0M** |
| Wasted: runs killed by usage limits (4 hits, ~20 agents died mid-run in the first) | not recorded | ~1-2M (guess) | ~1.5M |
| Orchestrator (this session, all turns, mostly cache reads) | not recorded | multi-million | unmeasured |

Rules of thumb: a small fresh-context sonnet task is 50-100k; a staged agent that ends with `CONTINUE:` is the cheapest pattern; resuming a cut-off agent costs 2-3x a fresh respawn. Whole project: roughly 5M subagent tokens for the work that landed, about 6.5M with waste, plus the orchestrator.

## 8. Known limitations

- Software-GL smoke numbers only (about 22-34 fps); real-GPU performance on macOS and Windows was not measured.
- macOS zip is ad-hoc signed and the Windows zip is unsigned; Gatekeeper and SmartScreen warn on first run. Only arm64 for macOS and x64 for Windows and Linux were built.
- Unpackaged Linux build needs `--no-sandbox` (the launcher does this).
- The level validator ignores player radius and blocking decor, so squeeze points need playtesting.
- Music (audio-music) and final-qa were still running when this document was written; their results are in their reports, not here.
- Polish-list items from `INTEGRATION-NOTES.md` that no later agent addressed remain open (for example SFX never listened to, plush sewer rat, weak `fx.fur`).
- No git history: the repo was never committed (the user did not authorize commits).

## 9. Rebuild recipe (short)

1. Create the dirs, restore `ARCHITECTURE.md`, `src/core/defs.js`, `docs/swarm/SWARM.md`, `tools/{track,swarm-plan}.mjs`, `tools/tracker/`.
2. `node tools/swarm-plan.mjs`; `node tools/tracker/server.mjs`.
3. Run p1 agents, 4 at a time, from `docs/swarm/prompts/`; tick off reports.
4. Run integ-lead, then p3 polish, then final-qa; do the native builds; run tracker-repo and docs-final.
5. Gate each step with the commands in section 4.
