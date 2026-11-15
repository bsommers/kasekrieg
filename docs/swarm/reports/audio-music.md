# audio-music report

## What I built
- `src/audio/music.js`: tracker/sequencer engine (ARCHITECTURE §10): pulse/triangle/noise/simple-FM voices, `createMusic(ctx, dest)`, `renderSong` (offline + live scheduling), `loadSong`, `MUSIC_NAMES`.
- `src/audio/songs/`: `_util.js` plus 8 original modules, one per `defs.MUSIC` name: title (march, 132 bpm, 58 s), level_a (sneaky, 100 bpm, 58 s), level_b (driving, 140 bpm, 55 s), level_c (eerie, 78 bpm, 62 s), boss (frantic, 172 bpm, 45 s), intermission (jaunty, 126 bpm, 46 s), victory (fanfare, 20 s jingle), gameover (lament, 23 s jingle).
- `src/audio/music-demo.html`: player plus offline analyser (`window.__analyse`, `__renderAll`) with piano-roll/waveform plots.
- `test/audio-music.test.mjs`: names match defs.MUSIC; each song compiles, length in range, has drums plus 3+ melodic tracks and notes.

## Verification evidence
- `node --test test/audio-music.test.mjs`: 9/9 pass.
- Headless Chrome (CDP, own http server) rendered every song through OfflineAudioContext; results in `out/previews/audio-music/analysis.json`, plots in `plots.png`. All 8 `ok`: peak 0.51-0.88 (no clipped samples, no NaN), |DC| < 0.003, longest quiet run <= 0.18 s, jingles end quiet. Loops: seam jump <= max jump elsewhere; steady-state pass 2 vs pass 3 relErr 0 for 5 songs, 0.033 (level_c) and 0.063 (boss) for the other two (reverb/feedback tails differ slightly; under the 0.1 threshold).

## Deviations from the contract
None known. Loop sample rate in the analyser is adjusted so a loop is a whole number of samples (analysis only).

## Mistakes I made and how I fixed them
- First headless attempts hung: `__renderAll` of all songs in one CDP call is slow (title/level_b/boss take 150-200 s each on a loaded machine because of 3 render passes with many nodes). Fixed by analysing one song per call and writing results incrementally.
- A stray `>/dev/null` on a track call plus a background server was refused by the permission classifier; reran without them.

## Learnings for a future agent
- Offline rendering cost scales with node count; per-song CDP calls with incremental output avoid timeouts. Machine load from other agents' Chromes doubles times.
- Use `--remote-debugging-port` + a unique `--user-data-dir` and a tiny node http server; ES modules do not load from file://.

## Requests for other modules
None. (audio.js should call `createMusic(ctx, musicBus)` and `.play(name)` per the contract.)
