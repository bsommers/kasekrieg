// render-core showcase: a synthetic world and scene that needs nothing from the sim.
// URL params: q=low|medium|high|ultra · view=0..7 (fixed cameras; default: fly-through) · t=<seconds> (freeze time)
//   bench=1 (frame time per quality → window.__demo.bench) · debug=1|2|3 · fallback=1 (ignore the art registry)
//   nopost=1 (internal tonemap instead of postfx.js) · opt.<key>=<value> (renderer.setOption)
// Keys: WASD/arrows move, Q/E quality, 1-8 views, F fly-through, P pause time.
import { artManifest, SKY, VIEW } from '../core/defs.js';
import { createRenderer, QUALITY } from './renderer.js';

const P = new URLSearchParams(location.search);
const D = (window.__demo = { ready: false, errors: [], bench: null, renderer: null, atlas: null });
window.addEventListener('error', (e) => D.errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => D.errors.push(String(e.reason?.message ?? e.reason)));

// ───────────────────────────── procedural fallback art ─────────────────────────────
const S = 64;
const h2 = (x, y, s = 0) => { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1274126177)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const hs = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return h >>> 0; };
const mk = () => ({ rgba: new Uint8Array(S * S * 4), mat: new Uint8Array(S * S * 4) });
const cl = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
function put(b, x, y, c, m = [0, 0, 0], a = 255) {
  x |= 0; y |= 0;
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  const i = (y * S + x) * 4;
  b.rgba[i] = cl(c[0]); b.rgba[i + 1] = cl(c[1]); b.rgba[i + 2] = cl(c[2]); b.rgba[i + 3] = a;
  b.mat[i] = cl(m[0] * 255); b.mat[i + 1] = cl(m[1] * 255); b.mat[i + 2] = cl(m[2] * 255); b.mat[i + 3] = 255;
}
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const tileOf = (fn) => { const b = mk(); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const r = fn(x, y); put(b, x, y, r[0], r[1]); } return b; };
function rect(b, x, y, w, h, c, m) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(b, x + i, y + j, c, m); }
function ell(b, cx, cy, rx, ry, c, m, lit = true) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
    const dx = (x - cx) / rx, dy = (y - cy) / ry;
    if (dx * dx + dy * dy <= 1) put(b, x, y, lit ? mul(c, 1 - 0.28 * (dx * 0.7 + dy * 0.7)) : c, m);
  }
}
function outline(b, c = [26, 20, 32]) {
  const a = b.rgba, on = (x, y) => x >= 0 && y >= 0 && x < S && y < S && a[(y * S + x) * 4 + 3] > 127, add = [];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (!on(x, y) && (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1))) add.push(x, y);
  for (let i = 0; i < add.length; i += 2) put(b, add[i], add[i + 1], c);
  return b;
}

