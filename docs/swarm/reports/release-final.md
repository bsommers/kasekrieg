# release-final report

## What I built
Close-out: e1m6 ammo tweak (one `ammo_box` at things row 7, col 9 in the throne arena, per final-qa suggestion), README test count and audio line, LEARNINGS append, BUILD-SPEC cost table plus usage-limit table, README automap screenshot replaced, three desktop packages rebuilt and smoke-tested, PLAYBOOK re-sync (new sections 10-11).

## Verification evidence
| Gate | Result | Evidence |
|---|---|---|
| e1m6 tweak | pass | `validate-level.mjs src/levels/e1m6.js` clean (ammo_box 7 to 8); `botplay --levels 6` reachedExit true |
| 1 tests + botplay | pass | `node --test test/` 173/173; god-mode botplay exits on levels 1-6; README says 173 |
| 2 LEARNINGS | done | 5 bullets appended with agent ids (audio-music, final-qa, docs-final) |
| 3 BUILD-SPEC | done | native rows added, 6-row limit-hit table; agents with no figure in CHECKPOINT stay "not recorded" |
| 4 screenshots | done | contact image: automap.png dark/mid-fade; replaced by out/shots/polish-ui/automap2.png (opaque grid, but only the start room, since automap shows explored cells only). Others fine |
| 5 linux | pass | `dist/Kaesekrieg-linux-x64` 290M; launcher worked unchanged; smoke ok, page index.html, fps 36, errors 0 |
| 5 macos | pass | `dist/Kaesekrieg-darwin-arm64.zip` 111,220,958 B (bigmac); smoke ok, fps 25, errors 0 |
| 5 windows | pass | `dist/Kaesekrieg-win32-x64.zip` 138,040,649 B (win-devvm); smoke ok, fps 35.2, errors 0 |
| 6 PLAYBOOK | done | sections 10-11 added, generic wording; swarm-tracker `npm test` 8/8; no git |

## Deviations from the contract
src/levels/e1m6.js edited as the user explicitly authorised. The README audio line was reworded: the repo map (ARCHITECTURE section on file ownership) says songs are in `src/audio/songs/*`, so I did not claim they live in music.js; README now says engine in music.js, song modules in src/audio/songs/.

## Mistakes I made and how I fixed them
First python edit asserted too strictly on the row text and aborted before writing; fixed the check, file was untouched. A keyed shot of the automap did not move the player, so I used the existing polished shot.

## Learnings for a future agent
Mac build needs `MAC_HOST=bill@bigmac.local`. build.mjs and the linux launcher work as-is. The automap only shows explored cells; capturing a fuller one needs real movement.

## Requests for other modules
None. Open: LEARNINGS has no entry for the fifth usage-limit hit (BUILD-SPEC marks it not documented); the README automap shot is sparse. The win-devvm was left running.
