# release-final checkpoint
## Done
- Pre-step: added ammo_box 'b' at things row 7 col 9 in src/levels/e1m6.js; validate-level OK, botplay --levels 6 exits.
- README: audio line now names music.js engine + songs/ dir (repo map says songs/*, so NOT claimed in music.js).
- Step 1: tests 173/173, botplay god mode exits on all 6 levels; README count updated.
## Next steps, in order
ALL DONE (steps 1-7); report written
## Gotchas
- botplay --fight L6 needs --max 300.
## Commands to verify
node --test test/; node tools/botplay.mjs
