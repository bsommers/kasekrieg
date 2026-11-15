# polish-art checkpoint
**Done**
- enemies_beasts: sewer got ragged fur spikes, ear notch, eye scar, blood flecks on die/dead; panzer mat.png checked (sensible). art.test passes.
- enemies_infantry: bright glints + 1.7x scale on idle mouse pistol/officer luger. fx: fx.fur denser puff body+9-11 tufts. tests pass.
**Next steps, in order**
(walls_fort: reviewed, no change needed; seams only at rivets/hazard, doors read well)
(flats: floor_gold calmed, done)
5. decor (open decor.mat.png; check emissive/gloss/spark)
Then write docs/swarm/reports/polish-art.md and `node tools/track.mjs polish-art done "..."`.
**Gotchas**
- Max 3 image reads per module; sheet: `node tools/sheet.mjs <module>` -> out/previews/<module>.png/.mat.png
- Keep sizes/anchors/frames/names unchanged.
**Commands to verify**
- node --test test/art.test.mjs test/art-<module>.test.mjs
