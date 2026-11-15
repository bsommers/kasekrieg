# final-qa progress
**Done**: Stage1 botplay --fight. All levels run (out/previews/final-qa/l1-6.jsonl): L1-5 pass 3/3 (0-1 deaths, ammo ok, 0 console errors). L6 timed out at --max 150 in parallel (sim only 17-60s: CPU contention); rerunning solo --max 200.
**Next**: analyze L6 (boss winnable? else tune defs.js boss), soak 120s low+ultra per level (--max 120 --quality ultra, run 1-2 at a time), node --test test/, write docs/swarm/reports/final-qa.md, track.mjs done.
**Gotchas**: don't run >2 bots in parallel; never edit music.js; no git.