const brick = (base, mortar, seed, m = [0, 0.08, 0]) => tileOf((x, y) => {
  const row = y >> 4, off = (row & 1) * 16, bx = (x + off) & 31, by = y & 15;
  if (bx < 2 || by < 2) return [mul(mortar, 0.9 + 0.2 * h2(x, y, seed)), [0, 0, 0]];
  const k = 0.78 + 0.3 * h2((x + off) >> 5, row, seed) + 0.08 * h2(x, y, seed + 1) + (by === 2 ? 0.12 : by === 15 ? -0.15 : 0);
  return [mul(base, k), m];
});
const planks = (base, seed, m = [0, 0.2, 0]) => tileOf((x, y) => {
  const px = x & 15;
  const k = 0.8 + 0.25 * h2(x >> 4, 0, seed) + 0.1 * h2(x, y >> 2, seed) - (px === 0 ? 0.35 : px === 1 ? -0.1 : 0);
  return [mul(base, k), m];
});
const plate = (base, seed, gloss, stripe) => tileOf((x, y) => {
  const px = x & 31, py = y & 31;
  if (stripe && y >= 54) return [((x + y) >> 3) & 1 ? [230, 190, 30] : [28, 28, 32], [0, 0.3, 0]];
  const rivet = (px === 3 || px === 28) && (py === 3 || py === 28);
  const k = (px === 0 || py === 0 ? 0.55 : px === 1 || py === 1 ? 1.2 : 0.92 + 0.1 * h2(x >> 1, y >> 3, seed)) * (rivet ? 1.4 : 1);
  return [mul(base, k), [0, rivet ? 0.9 : gloss, 0]];
});
const fondue = (frame, fall) => tileOf((x, y) => {
  if (fall && (x < 6 || x >= 58)) return [mul([120, 122, 130], 0.8 + 0.3 * h2(x, y >> 3, 5)), [0, 0.1, 0]];
  const ph = frame / 4;
  const v = fall
    ? 0.5 + 0.5 * Math.sin(((y / 64 - ph) * 2 + h2(x >> 2, 0, 9)) * Math.PI * 2)
    : 0.5 + 0.25 * Math.sin((x / 64 + ph) * Math.PI * 4 + Math.sin(y / 64 * Math.PI * 2) * 2) + 0.25 * Math.sin((y / 64 - ph) * Math.PI * 4 + Math.sin(x / 64 * Math.PI * 2) * 2);
  const bub = !fall && h2((x + frame * 3) >> 3, (y + frame * 5) >> 3, 3) > 0.9 && ((x & 7) - 3.5) ** 2 + ((y & 7) - 3.5) ** 2 < 7;
  const c = bub ? [255, 240, 150] : [255, 140 + 80 * v, 20 + 40 * v];
  return [c, [bub ? 1 : 0.6 + 0.35 * v, 0.3, 0]];
});
const TILE_GEN = {
  'wall.mirror': () => tileOf((x, y) => {
    const e = Math.min(x, y, 63 - x, 63 - y);
    if (e < 7) return [mul([225, 175, 50], e === 0 || e === 6 ? 0.6 : 0.85 + 0.25 * ((e & 1) ^ ((x + y) >> 2 & 1))), [0, 0.5, 0.7]];
    return [[14, 18, 24], [0, 1, 0]];
  }),
  'wall.gold_foil': () => tileOf((x, y) => [mul([240, 190, 50], 0.65 + 0.5 * h2((x + y) / 5 | 0, (x - y + 64) / 7 | 0, 2) + 0.1 * h2(x, y, 4)), [0, 0.8, 0.8]]),
  'wall.steel_plate': () => plate([125, 135, 150], 3, 0.55, true),
  'wall.pipes': () => plate([105, 112, 125], 6, 0.5, false),
  'wall.wax_rind': () => tileOf((x, y) => [mul([190, 30, 34], 0.85 + 0.2 * h2(x >> 3, y >> 3, 8) - ((x & 31) === 0 ? 0.3 : 0)), [0, 0.75, 0]]),
  'wall.parmesan_block': () => brick([235, 222, 170], [170, 150, 100], 12, [0, 0.1, 0.7]),
  'wall.cheese_glass': () => tileOf((x, y) => {
    const dx = x - 32, dy = y - 30;
    if (Math.abs(dx) < 16 && Math.abs(dy) < 22) return [(dx + dy > 4) ? [255, 190, 40] : (dx - dy > 6) ? [90, 140, 255] : [220, 60, 60], [((x & 15) === 0 || (y % 11) === 0) ? 0 : 0.9, 0.5, 0]];
    return [mul([110, 112, 120], 0.8 + 0.3 * h2(x >> 4, y >> 3, 2)), [0, 0, 0]];
  }),
  'door.wood': () => tileOf((x, y) => {
    const band = (y >= 9 && y < 14) || (y >= 49 && y < 54);
    if (band) return [mul([70, 72, 80], 0.9 + 0.25 * ((x & 7) === 3 ? 1 : 0)), [0, 0.45, 0]];
    if ((x - 50) ** 2 + (y - 32) ** 2 < 14 && (x - 50) ** 2 + (y - 32) ** 2 > 5) return [[190, 160, 60], [0, 0.6, 0.4]];
    return [mul([122, 80, 44], 0.8 + 0.25 * h2(x >> 3, 0, 7) + 0.1 * h2(x, y >> 2, 7) - ((x & 7) === 0 ? 0.3 : 0)), [0, 0.1, 0]];
  }),
  'door.steel': () => tileOf((x, y) => {
    const r2 = (x - 32) ** 2 + (y - 22) ** 2;
    if (r2 < 64) return [[20, 40, 60], [0.15, 0.95, 0]];
    if (r2 < 100) return [[190, 195, 205], [0, 0.7, 0.3]];
    if (y > 44 && y < 58) return [((x + (y < 51 ? y : 102 - y)) >> 3) & 1 ? [235, 190, 30] : [30, 30, 34], [0, 0.35, 0]];
    return [mul([130, 140, 155], (x & 31) < 1 || y < 1 ? 0.6 : 0.92 + 0.08 * h2(x >> 2, y >> 4, 4)), [0, 0.55, 0]];
  }),
  'door.jamb': () => tileOf((x, y) => [mul([58, 62, 72], (x & 7) < 2 ? 0.6 : 0.9 + 0.2 * ((x & 7) === 2 ? 1 : 0)), [0, 0.4, 0]]),
  'flat.floor_checker': () => tileOf((x, y) => {
    const dark = ((x >> 5) + (y >> 5)) & 1, edge = (x & 31) === 0 || (y & 31) === 0;
    const k = (edge ? 0.7 : 1) * (0.92 + 0.12 * h2(x >> 1, y >> 1, 11));
    return [mul(dark ? [26, 26, 32] : [232, 222, 198], k), [0, edge ? 0.3 : dark ? 0.7 : 0.6, 0]];
  }),
  'flat.floor_grate': () => tileOf((x, y) => ((x & 7) < 2 || (y & 7) < 2 ? [mul([118, 128, 144], 0.85 + 0.3 * ((x & 7) === 0 || (y & 7) === 0 ? 1 : 0)), [0, 0.6, 0]] : [[9, 9, 12], [0, 0.1, 0]])),
  'flat.floor_gold': () => tileOf((x, y) => {
    const ox = (y >> 4) & 1 ? 8 : 0, dx = ((x + ox) & 15) - 7.5, dy = (y & 15) - 7.5, r = dx * dx + dy * dy;
    return r < 44 ? [mul([250, 200, 50], 0.8 + 0.3 * h2((x + ox) >> 4, y >> 4, 6) - (r > 32 ? 0.25 : 0) + (dx + dy < -5 ? 0.2 : 0)), [0, 0.55, 0.9]] : [[110, 78, 22], [0, 0.3, 0.3]];
  }),
  'flat.ceil_lamp_panel': () => tileOf((x, y) => (Math.abs(x - 31.5) < 11 && Math.abs(y - 31.5) < 11 ? [[255, 240, 200], [1, 0, 0]] : [mul([80, 86, 98], (x & 31) === 0 || (y & 31) === 0 ? 0.6 : 1), [0, 0.3, 0]])),
};
function fallbackTile(name, frame) {
  if (name === 'wall.fondue_fall') return fondue(frame, true);
  if (name === 'flat.floor_fondue') return fondue(frame, false);
  if (name === 'wall.exit_switch') return tileOf((x, y) => ((x - 32) ** 2 + (y - 20) ** 2 < 30 ? [frame ? [40, 255, 60] : [255, 40, 30], [1, 0, 0]] : [mul([120, 130, 145], 0.9 + 0.1 * h2(x >> 3, y >> 3, 1)), [0, 0.5, 0]]));
  if (TILE_GEN[name]) return TILE_GEN[name]();
  const s = hs(name), hue = (n) => 90 + ((s >> n) & 127);
  if (name.startsWith('flat.ceil')) return brick(mul([hue(0), hue(3), hue(6)], 0.45), [20, 20, 26], s & 255);
  if (name.startsWith('flat.')) return name.includes('wood') ? planks([150, 100, 55], s & 255, [0, 0.3, 0]) : brick(mul([hue(0), hue(3), hue(6)], 0.8), [50, 48, 46], s & 255, [0, name.includes('tile') ? 0.3 : 0.05, name.includes('blue') ? 0.3 : 0]);
  if (name.startsWith('door.')) { const b = TILE_GEN['door.wood'](); rect(b, 40, 24, 16, 16, name.includes('gold') ? [250, 200, 50] : [200, 205, 215], [0, 0.6, 0.9]); return b; }
  if (name.includes('wood') || name.includes('book') || name.includes('crate')) return planks([112, 72, 40], s & 255);
  if (name.includes('fort') || name.includes('poster') || name.includes('mouse') || name.includes('cell') || name.includes('map') || name.includes('trophy')) return brick([128, 130, 138], [60, 60, 66], s & 255);
  return brick([hue(0) + 60, hue(4), 40], [90, 50, 20], s & 255);
}

