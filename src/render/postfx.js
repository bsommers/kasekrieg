// KÄSEKRIEG post-processing (ARCHITECTURE §9): HDR target → bloom + 4-point star streaks → filmic tonemap →
// flash / hurt vignette / wobble → subtle ordered dither → optional CRT → nearest-neighbour upscale to the
// default framebuffer.
//
//   const pfx = createPostFX(gl);
//   pfx.resize(w, h, outW, outH);                  // internal (traced) size and output (canvas) size
//   gl.bindFramebuffer(gl.FRAMEBUFFER, pfx.target); // renderer traces the HDR scene into it (RGBA16F, w×h)
//   pfx.draw({ time, exposure, bloom, crt, flash:[r,g,b,a], hurt, wobble });
//   pfx.dispose();
//
// Everything in the final composite is evaluated at internal-texel centres (scene, glow, vignette, dither),
// so the image stays made of crisp uniform blocks; only the optional CRT mask works at output resolution.
// Optional extra draw() keys (not in the contract, all default sensibly): streaks (0..2, multiplier on the
// star strength, default 1), dither (bool, default true), vignette (0..1 subtle lens vignette, default 0.25).
// GL state touched by draw(): framebuffer (left bound to null), viewport, program, VAO, texture units 0..3,
// BLEND/DEPTH_TEST/SCISSOR_TEST/CULL_FACE disabled. Pure GL — no DOM access, safe to import anywhere.

const VS = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const HDR_GUARD = `
vec3 safeHdr(vec3 c) {
  // NaN/Inf/negatives from the tracer must never poison the bloom chain.
  if (any(isnan(c)) || any(isinf(c))) return vec3(0.0);
  return clamp(c, 0.0, 256.0);
}`;

// Bright pass: soft-knee threshold, Karis-weighted 4-tap downsample (kills single-texel fireflies flicker
// in the wide bloom but keeps total energy of bright texels for the streak pass).
const FS_PREFILTER = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uSrc; uniform vec2 uSrcTexel;
uniform float uThreshold, uKnee, uKaris;
${HDR_GUARD}
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 bright(vec3 c) {
  float l = max(c.r, max(c.g, c.b));
  float soft = clamp(l - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-4);
  float w = max(soft, l - uThreshold) / max(l, 1e-4);
  return c * w;
}
void main() {
  vec2 d = uSrcTexel * 0.5;
  vec3 a = bright(safeHdr(texture(uSrc, vUv + vec2(-d.x, -d.y)).rgb));
  vec3 b = bright(safeHdr(texture(uSrc, vUv + vec2( d.x, -d.y)).rgb));
  vec3 c = bright(safeHdr(texture(uSrc, vUv + vec2(-d.x,  d.y)).rgb));
  vec3 e = bright(safeHdr(texture(uSrc, vUv + vec2( d.x,  d.y)).rgb));
  vec4 w = mix(vec4(1.0), 1.0 / (1.0 + vec4(luma(a), luma(b), luma(c), luma(e))), uKaris);
  o = vec4((a * w.x + b * w.y + c * w.z + e * w.w) / dot(w, vec4(1.0)), 1.0);
}`;

// Dual-filter (Kawase) downsample.
const FS_DOWN = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uSrc; uniform vec2 uSrcTexel;
void main() {
  vec2 d = uSrcTexel;
  vec3 s = texture(uSrc, vUv).rgb * 4.0;
  s += texture(uSrc, vUv + vec2(-d.x, -d.y)).rgb;
  s += texture(uSrc, vUv + vec2( d.x, -d.y)).rgb;
  s += texture(uSrc, vUv + vec2(-d.x,  d.y)).rgb;
  s += texture(uSrc, vUv + vec2( d.x,  d.y)).rgb;
  o = vec4(s / 8.0, 1.0);
}`;

