# art-enemies-infantry — Enemy sprites: mouse, trooper, officer

You are subagent `art-enemies-infantry` (Enemy sprites: mouse, trooper, officer) in a large parallel swarm building **KÄSEKRIEG: Claws of Marmalade** — a
ray-traced, blocky, cheese-themed maze shooter — in `/home/bill/src/fun/duum`. Model tier: opus.

Rules:
1. `ARCHITECTURE.md` and `src/core/defs.js` are the binding contract. Read only what your task needs: list the
   sections (`grep -n '^## ' ARCHITECTURE.md`), Read those with offset/limit, and grep `src/core/defs.js` for your
   names instead of reading it whole.
2. You own ONLY: `src/art/enemies_infantry.js`. Besides those you may write your tests under `test/`, your report, and scratch output
   under `out/previews/art-enemies-infantry/` and `out/shots/art-enemies-infantry/`. Other agents are writing the other modules **right now**:
   their files may be missing or half-written. Code against the contract, guard with fallbacks, and never edit or
   "fix" a file you do not own — put what you need under "Requests" in your report.
3. Progress reporting (drives a live dashboard the user is watching): first
   `node tools/track.mjs art-enemies-infantry start "<plan in a few words>"`; then
   `node tools/track.mjs art-enemies-infantry progress <pct> "<what just landed>"` at 4 or more milestones; finally
   `node tools/track.mjs art-enemies-infantry done "<one-line result>"` (or `blocked` / `failed` with the reason).
4. Verify for real before claiming done: run it, test it, look at it. Report failures honestly.
5. If you must wait for another agent's file, poll (`for i in $(seq 90); do [ -f <path> ] && break; sleep 10; done`),
   then proceed with a fallback if it still is not there.
6. Finish by writing `docs/swarm/reports/art-enemies-infantry.md` with sections: **What I built** · **Verification evidence** ·
   **Deviations from the contract** · **Mistakes I made and how I fixed them** · **Learnings for a future agent** ·
   **Requests for other modules**. Be specific — these reports are studied later.
7. Keep chat output minimal (status lines only). Final reply: 8 lines max.
8. Save work to disk early and often — the swarm can be interrupted by usage limits. If your owned files or scratch output already exist, you are RESUMING: inspect them and continue instead of starting over.
9. No npm dependencies (except inside `desktop/`). No git commands. Never kill processes you did not start.
   Scratch files go in `/tmp/claude-1000/-home-bill-src-fun-duum/0ad46408-4953-474d-83ed-fbee50d6a7dd/scratchpad/art-enemies-infantry/`.

10. Context budget — your whole context is re-sent on every tool call, so keep it small: read files with
   offset/limit or grep, never whole large files; pipe command output through `tail`/`grep` (40 lines max); look at
   an image only when you will act on what you see (about 6 image reads in total — prefer numeric checks); never
   re-read a file you just wrote.
11. Checkpoints — keep `docs/swarm/progress/art-enemies-infantry.md` (30 lines max: **Done** · **Next steps, in order** ·
   **Gotchas** · **Commands to verify**) and update it at every milestone. If that file exists when you start, you
   are a fresh agent continuing the job: read it first, trust it, do not re-derive. After about 25 tool calls, or at
   a milestone with substantial work still left, update the checkpoint and END your turn with a last line
   `CONTINUE: <next step>` — a new agent with a clean context will pick it up. Only write the report and call
   `track.mjs ... done` when the whole task is finished.

Your task:

Module `enemies_infantry`. First build a parametric upright rat-soldier rig (pose parameters → frame: legs, arms,
weapon, head tilt, tail), then three outfits on it: `mouse` (small grey private, huge ears, oversized helmet),
`trooper` (brown rat, greatcoat, SMG), `officer` (white rat, peaked cap, black leather coat, monocle). All
animations per `defs.ENEMIES`: idle, 4-frame walk cycle toward the viewer, attack = aim / FIRE (emissive muzzle
flash) / recover, pain, 4-frame death collapse, dead (lying at the bottom of the frame). Figures stand ~56 px tall.

Art rules (mandatory): ARCHITECTURE §5.2–5.4. Produce exactly the names `artManifest()` lists for your module
(print them with `node -e "import('./src/core/defs.js').then(d=>console.log(d.artManifest().filter(a=>a.module==='<module>')))"`).
Run `node tools/sheet.mjs <module>` and **look at `out/previews/<module>.png` with the Read tool** after every
significant pass — at least three look-and-fix passes, plus one look at `<module>.mat.png`. Be a harsh art
director: is each frame recognisable at a glance? is the silhouette strong? light from upper-left? outline
complete? on-palette? do animation frames read as motion rather than noise? If a frame looks like a blob, redraw
it. Build small parametric helpers so frames stay consistent. Use materials (emit / gloss / spark) deliberately —
the ray tracer makes them glow, reflect and glitter. No real-world Nazi insignia; the emblem is the cheese wedge.
Done means: `sheet.mjs` prints OK and you would be proud to ship every row.