function creature(body, coat, seed, frame) {
  const b = mk(), bob = frame & 1;
  ell(b, 46, 52, 14, 2, [225, 150, 150]);                                    // tail
  rect(b, 24, 56, 6, 8, [40, 36, 40]); rect(b, 35, 56, 6, 8, [40, 36, 40]);  // boots
  ell(b, 32, 43 - bob, 12, 14, coat, [0, 0.1, 0]);                           // tunic
  rect(b, 21, 44 - bob, 22, 3, [60, 44, 30], [0, 0.3, 0]);                   // belt
  rect(b, 42, 38 - bob, 4, 5, [194, 31, 36]);                                // armband
  ell(b, 22, 14 - bob, 6, 6, body); ell(b, 42, 14 - bob, 6, 6, body);        // ears
  ell(b, 22, 14 - bob, 3, 3, [230, 160, 160]); ell(b, 42, 14 - bob, 3, 3, [230, 160, 160]);
  ell(b, 32, 22 - bob, 10, 9, body);                                         // head
  ell(b, 32, 14 - bob, 11, 5, [100, 108, 100], [0, 0.5, 0.1]);               // helmet
  rect(b, 27, 21 - bob, 3, 3, [250, 250, 240]); rect(b, 34, 21 - bob, 3, 3, [250, 250, 240]);
  put(b, 28, 22 - bob, [200, 20, 20], [0.8, 0, 0]); put(b, 35, 22 - bob, [200, 20, 20], [0.8, 0, 0]);
  ell(b, 32, 27 - bob, 2, 1.5, [240, 150, 160]);
  rect(b, 44, 44 - bob, 12, 3, [50, 52, 60], [seed & 1 && frame === 1 ? 1 : 0, 0.6, 0]);   // gun
  return outline(b);
}
function prop(kind, col, seed, frame) {
  const b = mk();
  if (kind === 'pillar') { rect(b, 22, 0, 20, 64, [150, 150, 158], [0, 0.05, 0]); for (let y = 0; y < 64; y++) { put(b, 22, y, [95, 95, 105]); put(b, 41, y, [200, 200, 205]); if ((y & 15) === 0) rect(b, 22, y, 20, 1, [100, 100, 110]); } rect(b, 18, 0, 28, 6, [190, 170, 90], [0, 0.3, 0.3]); rect(b, 18, 58, 28, 6, [120, 120, 130]); return outline(b); }
  if (kind === 'hang') { rect(b, 31, 0, 2, 18, [70, 70, 78], [0, 0.4, 0]); ell(b, 32, 22, 20, 5, [60, 60, 70], [0, 0.5, 0]); for (const x of [14, 24, 32, 40, 50]) { rect(b, x - 1, 12, 3, 8, [240, 230, 200]); ell(b, x, 9 - (frame & 1), 2, 3, col, [1, 0, 0], false); } return outline(b); }
  if (kind === 'lamp') { rect(b, 30, 22, 4, 38, [150, 120, 50], [0, 0.6, 0.3]); rect(b, 22, 58, 20, 6, [120, 95, 40], [0, 0.5, 0]); ell(b, 32, 14 + (frame & 1), 12, 11, col, [1, 0, 0], false); ell(b, 32, 14, 6, 6, [255, 250, 220], [1, 0, 0], false); return outline(b); }
  if (kind === 'gem') { for (let y = 0; y < 22; y++) for (let x = -y; x <= y; x++) put(b, 32 + x * 0.8, 40 + y, mul(col, 0.75 + 0.5 * h2(x >> 2, y >> 2, seed)), [0, 0.6, 1]); rect(b, 18, 60, 28, 4, [230, 230, 235], [0, 0.5, 0.2]); return outline(b); }
  if (kind === 'plant') { rect(b, 24, 48, 16, 16, [170, 90, 50]); for (let i = 0; i < 26; i++) ell(b, 32 + (h2(i, 1, seed) - 0.5) * 34, 36 - h2(i, 2, seed) * 26, 5, 3, [50, 140 + 60 * h2(i, 3, seed), 60]); return outline(b); }
  if (kind === 'glow') { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const r = Math.hypot(x - 31.5, y - 31.5) / (18 + 6 * (frame & 1)); if (r < 1.4) put(b, x, y, r < 0.5 ? [255, 250, 220] : col, [1, 0, 0], r < 0.8 ? 255 : cl(255 * (1.4 - r) / 0.6 * 0.8)); } return b; }
  // barrel / box
  ell(b, 32, 44, 15, 20, col, [0, 0.1, 0]); rect(b, 17, 32, 30, 3, [70, 72, 80], [0, 0.5, 0]); rect(b, 17, 52, 30, 3, [70, 72, 80], [0, 0.5, 0]);
  return outline(b);
}
function fallbackSprite(name, frame) {
  const s = hs(name), [grp, id = ''] = name.split('.');
  const bodies = { mouse: [[150, 150, 160], [107, 116, 104]], trooper: [[130, 95, 70], [90, 100, 90]], officer: [[235, 235, 235], [40, 40, 48]], sewer: [[70, 60, 60], [70, 60, 60]], panzer: [[120, 100, 90], [140, 150, 165]], boss: [[200, 190, 180], [240, 240, 235]] };
  if (bodies[grp]) return creature(bodies[grp][0], bodies[grp][1], s, frame);
  if (grp === 'fx') return prop('glow', id === 'laser_dot' ? [255, 40, 40] : id === 'yarnball' ? [255, 120, 220] : [255, 170, 40], s, frame);
  if (grp === 'item') return prop('gem', /catnip/.test(id) ? [80, 230, 90] : /silver|brie|tuna|battery/.test(id) ? [200, 210, 225] : [250, 195, 50], s, frame);
  if (/chandelier|alarm|hanging|cage/.test(id)) return prop('hang', id === 'alarm_light' ? [255, 50, 40] : [255, 200, 90], s, frame);
  if (/lamp|candelabra|cauldron|glow/.test(id)) return prop('lamp', id === 'glow_cheese' ? [110, 255, 90] : [255, 190, 70], s, frame);
  if (id === 'pillar') return prop('pillar', null, s, frame);
  if (id === 'plant') return prop('plant', null, s, frame);
  return prop('box', [130 + (s & 63), 90 + ((s >> 6) & 31), 50], s, frame);
}

