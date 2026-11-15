// KÄSEKRIEG renderer (ARCHITECTURE §9) — a real-time GPU ray tracer in one WebGL2 fragment shader.
//
//   const r = createRenderer(canvas, atlas, { quality: 'medium' });   // throws Error('WEBGL2_UNAVAILABLE')
//   r.render(scene);            // scene per ARCHITECTURE §8.6
//   r.resize();                 // after the canvas backing store changed size
//   r.setQuality('high');       // 'low' 320×180 | 'medium' 480×270 | 'high' 640×360 | 'ultra' 960×540
//   r.setOption(key, value);    // post: exposure, bloom, crt, flash, hurt, wobble (+ anything postfx.draw accepts)
//                               // trace: reflections (0..1), shadows (bool), ao (0..1), glints (0..2), specular (0..2),
//                               //        texelLock (bool), lodBias (number), debug (0 off, 1 albedo, 2 normals, 3 lighting)
//   r.stats                     // { ms, width, height, renderer, cpuMs, gpuMs, packMs, quality, sprites, lights, post }
//   r.dispose();
//
// Per frame the CPU packs the scene into three tiny data textures (see shaders/trace.js for the layout): the cell
// map, per-cell sprite and light index lists (lights are flood-filled through open cells so a lamp never costs
// anything in rooms it cannot reach), and a float table of sprites and lights. `createPacker` is pure (no GL, no
// DOM) so it can be unit-tested in Node.

import { LIMITS, SKY, CELL, VIEW } from '../core/defs.js';
import { VERT, traceFrag, BLIT_FRAG } from './shaders/trace.js';

let createPostFX = null;
try { ({ createPostFX } = await import('./postfx.js')); } catch { createPostFX = null; }   // missing → internal tonemap + nearest blit

export const QUALITY = {
  low:    { w: 320, h: 180, lights: 4,  reflLights: 2, reflMinGloss: 0.30, steps: 64,  reflSteps: 24, shadowSteps: 12 },
  medium: { w: 480, h: 270, lights: 6,  reflLights: 3, reflMinGloss: 0.10, steps: 96,  reflSteps: 40, shadowSteps: 16 },
  high:   { w: 640, h: 360, lights: 8,  reflLights: 5, reflMinGloss: 0.05, steps: 128, reflSteps: 64, shadowSteps: 20 },
  ultra:  { w: 960, h: 540, lights: 12, reflLights: 8, reflMinGloss: 0.03, steps: 128, reflSteps: 96, shadowSteps: 24 },
};

export const MAPN = 64;               // map texture edge (= LIMITS.MAP)
export const LISTN = 16;              // max sprite / light indices per cell
export const DATAW = 128;             // data texture width
const MAX_SPRITES = Math.min(LIMITS.SPRITES ?? 96, DATAW);
const MAX_LIGHTS = Math.min(LIMITS.LIGHTS ?? 24, DATAW);
const MAX_BEAMS = Math.min(LIMITS.BEAMS ?? 4, 4);
const MAX_MOVERS = Math.min(LIMITS.MOVERS ?? 4, 4);
const MOON_GAIN = 0.6;                    // level moonColor → direct irradiance (keeps courtyards night-like)
const STATE_TILES = ['wall.exit_switch'];   // multi-frame tiles whose frames are states, not an animation loop

const now = () => (globalThis.performance ?? Date).now();
const fin = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const v3 = (a, d0, d1, d2) => (Array.isArray(a) || ArrayBuffer.isView(a) ? [fin(a[0], d0), fin(a[1], d1), fin(a[2], d2)] : [d0, d1, d2]);

/** Same window as the shader: falls to exactly zero at the light radius. x = (distance / radius)². */
export function lightFalloff(x) { return x >= 1 ? 0 : ((1 - x) * (1 - x)) / (1 + 5 * x); }

/**
 * CPU side of the tracer: packs a scene into typed arrays that are uploaded verbatim as textures.
 * Pure — usable in Node. `atlas` is only consulted for tile animation lengths.
 */
