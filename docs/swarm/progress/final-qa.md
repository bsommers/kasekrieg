# final-qa progress
**Done**: Stage1 tools/botplay.mjs --fight (flags: --levels --runs 3 --seed --quality --skill --max --trace). L1 passes.
**Next**: run all levels parallel (`node tools/botplay.mjs --fight --levels N --max 150 > out/previews/final-qa/lN.jsonl &`), analyze, Stage2 fixes, Stage3 soak low/ultra + node --test test/, then report docs/swarm/reports/final-qa.md.
**Gotchas**: game real-time (1 sim s per wall s); non-auto weapons need fire edges (alternate frames). Do NOT edit src/levels/e1m6.js until docs/swarm/reports/polish-level-6.md exists (it does now? check); never edit src/audio/music.js.
**Commands**: node tools/botplay.mjs --fight --levels 3 --runs 3 --max 150 --quality low
