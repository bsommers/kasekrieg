# final-qa — Final QA: can a player actually finish it?

You are subagent `final-qa` (Final QA: can a player actually finish it?) in a large parallel swarm building **KÄSEKRIEG: Claws of Marmalade** — a
ray-traced, blocky, cheese-themed maze shooter — in `/home/bill/src/fun/duum`. Model tier: sonnet.

Rules:
1. `ARCHITECTURE.md` and `src/core/defs.js` are the binding contract. Read only what your task needs: list the
   sections (`grep -n '^## ' ARCHITECTURE.md`), Read those with offset/limit, and grep `src/core/defs.js` for your
   names instead of reading it whole.
2. You own ONLY: `tools/botplay.mjs`, `test/`, `and bug fixes anywhere under src/ (smallest possible; say what and why in the report)`. Besides those you may write your tests under `test/`, your report, and scratch output
   under `out/previews/final-qa/` and `out/shots/final-qa/`. Other agents are writing the other modules **right now**:
   their files may be missing or half-written. Code against the contract, guard with fallbacks, and never edit or
   "fix" a file you do not own — put what you need under "Requests" in your report.
3. Progress reporting (drives a live dashboard the user is watching): first
   `node tools/track.mjs final-qa start "<plan in a few words>"`; then
   `node tools/track.mjs final-qa progress <pct> "<what just landed>"` at 4 or more milestones; finally
   `node tools/track.mjs final-qa done "<one-line result>"` (or `blocked` / `failed` with the reason).
4. Verify for real before claiming done: run it, test it, look at it. Report failures honestly.
5. If you must wait for another agent's file, poll (`for i in $(seq 90); do [ -f <path> ] && break; sleep 10; done`),
   then proceed with a fallback if it still is not there.
6. Finish by writing `docs/swarm/reports/final-qa.md` with sections: **What I built** · **Verification evidence** ·
   **Deviations from the contract** · **Mistakes I made and how I fixed them** · **Learnings for a future agent** ·
   **Requests for other modules**. Be specific — these reports are studied later.
7. Keep chat output minimal (status lines only). Final reply: 8 lines max.
8. Save work to disk early and often — the swarm can be interrupted by usage limits. If your owned files or scratch output already exist, you are RESUMING: inspect them and continue instead of starting over.
9. No npm dependencies (except inside `desktop/`). No git commands. Never kill processes you did not start.
   Scratch files go in `/tmp/claude-1000/-home-bill-src-fun-duum/0ad46408-4953-474d-83ed-fbee50d6a7dd/scratchpad/final-qa/`.

10. Context budget — your whole context is re-sent on every tool call, so keep it small: read files with
   offset/limit or grep, never whole large files; pipe command output through `tail`/`grep` (40 lines max); look at
   an image only when you will act on what you see (about 6 image reads in total — prefer numeric checks); never
   re-read a file you just wrote.
11. Checkpoints — keep `docs/swarm/progress/final-qa.md` (30 lines max: **Done** · **Next steps, in order** ·
   **Gotchas** · **Commands to verify**) and update it at every milestone. If that file exists when you start, you
   are a fresh agent continuing the job: read it first, trust it, do not re-derive. After about 25 tool calls, or at
   a milestone with substantial work still left, update the checkpoint and END your turn with a last line
   `CONTINUE: <next step>` — a new agent with a clean context will pick it up. Only write the report and call
   `track.mjs ... done` when the whole task is finished.

Your task:

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