export function createPacker(atlas) {
  const N = MAPN * MAPN;
  const map = new Uint32Array(N * 4);
  const lists = new Uint32Array(N * 2 * 4);
  const data = new Float32Array(DATAW * 4 * 4);
  const kind = new Uint8Array(N);           // 0 open, 1 solid, 2 door (indexed cy*MAPN+cx)
  const doorBits = new Uint32Array(N);
  const closed = new Uint8Array(N);         // fully shut door: light does not flood through
  const sky = new Uint8Array(N);
  const moonOk = new Uint8Array(N);
  const sprCount = new Uint8Array(N), litCount = new Uint8Array(N);
  const sprIdx = new Uint8Array(N * LISTN), litIdx = new Uint8Array(N * LISTN);
  const litW = new Float32Array(N * LISTN);
  const stamp = new Uint32Array(N);
  const queue = new Int32Array(N);
  let stampId = 0;

  const anim = atlas?.tiles?.anim ?? null;
  const tileCount = atlas?.tiles?.count ?? 0x10000;
  const noAnim = new Set();
  for (const name of STATE_TILES) { const l = atlas?.tiles?.index?.get?.(name); if (l !== undefined) noAnim.add(l); }
  let tick = 0;
  const layerOf = (l) => {
    l |= 0;
    if (l < 0 || l >= tileCount) return 0;
    const n = anim && !noAnim.has(l) ? anim[l] : 1;
    return n > 1 ? l + (tick % n) : l;
  };

  const info = { w: 0, h: 0, sprites: 0, lights: 0, movers: 0, beams: 0, moon: false, jamb: 0 };
  const moverBox = new Float32Array(MAX_MOVERS * 4), moverTex = new Int32Array(MAX_MOVERS);
  const beamA = new Float32Array(MAX_BEAMS * 4), beamB = new Float32Array(MAX_BEAMS * 4), beamC = new Float32Array(MAX_BEAMS * 4);

  function addLight(ci, li, wgt) {
    const base = ci * LISTN;
    let n = litCount[ci];
    if (n === LISTN) { if (wgt <= litW[base + n - 1]) return; n--; } else litCount[ci] = n + 1;
    let k = n;
    while (k > 0 && litW[base + k - 1] < wgt) { litW[base + k] = litW[base + k - 1]; litIdx[base + k] = litIdx[base + k - 1]; k--; }
    litW[base + k] = wgt; litIdx[base + k] = li;
  }

  /** scene → arrays. Returns `info` (dimensions and counts). `moon`: { dir:[x,y,z] } or null. */
  function pack(scene, moon = null) {
    const world = scene?.world;
    const w = Math.min(MAPN, Math.max(0, world?.w | 0)), h = Math.min(MAPN, Math.max(0, world?.h | 0));
    const sw = world?.w | 0;
    info.w = w; info.h = h; info.sprites = 0; info.lights = 0; info.movers = 0; info.beams = 0; info.moon = false;
    tick = Math.floor(fin(scene?.time) * 6);
    if (tick < 0) tick = 0;
    kind.fill(1); sky.fill(0); moonOk.fill(0); closed.fill(0); doorBits.fill(0);
    sprCount.fill(0); litCount.fill(0);
    if (!world || !w || !h) { map.fill(0); lists.fill(0); return info; }
    const cells = world.cells, wallTex = world.wallTex, floorTex = world.floorTex, ceilTex = world.ceilTex;
    const doors = world.doors || [], doorAt = world.doorAt;
    info.jamb = layerOf(world.jambTex | 0);

    // 1. cell kinds, doors, sky
    let anySky = false;
    for (let cy = 0; cy < h; cy++) for (let cx = 0; cx < w; cx++) {
      const i = cy * sw + cx, o = cy * MAPN + cx, c = cells[i];
      if (c === CELL.OPEN) kind[o] = 0;
      else if (c === CELL.DOOR) {
        const d = doorAt ? doors[doorAt[i]] : null;
        if (d) {
          const op = Math.min(1, Math.max(0, fin(d.open)));
          kind[o] = 2;
          doorBits[o] = ((d.vertical ? 1 : 0) << 18) | (Math.round(op * 4095) << 19);
          closed[o] = op < 0.004 ? 1 : 0;
        } else kind[o] = 0;
      } else kind[o] = 1;
      if (kind[o] !== 1 && ceilTex[i] === SKY) { sky[o] = 1; anySky = true; }
    }

    // 2. moonlight reach: sky cells plus the cells a slanted moon ray can still get into
    if (moon && anySky) {
      info.moon = true;
      const hy = Math.max(0.05, moon.dir[1]);
      const reach = Math.min(4, Math.ceil(Math.hypot(moon.dir[0], moon.dir[2]) / hy));
      for (let cy = 0; cy < h; cy++) for (let cx = 0; cx < w; cx++) {
        if (!sky[cy * MAPN + cx]) continue;
        const y0 = Math.max(0, cy - reach), y1 = Math.min(h - 1, cy + reach), x0 = Math.max(0, cx - reach), x1 = Math.min(w - 1, cx + reach);
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) moonOk[y * MAPN + x] = 1;
      }
    }

    // 3. sprites → table + per-cell lists
    const sprites = scene.sprites || [];
    let ns = 0;
    for (let k = 0; k < sprites.length && ns < MAX_SPRITES; k++) {
      const s = sprites[k];
      if (!s) continue;
      const x = +s.x, y = +s.y, size = +s.size, alpha = s.alpha === undefined ? 1 : +s.alpha;
      if (!(size > 0.001) || !(alpha > 0.01) || !Number.isFinite(x) || !Number.isFinite(y)) continue;
      const si = ns++;
      data[si * 4] = x; data[si * 4 + 1] = fin(s.h); data[si * 4 + 2] = y; data[si * 4 + 3] = size;
      const o1 = (DATAW + si) * 4;
      data[o1] = Math.max(0, s.frame | 0); data[o1 + 1] = s.flipX ? 1 : 0; data[o1 + 2] = Math.max(0, fin(s.glow)); data[o1 + 3] = Math.min(1, alpha);
      const r = size * 0.5 + 0.02;
      const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(w - 1, Math.floor(x + r));
      const y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(h - 1, Math.floor(y + r));
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
        const o = cy * MAPN + cx;
        if (kind[o] === 1 || sprCount[o] >= LISTN) continue;
        sprIdx[o * LISTN + sprCount[o]++] = si;
      }
    }
    info.sprites = ns;

    // 4. lights → table + per-cell lists (flood fill through non-solid cells inside the radius)
    const lights = scene.lights || [];
    let nl = 0;
    for (let k = 0; k < lights.length && nl < MAX_LIGHTS; k++) {
      const l = lights[k];
      if (!l) continue;
      const x = +l.x, y = +l.y, rad = +l.radius, r = fin(l.r), g = fin(l.g), b = fin(l.b);
      const peak = Math.max(r, g, b);
      if (!(rad > 0.01) || !(peak > 0.001) || !Number.isFinite(x) || !Number.isFinite(y)) continue;
      const li = nl++;
      const o2 = (DATAW * 2 + li) * 4, o3 = (DATAW * 3 + li) * 4;
      data[o2] = x; data[o2 + 1] = fin(l.h, 0.5); data[o2 + 2] = y; data[o2 + 3] = rad;
      data[o3] = r; data[o3 + 1] = g; data[o3 + 2] = b; data[o3 + 3] = 0;
      const sx = Math.floor(x), sy = Math.floor(y);
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      const r2 = rad * rad;
      if (++stampId === 0xFFFFFFFF) { stamp.fill(0); stampId = 1; }
      let qh = 0, qt = 0;
      queue[qt++] = sy * MAPN + sx; stamp[sy * MAPN + sx] = stampId;
      while (qh < qt) {
        const o = queue[qh++], cx = o % MAPN, cy = (o / MAPN) | 0;
        const nx = x < cx ? cx : x > cx + 1 ? cx + 1 : x, ny = y < cy ? cy : y > cy + 1 ? cy + 1 : y;
        const d2 = (nx - x) * (nx - x) + (ny - y) * (ny - y);
        if (kind[o] !== 1) addLight(o, li, peak * lightFalloff(d2 / r2) + 1e-6);
        if (closed[o] && qh > 1) continue;              // light stops at a shut door (unless it starts inside it)
        for (let e = 0; e < 4; e++) {
          const ax = cx + (e === 0 ? 1 : e === 1 ? -1 : 0), ay = cy + (e === 2 ? 1 : e === 3 ? -1 : 0);
          if (ax < 0 || ay < 0 || ax >= w || ay >= h) continue;
          const ao = ay * MAPN + ax;
          if (stamp[ao] === stampId || kind[ao] === 1) continue;
          const mx = x < ax ? ax : x > ax + 1 ? ax + 1 : x, my = y < ay ? ay : y > ay + 1 ? ay + 1 : y;
          if ((mx - x) * (mx - x) + (my - y) * (my - y) >= r2) continue;
          stamp[ao] = stampId; queue[qt++] = ao;
        }
      }
    }
    info.lights = nl;

    // 5. write the map and list texels
    const solidAt = (cx, cy) => (cx < 0 || cy < 0 || cx >= w || cy >= h ? 1 : kind[cy * MAPN + cx] === 1 ? 1 : 0);
    for (let cy = 0; cy < h; cy++) for (let cx = 0; cx < w; cx++) {
      const i = cy * sw + cx, o = cy * MAPN + cx, m = o * 4, kd = kind[o];
      const ceil = ceilTex[i] === SKY ? 0xFFFF : layerOf(ceilTex[i]);
      map[m] = (layerOf(wallTex[i]) | (layerOf(floorTex[i]) << 16)) >>> 0;
      map[m + 1] = (ceil | (kd << 16) | doorBits[o]) >>> 0;
      map[m + 2] = sprCount[o] | (litCount[o] << 8);
      let nb = 0;
      if (kd !== 1) {
        nb = solidAt(cx, cy - 1) | (solidAt(cx + 1, cy) << 1) | (solidAt(cx, cy + 1) << 2) | (solidAt(cx - 1, cy) << 3)
          | (solidAt(cx + 1, cy - 1) << 4) | (solidAt(cx + 1, cy + 1) << 5) | (solidAt(cx - 1, cy + 1) << 6) | (solidAt(cx - 1, cy - 1) << 7);
        if (moonOk[o]) nb |= 256;
        if (sky[o]) nb |= 512;
      }
      map[m + 3] = nb;
      const ls = (cy * MAPN * 2 + cx * 2) * 4, sb = o * LISTN;
      for (let c4 = 0; c4 < 4; c4++) {
        const q = sb + c4 * 4;
        lists[ls + c4] = (sprIdx[q] | (sprIdx[q + 1] << 8) | (sprIdx[q + 2] << 16) | (sprIdx[q + 3] << 24)) >>> 0;
        lists[ls + 4 + c4] = (litIdx[q] | (litIdx[q + 1] << 8) | (litIdx[q + 2] << 16) | (litIdx[q + 3] << 24)) >>> 0;
      }
    }

    // 6. pushwalls in motion and beams (uniforms)
    const movers = world.movers || [];
    let nm = 0;
    for (let k = 0; k < movers.length && nm < MAX_MOVERS; k++) {
      const mv = movers[k];
      if (!mv || !(mv.x1 > mv.x0) || !(mv.y1 > mv.y0)) continue;
      moverBox[nm * 4] = mv.x0; moverBox[nm * 4 + 1] = mv.y0; moverBox[nm * 4 + 2] = mv.x1; moverBox[nm * 4 + 3] = mv.y1;
      moverTex[nm++] = layerOf(mv.tex);
    }
    info.movers = nm;
    const beams = scene.beams || [];
    let nb = 0;
    for (let k = 0; k < beams.length && nb < MAX_BEAMS; k++) {
      const b = beams[k];
      if (!b || !Number.isFinite(+b.x0) || !Number.isFinite(+b.x1)) continue;
      const o = nb++ * 4;
      beamA[o] = +b.x0; beamA[o + 1] = fin(b.h0, 0.4); beamA[o + 2] = +b.y0; beamA[o + 3] = Math.max(0.004, fin(b.width, 0.03));
      beamB[o] = +b.x1; beamB[o + 1] = fin(b.h1, 0.4); beamB[o + 2] = +b.y1; beamB[o + 3] = 0;
      beamC[o] = fin(b.r, 1); beamC[o + 1] = fin(b.g, 0.2); beamC[o + 2] = fin(b.b, 0.2); beamC[o + 3] = 0;
    }
    info.beams = nb;
    return info;
  }

  return { map, lists, data, moverBox, moverTex, beamA, beamB, beamC, info, pack,
    /** Test helpers: decoded per-cell lists. */
    lightsAt(cx, cy) { const o = cy * MAPN + cx; return Array.from(litIdx.subarray(o * LISTN, o * LISTN + litCount[o])); },
    spritesAt(cx, cy) { const o = cy * MAPN + cx; return Array.from(sprIdx.subarray(o * LISTN, o * LISTN + sprCount[o])); },
  };
}

