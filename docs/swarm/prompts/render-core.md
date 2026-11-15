# render-core — GPU ray tracer

You are subagent `render-core` (GPU ray tracer) in a large parallel swarm building **KÄSEKRIEG: Claws of Marmalade** — a
ray-traced, blocky, cheese-themed maze shooter — in `/home/bill/src/fun/duum`. Model tier: sonnet.

Rules:
1. `ARCHITECTURE.md` and `src/core/defs.js` are the binding contract. Read only what your task needs: list the
   sections (`grep -n '^## ' ARCHITECTURE.md`), Read those with offset/limit, and grep `src/core/defs.js` for your
   names instead of reading it whole.
2. You own ONLY: `src/render/renderer.js`, `src/render/shaders/`, `src/render/demo.html`, `src/render/demo.js`. Besides those you may write your tests under `test/`, your report, and scratch output
   under `out/previews/render-core/` and `out/shots/render-core/`. Other agents are writing the other modules **right now**:
   their files may be missing or half-written. Code against the contract, guard with fallbacks, and never edit or
   "fix" a file you do not own — put what you need under "Requests" in your report.
3. Progress reporting (drives a live dashboard the user is watching): first
   `node tools/track.mjs render-core start "<plan in a few words>"`; then
   `node tools/track.mjs render-core progress <pct> "<what just landed>"` at 4 or more milestones; finally
   `node tools/track.mjs render-core done "<one-line result>"` (or `blocked` / `failed` with the reason).
4. Verify for real before claiming done: run it, test it, look at it. Report failures honestly.
5. If you must wait for another agent's file, poll (`for i in $(seq 90); do [ -f <path> ] && break; sleep 10; done`),
   then proceed with a fallback if it still is not there.
6. Finish by writing `docs/swarm/reports/render-core.md` with sections: **What I built** · **Verification evidence** ·
   **Deviations from the contract** · **Mistakes I made and how I fixed them** · **Learnings for a future agent** ·
   **Requests for other modules**. Be specific — these reports are studied later.
7. Keep chat output minimal (status lines only). Final reply: 8 lines max.
8. Save work to disk early and often — the swarm can be interrupted by usage limits. If your owned files or scratch output already exist, you are RESUMING: inspect them and continue instead of starting over.
9. No npm dependencies (except inside `desktop/`). No git commands. Never kill processes you did not start.
   Scratch files go in `/tmp/claude-1000/-home-bill-src-fun-duum/0ad46408-4953-474d-83ed-fbee50d6a7dd/scratchpad/render-core/`.

10. Context budget — your whole context is re-sent on every tool call, so keep it small: read files with
   offset/limit or grep, never whole large files; pipe command output through `tail`/`grep` (40 lines max); look at
   an image only when you will act on what you see (about 6 image reads in total — prefer numeric checks); never
   re-read a file you just wrote.
11. Checkpoints — keep `docs/swarm/progress/render-core.md` (30 lines max: **Done** · **Next steps, in order** ·
   **Gotchas** · **Commands to verify**) and update it at every milestone. If that file exists when you start, you
   are a fresh agent continuing the job: read it first, trust it, do not re-derive. After about 25 tool calls, or at
   a milestone with substantial work still left, update the checkpoint and END your turn with a last line
   `CONTINUE: <next step>` — a new agent with a clean context will pick it up. Only write the report and call
   `track.mjs ... done` when the whole task is finished.

Your task:

ARCHITECTURE §9, §8.6, §5.5, §7 (world arrays). This is the heart of the game and the main wow factor: make it
beautiful, sparkly and fast. Build `demo.html`/`demo.js`: a synthetic showcase world and scene (walls, doors
half open, a mover, sprites, coloured lights, sky zone, mirror, fondue) that needs nothing from the sim; use
`buildAtlas()` from the registry when present, else a procedural fallback atlas. Screenshot with headless Chrome
(`google-chrome --headless=new --no-sandbox --use-angle=vulkan --enable-features=Vulkan --window-size=1280,720
--virtual-time-budget=4000 --screenshot=<png> <url>` behind `python3 -m http.server` on a free port, or
`tools/shot.mjs` once it exists) and **look at the result** — iterate many times on image quality. If
`postfx.js` is missing, fall back to an internal tonemap + nearest blit. Throw with the shader log on compile
errors. Measure and report frame time at each quality level.
