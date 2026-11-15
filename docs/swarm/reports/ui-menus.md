# ui-menus report

## What I built
- `src/ui/menus.js` (resumed from an earlier partial run, reviewed and fixed): `createMenus({atlas,audio,settings,progress,canContinue})` with title, main, skill, options, controls, pause and a confirmQuit sub-menu. Also exports shared UI helpers (scrim, panel, paw, logo, face, lifePip, outlined, wrap, image) used by screens.js.
- `src/ui/screens.js` (new): `createScreens({atlas,audio})` with levelIntro (typewriter name, par/skill), intermission (counted-up tally with `tally_tick` sfx, bars, rank, perfect banner, ENTER skips count-up), death (red wash, shake, nine life pips), gameOver (falling crumbs, waving emblem flag, quips), victory (rays, confetti, fireworks, story lines).
- `src/ui/menus-demo.html`: `?view=<name>&t=<sec>&sel=N&atlas=0&live=1`, fake backdrop standing in for the attract scene, real atlas when buildAtlas works.
- `test/menus.test.mjs`: 4 headless tests (state flow, actions, draw with stub ctx, screen completion).

## Verification evidence
- `node --test test/menus.test.mjs` passes 4/4.
- Screenshots of all 12 views in `out/shots/ui-menus/*.png` (shot.mjs, headless Chrome); no page errors with `--strict`.
- Iterated: skill list overflow, intermission bar/value/stamp collisions, victory cats overlapping text, degree sign missing from font, levelIntro shot blank (auto-timeout at 4.2s, demo artifact).

## Deviations from the contract
- Added optional args/members: `progress`/`canContinue`, `menus.close()`, `menus.current`, `screens.active`, `screens.hide()`, and `audio` for screens. A `confirmQuit` sub-menu exists (not in the listed menu names).
- Menus return `{type:'option', key:'volume', value:{master,sfx,music}}` for volume changes.
- hud art (logo/face/cursor/emblem) was not built yet when testing, so all shots show the hand-drawn fallbacks; with real atlas images they are used automatically.

## Mistakes I made and how I fixed them
- Used a degree sign; the 5x7 font lacks it, so it rendered `?`. Now prints " DEG".
- Skill panel too narrow for "NINE LIVES NIGHTMARE"; widened.
- Screenshotted levelIntro after its auto-dismiss; screens finish themselves, so use t<4.2 for it.

## Learnings for a future agent
- Screens null themselves after returning 'done', so draw after done renders nothing.
- Font glyph set is limited; check `glyphChars()` before using symbols.
- Menu input edges are swallowed for 0.12s after opening a menu, to avoid the opening keypress leaking.

## Requests for other modules
- art-hud: provide `hud.logo`, `hud.face` (frames 0,3,9,20,21,22 used), `hud.cursor`, `hud.emblem`, `hud.icon.life`.
- audio-sfx: `menu_move`, `menu_select`, `menu_back`, `level_complete`, `tally_tick`, `game_over`, `player_die`, `extra_life` are used.
- app-shell: call `menus.open('title')` etc; menus does not draw its own background.