// ───────────────────────────── GL helpers ─────────────────────────────
function numbered(src) { return src.split('\n').map((l, i) => String(i + 1).padStart(4) + ': ' + l).join('\n'); }

function compile(gl, type, src, label) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s) || '(no log)';
    gl.deleteShader(s);
    const bad = new Set([...log.matchAll(/ERROR:\s*\d+:(\d+)/g)].map((mm) => +mm[1]));
    const ctx = numbered(src).split('\n').filter((_, i) => [...bad].some((b) => Math.abs(b - 1 - i) <= 1)).join('\n');
    throw new Error(`renderer: ${label} shader compile failed:\n${log}\n${ctx}`);
  }
  return s;
}

function link(gl, vsSrc, fsSrc, label) {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc, label + ' vertex');
  let fs;
  try { fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc, label + ' fragment'); } catch (e) { gl.deleteShader(vs); throw e; }
  const p = gl.createProgram();
  gl.attachShader(p, vs); gl.attachShader(p, fs);
  gl.linkProgram(p);
  gl.deleteShader(vs); gl.deleteShader(fs);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p) || '(no log)';
    gl.deleteProgram(p);
    throw new Error(`renderer: ${label} program link failed:\n${log}`);
  }
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const a = gl.getActiveUniform(p, i);
    if (!a) continue;
    const name = a.name.replace(/\[0\]$/, '');
    u[name] = gl.getUniformLocation(p, name);
  }
  return { p, u };
}

