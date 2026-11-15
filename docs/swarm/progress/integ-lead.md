# integ-lead checkpoint
## Done
- Stage A: boots, 0 errors, real WebGL. Stage B: verified visually (door, sprites, pushwall, exit switch), no code changes needed.
- Stage C part 1: tools/botplay.mjs written (in-page bot via shot.mjs --eval; god+keys granted, BFS over doors). `node tools/botplay.mjs [--levels 1,2] [--max 120]`. ALL 6 levels reachedExit=true (9-16 s each, 0 errors). Fix needed: BFS must treat world.blocker cells as impassable (blocking decor).
- Stage C rest VERIFIED via shot --eval (scratch c1-c5.js): fire/kill/ammo, player dmg (no god), pickups (fish_treat heals; cheddar/brie are treasure), gold door locked w/o key & opens with real key pickup, death->respawn (lives 9->8), intermission card content+tally ok (animated, 0% when nothing collected), Enter -> next level, L6 -> victory screen. No code changes needed. botplay BFS blocker fix already in.
- Stage D DONE (scratch d1-d4): audio unlock->ctx running, sfx/music bus forwarded, setListener every frame, pause/resume (needs >0.12s menu swallow), options persist to localStorage, quit->title, Tab automap no errors, items 1,10,11,13,14 already correct in main.js. Added test hooks G.audio and G.action(a) in main.js. Music: all 8 songs loadSong OK and names match playMusic calls (level_a/b/c, boss, title, intermission, victory, gameover); audio-music.md report STILL MISSING -> 'music hookup unverified' as to final music.js (re-run d4 in stage E).
## Next steps, in order
- (done) Stage C rest: verify via shot --eval (G.cmd fire/use, g.player hp/ammo): firing + enemy damage, player damage (no god), pickups, key+locked door, death -> respawn, intermission stat box content (was empty at 300ms), intermission -> next level, level 6 -> victory screen. Check main.js items 1,10,11,13 of INTEGRATION-NOTES.md.
- NEXT: Stage E (node --test test/, 60s demo, frame time medium)
## Gotchas
- audio/music.js still being written; edit only if reports/audio-music.md exists
- G.cmd override applies for one frame only (set every rAF). cmd.turn is radians/tick. state names: playing, intermission, victory, death, levelIntro.
- shot.mjs --eval awaits promises; scratch: scratchpad/integ-lead/
- Level1: doors (10,12), pushwalls (26,10),(7,24),(21,27), exit (16,1), start 4.5,27.5
## Commands to verify
node tools/botplay.mjs
