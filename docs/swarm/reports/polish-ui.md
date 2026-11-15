# polish-ui report
## What I built
Stage A: viewmodel x offset +24 -> +10 so muzzles sit at the crosshair (src/ui/hud.js); automap background made opaque with grid and border (src/ui/automap.js). Stage B: audited title, main menu, skill select, controls, options, pause, intermission, death against the real art; no further code changes were needed.
## Verification evidence
Screenshots in out/shots/polish-ui/ (title.png, m3.png menu/skill/controls, m4.png and m3b.png pause/options/death, ism.png intermission sweep, automap2.png). Title: large centred logo, sparkles, "PRESS ENTER TO POUNCE" with paw icons. `node --test test/` green.
## Deviations from the contract
None.
## Mistakes I made and how I fixed them
Early intermission/death shots looked faded: they were captured during the fade-in; a frame sweep showed them fine. Setting game.status via --eval is how to reach those screens.
## Learnings for a future agent
Use `--eval "window.__game.game.status='complete'|'dead'"` plus --frames/--interval; montage (ImageMagick) packs several shots into one image read. Automap is empty at spawn by design (only explored cells drawn).
## Requests for other modules
None. Game over and victory screens were not individually screenshotted.