export function createRenderer(canvas, atlas, opts = {}) {
  const gl = canvas && canvas.getContext ? canvas.getContext('webgl2', {
    alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false,
    preserveDrawingBuffer: false, powerPreference: 'high-performance',
  }) : null;
  if (!gl) throw new Error('WEBGL2_UNAVAILABLE');

  let quality = QUALITY[opts.quality] ? opts.quality : 'medium';
  const packer = createPacker(atlas);
  const stats = { ms: 0, width: 0, height: 0, renderer: 'WebGL2', cpuMs: 0, gpuMs: null, packMs: 0, quality, sprites: 0, lights: 0, post: 'none', compileMs: 0, frames: 0 };
  const post = { exposure: 1.35, bloom: 1, crt: 0, flash: null, hurt: 0, wobble: 0 };
  const topt = { reflections: 1, shadows: 1, ao: 1, glints: 1, specular: 1, texelLock: 1, lodBias: -0.6, debug: 0 };
  let G = null;          // all GL objects; rebuilt after a context loss
  let lost = false, disposed = false;

  function arrayTex(src, count, srgb, mips) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
    const levels = mips ? 5 : 1;
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, levels, srgb ? gl.SRGB8_ALPHA8 : gl.RGBA8, 64, 64, count);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, 0, 64, 64, count, gl.RGBA, gl.UNSIGNED_BYTE, src);
    if (mips) gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, mips ? gl.NEAREST_MIPMAP_NEAREST : gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  function dataTex(ifmt, w, h) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, 1, ifmt, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  /** Atlas layer block, padded/truncated to a whole number of 64×64 layers the GPU accepts. */
  function layerBlock(part) {
    const maxLayers = gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS) | 0;
    const bytes = 64 * 64 * 4;
    let count = Math.max(1, Math.min(maxLayers, part?.count | 0 || Math.floor((part?.rgba?.length || 0) / bytes)));
    const fit = (a) => {
      if (a && a.length === count * bytes) return a;
      const out = new Uint8Array(count * bytes);
      if (a) out.set(a.subarray(0, Math.min(a.length, out.length)));
      return out;
    };
    return { count, rgba: fit(part?.rgba), mat: fit(part?.mat) };
  }

  function init() {
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    stats.renderer = String((dbg && gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || 'WebGL2');
    const g = { programs: {}, vao: gl.createVertexArray(), own: null, pfx: null, timer: null, queries: [] };
    const tiles = layerBlock(atlas?.tiles), sprites = layerBlock(atlas?.sprites);
    g.tileCount = tiles.count; g.sprCount = sprites.count;
    g.tileAlb = arrayTex(tiles.rgba, tiles.count, true, true);
    g.tileMat = arrayTex(tiles.mat, tiles.count, false, true);
    g.sprAlb = arrayTex(sprites.rgba, sprites.count, true, false);
    g.sprMat = arrayTex(sprites.mat, sprites.count, false, false);
    g.map = dataTex(gl.RGBA32UI, MAPN, MAPN);
    g.lists = dataTex(gl.RGBA32UI, MAPN * 2, MAPN);
    g.data = dataTex(gl.RGBA32F, DATAW, 4);
    g.timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if (createPostFX && opts.postfx !== false) {
      try { g.pfx = createPostFX(gl); stats.post = 'postfx' + (g.pfx.format ? ' ' + g.pfx.format : ''); }
      catch (e) { g.pfx = null; stats.postError = String(e?.message ?? e); }
    }
    if (!g.pfx) {
      g.blit = link(gl, VERT, BLIT_FRAG, 'blit');
      stats.post = 'internal';
    }
    G = g;
    program(quality);
    resize();
  }

  function program(q) {
    if (G.programs[q]) return G.programs[q];
    const t0 = now();
    const pr = link(gl, VERT, traceFrag(QUALITY[q]), 'trace(' + q + ')');
    gl.useProgram(pr.p);
    const units = { uMap: 0, uLists: 1, uData: 2, uTileAlb: 3, uTileMat: 4, uSprAlb: 5, uSprMat: 6 };
    for (const k in units) if (pr.u[k]) gl.uniform1i(pr.u[k], units[k]);
    stats.compileMs = now() - t0;
    return (G.programs[q] = pr);
  }

  function ownTarget(w, h) {
    const o = G.own;
    if (o && o.w === w && o.h === h) return o;
    if (o) { gl.deleteTexture(o.tex); gl.deleteFramebuffer(o.fbo); }
    const hdr = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float');
    const tex = dataTex(hdr ? gl.RGBA16F : gl.RGBA8, w, h);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return (G.own = { tex, fbo, w, h });
  }

  function resize() {
    if (!G || lost) return;
    const q = QUALITY[quality];
    const ow = Math.max(1, canvas.width | 0), oh = Math.max(1, canvas.height | 0);
    stats.width = q.w; stats.height = q.h;
    G.outW = ow; G.outH = oh;
    if (G.pfx) G.pfx.resize(q.w, q.h, ow, oh); else ownTarget(q.w, q.h);
  }

  function setQuality(q) {
    if (!QUALITY[q] || q === quality) return;
    quality = q; stats.quality = q;
    if (G && !lost) { program(q); resize(); }
  }

  function setOption(key, value) {
    if (typeof key !== 'string') return;
    if (key in topt) topt[key] = typeof value === 'boolean' ? (value ? 1 : 0) : fin(+value, topt[key]);
    else if (key === 'crt') post.crt = value === true ? 1 : fin(+value, 0);
    else post[key] = value;
  }

  const moonDir = [0, 1, 0], moonShow = [0, 1, 0, 0], moonArg = { dir: moonDir };

  function render(scene) {
    if (disposed || lost || !G) return;
    const t0 = now();
    if (canvas.width !== G.outW || canvas.height !== G.outH) resize();
    const q = QUALITY[quality], pr = program(quality), u = pr.u;

    // sky / moon set-up (needed by the packer for the moonlight reach flags)
    const sky = scene?.sky || null;
    let moonCol = [0, 0, 0];
    if (sky) {
      const d = v3(sky.moonDir, 0.45, 0.8, 0.35);
      if (d[1] < 0.05) d[1] = 0.05;
      const len = Math.hypot(d[0], d[1], d[2]) || 1;
      moonDir[0] = d[0] / len; moonDir[1] = d[1] / len; moonDir[2] = d[2] / len;
      moonCol = v3(sky.moonColor, 0.55, 0.65, 1.0);
      // the disc is drawn at the moon's azimuth but low in the sky, where a level camera can actually see it
      const az = Math.atan2(moonDir[2], moonDir[0]), el = Math.min(Math.asin(moonDir[1]), 0.27);
      moonShow[0] = Math.cos(el) * Math.cos(az); moonShow[1] = Math.sin(el); moonShow[2] = Math.cos(el) * Math.sin(az); moonShow[3] = 0.085;
    } else { moonShow[3] = 0; }
    const info = packer.pack(scene, sky ? moonArg : null);
    stats.sprites = info.sprites; stats.lights = info.lights;
    stats.packMs = now() - t0;

    let query = null;
    if (G.timer && G.queries.length < 4) { query = gl.createQuery(); gl.beginQuery(G.timer.TIME_ELAPSED_EXT, query); }

    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.disable(gl.SCISSOR_TEST); gl.disable(gl.CULL_FACE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, G.map);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, MAPN, MAPN, gl.RGBA_INTEGER, gl.UNSIGNED_INT, packer.map);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, G.lists);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, MAPN * 2, MAPN, gl.RGBA_INTEGER, gl.UNSIGNED_INT, packer.lists);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, G.data);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, DATAW, 4, gl.RGBA, gl.FLOAT, packer.data);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D_ARRAY, G.tileAlb);
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D_ARRAY, G.tileMat);
    gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D_ARRAY, G.sprAlb);
    gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D_ARRAY, G.sprMat);

    const target = G.pfx ? G.pfx.target : ownTarget(q.w, q.h).fbo;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.viewport(0, 0, q.w, q.h);
    gl.useProgram(pr.p);
    gl.bindVertexArray(G.vao);

    const cam = scene?.cam || {};
    const a = fin(cam.angle), fov = Math.min(2.8, Math.max(0.3, fin(cam.fov, VIEW.FOV))), roll = fin(cam.roll);
    const ca = Math.cos(a), sa = Math.sin(a), th = Math.tan(fov / 2), tv = th * q.h / q.w;
    const cr = Math.cos(roll), sr = Math.sin(roll);
    // forward (ca,0,sa) · right (-sa,0,ca) · up (0,1,0); roll spins right/up about forward
    gl.uniform2f(u.uRes, q.w, q.h);
    gl.uniform3f(u.uCamPos, fin(cam.x, 1.5), Math.min(0.98, Math.max(0.02, fin(cam.h, VIEW.EYE))), fin(cam.y, 1.5));
    gl.uniform3f(u.uCamF, ca, 0, sa);
    gl.uniform3f(u.uCamR, -sa * cr * th, sr * th, ca * cr * th);
    gl.uniform3f(u.uCamU, sa * sr * tv, cr * tv, -ca * sr * tv);
    gl.uniform2f(u.uCamFwd2, ca, sa);
    gl.uniform1f(u.uTime, fin(scene?.time) % 3600);
    gl.uniform1f(u.uPixAngle, (2 * th) / q.w);
    gl.uniform2i(u.uMapSize, info.w, info.h);
    const amb = v3(scene?.ambient, 0.05, 0.05, 0.06);
    gl.uniform3f(u.uAmbient, amb[0], amb[1], amb[2]);
    const fog = scene?.fog || null, fc = v3(fog?.color, 0.02, 0.02, 0.03);
    gl.uniform4f(u.uFog, fc[0], fc[1], fc[2], Math.max(0, fin(fog?.density, 0)));
    const moonOn = info.moon ? 1 : 0;
    gl.uniform3f(u.uMoonDir, moonDir[0], moonDir[1], moonDir[2]);
    const mk = moonOn * MOON_GAIN;
    gl.uniform3f(u.uMoonCol, moonCol[0] * mk, moonCol[1] * mk, moonCol[2] * mk);
    gl.uniform3f(u.uSkyAmb, 0.02 + moonCol[0] * 0.07, 0.025 + moonCol[1] * 0.07, 0.04 + moonCol[2] * 0.07);
    gl.uniform4f(u.uMoonShow, moonShow[0], moonShow[1], moonShow[2], moonShow[3]);
    gl.uniform1i(u.uMoverCount, info.movers);
    if (info.movers) { gl.uniform4fv(u.uMoverBox, packer.moverBox); gl.uniform1iv(u.uMoverTex, packer.moverTex); }
    gl.uniform1i(u.uBeamCount, info.beams);
    if (info.beams) { gl.uniform4fv(u.uBeamA, packer.beamA); gl.uniform4fv(u.uBeamB, packer.beamB); gl.uniform4fv(u.uBeamC, packer.beamC); }
    gl.uniform1i(u.uJambTex, Math.min(info.jamb, G.tileCount - 1));
    gl.uniform4f(u.uOpt, topt.reflections, topt.shadows, topt.ao, topt.glints);
    gl.uniform4f(u.uOpt2, topt.texelLock, topt.lodBias, topt.specular, 0);
    gl.uniform1i(u.uDebug, topt.debug | 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const time = fin(scene?.time);
    if (G.pfx) {
      G.pfx.draw({ ...post, time });
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, G.outW, G.outH);
      gl.useProgram(G.blit.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, G.own.tex);
      gl.uniform1i(G.blit.u.uScene, 0);
      gl.uniform2f(G.blit.u.uSceneSize, q.w, q.h);
      gl.uniform2f(G.blit.u.uOutSize, G.outW, G.outH);
      gl.uniform1f(G.blit.u.uExposure, fin(post.exposure, 1));
      const fl = post.flash;
      if (fl && fl.length >= 4) gl.uniform4f(G.blit.u.uFlash, fin(fl[0]), fin(fl[1]), fin(fl[2]), fin(fl[3])); else gl.uniform4f(G.blit.u.uFlash, 0, 0, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.bindVertexArray(null);

    if (query) { gl.endQuery(G.timer.TIME_ELAPSED_EXT); G.queries.push(query); }
    while (G.queries.length) {
      const qq = G.queries[0];
      if (!gl.getQueryParameter(qq, gl.QUERY_RESULT_AVAILABLE)) break;
      const disjoint = gl.getParameter(G.timer.GPU_DISJOINT_EXT);
      if (!disjoint) { const ms = gl.getQueryParameter(qq, gl.QUERY_RESULT) / 1e6; stats.gpuMs = stats.gpuMs == null ? ms : stats.gpuMs * 0.8 + ms * 0.2; }
      gl.deleteQuery(qq); G.queries.shift();
    }
    stats.cpuMs = now() - t0;
    stats.ms = stats.gpuMs != null ? stats.gpuMs : stats.cpuMs;
    stats.frames++;
  }

  /** Blocking benchmark helper: renders `frames` frames and waits for the GPU. Returns ms per frame. */
  function measure(scene, frames = 30) {
    if (!G || lost) return NaN;
    const px = new Uint8Array(4);
    render(scene); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const t0 = now();
    for (let i = 0; i < frames; i++) render(scene);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return (now() - t0) / frames;
  }

  function freeGL() {
    if (!G) return;
    try {
      for (const k in G.programs) gl.deleteProgram(G.programs[k].p);
      if (G.blit) gl.deleteProgram(G.blit.p);
      for (const t of [G.tileAlb, G.tileMat, G.sprAlb, G.sprMat, G.map, G.lists, G.data]) gl.deleteTexture(t);
      if (G.own) { gl.deleteTexture(G.own.tex); gl.deleteFramebuffer(G.own.fbo); }
      for (const qq of G.queries) gl.deleteQuery(qq);
      gl.deleteVertexArray(G.vao);
      G.pfx?.dispose?.();
    } catch { /* context already gone */ }
    G = null;
  }

  const onLost = (e) => { e.preventDefault(); lost = true; G = null; };
  const onRestored = () => { lost = false; try { init(); } catch (e) { stats.error = String(e?.message ?? e); } };
  canvas.addEventListener?.('webglcontextlost', onLost);
  canvas.addEventListener?.('webglcontextrestored', onRestored);

  init();

  return {
    render, resize, setQuality, setOption, stats, measure,
    get quality() { return quality; },
    get gl() { return gl; },
    dispose() {
      if (disposed) return;
      disposed = true;
      canvas.removeEventListener?.('webglcontextlost', onLost);
      canvas.removeEventListener?.('webglcontextrestored', onRestored);
      freeGL();
    },
  };
}

export default createRenderer;
