// KÄSEKRIEG items: pickups (health, ammo, weapons, keys, treasure, lives), decor helpers and floor traps.
// Contract: ARCHITECTURE.md §8.3–8.4. Pure sim code: no DOM, randomness from game.rng only.

import { ITEMS, DECOR, AMMO_MAX, WEAPONS } from '../core/defs.js';
import { switchWeapon, clampAmmo } from './weapons.js';

export const PICKUP_RADIUS = 0.55;     // player centre ↔ item centre distance that collects it
export const PICKUP_SIZE = 0.58;       // billboard size of items (world units)
export const TRAP_RADIUS = 0.36;

const emit = (game, type, payload) => { try { game.bus && game.bus.emit(type, payload); } catch { /* ignore */ } };

export function spriteLayer(game, name, frame = 0) {
  try { return game.atlas && typeof game.atlas.sprite === 'function' ? game.atlas.sprite(name, frame) | 0 : 0; } catch { return 0; }
}
export function spriteFrames(game, name, fallback = 1) {
  try { const n = game.atlas?.sprites?.frames?.get?.(name); return n > 0 ? n : fallback; } catch { return fallback; }
}

/** Create a pickup entity and add it to game.pickups. `opts.drop` marks enemy drops (counted into totals). */
export function spawnPickup(game, id, x, y, opts = {}) {
  const def = ITEMS[id];
  if (!def) return null;
  const it = {
    kind: 'pickup', id, def, x, y, h: 0, radius: 0.25, taken: false, drop: !!opts.drop,
    phase: ((x * 7.13 + y * 3.71) % 1 + 1) % 1,
    spr: { frame: spriteLayer(game, `item.${id}`), size: PICKUP_SIZE, h: 0, flipX: false, glow: def.light ? 0.15 : 0, alpha: 1 },
    light: def.light ? { r: def.light[0], g: def.light[1], b: def.light[2], radius: def.light[3], h: 0.22 } : null,
  };
  if (opts.drop && def.treasure && game.stats) game.stats.treasureTotal++;
  (game.pickups ||= []).push(it);
  return it;
}

/** Resolve a `def.drop` string like 'gatling|ammo_clip' (first option the player lacks, else the last). */
export function resolveDrop(game, drop) {
  if (!drop) return null;
  const opts = String(drop).split('|').filter((s) => ITEMS[s]);
  if (!opts.length) return null;
  const p = game.player;
  for (const id of opts.slice(0, -1)) {
    const d = ITEMS[id];
    if (d.weapon !== undefined && p && !p.owned[d.weapon]) return id;
  }
  return opts[opts.length - 1];
}

/** Spawn the drop for an enemy death (enemies.js may call this). */
export function dropItem(game, drop, x, y) {
  const id = resolveDrop(game, drop);
  return id ? spawnPickup(game, id, x, y, { drop: true }) : null;
}

export function healPlayer(game, amount, max = 100) {
  const p = game.player;
  if (!p || p.dead) return false;
  if (p.health >= max) return false;
  p.health = Math.min(max, p.health + amount);
  return true;
}

