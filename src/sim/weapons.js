// KÄSEKRIEG weapons: view-model state machine, firing (melee / hitscan / projectile / beam), switching.
// Contract: ARCHITECTURE.md §8.4. Pure sim code: no DOM, randomness from game.rng only.
//
// Cross-module calls (enemies / projectiles / effects) go through `game.sys` (filled by game.js, with safe
// fallbacks) so this file has no import-order coupling with modules written by other agents.

import { WEAPONS, AMMO_MAX, VIEW } from '../core/defs.js';

export const RAISE_T = 0.16;          // s to bring a weapon up
export const LOWER_T = 0.12;          // s to put it away
export const MUZZLE_T = 0.07;         // s the muzzle-flash light stays on
export const BEAM_FRAME_RATE = 14;    // laser view-model fire-frame rate (Hz)
const MUZZLE_H = VIEW.EYE - 0.08;     // height shots leave the gun

const sys = (game) => game.sys || {};
const emit = (game, type, payload) => { try { game.bus && game.bus.emit(type, payload); } catch { /* listeners must not break the sim */ } };
const rnd = (game) => game.rng || { next: () => 0.5, range: (a, b) => (a + b) / 2, int: (a) => a, chance: () => false };

export function weaponDef(i) { return WEAPONS[i] || WEAPONS[0]; }

/** True if weapon `i` is owned and has enough ammo to fire at least once. */
export function canFire(p, i) {
  const w = WEAPONS[i];
  if (!w || !p.owned[i]) return false;
  if (!w.ammo) return true;
  const have = p.ammo[w.ammo] || 0;
  return w.kind === 'beam' ? have >= 1 : have >= (w.use || 1);
}

/** Best owned weapon with ammo (prefers the most powerful, excludes the yarn bomber for auto-switching). */
export function bestWeapon(p) {
  for (const i of [2, 1, 4, 0]) if (canFire(p, i)) return i;
  return 0;
}

/** Begin switching to slot `i`. Returns false if not owned / already selected. */
export function switchWeapon(game, i, { force = false } = {}) {
  const p = game.player;
  if (!p || p.dead || !WEAPONS[i] || !p.owned[i]) return false;
  const ws = p.wstate;
  if (!force && ((i === p.weapon && ws.phase !== 'lower') || (i === p.pendingWeapon && ws.phase === 'lower'))) return false;
  p.pendingWeapon = i;
  if (ws.phase === 'raise' && p.weapon !== i) {
    // reverse mid-raise: lower from the current visual position
    ws.phase = 'lower'; ws.t = LOWER_T * (1 - Math.min(1, ws.t / RAISE_T));
  } else if (ws.phase !== 'lower') { ws.phase = 'lower'; ws.t = 0; }
  ws.anim = 'idle'; ws.frame = 0;
  p.beamOn = false;
  emit(game, 'sfx', { name: 'weapon_switch' });
  return true;
}

/** Cycle to the next/previous owned weapon (dir = 1 / -1) that can fire. */
export function cycleWeapon(game, dir) {
  const p = game.player;
  const base = p.wstate.phase === 'lower' && p.pendingWeapon >= 0 ? p.pendingWeapon : p.weapon;
  for (let k = 1; k <= WEAPONS.length; k++) {
    const i = ((base + dir * k) % WEAPONS.length + WEAPONS.length) % WEAPONS.length;
    if (canFire(p, i)) return switchWeapon(game, i);
  }
  return false;
}

/** Spend ammo for one shot. */
function spend(p, w) {
  if (!w.ammo) return;
  p.ammo[w.ammo] = Math.max(0, (p.ammo[w.ammo] || 0) - (w.use || 1));
}

function muzzle(game, p, strength = 1) {
  p.flashT = MUZZLE_T;
  p.flashI = strength;
}

/**
 * Fire the current weapon once (melee swing, hitscan shot, projectile launch, or one beam pulse of `dt`).
 * Does NOT check timing (the state machine in updateWeapon does). Returns true if something was fired.
 */
