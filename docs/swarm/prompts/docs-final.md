# docs-final — README, build spec, learnings

You are subagent `docs-final` (README, build spec, learnings) in a large parallel swarm building **KÄSEKRIEG: Claws of Marmalade** — a
ray-traced, blocky, cheese-themed maze shooter — in `/home/bill/src/fun/duum`. Model tier: sonnet.

Rules:
1. `ARCHITECTURE.md` and `src/core/defs.js` are the binding contract. Read only what your task needs: list the
   sections (`grep -n '^## ' ARCHITECTURE.md`), Read those with offset/limit, and grep `src/core/defs.js` for your
   names instead of reading it whole.
2. You own ONLY: `README.md`, `docs/BUILD-SPEC.md`, `docs/LEARNINGS.md (append/reorganise only — keep every existing item)`, `ARCHITECTURE.md (only the corrections listed below)`, `docs/screenshots/`. Besides those you may write your tests under `test/`, your report, and scratch output
   under `out/previews/docs-final/` and `out/shots/docs-final/`. Other agents are writing the other modules **right now**:
   their files may be missing or half-written. Code against the contract, guard with fallbacks, and never edit or
   "fix" a file you do not own — put what you need under "Requests" in your report.
3. Progress reporting (drives a live dashboard the user is watching): first
   `node tools/track.mjs docs-final start "<plan in a few words>"`; then
   `node tools/track.mjs docs-final progress <pct> "<what just landed>"` at 4 or more milestones; finally
   `node tools/track.mjs docs-final done "<one-line result>"` (or `blocked` / `failed` with the reason).
4. Verify for real before claiming done: run it, test it, look at it. Report failures honestly.
5. If you must wait for another agent's file, poll (`for i in $(seq 90); do [ -f <path> ] && break; sleep 10; done`),
   then proceed with a fallback if it still is not there.
6. Finish by writing `docs/swarm/reports/docs-final.md` with sections: **What I built** · **Verification evidence** ·
   **Deviations from the contract** · **Mistakes I made and how I fixed them** · **Learnings for a future agent** ·
   **Requests for other modules**. Be specific — these reports are studied later.
7. Keep chat output minimal (status lines only). Final reply: 8 lines max.
8. Save work to disk early and often — the swarm can be interrupted by usage limits. If your owned files or scratch output already exist, you are RESUMING: inspect them and continue instead of starting over.
9. No npm dependencies (except inside `desktop/`). No git commands. Never kill processes you did not start.
   Scratch files go in `/tmp/claude-1000/-home-bill-src-fun-duum/0ad46408-4953-474d-83ed-fbee50d6a7dd/scratchpad/docs-final/`.

10. Context budget — your whole context is re-sent on every tool call, so keep it small: read files with
   offset/limit or grep, never whole large files; pipe command output through `tail`/`grep` (40 lines max); look at
   an image only when you will act on what you see (about 6 image reads in total — prefer numeric checks); never
   re-read a file you just wrote.
11. Checkpoints — keep `docs/swarm/progress/docs-final.md` (30 lines max: **Done** · **Next steps, in order** ·
   **Gotchas** · **Commands to verify**) and update it at every milestone. If that file exists when you start, you
   are a fresh agent continuing the job: read it first, trust it, do not re-derive. After about 25 tool calls, or at
   a milestone with substantial work still left, update the checkpoint and END your turn with a last line
   `CONTINUE: <next step>` — a new agent with a clean context will pick it up. Only write the report and call
   `track.mjs ... done` when the whole task is finished.

Your task:

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
