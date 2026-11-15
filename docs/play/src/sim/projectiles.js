// KÄSEKRIEG projectiles: yarn bombs (player) and molten cheeseballs (panzer rats, the boss).
// Contract: ARCHITECTURE.md §8.5. Pure sim code: no DOM, no Math.random, runs in Node.
//
// Projectile (in game.projectiles):
//   { kind, def, x, y, h /*centre height*/, vx, vy, vh, angle, owner /*'player'|enemy*/, radius, life, bounces,
//     spr, light /*{x,y,h,r,g,b,radius}*/, dead }

import { PROJECTILES } from '../core/defs.js';
import { spawnFx, emit, rngOf, spriteLayer } from './effects.js';
import { damageEnemy, hurtPlayer, makeNoise } from './enemies.js';

const GRAVITY = 9;          // yarn balls lob and bounce along the floor
const ANIM_FPS = 10;
export const MAX_PROJECTILES = 64;

const living = (e) => e && e.state !== 'die' && e.state !== 'dead' && e.hp > 0;

/** spawnProjectile(game, kind, x, y, h, angle, owner) → projectile | null */
export function spawnProjectile(game, kind, x, y, h, angle, owner) {
  if (!game) return null;
  const def = PROJECTILES[kind];
  if (!def) return null;
  if (!Array.isArray(game.projectiles)) game.projectiles = [];
  const a = Number.isFinite(angle) ? angle : 0;
  const p = {
    kind, def, x: +x || 0, y: +y || 0, h: Number.isFinite(h) ? h : 0.45,
    vx: Math.cos(a) * def.speed, vy: Math.sin(a) * def.speed, vh: kind === 'yarnball' ? 1.4 : 0,
    angle: a, owner: owner ?? null, radius: def.radius, size: def.size,
    life: def.fuse, bounces: def.bounces, t: 0,
    spr: { frame: spriteLayer(game, `fx.${def.sprite}`, 0), size: def.size, h: 0, flipX: false, glow: 1, alpha: 1 },
    light: null, dead: false,
  };
  sync(game, p);
  game.projectiles.push(p);
  if (game.projectiles.length > MAX_PROJECTILES) game.projectiles.shift();
  // spawned inside a wall (muzzle against a wall): burst immediately
  const w = game.world;
  if (w && solidAt(w, p.x, p.y)) explode(game, p, null);
  return p;
}

function solidAt(w, x, y) {
  const cx = Math.floor(x), cy = Math.floor(y);
  try { return w.blocksSight ? w.blocksSight(cx, cy) : w.isSolid(cx, cy); } catch { return true; }
}

function sync(game, p) {
  const d = p.def;
  p.spr.frame = spriteLayer(game, `fx.${d.sprite}`, Math.floor(p.t * ANIM_FPS));
  p.spr.h = Math.max(0, p.h - p.size / 2);
  p.spr.flipX = p.vx < 0;
  const L = d.light;
  p.light = L ? { x: p.x, y: p.y, h: p.h, r: L[0], g: L[1], b: L[2], radius: L[3] } : null;
}

export function updateProjectiles(game, dt) {
  if (!game || !(dt > 0)) return;
  const list = Array.isArray(game.projectiles) ? game.projectiles : (game.projectiles = []);
  for (const p of list) if (p && !p.dead) stepProjectile(game, p, dt);
  let j = 0;
  for (const p of list) if (p && !p.dead) list[j++] = p;
  list.length = j;
}

function stepProjectile(game, p, dt) {
  const w = game.world;
  p.t += dt; p.life -= dt;
  if (p.life <= 0) { explode(game, p, null); return; }
  // vertical: yarn lobs and bounces off floor/ceiling
  if (p.kind === 'yarnball') {
    p.vh -= GRAVITY * dt; p.h += p.vh * dt;
    const lo = p.size / 2, hi = 1 - p.size / 2;
    if (p.h < lo) { p.h = lo; p.vh = Math.abs(p.vh) > 0.8 ? -p.vh * 0.45 : 0; }
    if (p.h > hi) { p.h = hi; p.vh = -Math.abs(p.vh) * 0.5; }
  }
  const dist = Math.hypot(p.vx, p.vy) * dt;
  const n = Math.max(1, Math.ceil(dist / 0.1));
  for (let k = 0; k < n && !p.dead; k++) {
    const sx = (p.vx * dt) / n, sy = (p.vy * dt) / n;
    const nx = p.x + sx, ny = p.y + sy;
    if (w && solidAt(w, nx, ny)) {
      if (p.bounces > 0) {
        const hitX = solidAt(w, nx, p.y), hitY = solidAt(w, p.x, ny);
        if (hitX || !hitY) p.vx = -p.vx;
        if (hitY || !hitX) p.vy = -p.vy;
        p.vx *= 0.8; p.vy *= 0.8;
        p.bounces--;
        emit(game, 'sfx', { name: 'yarn_bounce', x: p.x, y: p.y, vol: 0.7 });
        break;   // resume next tick with the reflected velocity
      }
      explode(game, p, null);
      return;
    }
    p.x = nx; p.y = ny;
    const victim = touching(game, p);
    if (victim) { explode(game, p, victim); return; }
  }
  if (!p.dead) sync(game, p);
}