export function fireWeapon(game, dt = 1 / 60) {
  const p = game.player;
  if (!p || p.dead) return false;
  const w = weaponDef(p.weapon);
  if (!canFire(p, p.weapon)) return false;
  const S = sys(game), R = rnd(game);
  const dx = Math.cos(p.angle), dy = Math.sin(p.angle);
  const world = game.world;

  if (w.kind === 'melee') {
    let target = null;
    try { target = S.pickEnemyOnRay ? S.pickEnemyOnRay(game, p.x, p.y, dx, dy, w.range + 0.3) : null; } catch { target = null; }
    // forgiving cone: nearest living enemy within reach and ±35°
    if (!target && S.enemiesInRadius) {
      let best = null;
      for (const e of S.enemiesInRadius(game, p.x, p.y, w.range + 0.35) || []) {
        if (!isAlive(e)) continue;
        const ex = e.x - p.x, ey = e.y - p.y, d = Math.hypot(ex, ey);
        if (d < 1e-6) { best = { enemy: e, dist: 0 }; break; }
        if ((ex * dx + ey * dy) / d < Math.cos(0.6)) continue;
        if (world && !world.hasLOS(p.x, p.y, e.x, e.y)) continue;
        if (!best || d < best.dist) best = { enemy: e, dist: d };
      }
      target = best;
    }
    if (target && target.enemy && target.dist <= w.range + (target.enemy.radius || 0.3)) {
      const dmg = R.int(w.dmg[0], w.dmg[1]);
      S.damageEnemy && S.damageEnemy(game, target.enemy, dmg, { fromX: p.x, fromY: p.y });
      S.spawnFx && S.spawnFx(game, 'fur', target.enemy.x, target.enemy.y, 0.45, { size: 0.45 });
      emit(game, 'sfx', { name: 'claw_hit', x: target.enemy.x, y: target.enemy.y });
    } else emit(game, 'sfx', { name: 'claw_swipe' });
    return true;
  }

  if (w.kind === 'hitscan') {
    spend(p, w);
    const a = p.angle + R.range(-w.spread, w.spread) + (p.vx || p.vy ? R.range(-0.004, 0.004) : 0);
    const rx = Math.cos(a), ry = Math.sin(a);
    let hit = null;
    try { hit = S.pickEnemyOnRay ? S.pickEnemyOnRay(game, p.x, p.y, rx, ry, w.range) : null; } catch { hit = null; }
    if (hit && hit.enemy) {
      let dmg = R.int(w.dmg[0], w.dmg[1]);
      if (hit.dist > 10) dmg = Math.round(dmg * Math.max(0.55, 1 - (hit.dist - 10) * 0.04));   // gentle falloff
      S.damageEnemy && S.damageEnemy(game, hit.enemy, dmg, { fromX: p.x, fromY: p.y });
      S.spawnFx && S.spawnFx(game, 'fur', hit.enemy.x - rx * 0.2, hit.enemy.y - ry * 0.2, 0.5, { size: 0.35 });
    } else if (world) {
      const r = world.castRay(p.x, p.y, rx, ry, w.range);
      if (r.hit && r.dist > 0.45) {        // muzzle against the wall: no spark in the player's face
        const hx = r.x - rx * 0.06, hy = r.y - ry * 0.06;
        S.spawnFx && S.spawnFx(game, 'spark', hx, hy, MUZZLE_H - r.dist * 0.004, { size: 0.22, light: [1.6, 1.2, 0.5, 1.2] });
        if (R.chance(0.25)) emit(game, 'sfx', { name: R.chance(0.5) ? 'ricochet' : 'hit_wall', x: hx, y: hy, vol: 0.5 });
      }
    }
    emit(game, 'sfx', { name: w.id });
    muzzle(game, p, w.id === 'gatling' ? 0.85 : 1);
    if (w.loud && S.makeNoise) S.makeNoise(game, p.x, p.y, w.loud);
    return true;
  }

  if (w.kind === 'projectile') {
    spend(p, w);
    // spawn just in front of the player, but never inside a wall
    let off = 0.35;
    if (world) { const r = world.castRay(p.x, p.y, dx, dy, 0.6); if (r.hit) off = Math.max(0, r.dist - 0.2); }
    S.spawnProjectile && S.spawnProjectile(game, w.projectile, p.x + dx * off, p.y + dy * off, MUZZLE_H - 0.05, p.angle, 'player');
    emit(game, 'sfx', { name: 'yarn_launch' });
    S.spawnFx && S.spawnFx(game, 'puff', p.x + dx * (off + 0.1), p.y + dy * (off + 0.1), MUZZLE_H, { size: 0.35 });
    muzzle(game, p, 0.5);
    if (w.loud && S.makeNoise) S.makeNoise(game, p.x, p.y, w.loud);
    return true;
  }

  if (w.kind === 'beam') {
    p.beamAcc = (p.beamAcc || 0) + w.usePerSec * dt;
    while (p.beamAcc >= 1 && p.ammo.cell > 0) { p.ammo.cell--; p.beamAcc -= 1; }
    let hit = null;
    try { hit = S.pickEnemyOnRay ? S.pickEnemyOnRay(game, p.x, p.y, dx, dy, w.range) : null; } catch { hit = null; }
    let ex, ey, eh = MUZZLE_H;
    if (hit && hit.enemy) {
      ex = p.x + dx * hit.dist; ey = p.y + dy * hit.dist; eh = 0.5 * (hit.enemy.spr?.size || 1);
      S.damageEnemy && S.damageEnemy(game, hit.enemy, w.dps * dt, { stun: w.stun, fromX: p.x, fromY: p.y });
    } else {
      const r = world ? world.castRay(p.x, p.y, dx, dy, w.range) : { dist: w.range, x: p.x + dx * w.range, y: p.y + dy * w.range };
      ex = r.x - dx * 0.03; ey = r.y - dy * 0.03; eh = MUZZLE_H - 0.06;
    }
    p.laserDot = { x: ex, y: ey, h: eh };
    const sx = p.x + dx * 0.25 + Math.cos(p.angle + Math.PI / 2) * 0.06, sy = p.y + dy * 0.25 + Math.sin(p.angle + Math.PI / 2) * 0.06;
    S.addBeam && S.addBeam(game, { x0: sx, y0: sy, h0: MUZZLE_H - 0.04, x1: ex, y1: ey, h1: eh, r: 2.6, g: 0.15, b: 0.12, width: 0.012, life: dt * 1.5 });
    p.beamSfxT = (p.beamSfxT || 0) - dt;
    if (p.beamSfxT <= 0) { emit(game, 'sfx', { name: 'laser', vol: 0.6 }); p.beamSfxT = 0.25; }
    p.noiseT = (p.noiseT || 0) - dt;
    if (p.noiseT <= 0 && S.makeNoise) { S.makeNoise(game, p.x, p.y, w.loud); p.noiseT = 0.5; }
    return true;
  }
  return false;
}