/** Registry atlas when available (missing names patched with procedural art), else a fully procedural atlas. */
async function buildDemoAtlas() {
  let atlas = null, source = 'procedural';
  if (!P.get('fallback')) {
    try { const m = await import('../art/registry.js'); atlas = await m.buildAtlas(); source = 'registry'; } catch (e) { D.registryError = String(e?.message ?? e); }
  }
  const man = artManifest(), L = S * S * 4;
  if (!atlas || !atlas.tiles || !atlas.sprites) {
    const tl = man.filter((a) => a.kind === 'tile'), sp = man.filter((a) => a.kind === 'sprite');
    const count = (l) => 1 + l.reduce((n, a) => n + a.frames, 0);
    const tiles = { count: count(tl), index: new Map(), anim: null }, sprites = { count: count(sp), index: new Map(), frames: new Map() };
    tiles.rgba = new Uint8Array(tiles.count * L); tiles.mat = new Uint8Array(tiles.count * L); tiles.anim = new Uint8Array(tiles.count).fill(1);
    sprites.rgba = new Uint8Array(sprites.count * L); sprites.mat = new Uint8Array(sprites.count * L);
    let l = 1;
    for (const a of tl) { tiles.index.set(a.name, l); tiles.anim[l] = a.frames; l += a.frames; }
    l = 1;
    for (const a of sp) { sprites.index.set(a.name, l); sprites.frames.set(a.name, a.frames); l += a.frames; }
    atlas = { tiles, sprites, images: new Map(), missing: man.filter((a) => a.kind !== 'image').map((a) => a.name),
      tile: (n) => tiles.index.get(n) ?? 0, sprite: (n, f = 0) => (sprites.index.has(n) ? sprites.index.get(n) + Math.min(sprites.frames.get(n) - 1, Math.max(0, f | 0)) : 0) };
    source = 'procedural';
  }
  const missing = new Set(atlas.missing || []);
  let patched = 0;
  for (const a of man) {
    if (!missing.has(a.name) || a.kind === 'image') continue;
    const part = a.kind === 'tile' ? atlas.tiles : atlas.sprites, first = part.index.get(a.name);
    if (first === undefined) continue;
    for (let fr = 0; fr < a.frames; fr++) {
      const b = a.kind === 'tile' ? fallbackTile(a.name, fr) : fallbackSprite(a.name, fr);
      part.rgba.set(b.rgba, (first + fr) * L); part.mat.set(b.mat, (first + fr) * L); patched++;
    }
  }
  D.atlasInfo = { source, missing: missing.size, patchedLayers: patched, tiles: atlas.tiles.count, sprites: atlas.sprites.count };
  return atlas;
}