/** Apply an item to the player. Returns false if it cannot be picked up (e.g. health full). */
export function giveItem(game, itemId) {
  const p = game.player;
  const d = ITEMS[itemId];
  if (!p || p.dead || !d) return false;
  let took = false;
  if (d.heal) {
    if (!healPlayer(game, d.heal, d.max || 100)) return false;
    took = true;
    if (itemId === 'catnip') p.catnipT = 6;
  }
  if (d.life) { p.lives = Math.min(99, p.lives + d.life); took = true; }
  if (d.weapon !== undefined) {
    const isNew = !p.owned[d.weapon];
    const [kind, n] = d.ammo || [];
    const room = kind ? (p.ammo[kind] || 0) < AMMO_MAX[kind] : false;
    if (!isNew && !room) return false;
    p.owned[d.weapon] = true;
    if (kind) p.ammo[kind] = (p.ammo[kind] || 0) + n;
    clampAmmo(p);
    if (isNew) switchWeapon(game, d.weapon, { force: true });
    took = true;
  } else if (d.ammo) {
    const [kind, n] = d.ammo;
    if ((p.ammo[kind] || 0) >= AMMO_MAX[kind]) return false;
    const was = p.ammo[kind] || 0;
    p.ammo[kind] = was + n;
    clampAmmo(p);
    took = true;
    // picking up ammo while holding an empty weapon/claws: auto-raise the gun that uses it (classic comfort)
    if (was === 0 && p.weapon === 0) {
      const wi = WEAPONS.findIndex((w, i) => i > 0 && p.owned[i] && w.ammo === kind && w.kind !== 'projectile');
      if (wi > 0) switchWeapon(game, wi);
    }
  }
  if (d.key) { if (p.keys[d.key]) return false; p.keys[d.key] = true; took = true; }
  if (d.score) {
    p.score += d.score;
    if (d.treasure && game.stats) game.stats.treasure++;
    took = true;
  }
  if (!took) return false;
  emit(game, 'sfx', { name: d.sfx || 'pickup_ammo' });
  emit(game, 'msg', { text: d.msg || itemId, kind: 'pickup' });
  emit(game, 'pickup', { id: itemId });
  const tint = d.heal ? [1, 0.55, 0.4] : d.key || d.treasure || d.life ? [1, 0.85, 0.3] : itemId === 'catnip' ? [0.4, 1, 0.4] : [1, 0.9, 0.6];
  emit(game, 'flash', { r: tint[0], g: tint[1], b: tint[2], a: 0.22 });
  if (d.life) emit(game, 'msg', { text: `${p.lives} lives`, kind: 'info' });
  return true;
}

/** Create a decor entity (does not register blockers — game.js does). */
export function makeDecor(game, id, x, y) {
  const def = DECOR[id];
  if (!def) return null;
  const name = `decor.${id}`;
  return {
    kind: 'decor', id, def, x, y, frames: Math.max(1, def.frames || 1),
    sprung: false, phase: ((x * 12.9898 + y * 78.233) % 1 + 1) % 1,
    baseFrame: spriteLayer(game, name, 0),
    spr: { frame: spriteLayer(game, name, 0), size: 1, h: 0, flipX: false, glow: def.light ? 0.25 : 0, alpha: 1 },
  };
}

/** Per tick: collect pickups, spring traps, animate decor frames. */
export function updateItems(game, dt) {
  const p = game.player;
  const list = game.pickups || [];
  if (p && !p.dead) {
    for (const it of list) {
      if (it.taken) continue;
      if (Math.abs(it.x - p.x) > PICKUP_RADIUS || Math.abs(it.y - p.y) > PICKUP_RADIUS) continue;
      if (Math.hypot(it.x - p.x, it.y - p.y) > PICKUP_RADIUS) continue;
      if (giveItem(game, it.id)) it.taken = true;
    }
  }
  if (list.some((it) => it.taken)) game.pickups = list.filter((it) => !it.taken);
  const t = game.time || 0;
  for (const it of game.pickups) {
    if (it.light) it.spr.glow = 0.12 + 0.1 * Math.sin((t + it.phase * 6) * 3);
  }
  for (const d of game.decor || []) {
    if (d.def.trap) {
      if (!d.sprung && p && !p.dead && Math.abs(d.x - p.x) < TRAP_RADIUS && Math.abs(d.y - p.y) < TRAP_RADIUS) {
        d.sprung = true;
        emit(game, 'sfx', { name: 'trap_snap', x: d.x, y: d.y });
        game.sys?.damagePlayer?.(game, d.def.trap, d.x, d.y);
        emit(game, 'msg', { text: 'SNAP! A mousetrap!', kind: 'warn' });
      }
      d.spr.frame = d.baseFrame + (d.sprung && d.frames > 1 ? 1 : 0);
    } else if (d.frames > 1) {
      const rate = d.id === 'alarm_light' ? 3 : d.id === 'candelabra' ? 7 : 2.5;
      d.spr.frame = d.baseFrame + (Math.floor(t * rate + d.phase * d.frames) % d.frames);
    }
  }
}
