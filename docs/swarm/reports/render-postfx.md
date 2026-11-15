# render-postfx report

## What I built
- `src/render/postfx.js` (pre-existing from an earlier run, resumed): `createPostFX(gl)` -> `{resize, draw, dispose, target, texture, width, height, hdr, format}`. Pipeline: soft-knee Karis bright pass -> 5-level dual-filter bloom -> separate high-threshold star source -> 4-pass Kawase streaks along X and Y (4-point star) -> composite (texelFetch nearest at internal texel centres, ACES tonemap, sRGB, lens vignette, hurt vignette + desaturation, flash, Bayer-4 dither, optional CRT with barrel/scanlines/aperture mask/edge falloff, wobble warp with chromatic split). RGBA16F target, RGBA8 fallback if EXT_color_buffer_float is missing. NaN/Inf guard on scene reads.
- `src/render/postfx-demo.html`: synthetic HDR scene (gradients, 1-texel bright points 3..60, HDR ramp strip, checker and 1-texel line crispness charts, coloured lamp). Query params: `bloom crt flash=r,g,b,a hurt wobble exposure time dither streaks w h ow oh`. Sets `window.__demo.done`.
- `test/postfx.test.mjs`: Node import / guard test.

## Verification evidence
Headless Chrome (tools/shot.mjs, `--strict`, no page errors, GL error 0, format RGBA16F) screenshots in `out/shots/render-postfx/`: base, nobloom, crt, flash, hurt, wobble, exposure2, nodither, nostreak. Viewed base/crt/wobble/hurt: four-point streaks on the bright texels (horizontal + vertical only), checker and 1-texel line charts are crisp uniform blocks (nearest upscale, 4x), CRT curves + scanlines, hurt gives red vignette, wobble warps with RGB split, flash tints (readback corner [234,224,188] vs [219,219,219]).

## Deviations from the contract
Extra optional draw keys: `streaks`, `dither`, `vignette`. Extra getters `texture/width/height/hdr/format`.

## Mistakes I made and how I fixed them
- Existing postfx.js had never been run: composite shader failed to compile (`dot(c,c).xx` on a scalar). Fixed to plain scalar multiply.
- Demo shader compared int to float (`t.y>uS.y-14.`); wrapped in float().

## Learnings for a future agent
Always compile-test shaders in the real browser early; GLSL ES 3.00 forbids swizzling scalars. Bloom=1 with scenes containing large areas above HDR 4 blows out to white; the renderer should set `exposure` sensibly (~1 for lit levels).

## Requests for other modules
render-core: bind `postfx.target`, set viewport to w x h before tracing, call `resize(w,h,canvas.width,canvas.height)` on quality/size change; postfx leaves framebuffer bound to null and texture units 0..3 unbound.
