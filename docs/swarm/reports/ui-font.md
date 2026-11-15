# ui-font report

## What I built
`src/ui/font.js`: 5x7 bitmap font, ASCII 32-126 + ÄÖÜäöüß as `'#'/'.'` row strings (import-safe in Node).
Exports `drawText(ctx,text,x,y,{scale,color,shadow,align})`, `measureText(text,scale)`, `glyphRows(ch)`, plus extras
`glyphChars()`, `GLYPH_W/H`, `ADVANCE` (6), `LINE_H` (9). Multi-line via `\n`. Shadow default `'#000'`, offset 1*scale
down-right. Unknown chars render as `?`. Per colour/scale glyph atlas cached on an OffscreenCanvas/canvas (cap 64
entries), blitted with drawImage; falls back to `fillRect` runs when no canvas exists (Node/tests).
`test/font.test.mjs`: 5 tests.

## Verification evidence
`node --test test/font.test.mjs`: 5 pass. Specimen at `out/previews/ui-font/specimen.png` viewed: all glyphs legible at
1x/2x/3x, umlauts and ß distinct, align left/center/right OK. Browser atlas path NOT exercised (no DOM here).

## Deviations from the contract
Extra exports and `\n` support. Integer scale is rounded and clamped to >=1.

## Mistakes I made and how I fixed them
None notable. Capital umlauts only have 6 rows for the base letter (dots on row 0).

## Learnings for a future agent
`encodePNG` in tools/sheet.mjs is import-safe (main guarded). Descender letters (g,p,q,y) use rows 1-6, so g looks a bit like 9 at 1x.

## Requests for other modules
None. Callers should pass integer-pixel coordinates on the 480x270 canvas with `imageSmoothingEnabled=false`.