// Dual-filter upsample of the smaller level, added onto the current level (energy kept via uMix).
const FS_UP = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uSrc; uniform vec2 uSrcTexel;
uniform sampler2D uBase; uniform float uMix;
void main() {
  vec2 d = uSrcTexel;
  vec3 s = vec3(0.0);
  s += texture(uSrc, vUv + vec2(-2.0 * d.x, 0.0)).rgb;
  s += texture(uSrc, vUv + vec2( 2.0 * d.x, 0.0)).rgb;
  s += texture(uSrc, vUv + vec2(0.0, -2.0 * d.y)).rgb;
  s += texture(uSrc, vUv + vec2(0.0,  2.0 * d.y)).rgb;
  s += texture(uSrc, vUv + vec2(-d.x, -d.y)).rgb * 2.0;
  s += texture(uSrc, vUv + vec2( d.x, -d.y)).rgb * 2.0;
  s += texture(uSrc, vUv + vec2(-d.x,  d.y)).rgb * 2.0;
  s += texture(uSrc, vUv + vec2( d.x,  d.y)).rgb * 2.0;
  o = vec4(texture(uBase, vUv).rgb + s / 12.0 * uMix, 1.0);
}`;

// Kawase light-streak pass: symmetric taps along one axis, tap spacing grows ×4 per pass so 4 passes reach
// across the whole screen. Weights decay as a^(distance in source texels).
const FS_STREAK = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uSrc; uniform vec2 uStep; uniform float uSpan, uAtten, uGain;
void main() {
  vec3 s = texture(uSrc, vUv).rgb;
  float wsum = 1.0;
  for (int i = 1; i <= 3; i++) {
    float fi = float(i);
    float w = pow(uAtten, uSpan * fi);
    s += (texture(uSrc, vUv + uStep * fi).rgb + texture(uSrc, vUv - uStep * fi).rgb) * w;
    wsum += 2.0 * w;
  }
  o = vec4(s / wsum * uGain, 1.0);
}`;

// Final composite at output resolution.
const FS_COMPOSITE = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uScene, uBloom, uStreakH, uStreakV;
uniform vec2 uSceneSize, uOutSize;
uniform float uTime, uExposure, uBloomAmt, uStreakAmt, uCrt, uHurt, uWobble, uDither, uVignette, uHdr;
uniform vec4 uFlash;
${HDR_GUARD}

vec3 aces(vec3 x) {          // Narkowicz ACES fit — filmic shoulder, slightly warm highlights
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
vec3 toSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
float bayer4(ivec2 p) {
  int i = (p.x & 3) + ((p.y & 3) << 2);
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[i]) + 0.5) / 16.0;
}
vec3 sceneAt(ivec2 t) {
  t = clamp(t, ivec2(0), ivec2(uSceneSize) - 1);
  return safeHdr(texelFetch(uScene, t, 0).rgb);
}

void main() {
  vec2 uv = vUv;

  // CRT: gentle barrel curvature, applied before texel snapping so pixels bend as a whole.
  if (uCrt > 0.0) {
    vec2 c = uv * 2.0 - 1.0;
    c *= 1.0 + uCrt * 0.045 * dot(c, c) * vec2(0.9, 1.1);
    uv = c * 0.5 + 0.5;
  }

  // Wobble (catnip / death warp): smooth sinusoidal displacement in internal-texel space.
  vec2 wob = vec2(0.0);
  if (uWobble > 0.0) {
    wob = vec2(sin(uv.y * 9.0 + uTime * 2.7) + 0.5 * sin(uv.y * 23.0 - uTime * 4.1),
               sin(uv.x * 7.0 + uTime * 2.1) + 0.5 * sin(uv.x * 19.0 + uTime * 3.3)) * (0.012 * uWobble);
    wob += (uv - 0.5) * (sin(uTime * 1.7) * 0.03 * uWobble);   // breathing zoom
  }

  // Nearest-neighbour: everything below is evaluated at one internal texel.
  vec2 p = (uv + wob) * uSceneSize;
  ivec2 t = ivec2(floor(p));
  vec2 tuv = (vec2(t) + 0.5) / uSceneSize;      // centre of that texel in [0,1]

  vec3 col;
  if (uWobble > 0.0) {                          // chunky chromatic split while warped
    int k = int(round(uWobble * 2.0));
    col = vec3(sceneAt(t + ivec2(k, 0)).r, sceneAt(t).g, sceneAt(t - ivec2(k, 0)).b);
  } else {
    col = sceneAt(t);
  }

  vec3 glow = texture(uBloom, tuv).rgb * uBloomAmt;
  vec3 star = (texture(uStreakH, tuv).rgb + texture(uStreakV, tuv).rgb) * uStreakAmt;
  col += glow + star;

  col *= uExposure;
  if (uVignette > 0.0) {
    vec2 q = tuv - 0.5;
    col *= 1.0 - uVignette * smoothstep(0.2, 0.75, dot(q, q) * 2.0);
  }

  col = aces(col);                               // linear [0,1]

  // Hurt: red vignette that breathes slightly, plus a touch of desaturation.
  if (uHurt > 0.0) {
    vec2 q = (tuv - 0.5) * vec2(1.0, 0.82);
    float r = length(q) * 1.414;
    float v = smoothstep(0.25, 1.05, r + 0.05 * sin(uTime * 9.0)) * uHurt;
    float g = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(col, vec3(g), 0.35 * uHurt);
    col = mix(col, vec3(0.55, 0.0, 0.02), clamp(v * 1.15, 0.0, 0.92));
  }

  // Full-screen flash (pickup gold, damage red, muzzle white...).
  col = mix(col, uFlash.rgb, clamp(uFlash.a, 0.0, 1.0));

  vec3 srgb = toSrgb(clamp(col, 0.0, 1.0));

  // Subtle ordered dither on the internal texel grid (±1 LSB of the 8-bit output).
  if (uDither > 0.0) srgb += (bayer4(t) - 0.5) * (2.0 / 255.0) * uDither;

  // CRT: scanlines at internal-row frequency, RGB aperture mask at output resolution, edge falloff.
  if (uCrt > 0.0) {
    float fy = fract(p.y);
    float scan = 1.0 - uCrt * 0.42 * pow(abs(fy - 0.5) * 2.0, 2.5);
    int mx = int(gl_FragCoord.x) % 3;
    vec3 mask = mx == 0 ? vec3(1.0, 0.8, 0.8) : mx == 1 ? vec3(0.8, 1.0, 0.8) : vec3(0.8, 0.8, 1.0);
    srgb *= scan * mix(vec3(1.0), mask * 1.12, uCrt);
    vec2 e = smoothstep(vec2(0.0), vec2(0.012), uv) * smoothstep(vec2(0.0), vec2(0.012), 1.0 - uv);
    srgb *= e.x * e.y;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) srgb = vec3(0.0);
  }

  o = vec4(srgb, 1.0);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error('postfx shader compile failed: ' + log);
  }
  return s;
}

