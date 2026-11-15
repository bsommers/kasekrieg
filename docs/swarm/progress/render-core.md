# render-core checkpoint (written by the orchestrator from the tracker log; the previous agent was cut off)
**Done:** design; `src/render/renderer.js` (578 lines), `src/render/shaders/`, `src/render/demo.html` + `demo.js`
compile and render a first frame (tracker: 30%). Shots v0–v4 in `out/shots/render-core/`. Other agents have since
taken in-game screenshots through it (`out/shots/art-weapons/ingame.png`, `out/shots/level-2/start.png`).
**Next steps, in order:** 1) inventory which features in your prompt already work (grep the shader for each:
doors/sliding slabs, movers/pushwalls, sprites + sprite shadows, texel-locked lighting, reflections by gloss,
spark glints, sky/moonlight, exit-switch animation, quality levels); 2) implement the missing ones one at a time,
one screenshot per feature; 3) postfx hookup (bind `postfx.target`, viewport w×h, `postfx.resize`); 4) perf check;
5) tests + report.
**Gotchas:** door slab geometry must match the comment block at the top of `src/sim/world.js`. The previous agent
left no notes beyond this — inspect, don't assume.
