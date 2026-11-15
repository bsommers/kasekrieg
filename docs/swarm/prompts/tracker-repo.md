# tracker-repo — Reusable swarm-tracker repo

You are subagent `tracker-repo` (Reusable swarm-tracker repo) in a large parallel swarm building **KÄSEKRIEG: Claws of Marmalade** — a
ray-traced, blocky, cheese-themed maze shooter — in `/home/bill/src/fun/duum`. Model tier: sonnet.

Rules:
1. `ARCHITECTURE.md` and `src/core/defs.js` are the binding contract. Read only what your task needs: list the
   sections (`grep -n '^## ' ARCHITECTURE.md`), Read those with offset/limit, and grep `src/core/defs.js` for your
   names instead of reading it whole.
2. You own ONLY: `/home/bill/src/ai/agents/swarm-tracker/ (a NEW directory outside this repo — create it; touch nothing else outside this repo)`. Besides those you may write your tests under `test/`, your report, and scratch output
   under `out/previews/tracker-repo/` and `out/shots/tracker-repo/`. Other agents are writing the other modules **right now**:
   their files may be missing or half-written. Code against the contract, guard with fallbacks, and never edit or
   "fix" a file you do not own — put what you need under "Requests" in your report.
3. Progress reporting (drives a live dashboard the user is watching): first
   `node tools/track.mjs tracker-repo start "<plan in a few words>"`; then
   `node tools/track.mjs tracker-repo progress <pct> "<what just landed>"` at 4 or more milestones; finally
   `node tools/track.mjs tracker-repo done "<one-line result>"` (or `blocked` / `failed` with the reason).
4. Verify for real before claiming done: run it, test it, look at it. Report failures honestly.
5. If you must wait for another agent's file, poll (`for i in $(seq 90); do [ -f <path> ] && break; sleep 10; done`),
   then proceed with a fallback if it still is not there.
6. Finish by writing `docs/swarm/reports/tracker-repo.md` with sections: **What I built** · **Verification evidence** ·
   **Deviations from the contract** · **Mistakes I made and how I fixed them** · **Learnings for a future agent** ·
   **Requests for other modules**. Be specific — these reports are studied later.
7. Keep chat output minimal (status lines only). Final reply: 8 lines max.
8. Save work to disk early and often — the swarm can be interrupted by usage limits. If your owned files or scratch output already exist, you are RESUMING: inspect them and continue instead of starting over.
9. No npm dependencies (except inside `desktop/`). No git commands. Never kill processes you did not start.
   Scratch files go in `/tmp/claude-1000/-home-bill-src-fun-duum/0ad46408-4953-474d-83ed-fbee50d6a7dd/scratchpad/tracker-repo/`.

10. Context budget — your whole context is re-sent on every tool call, so keep it small: read files with
   offset/limit or grep, never whole large files; pipe command output through `tail`/`grep` (40 lines max); look at
   an image only when you will act on what you see (about 6 image reads in total — prefer numeric checks); never
   re-read a file you just wrote.
11. Checkpoints — keep `docs/swarm/progress/tracker-repo.md` (30 lines max: **Done** · **Next steps, in order** ·
   **Gotchas** · **Commands to verify**) and update it at every milestone. If that file exists when you start, you
   are a fresh agent continuing the job: read it first, trust it, do not re-derive. After about 25 tool calls, or at
   a milestone with substantial work still left, update the checkpoint and END your turn with a last line
   `CONTINUE: <next step>` — a new agent with a clean context will pick it up. Only write the report and call
   `track.mjs ... done` when the whole task is finished.

Your task:

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
