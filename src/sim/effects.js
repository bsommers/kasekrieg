// KÄSEKRIEG effects: short-lived fx sprites (sparks, puffs, explosions, stun stars…) and beams.
// Contract: ARCHITECTURE.md §8.5. Pure sim code: no DOM, no Math.random, runs in Node.
//
// Effect entity (in game.effects):
//   { name, x, y, h /*centre height*/, vx, vy, vh, t, life, frames, loop, spr, light, follow, dead }
//   spr  = { frame /*sprite layer*/, size, h /*bottom height = centre - size/2*/, flipX, glow, alpha }
//   light = { x, y, h, r, g, b, radius } | null — already faded; buildScene can copy it straight into scene.lights.
// Beam (in game.beams): { x0,y0,h0, x1,y1,h1, r,g,b, width, life, t }
//
// Also hosts tiny helpers shared by enemies.js / projectiles.js (this file imports nothing from them).

import { FX, SKILLS, LIMITS } from '../core/defs.js';
import { createRng } from '../core/rng.js';

export const MAX_EFFECTS = 192;
const FX_FPS = 12;

// default size (world units) and extra properties per fx
const FX_DEFAULTS = {
  yarnball: { size: 0.3 }, cheeseball: { size: 0.4 }, explosion: { size: 1.6 }, puff: { size: 0.45, vh: 0.25 },
  spark: { size: 0.25 }, crumbs: { size: 0.5 }, fur: { size: 0.45 }, sparkle: { size: 0.4 },
  laser_dot: { size: 0.18 }, stun: { size: 0.38 }, splash: { size: 0.9 }, muzzle: { size: 0.4 },
};

// ───────────── shared helpers ─────────────
const fallbackRng = new WeakMap();
/** game.rng, or a seeded per-game fallback (never Math.random). */
export function rngOf(game) {
  if (game && game.rng && typeof game.rng.next === 'function') return game.rng;
  const key = game && typeof game === 'object' ? game : rngOf;
  let r = fallbackRng.get(key);
  if (!r) { r = createRng(1); fallbackRng.set(key, r); }
  return r;
}
/** Skill row from defs.SKILLS; accepts a number or a skill object; defaults to Alley Cat (2). */
export function skillOf(game) {
  const s = game && game.skill;
  if (s && typeof s === 'object') return { ...SKILLS[2], ...s };
  if (Number.isFinite(s)) return SKILLS[Math.max(0, Math.min(SKILLS.length - 1, s | 0))];
  return SKILLS[2];
}
/** Emit on the bus; listener errors never break the sim. */
export function emit(game, type, payload) {
  try { game && game.bus && game.bus.emit && game.bus.emit(type, payload); } catch { /* ignore */ }
}
const spriteCache = new WeakMap();
/** Sprite layer for `name` frame `frame` (wraps by the atlas frame count). 0 (placeholder) when unknown. */
export function spriteLayer(game, name, frame = 0) {
  const atlas = game && game.atlas;
  if (!atlas || typeof atlas.sprite !== 'function') return 0;
  let c = spriteCache.get(atlas);
  if (!c) { c = new Map(); spriteCache.set(atlas, c); }
  let ent = c.get(name);
  if (!ent) {
    let count = 1;
    try { const n = atlas.sprites && atlas.sprites.frames && atlas.sprites.frames.get(name); if (n > 0) count = n; } catch { /* ignore */ }
    let first = 0;
    try { first = atlas.sprite(name, 0) | 0; } catch { first = 0; }
    ent = { count, first, known: !!(atlas.sprites && atlas.sprites.index && atlas.sprites.index.has && atlas.sprites.index.has(name)) };
    c.set(name, ent);
  }
  const f = ((frame | 0) % ent.count + ent.count) % ent.count;
  if (ent.known) return ent.first + f;
  try { return atlas.sprite(name, f) | 0; } catch { return 0; }
}
function toLight(l) {
  if (!l) return null;
  if (Array.isArray(l)) return { r: +l[0] || 0, g: +l[1] || 0, b: +l[2] || 0, radius: +l[3] || 2 };
  if (typeof l === 'object') return { r: +l.r || 0, g: +l.g || 0, b: +l.b || 0, radius: +l.radius || 2 };
  return null;
}

// ───────────── fx ─────────────
/**
 * spawnFx(game, name, x, y, h, opts) → effect
 * h is the CENTRE height of the fx (art is centred in its frame).
 * opts: size, life (default: one pass of the animation at 12 fps; a longer life loops it), vx, vy, vh,
 *       light ([r,g,b,radius] or {r,g,b,radius}; fades out over the life), follow (entity: the fx tracks its x/y),
 *       followH (height above the followed entity's feet), until (fn(effect) → true ends it early), glow, flipX.
 */