const isAlive = (e) => e && e.state !== 'dead' && e.state !== 'die' && !(e.hp <= 0);

/** Advance the weapon state machine one tick. `fireHeld` = cmd.fire (level); edges are derived here. */
export function updateWeapon(game, dt, cmd) {
  const p = game.player;
  const ws = p.wstate;
  const fire = !!(cmd && cmd.fire);
  const fireEdge = fire && !p.fireWas;
  p.fireWas = fire;
  if (fireEdge) p.fireQueued = 0.18;            // buffer a tap that lands just before the weapon is ready
  else p.fireQueued = Math.max(0, (p.fireQueued || 0) - dt);
  p.flashT = Math.max(0, (p.flashT || 0) - dt);
  if (!p.beamOn) p.laserDot = null;
  p.beamOn = false;
  if (p.dead) return;
  ws.t += dt;

  if (ws.phase === 'lower') {
    if (ws.t >= LOWER_T) {
      if (p.pendingWeapon >= 0 && p.owned[p.pendingWeapon]) p.weapon = p.pendingWeapon;
      p.pendingWeapon = -1;
      ws.phase = 'raise'; ws.t = 0; ws.anim = 'idle'; ws.frame = 0;
      emit(game, 'weapon', { index: p.weapon });
    }
    return;
  }
  if (ws.phase === 'raise') {
    if (ws.t >= RAISE_T) { ws.phase = 'ready'; ws.t = 0; }
    else return;
  }

  const w = weaponDef(p.weapon);

  if (w.kind === 'beam') {
    if (fire && canFire(p, p.weapon)) {
      p.beamOn = true;
      fireWeapon(game, dt);
      if (ws.phase !== 'fire') { ws.phase = 'fire'; ws.t = 0; }
      ws.anim = 'fire';
      ws.frame = Math.floor(ws.t * BEAM_FRAME_RATE) % w.fireFrames;
      return;
    }
    if (ws.phase === 'fire') { ws.phase = 'ready'; ws.t = 0; ws.anim = 'idle'; ws.frame = 0; }
    if (fireEdge && !canFire(p, p.weapon)) outOfAmmo(game);
    return;
  }

  if (ws.phase === 'fire') {
    const period = w.period;
    ws.frame = Math.min(w.fireFrames - 1, Math.floor(ws.t / (period / w.fireFrames)));
    if (ws.t < period) return;
    // cycle complete: chain into the next shot if the trigger is still down (auto) or a tap was buffered
    const again = (w.auto && fire) || p.fireQueued > 0;
    if (again && canFire(p, p.weapon)) {
      ws.t -= period;                         // keep exact cadence
      if (ws.t > period) ws.t = 0;
      ws.frame = 0; p.fireQueued = 0;
      fireWeapon(game, dt);
      return;
    }
    ws.phase = 'ready'; ws.t = 0; ws.anim = 'idle'; ws.frame = 0;
    if (again) { outOfAmmo(game); return; }
  }

  if (ws.phase === 'ready') {
    const want = (w.auto && fire) || p.fireQueued > 0;
    if (!want) return;
    if (!canFire(p, p.weapon)) { if (fireEdge || p.fireQueued > 0) { p.fireQueued = 0; outOfAmmo(game); } return; }
    p.fireQueued = 0;
    ws.phase = 'fire'; ws.t = 0; ws.anim = 'fire'; ws.frame = 0;
    fireWeapon(game, dt);
  }
}

function outOfAmmo(game) {
  const p = game.player;
  emit(game, 'sfx', { name: 'no_ammo' });
  const b = bestWeapon(p);
  if (b !== p.weapon) switchWeapon(game, b);
}

/** Clamp ammo to AMMO_MAX (used after pickups). */
export function clampAmmo(p) {
  for (const k of Object.keys(AMMO_MAX)) p.ammo[k] = Math.max(0, Math.min(AMMO_MAX[k], p.ammo[k] || 0));
}