// ───────────────────────────── synthetic world ─────────────────────────────
// Own legend (this is not the level format): letters = defs wall letters, '.' open, '+' wood door, '=' steel door.
const MAP = [
  'HHOHHOHHHFFFGFFRFFF',
  'H........F........F',
  'I........+........G',
  'H........F........F',
  'O........F........R',
  'H........=........F',
  'L........F........M',
  'HHHH+HHHHFFFF=FFFFF',
  'J........JN.......N',
  'K.................D',
  'J........JN.......N',
  'S........JN.......N',
  'J........JD.......N',
  'JJSJJKJSJJNNNDNNNDN',
];
const WALL_NAMES = { A: 'wall.cheddar_brick', B: 'wall.swiss_block', C: 'wall.blue_stone', D: 'wall.parmesan_block', E: 'wall.wax_rind', N: 'wall.gold_foil', S: 'wall.fondue_fall', Q: 'wall.cheese_glass', F: 'wall.fort_stone', G: 'wall.fort_banner', H: 'wall.wood_panel', I: 'wall.wood_portrait', J: 'wall.steel_plate', K: 'wall.pipes', L: 'wall.bookshelf', M: 'wall.mouse_hole', R: 'wall.poster', O: 'wall.mirror' };

function buildWorld(atlas) {
  const h = MAP.length, w = MAP[0].length, n = w * h;
  const world = { w, h, cells: new Uint8Array(n), wallTex: new Uint16Array(n), floorTex: new Uint16Array(n), ceilTex: new Uint16Array(n),
    doors: [], doorAt: new Int16Array(n).fill(-1), movers: [], jambTex: atlas.tile('door.jamb') };
  const T = (name) => atlas.tile(name);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, ch = MAP[y][x];
    const hall = x < 9 && y < 7, yard = x > 9 && y < 7, works = x < 9 && y > 7, vault = x > 9 && y > 7;
    world.floorTex[i] = T(hall ? 'flat.floor_checker' : yard ? 'flat.floor_stone' : works ? 'flat.floor_grate' : vault ? 'flat.floor_gold' : 'flat.floor_stone');
    world.ceilTex[i] = hall ? T((x === 3 || x === 6) && (y === 2 || y === 5) ? 'flat.ceil_lamp_panel' : 'flat.ceil_wood') : yard ? SKY : works ? T('flat.ceil_panel') : vault ? T('flat.ceil_cheese') : T('flat.ceil_stone');
    if (works && x >= 3 && x <= 6 && y >= 10 && y <= 11) world.floorTex[i] = T('flat.floor_fondue');
    if (ch === '.') continue;
    if (ch === '+' || ch === '=') {
      world.cells[i] = 2; world.wallTex[i] = T(ch === '+' ? 'door.wood' : 'door.steel');
      world.doorAt[i] = world.doors.length;
      world.doors.push({ cx: x, cy: y, vertical: MAP[y - 1][x] !== '.' && MAP[y + 1][x] !== '.', open: 0.5, lock: null, state: 'open', tex: world.wallTex[i], timer: 0 });
    } else { world.cells[i] = 1; world.wallTex[i] = T(WALL_NAMES[ch] ?? 'wall.fort_stone'); }
  }
  world.pushTex = T('wall.parmesan_block');
  return world;
}

const VIEWS = [
  { x: 7.6, y: 5.9, a: -2.55, name: 'hall: marble, mirrors, chandelier' },
  { x: 2.6, y: 2.0, a: 0.42, name: 'hall towards the doors' },
  { x: 16.6, y: 5.8, a: -2.62, name: 'moonlit courtyard' },
  { x: 7.8, y: 8.6, a: 2.45, name: 'fondue works' },
  { x: 16.9, y: 11.6, a: -2.5, name: 'treasure vault' },
  { x: 6.2, y: 9.5, a: 0.0, name: 'pushwall in motion' },
  { x: 7.3, y: 2.9, a: -0.25, name: 'door close-up' },
  { x: 3.6, y: 3.4, a: 3.14, name: 'mirror close-up' },
];