function touching(game, p) {
  if (p.owner === 'player') {
    for (const e of game.enemies || []) {
      if (!living(e)) continue;
      const r = p.radius + (e.radius || 0.3);
      if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 <= r * r) return e;
    }
    return null;
  }
  const pl = game.player;
  if (pl && !pl.dead && Number.isFinite(pl.x)) {
    const r = p.radius + (pl.radius || 0.27);
    if ((pl.x - p.x) ** 2 + (pl.y - p.y) ** 2 <= r * r) return pl;
  }
  return null;
}

/** Burst: direct-hit damage on `victim`, splash on everything in def.splash with line of sight. */
export function explode(game, p, victim) {
  if (p.dead) return;
  p.dead = true;
  const d = p.def, rng = rngOf(game), w = game.world;
  // back the burst point out of the wall so the fx is visible and the LOS checks start in open space
  let bx = p.x, by = p.y;
  if (w && solidAt(w, bx, by)) {
    const sp = Math.hypot(p.vx, p.vy) || 1;
    for (let k = 0; k < 6 && solidAt(w, bx, by); k++) { bx -= (p.vx / sp) * 0.06; by -= (p.vy / sp) * 0.06; }
  }
  const roll = () => rng.int(d.dmg[0], d.dmg[1]);
  const fromPlayer = p.owner === 'player';
  const pl = game.player;
  const sees = (x, y) => { try { return !w || w.hasLOS(bx, by, x, y); } catch { return true; } };
  // direct hit
  if (victim) {
    if (victim === pl) hurtPlayer(game, roll(), bx, by);
    else damageEnemy(game, victim, roll(), { fromX: bx, fromY: by, splash: true });
  }
  // splash
  if (d.splash > 0) {
    const falloff = (dist) => Math.max(0, 1 - 0.65 * (dist / d.splash));
    if (fromPlayer) {
      for (const e of game.enemies || []) {
        if (e === victim || !living(e)) continue;
        const dist = Math.max(0, Math.hypot(e.x - bx, e.y - by) - (e.radius || 0.3));
        if (dist >= d.splash || !sees(e.x, e.y)) continue;
        damageEnemy(game, e, Math.round(roll() * falloff(dist)), { fromX: bx, fromY: by, splash: true });
      }
    }
    if (pl && pl !== victim && !pl.dead && Number.isFinite(pl.x)) {
      const dist = Math.max(0, Math.hypot(pl.x - bx, pl.y - by) - (pl.radius || 0.27));
      if (dist < d.splash && sees(pl.x, pl.y)) {
        const amt = Math.round(roll() * falloff(dist) * (fromPlayer ? 0.5 : 1));   // own yarn bombs sting at half strength
        if (amt > 0) hurtPlayer(game, amt, bx, by);
      }
    }
  }
  // show & tell
  const big = p.kind === 'yarnball';
  const L = d.light;
  spawnFx(game, d.boom || 'explosion', bx, by, Math.max(big ? 0.5 : 0.3, p.h), {
    size: big ? 1.7 : 0.9,
    light: L ? [L[0] * 1.6, L[1] * 1.6, L[2] * 1.6, L[3] * (big ? 1.6 : 1.1)] : null,
  });
  if (big) for (let k = 0; k < 3; k++) {
    const a = rng.range(0, Math.PI * 2);
    spawnFx(game, 'crumbs', bx, by, 0.4, { size: 0.45, vx: Math.cos(a) * 1.5, vy: Math.sin(a) * 1.5, vh: 1.2, life: 0.4 });
  }
  emit(game, 'sfx', { name: d.sfx, x: bx, y: by });
  if (pl && Number.isFinite(pl.x)) {
    const pd = Math.hypot(pl.x - bx, pl.y - by);
    if (big && pd < 4) emit(game, 'flash', { r: 1, g: 0.75, b: 0.3, a: 0.35 * (1 - pd / 4) });
  }
  if (fromPlayer) makeNoise(game, bx, by, 10);
}
