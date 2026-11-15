# audio-sfx report

## What I built
- `src/audio/sfx.js`: side-effect-free module (safe in Node). Exports `playSfx(ctx, dest, name, when, {vol}) -> duration`, `hasSfx`, `SFX_NAMES`, `SFX_MISSING`. All 58 `defs.SFX` names are synthesised. A small kit (`tone`, `noise`, `voice`, `click`, `bell`, `notes`, `cat`, `squeak`, `gruff`, `thud`, `shot`) builds each sound.
  - Cat meows, yowls and the death cry use a sawtooth source through three parallel band-pass formants whose frequencies sweep, plus vibrato and breath noise.
  - Rat and mouse barks and squeals are high, fast-vibrato formant squeaks. Trooper, officer, panzer and boss voices are gruff AM-roughened formant voices at different pitches.
  - Every sound goes through its own tanh soft-clip stage, capped at 0.93, so peak is below 1 by construction. Noise comes from a seeded xorshift buffer, so renders are deterministic.
- `src/audio/audio.js`: `createAudio()` returns `{unlock, sfx, setListener, music, setVolume, suspend, resume, ready}` plus extra getter `context`.
  - Graph: sfxBus and musicBus into master, then a compressor, then the destination.
  - Positional sounds get equal-power pan via a StereoPanner (`sin(relative angle)`, +1 is right, clockwise on the map) and quadratic distance falloff to 26 cells.
  - Same-name plays within 30 ms are dropped, and there is a 28-voice cap.
  - `music(name)` dynamically imports `./music.js` and calls `createMusic(ctx, musicBus)`. A missing file is tolerated. The wanted song is remembered until `unlock()`.
  - It is a silent no-op without `AudioContext`. `createAudio({AudioContext})` allows injecting a fake context.
- `src/audio/sfx-demo.html`: a button per SFX, a pan slider, an offline-render test button, and `window.__renderAll()` for tools.
- `test/audio-sfx.test.mjs`: coverage check, Node no-op check, pan and falloff check with a fake context, and a headless-Chrome OfflineAudioContext render.

## Verification evidence
- `node --test test/audio-sfx.test.mjs` passes 6 of 6.
- The Chrome test runs `tools/shot.mjs` against the demo page. It renders all 58 SFX with `OfflineAudioContext` at 44.1 kHz and prints a table of duration, audible length, peak and rms.
- All 58 pass: peaks are 0.2 to 0.79 (all below 1), audible length is 0.026 s (tally_tick) to 2.09 s, and no NaNs.
- A real-time `AudioContext` in headless Chrome ran `unlock()`, `music('title')` and 58 positional `sfx()` calls with no page errors.
- Screenshot: `out/shots/audio-sfx/demo.png`.
- Not verified: I cannot listen to the sounds, so how they sound is unchecked. The numeric checks (peak, length, non-silence) are all that was verified.

## Deviations from the contract
- None to the public API. Extras: `audio.context`, `createAudio({AudioContext})`, and the `sfx.js` exports above.
- `boss_fire` and `enemy_smg` are single-shot sounds. Callers that fire bursts should play once per shot (the 30 ms same-name gap allows this).

## Mistakes I made and how I fixed them
- My first `voice()` had tangled noise routing, with leftover disconnects. I rewrote it so the breath noise has its own envelope gain feeding the formants.
- Band-pass formants made the voices much quieter than the other sounds (the mouse squeak peaked at 0.065). I added a `boost` to the formant sum (default 2.6) and raised the squeak gain.
- `tally_tick` was too short to count as audible (under 20 ms). I lengthened it.

## Learnings for a future agent
- `tools/shot.mjs --eval` awaits promises, so it works for OfflineAudioContext tests.
- Run offline renders at 44.1 kHz. With the fake context in Node, `exponentialRamp` values must stay above 0, so `setPath` clamps them.
- `setValueAtTime` for the first envelope point must come before the ramps, as in `envelope()`.

## Requests for other modules
- app-shell: call `audio.unlock()` on the first user gesture. Forward bus `sfx {name,x,y,vol}` to `audio.sfx(name, {x,y,vol})`, bus `music {name}` to `audio.music(name)`, and call `audio.setListener(player.x, player.y, player.angle)` every frame.
- sim-player: the cat's `meow` and `purr` are not positional, so omit x and y. Call `setVolume` from settings.
- audio-music: `createMusic(ctx, destination)` is called with the music bus gain node, so `setVolume` is handled by the bus. Keep `music.js` import-safe in Node.