function makeScene(atlas, world, scene, t, cam) {
  const spr = (name, x, y, o = {}) => scene.sprites.push({ x, y, h: o.h ?? 0, size: o.size ?? 1, frame: atlas.sprite(name, o.f ?? 0), flipX: !!o.flip, glow: o.glow ?? 0, alpha: o.alpha ?? 1 });
  const light = (x, y, h, r, g, b, radius, fl = 0) => { const k = 1 - fl * (0.5 + 0.5 * Math.sin(t * 17 + x * 7) * Math.sin(t * 5.3 + y)); scene.lights.push({ x, y, h, r: r * k, g: g * k, b: b * k, radius }); };
  scene.time = t; scene.world = world; scene.cam = cam;
  scene.sprites.length = 0; scene.lights.length = 0; scene.beams.length = 0;
  scene.ambient = [0.05, 0.045, 0.06];
  scene.fog = { color: [0.02, 0.02, 0.035], density: 0.03 };
  scene.sky = { moonDir: [-0.5, 0.75, -0.35], moonColor: [0.55, 0.68, 1.0] };

  // doors breathe, the pushwall shuttles through the gap between the works and the vault
  world.doors.forEach((d, i) => { d.open = 0.5 + 0.45 * Math.sin(t * 0.6 + i * 1.7); });
  const mx = 9 + (0.5 + 0.5 * Math.sin(t * 0.5)) * 1.6;
  world.movers.length = 0;
  world.movers.push({ x0: mx, y0: 9, x1: mx + 1, y1: 10, tex: world.pushTex });

  // hall
  spr('decor.chandelier', 4.5, 3.5); light(4.5, 3.5, 0.8, 2.2, 1.8, 1.2, 5.5, 0.06);
  spr('decor.pillar', 2.5, 1.5); spr('decor.pillar', 6.5, 1.5); spr('decor.pillar', 2.5, 5.5); spr('decor.pillar', 6.5, 5.5);
  spr('trooper.idle', 3.3, 4.4); spr('officer.idle', 5.6, 2.6, { flip: true });
  spr('mouse.walk', 2.4 + 0.8 * Math.sin(t * 0.7), 3.2, { size: 0.9, f: Math.floor(t * 6) % 4 });
  spr('decor.rat_armor', 1.5, 6.4); spr('decor.table_cheese', 7.5, 1.6);
  spr('decor.candelabra', 7.5, 6.4, { f: Math.floor(t * 8) % 2 }); light(7.5, 6.4, 0.7, 2.2, 1.3, 0.5, 4.5, 0.3);
  spr('item.brie_wheel', 5.2, 5.2, { size: 0.5 }); spr('item.cheddar_wedge', 4.1, 5.6, { size: 0.5 });
  light(1.6, 1.6, 0.5, 0.3, 0.5, 1.9, 4.0);                               // cold blue accent
  // courtyard
  spr('decor.plant', 11.5, 1.5); spr('decor.barrel', 16.5, 1.6); spr('decor.barrel', 15.7, 1.4);
  spr('sewer.idle', 13.6, 3.4, { size: 0.7 }); spr('decor.flag_stand', 16.5, 5.5); spr('decor.crate', 11.6, 5.5);
  spr('item.extra_life', 14.5, 5.0, { size: 0.55 }); light(14.5, 5.0, 0.35, 1.6, 1.3, 0.4, 2.5);
  spr('decor.floor_lamp', 12.5, 6.4); light(12.5, 6.4, 0.75, 2.0, 1.7, 1.0, 4.0, 0.03);
  // fondue works
  spr('decor.cauldron', 1.6, 8.6, { f: Math.floor(t * 5) % 2 }); light(1.6, 8.6, 0.5, 2.6, 1.5, 0.3, 5.0, 0.15);
  spr('decor.alarm_light', 5.5, 8.6, { f: Math.floor(t * 4) % 2 }); light(5.5, 8.6, 0.85, 2.8 * (0.55 + 0.45 * Math.sin(t * 6)), 0.25, 0.2, 5.0);
  spr('panzer.idle', 2.3, 12.2); spr('decor.glow_cheese', 7.5, 12.4, { size: 0.6, f: Math.floor(t * 3) % 2 }); light(7.5, 12.4, 0.2, 0.5, 2.2, 0.4, 3.5, 0.2);
  light(4.5, 10.5, 0.25, 2.4, 1.2, 0.25, 4.5, 0.1);                       // the fondue pool itself
  light(2.5, 13.2, 0.5, 2.0, 1.0, 0.2, 3.0, 0.1);                         // fondue fall
  spr('decor.cheese_cart', 8.3, 12.3);
  // vault
  spr('item.cheese_crown', 14.5, 10.5, { size: 0.6, h: 0.05 + 0.04 * Math.sin(t * 2) }); light(14.5, 10.5, 0.45, 1.6, 1.3, 0.4, 3.5);
  spr('item.key_gold', 12.4, 8.6, { size: 0.5 }); light(12.4, 8.6, 0.3, 1.2, 1.0, 0.3, 2.0);
  spr('item.key_silver', 16.5, 12.3, { size: 0.5 }); light(16.5, 12.3, 0.3, 0.8, 0.9, 1.2, 2.5);
  spr('decor.cheese_stack', 11.6, 12.3); spr('item.cheddar_wedge', 13.2, 11.6, { size: 0.5 }); spr('item.brie_wheel', 15.8, 9.0, { size: 0.5 });
  spr('boss.idle', 16.3, 10.4, { size: 1.6, f: Math.floor(t * 2) % 2 });
  light(12.5, 11.5, 0.9, 0.9, 1.1, 2.0, 5.0);
  // a molten cheese ball lobbed across the hall, with its own light
  const bx = 1.5 + ((t * 1.6) % 6.5), by = 4.6 + 0.4 * Math.sin(t * 1.3), bh = 0.3 + 0.25 * Math.abs(Math.sin(t * 2.2));
  spr('fx.cheeseball', bx, by, { size: 0.4, h: bh, glow: 1, f: Math.floor(t * 10) % 2 }); light(bx, by, bh + 0.2, 2.2, 1.3, 0.3, 3.5);
  spr('fx.sparkle', 5.2, 5.2, { size: 0.35, h: 0.35, glow: 1, f: Math.floor(t * 8) % 4 });
  // laser pointer beam through the courtyard door, with its dot
  const lx = 15.4 + 1.2 * Math.sin(t * 0.9);
  scene.beams.push({ x0: 10.6, y0: 5.5, h0: 0.36, x1: lx, y1: 0.98 + 0.05, h1: 0.5, r: 3.0, g: 0.15, b: 0.12, width: 0.012 });
  light(lx, 1.15, 0.5, 1.6, 0.15, 0.1, 1.6);
  spr('fx.laser_dot', lx, 1.06, { size: 0.3, h: 0.35, glow: 1, f: Math.floor(t * 12) % 2 });
  scene.viewLight = [0.5, 0.45, 0.4];
  return scene;
}