export function spawnFx(game, name, x, y, h = 0.5, opts = {}) {
  if (!game) return null;
  if (!Array.isArray(game.effects)) game.effects = [];
  const def = FX[name] || FX.puff;
  const id = FX[name] ? name : 'puff';
  const d = FX_DEFAULTS[id] || {};
  const o = opts || {};
  const frames = def.frames || 1;
  const pass = frames / FX_FPS;
  const life = Number.isFinite(o.life) && o.life > 0 ? o.life : pass;
  const size = Number.isFinite(o.size) && o.size > 0 ? o.size : d.size || 0.4;
  const rng = rngOf(game);
  const fx = {
    name: id, x: +x || 0, y: +y || 0, h: Number.isFinite(h) ? h : 0.5,
    vx: +o.vx || 0, vy: +o.vy || 0, vh: Number.isFinite(o.vh) ? o.vh : d.vh || 0,
    t: 0, life, frames, loop: life > pass * 1.05, size,
    spr: { frame: spriteLayer(game, `fx.${id}`, 0), size, h: 0, flipX: o.flipX ?? rng.chance(0.5), glow: o.glow ?? 1, alpha: 1 },
    light: null, baseLight: toLight(o.light),
    follow: o.follow || null, followH: Number.isFinite(o.followH) ? o.followH : null, until: typeof o.until === 'function' ? o.until : null,
    dead: false,
  };
  syncFx(game, fx);
  game.effects.push(fx);
  if (game.effects.length > MAX_EFFECTS) {
    // drop the oldest non-following effect
    const k = game.effects.findIndex((e) => !e.follow);
    game.effects.splice(k >= 0 ? k : 0, 1);
  }
  return fx;
}

function syncFx(game, fx) {
  if (fx.follow) {
    fx.x = fx.follow.x; fx.y = fx.follow.y;
    if (fx.followH !== null) fx.h = fx.followH;
  }
  const k = fx.loop ? Math.floor(fx.t * FX_FPS) % fx.frames : Math.min(fx.frames - 1, Math.floor((fx.t / fx.life) * fx.frames));
  fx.spr.frame = spriteLayer(game, `fx.${fx.name}`, k);
  fx.spr.size = fx.size;
  fx.spr.h = Math.max(0, fx.h - fx.size / 2);
  if (fx.baseLight) {
    const fade = fx.loop ? 1 : Math.max(0, 1 - fx.t / fx.life);
    const L = fx.baseLight;
    fx.light = { x: fx.x, y: fx.y, h: fx.h, r: L.r * fade, g: L.g * fade, b: L.b * fade, radius: L.radius };
  }
}

export function updateEffects(game, dt) {
  if (!game || !(dt > 0)) return;
  const list = Array.isArray(game.effects) ? game.effects : (game.effects = []);
  let j = 0;
  for (let i = 0; i < list.length; i++) {
    const fx = list[i];
    if (!fx) continue;
    fx.t += dt;
    if (!fx.follow) {
      fx.x += fx.vx * dt; fx.y += fx.vy * dt; fx.h += fx.vh * dt;
      if (fx.name === 'crumbs' || fx.name === 'splash') fx.vh -= 3 * dt;
      fx.vx *= 1 - Math.min(1, 2 * dt); fx.vy *= 1 - Math.min(1, 2 * dt);
      if (fx.h < fx.size * 0.3) { fx.h = fx.size * 0.3; fx.vh = 0; }
    }
    let end = fx.dead || fx.t >= fx.life;
    if (!end && fx.until) { try { end = !!fx.until(fx); } catch { end = true; } }
    if (!end && fx.follow && (fx.follow.state === 'dead' || fx.follow.dead)) end = true;
    if (end) { fx.dead = true; continue; }
    syncFx(game, fx);
    list[j++] = fx;
  }
  list.length = j;
  // beams
  const beams = Array.isArray(game.beams) ? game.beams : (game.beams = []);
  let b = 0;
  for (let i = 0; i < beams.length; i++) {
    const bm = beams[i];
    if (!bm) continue;
    bm.t = (bm.t || 0) + dt;
    if (bm.t >= bm.life) continue;
    beams[b++] = bm;
  }
  beams.length = b;
}

/** addBeam(game, {x0,y0,h0,x1,y1,h1,r,g,b,width,life}) — keeps at most LIMITS.BEAMS (oldest dropped). */
export function addBeam(game, o = {}) {
  if (!game) return null;
  if (!Array.isArray(game.beams)) game.beams = [];
  const n = (v, d) => (Number.isFinite(v) ? v : d);
  const bm = {
    x0: n(o.x0, 0), y0: n(o.y0, 0), h0: n(o.h0, 0.45), x1: n(o.x1, 0), y1: n(o.y1, 0), h1: n(o.h1, 0.45),
    r: n(o.r, 2.5), g: n(o.g, 0.15), b: n(o.b, 0.12), width: n(o.width, 0.012),
    life: o.life > 0 ? o.life : 1 / 30, t: 0,
  };
  game.beams.push(bm);
  while (game.beams.length > LIMITS.BEAMS) game.beams.shift();
  return bm;
}
