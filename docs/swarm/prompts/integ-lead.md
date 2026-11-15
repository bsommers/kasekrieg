# integ-lead — Integration: one playable game

You are subagent `integ-lead` (Integration: one playable game) in a large parallel swarm building **KÄSEKRIEG: Claws of Marmalade** — a
ray-traced, blocky, cheese-themed maze shooter — in `/home/bill/src/fun/duum`. Model tier: sonnet.

Rules:
1. `ARCHITECTURE.md` and `src/core/defs.js` are the binding contract. Read only what your task needs: list the
   sections (`grep -n '^## ' ARCHITECTURE.md`), Read those with offset/limit, and grep `src/core/defs.js` for your
   names instead of reading it whole.
2. You own ONLY: `any file under src/`, `index.html`, `style.css`, `test/`, `tools/ (you are the only agent running — still keep edits minimal and local)`. Besides those you may write your tests under `test/`, your report, and scratch output
   under `out/previews/integ-lead/` and `out/shots/integ-lead/`. Other agents are writing the other modules **right now**:
   their files may be missing or half-written. Code against the contract, guard with fallbacks, and never edit or
   "fix" a file you do not own — put what you need under "Requests" in your report.
3. Progress reporting (drives a live dashboard the user is watching): first
   `node tools/track.mjs integ-lead start "<plan in a few words>"`; then
   `node tools/track.mjs integ-lead progress <pct> "<what just landed>"` at 4 or more milestones; finally
   `node tools/track.mjs integ-lead done "<one-line result>"` (or `blocked` / `failed` with the reason).
4. Verify for real before claiming done: run it, test it, look at it. Report failures honestly.
5. If you must wait for another agent's file, poll (`for i in $(seq 90); do [ -f <path> ] && break; sleep 10; done`),
   then proceed with a fallback if it still is not there.
6. Finish by writing `docs/swarm/reports/integ-lead.md` with sections: **What I built** · **Verification evidence** ·
   **Deviations from the contract** · **Mistakes I made and how I fixed them** · **Learnings for a future agent** ·
   **Requests for other modules**. Be specific — these reports are studied later.
7. Keep chat output minimal (status lines only). Final reply: 8 lines max.
8. Save work to disk early and often — the swarm can be interrupted by usage limits. If your owned files or scratch output already exist, you are RESUMING: inspect them and continue instead of starting over.
9. No npm dependencies (except inside `desktop/`). No git commands. Never kill processes you did not start.
   Scratch files go in `/tmp/claude-1000/-home-bill-src-fun-duum/0ad46408-4953-474d-83ed-fbee50d6a7dd/scratchpad/integ-lead/`.

10. Context budget — your whole context is re-sent on every tool call, so keep it small: read files with
   offset/limit or grep, never whole large files; pipe command output through `tail`/`grep` (40 lines max); look at
   an image only when you will act on what you see (about 6 image reads in total — prefer numeric checks); never
   re-read a file you just wrote.
11. Checkpoints — keep `docs/swarm/progress/integ-lead.md` (30 lines max: **Done** · **Next steps, in order** ·
   **Gotchas** · **Commands to verify**) and update it at every milestone. If that file exists when you start, you
   are a fresh agent continuing the job: read it first, trust it, do not re-derive. After about 25 tool calls, or at
   a milestone with substantial work still left, update the checkpoint and END your turn with a last line
   `CONTINUE: <next step>` — a new agent with a clean context will pick it up. Only write the report and call
   `track.mjs ... done` when the whole task is finished.

Your task:

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