function flyCam(t) {
  // loop through hall → courtyard → vault → works
  const pts = [[4.5, 5.6], [7.4, 4.2], [8.4, 2.5], [11.5, 2.5], [14.5, 3.5], [13.5, 6.2], [13.5, 8.6], [15.5, 10.5], [11.5, 9.5], [7.5, 9.5], [3.0, 9.0], [4.5, 8.4], [4.5, 6.4]];
  const n = pts.length, u = (t * 0.22) % n, i = Math.floor(u), f = u - i;
  const p = (k) => pts[((i + k) % n + n) % n];
  const cr = (a, b, c, d) => 0.5 * (2 * b + (c - a) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (3 * b - a - 3 * c + d) * f * f * f);
  const dcr = (a, b, c, d) => 0.5 * ((c - a) + 2 * (2 * a - 5 * b + 4 * c - d) * f + 3 * (3 * b - a - 3 * c + d) * f * f);
  const x = cr(p(-1)[0], p(0)[0], p(1)[0], p(2)[0]), y = cr(p(-1)[1], p(0)[1], p(1)[1], p(2)[1]);
  return { x, y, a: Math.atan2(dcr(p(-1)[1], p(0)[1], p(1)[1], p(2)[1]), dcr(p(-1)[0], p(0)[0], p(1)[0], p(2)[0])) };
}