function program(gl, vsObj, fsSrc, uniformNames) {
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
  const p = gl.createProgram();
  gl.attachShader(p, vsObj);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('postfx link failed: ' + gl.getProgramInfoLog(p));
  const u = {};
  for (const n of uniformNames) u[n] = gl.getUniformLocation(p, n);
  return { p, u };
}

const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'boolean' ? (v ? 1 : 0) : d);

export function createPostFX(gl) {
  if (!gl || typeof gl.texStorage2D !== 'function') throw new Error('postfx: WebGL2 context required');

  const hdr = !!gl.getExtension('EXT_color_buffer_float');
  gl.getExtension('OES_texture_float_linear'); // harmless if absent: RGBA16F is filterable in core WebGL2
  const IFMT = hdr ? gl.RGBA16F : gl.RGBA8;
  const FMT_NAME = hdr ? 'RGBA16F' : 'RGBA8';

  const vs = compile(gl, gl.VERTEX_SHADER, VS);
  const P = {
    prefilter: program(gl, vs, FS_PREFILTER, ['uSrc', 'uSrcTexel', 'uThreshold', 'uKnee', 'uKaris']),
    down: program(gl, vs, FS_DOWN, ['uSrc', 'uSrcTexel']),
    up: program(gl, vs, FS_UP, ['uSrc', 'uSrcTexel', 'uBase', 'uMix']),
    streak: program(gl, vs, FS_STREAK, ['uSrc', 'uStep', 'uSpan', 'uAtten', 'uGain']),
    comp: program(gl, vs, FS_COMPOSITE, ['uScene', 'uBloom', 'uStreakH', 'uStreakV', 'uSceneSize', 'uOutSize', 'uTime',
      'uExposure', 'uBloomAmt', 'uStreakAmt', 'uCrt', 'uHurt', 'uWobble', 'uDither', 'uVignette', 'uHdr', 'uFlash']),
  };
  gl.deleteShader(vs);
  const vao = gl.createVertexArray();

  // render targets: { tex, fbo, w, h }
  const rts = [];
  function makeRT(w, h, filter) {
    w = Math.max(1, w | 0); h = Math.max(1, h | 0);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, IFMT, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (st !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`postfx: framebuffer incomplete (${FMT_NAME} ${w}x${h}, 0x${st.toString(16)})`);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const rt = { tex, fbo, w, h };
    rts.push(rt);
    return rt;
  }
  function freeAll() {
    for (const rt of rts) { gl.deleteTexture(rt.tex); gl.deleteFramebuffer(rt.fbo); }
    rts.length = 0;
  }

  let size = null;   // { w, h, outW, outH }
  let scene = null, half = null, chain = [], starSrc = null, streakH = [], streakV = [];
  let disposed = false;

  function resize(w, h, outW = w, outH = h) {
    if (disposed) return;
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    outW = Math.max(1, Math.round(outW)); outH = Math.max(1, Math.round(outH));
    if (size && size.w === w && size.h === h) { size.outW = outW; size.outH = outH; return; }
    freeAll();
    size = { w, h, outW, outH };
    scene = makeRT(w, h, gl.LINEAR);              // composite uses texelFetch → nearest anyway
    const hw = Math.ceil(w / 2), hh = Math.ceil(h / 2);
    half = makeRT(hw, hh, gl.LINEAR);              // bloom bright pass
    starSrc = makeRT(hw, hh, gl.LINEAR);           // streak bright pass (higher threshold)
    chain = [];
    let cw = hw, ch = hh;
    for (let i = 0; i < 5 && Math.min(cw, ch) > 3; i++) {
      cw = Math.ceil(cw / 2); ch = Math.ceil(ch / 2);
      chain.push({ down: makeRT(cw, ch, gl.LINEAR), up: null });
    }
    // up targets mirror the chain sizes (level i accumulates levels > i); level -1 (half res) is `upHalf`
    for (const lv of chain) lv.up = makeRT(lv.down.w, lv.down.h, gl.LINEAR);
    chain.upHalf = makeRT(hw, hh, gl.LINEAR);
    // Streaks: long axis at quarter res (reach), short axis at half res (thin lines). Ping-pong pairs.
    const qw = Math.max(1, Math.ceil(w / 4)), qh = Math.max(1, Math.ceil(h / 4));
    streakH = [makeRT(qw, hh, gl.LINEAR), makeRT(qw, hh, gl.LINEAR)];
    streakV = [makeRT(hw, qh, gl.LINEAR), makeRT(hw, qh, gl.LINEAR)];
    gl.bindFramebuffer(gl.FRAMEBUFFER, scene.fbo);
    gl.viewport(0, 0, w, h);
  }

  function pass(prog, dst) {
    gl.useProgram(prog.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fbo : null);
    if (dst) gl.viewport(0, 0, dst.w, dst.h);
  }
  function bindTex(unit, rt, loc) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, rt.tex);
    gl.uniform1i(loc, unit);
  }
  const tri = () => gl.drawArrays(gl.TRIANGLES, 0, 3);

  function streakChain(pair, axisX, gain) {
    // returns the RT holding the result
    const src0 = starSrc;
    let src = src0, k = 0;
    const atten = 0.82;                          // per source texel of the pass-0 spacing
    for (let i = 0; i < 4; i++) {
      const dst = pair[k];
      pass(P.streak, dst);
      bindTex(0, src, P.streak.u.uSrc);
      const span = Math.pow(4, i);               // spacing in destination texels
      gl.uniform2f(P.streak.u.uStep, axisX ? span / dst.w : 0, axisX ? 0 : span / dst.h);
      gl.uniform1f(P.streak.u.uSpan, span);
      gl.uniform1f(P.streak.u.uAtten, atten);
      gl.uniform1f(P.streak.u.uGain, i === 3 ? gain : 1);
      tri();
      src = dst; k ^= 1;
    }
    return src;
  }

  function draw(opts = {}) {
    if (disposed || !size) return;
    const { w, h, outW, outH } = size;
    const bloomAmt = Math.max(0, num(opts.bloom, 1));
    const streakMul = Math.max(0, num(opts.streaks, 1));
    const flash = Array.isArray(opts.flash) || ArrayBuffer.isView(opts.flash) ? opts.flash : null;

    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.disable(gl.SCISSOR_TEST); gl.disable(gl.CULL_FACE);
    gl.colorMask(true, true, true, true);
    gl.bindVertexArray(vao);

    if (bloomAmt > 0) {
      // 1. bright passes (wide bloom: soft threshold; stars: only the brightest texels)
      pass(P.prefilter, half);
      bindTex(0, scene, P.prefilter.u.uSrc);
      gl.uniform2f(P.prefilter.u.uSrcTexel, 1 / w, 1 / h);
      gl.uniform1f(P.prefilter.u.uThreshold, hdr ? 1.0 : 0.8);
      gl.uniform1f(P.prefilter.u.uKnee, 0.5);
      gl.uniform1f(P.prefilter.u.uKaris, 1.0);
      tri();
      pass(P.prefilter, starSrc);
      bindTex(0, scene, P.prefilter.u.uSrc);
      gl.uniform1f(P.prefilter.u.uThreshold, hdr ? 3.0 : 0.95);
      gl.uniform1f(P.prefilter.u.uKnee, 0.75);
      gl.uniform1f(P.prefilter.u.uKaris, 0.0);
      tri();

      // 2. bloom down chain
      let src = half;
      for (const lv of chain) {
        pass(P.down, lv.down);
        bindTex(0, src, P.down.u.uSrc);
        gl.uniform2f(P.down.u.uSrcTexel, 1 / src.w, 1 / src.h);
        tri();
        src = lv.down;
      }
      // 3. up chain: up[i] = down[i] + upsample(up[i+1]) ; upHalf = half + upsample(up[0])
      let acc = chain.length ? chain[chain.length - 1].down : half;
      for (let i = chain.length - 2; i >= -1; i--) {
        const base = i >= 0 ? chain[i].down : half;
        const dst = i >= 0 ? chain[i].up : chain.upHalf;
        pass(P.up, dst);
        bindTex(0, acc, P.up.u.uSrc);
        bindTex(1, base, P.up.u.uBase);
        gl.uniform2f(P.up.u.uSrcTexel, 1 / acc.w, 1 / acc.h);
        gl.uniform1f(P.up.u.uMix, 1.0);
        tri();
        acc = dst;
      }
      if (!chain.length) acc = half;
      size.bloomTex = acc;

      // 4. star streaks
      size.sh = streakChain(streakH, true, 1);
      size.sv = streakChain(streakV, false, 1);
    }

    // 5. composite → default framebuffer, nearest upscale
    pass(P.comp, null);
    gl.viewport(0, 0, outW, outH);
    const u = P.comp.u;
    bindTex(0, scene, u.uScene);
    bindTex(1, bloomAmt > 0 ? size.bloomTex : half, u.uBloom);
    bindTex(2, bloomAmt > 0 ? size.sh : half, u.uStreakH);
    bindTex(3, bloomAmt > 0 ? size.sv : half, u.uStreakV);
    gl.uniform2f(u.uSceneSize, w, h);
    gl.uniform2f(u.uOutSize, outW, outH);
    gl.uniform1f(u.uTime, num(opts.time, 0));
    gl.uniform1f(u.uExposure, Math.max(0, num(opts.exposure, 1)));
    // Bloom levels sum ~6 octaves of energy; scale so bloom=1 is a tasteful glow.
    const levels = chain.length + 1;
    gl.uniform1f(u.uBloomAmt, bloomAmt * 0.55 / levels);
    gl.uniform1f(u.uStreakAmt, bloomAmt * streakMul * 0.9);
    gl.uniform1f(u.uCrt, Math.min(1, Math.max(0, num(opts.crt, 0))));
    gl.uniform1f(u.uHurt, Math.min(1, Math.max(0, num(opts.hurt, 0))));
    gl.uniform1f(u.uWobble, Math.min(1, Math.max(0, num(opts.wobble, 0))));
    gl.uniform1f(u.uDither, opts.dither === false ? 0 : Math.max(0, num(opts.dither, 1)));
    gl.uniform1f(u.uVignette, Math.min(1, Math.max(0, num(opts.vignette, 0.25))));
    gl.uniform1f(u.uHdr, hdr ? 1 : 0);
    if (flash) gl.uniform4f(u.uFlash, num(flash[0], 1), num(flash[1], 1), num(flash[2], 1), num(flash[3], 0));
    else gl.uniform4f(u.uFlash, 0, 0, 0, 0);
    tri();

    gl.bindVertexArray(null);
    for (let i = 3; i >= 0; i--) { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, null); }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    freeAll();
    for (const k in P) gl.deleteProgram(P[k].p);
    gl.deleteVertexArray(vao);
    size = null; scene = null;
  }

  return {
    resize, draw, dispose,
    /** FBO to render the HDR scene into (w×h). null until resize() is called. */
    get target() { return scene ? scene.fbo : null; },
    /** The HDR scene texture behind `target` (for debugging / readback). */
    get texture() { return scene ? scene.tex : null; },
    get width() { return size ? size.w : 0; },
    get height() { return size ? size.h : 0; },
    /** true when the target is RGBA16F (EXT_color_buffer_float available); false → RGBA8 LDR fallback. */
    hdr,
    format: FMT_NAME,
  };
}

export default createPostFX;
