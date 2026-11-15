# polish-level-3 report
## What I built
Dock zone d -> floor_grate + ceil_lamp_panel; `!` fill (6,31), candelabra (5,32); three `!` low lights over the fondue river (2,19),(6,19) plus existing glow for River Hall; `!` at (17,6) in Pump Station. Header updated.
## Verification evidence
validate-level OK; botplay --levels 3 reached exit, 0 errors. Start view re-shot: bright, warm, glossy grate. River view was already strongly emissive (fondue glows, reflects on ceiling). Economy: enemy HP ~1139 (11 trooper, 4 panzer, 6 sewer, 1 mouse) vs 163 hairball placed + drops + gatling/yarn/cells; 7 tuna + 3 fish_treat healing: no gross shortage.
## Deviations from the contract
None. Shape/fit: River Hall already had pillar blocks and grate walkways; not changed. Only 3 of the planned 3 views looked at (pump view pre-change).
## Mistakes I made and how I fixed them
Python string indexing ignored the 5-char line prefix, placing things on walls; validator caught it, fixed with offset.
## Learnings for a future agent
Thing-map rows in the file are prefixed by 5 chars; use content offsets. Validator catches wall placement.
## Requests for other modules
None.