// ───────────────────────────── boot ─────────────────────────────
async function main() {
  const canvas = document.getElementById('gl'), hud = document.getElementById('info');
  const fit = () => { const w = innerWidth, h = innerHeight, s = Math.min(w / 16, h / 9); canvas.style.width = Math.floor(s * 16) + 'px'; canvas.style.height = Math.floor(s * 9) + 'px'; canvas.width = Math.max(320, Math.floor(s * 16)); canvas.height = Math.max(180, Math.floor(s * 9)); };
  fit();
  const atlas = (D.atlas = await buildDemoAtlas());
  const world = (D.world = buildWorld(atlas));
  let quality = QUALITY[P.get('q')] ? P.get('q') : 'medium';
  const renderer = (D.renderer = createRenderer(canvas, atlas, { quality, postfx: P.get('nopost') ? false : undefined }));
  for (const [k, v] of P) if (k.startsWith('opt.')) renderer.setOption(k.slice(4), v === 'true' ? true : v === 'false' ? false : +v);
  if (P.get('debug')) renderer.setOption('debug', +P.get('debug'));
  addEventListener('resize', () => { fit(); renderer.resize(); });

  const scene = (D.scene = { sprites: [], lights: [], beams: [] });
  const cam = { x: 4.5, y: 5.5, h: VIEW.EYE, angle: 0, fov: VIEW.FOV, roll: 0 };
  let view = P.has('view') ? +P.get('view') : -1, paused = false, tFixed = P.has('t') ? +P.get('t') : null, t = tFixed ?? 0, manual = false;
  const setView = (v) => { view = v; manual = false; if (VIEWS[v]) { cam.x = VIEWS[v].x; cam.y = VIEWS[v].y; cam.angle = VIEWS[v].a; } };
  if (P.has('cam')) { const [x, y, a] = P.get('cam').split(',').map(Number); cam.x = x; cam.y = y; cam.angle = (a || 0) * Math.PI / 180; manual = true; view = -2; }
  else if (view >= 0) setView(view);
  if (P.has('fov')) cam.fov = +P.get('fov');
  if (P.has('roll')) cam.roll = +P.get('roll');

  const keys = new Set();
  addEventListener('keydown', (e) => {
    keys.add(e.key.toLowerCase());
    const k = e.key.toLowerCase(), order = Object.keys(QUALITY);
    if (k === 'q' || k === 'e') { quality = order[(order.indexOf(quality) + (k === 'e' ? 1 : order.length - 1)) % order.length]; renderer.setQuality(quality); }
    else if (k >= '1' && k <= '8') setView(+k - 1);
    else if (k === 'f') { view = -1; manual = false; }
    else if (k === 'p') paused = !paused;
  });
  addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

  D.info = () => ({ ...D.atlasInfo, stats: { ...renderer.stats }, view, quality, errors: D.errors });
  D.frame = (time) => { makeScene(atlas, world, scene, time, cam); renderer.render(scene); };

  if (P.get('bench')) {
    const res = {};
    const views = P.has('view') ? [view] : [0, 2, 3, 4];
    for (const q of Object.keys(QUALITY)) {
      renderer.setQuality(q);
      let sum = 0, worst = 0;
      for (const v of views) { setView(v); makeScene(atlas, world, scene, 3.7, cam); const ms = renderer.measure(scene, 40); sum += ms; worst = Math.max(worst, ms); }
      res[q] = { avgMs: +(sum / views.length).toFixed(3), worstMs: +worst.toFixed(3), res: QUALITY[q].w + 'x' + QUALITY[q].h, compileMs: +renderer.stats.compileMs.toFixed(1) };
    }
    D.bench = { gl: renderer.stats.renderer, post: renderer.stats.post, sprites: renderer.stats.sprites, lights: renderer.stats.lights, results: res };
    renderer.setQuality(quality); setView(view >= 0 ? view : 0);
  }

  if (P.get('sheet')) {
    // contact sheet: several cameras in one image (for look-and-fix passes)
    const list = P.has('cams') ? P.get('cams').split(';').map((c) => { const [x, y, a] = c.split(',').map(Number); return { x, y, a: a * Math.PI / 180 }; })
      : (P.has('views') ? P.get('views').split(',').map(Number) : VIEWS.map((_, i) => i)).map((i) => VIEWS[i]);
    const cols = +(P.get('cols') || Math.ceil(Math.sqrt(list.length))), rows = Math.ceil(list.length / cols);
    const c2 = document.createElement('canvas'); c2.width = innerWidth; c2.height = innerHeight;
    c2.style.cssText = 'position:fixed;left:0;top:0;image-rendering:pixelated';
    document.body.appendChild(c2); hud.style.display = 'none';
    const g = c2.getContext('2d'); g.imageSmoothingEnabled = false;
    const tw = Math.floor(c2.width / cols), th = Math.floor(tw * 9 / 16);
    canvas.width = tw; canvas.height = th; renderer.resize();
    list.forEach((v, i) => {
      cam.x = v.x; cam.y = v.y; cam.angle = v.a;
      D.frame(t); D.frame(t);
      g.drawImage(canvas, (i % cols) * tw, Math.floor(i / cols) * th, tw, th);
    });
    D.ready = true; D.frames = 99;
    return;
  }

  let last = performance.now(), fps = 0, acc = 0, frames = 0;
  function frame(nowMs) {
    const dt = Math.min(0.1, (nowMs - last) / 1000); last = nowMs;
    if (tFixed === null && !paused) t += dt;
    const mv = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
    const tr = (keys.has('arrowright') ? 1 : 0) - (keys.has('arrowleft') ? 1 : 0), st = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
    if (mv || tr || st) { manual = true; cam.angle += tr * dt * 2; cam.x += (Math.cos(cam.angle) * mv - Math.sin(cam.angle) * st) * dt * 2.5; cam.y += (Math.sin(cam.angle) * mv + Math.cos(cam.angle) * st) * dt * 2.5; }
    if (view === -1 && !manual) { const c = flyCam(t); cam.x = c.x; cam.y = c.y; cam.angle = c.a; cam.h = VIEW.EYE + 0.015 * Math.sin(t * 5); }
    try { D.frame(t); } catch (e) { if (!D.errors.includes(String(e.message))) D.errors.push(String(e.message)); }
    acc += dt; frames++;
    if (acc > 0.5) { fps = frames / acc; acc = 0; frames = 0; }
    const s = renderer.stats;
    hud.textContent = D.errors.length ? D.errors.join('\n') : `${quality} ${s.width}x${s.height}  ${fps.toFixed(0)} fps  gpu ${s.gpuMs == null ? 'n/a' : s.gpuMs.toFixed(2) + ' ms'}  cpu ${s.cpuMs.toFixed(2)} ms (pack ${s.packMs.toFixed(2)})  ${s.sprites} sprites ${s.lights} lights  ${s.post}  [${VIEWS[view]?.name ?? (manual ? 'manual' : 'fly-through')}]` + (D.bench ? '\n' + JSON.stringify(D.bench.results) : '');
    if (P.get('hud') === '0') hud.style.display = 'none';
    D.ready = true; D.frames = (D.frames | 0) + 1;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((e) => { D.errors.push(String(e?.stack ?? e)); const el = document.getElementById('info'); if (el) el.textContent = String(e?.stack ?? e); D.failed = true; });
