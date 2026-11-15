# final-qa report

## What I built
`tools/botplay.mjs --fight` (flags: --levels --runs --seed --quality --skill --max --trace): no god mode, no granted keys, skill 2. BFS to keys then doors, turns/fires at visible enemies with best-ammo weapon (alternating fire edges for non-auto), grabs nearby pickups. Emits per-run JSON {reachedExit, deaths, healthAtExit, ammoAtExit, kills/total, seconds, consoleErrors}.

## Verification evidence
Quality low, 3 seeds/level (out/previews/final-qa/l1-6.jsonl): L1-L5 reached exit 15/15 runs, deaths 0-1, health at exit 84-100, ammo never dry (hair 75-99 left), 0 console errors. L6 (boss) solo rerun --max 200: exit reached in 2 of 3 (deaths 1/0; health 100), third timed out after 2 deaths at 70 sim s. Ultra quality, 1 run/level, 120 s: L1-L5 exit with 0 deaths, 0 console errors; L6 timed out (2 deaths, still fighting) -- 0 console errors. `node --test test/`: 173/173 pass.

## Deviations from the contract
None. No game code or level edits were needed; boss numbers in defs.js untouched (boss beaten 2/3 at low, 0/1 at ultra within 120 s, so not tuned).

## Mistakes I made and how I fixed them
Running 6 bots in parallel starved the CPU: sim only advanced 17-60 s of 150 wall s, producing false L6 timeouts. Reran L6 solo with --max 200.

## Learnings for a future agent
Game runs real time (sim s ~ wall s when uncontended); run at most 2 bots in parallel. L6 needs --max >= 200 (boss+fort ~85 s sim).

## Suspicious, not fixed
- L6 boss is the only fight where the bot dies repeatedly (2 deaths in 3 of 4 non-winning runs); a human with skill>2 should do fine but it is the hardest spot. Ultra's lower fps may make it harder (single sample).
- Kill counts never reach 100% (e.g. L1 15/19, L4 18/24): bot skips unseen/secret-area enemies; not verified whether any are unreachable.
- Secrets never found by bot (0).

## Requests for other modules
None.
