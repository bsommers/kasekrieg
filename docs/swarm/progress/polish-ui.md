# polish-ui checkpoint
## Done
- Stage A: viewmodel x offset +24 -> +10 (muzzles now at crosshair), automap bg opaque + grid/border (src/ui/hud.js, src/ui/automap.js). HUD plaques/portrait/low-hp verified OK. Contact sheet: out/previews/polish-ui/contact.html -> out/shots/polish-ui/contact.png
- Image reads used in A: 4 of 8
## Next steps
- Stage B: title, main menu, skill select, options, pause, intermission, death, game over, victory (src/ui/menus.js, screens.js, style.css). Title: big centred logo, motion, "press any key".
- Then report docs/swarm/reports/polish-ui.md and track.mjs done.
## Gotchas
- shot: `node tools/shot.mjs --url "index.html?autostart=1&level=1&mute=1&quality=low" --size 1440x810 --wait-for "window.__game.state==='playing'" --eval ... --keys "Tab:100" --out ...`
- Menu states: window.__game.state; window.__game.action({type:..})
## Commands to verify
node --test test/
