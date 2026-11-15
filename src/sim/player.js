// KÄSEKRIEG player: movement (acceleration / friction / run), head bob, use, meow, hazards, damage, death.
// Contract: ARCHITECTURE.md §8.4. Pure sim code: no DOM, randomness from game.rng only.

import { START, SKILLS, VIEW, WEAPONS } from '../core/defs.js';
import { updateWeapon, switchWeapon, cycleWeapon, fireWeapon } from './weapons.js';
import { giveItem, healPlayer } from './items.js';

export { giveItem, healPlayer, fireWeapon };

// Movement tuning (cells, seconds). Feel: quick to start, short slide to stop, run ≈ 1.65× walk.
export const WALK_SPEED = 3.4;
export const RUN_SPEED = 5.6;
export const ACCEL = 16;            // 1/s exponential approach to the wish velocity while moving
export const FRICTION = 12;         // 1/s exponential decay when there is no input
export const BOB_AMP = 0.016;       // camera head-bob amplitude at full walk speed (world units)
export const STEP_LEN = 1.35;       // cells per full bob cycle (two footfalls)
export const PLAYER_RADIUS = 0.27;
export const HURT_SFX_GAP = 0.25;

const emit = (game, type, payload) => { try { game.bus && game.bus.emit(type, payload); } catch { /* ignore */ } };

export function createPlayer() {
  return {
    x: 1.5, y: 1.5, angle: 0, radius: PLAYER_RADIUS,
    vx: 0, vy: 0, speed: 0,
    health: START.health, lives: START.lives, score: 0,
    ammo: { ...START.ammo }, owned: [...START.owned], weapon: START.weapon, pendingWeapon: -1,
    wstate: { phase: 'raise', t: 0, frame: 0, anim: 'idle' },
    keys: { gold: false, silver: false },
    bob: 0, bobAmp: 0, camH: VIEW.EYE, roll: 0,
    hurtT: 0, dead: false, deadT: 0, stepT: 0,
    flashT: 0, flashI: 0, catnipT: 0, meowT: 0, hazardT: 0, hurtSfxT: 0,
    fireWas: false, fireQueued: 0, beamOn: false, laserDot: null,
    levelStart: null,
  };
}

/** Snapshot of what survives a death (taken at level start). */
export function snapshotPlayer(p) {
  return { score: p.score, ammo: { ...p.ammo }, owned: [...p.owned], weapon: p.weapon, health: p.health };
}

/** Reset per-life state, keeping score/lives/inventory. */
export function resetTransient(p) {
  p.vx = p.vy = p.speed = 0;
  p.bob = 0; p.bobAmp = 0; p.camH = VIEW.EYE; p.roll = 0;
  p.hurtT = 0; p.dead = false; p.deadT = 0; p.stepT = 0;
  p.flashT = 0; p.catnipT = 0; p.meowT = 0; p.hazardT = 0; p.hurtSfxT = 0;
  p.fireWas = false; p.fireQueued = 0; p.beamOn = false; p.laserDot = null; p.beamAcc = 0;
  p.pendingWeapon = -1;
  p.wstate = { phase: 'raise', t: 0, frame: 0, anim: 'idle' };
  p.keys = { gold: false, silver: false };
}

export function placePlayer(game, x, y, angle = 0) {
  const p = game.player || (game.player = createPlayer());
  p.x = x; p.y = y; p.angle = angle;
  p.vx = p.vy = p.speed = 0;
  return p;
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const num = (v) => (Number.isFinite(v) ? v : 0);

export function updatePlayer(game, dt, cmd = {}) {
  const p = game.player;
  if (!p) return;
  const world = game.world;
  p.hurtT = Math.max(0, p.hurtT - dt);
  p.hurtSfxT = Math.max(0, p.hurtSfxT - dt);
  p.meowT = Math.max(0, p.meowT - dt);

  if (p.dead) {
    p.deadT += dt;
    // slump to the floor and roll over
    p.camH += (0.12 - p.camH) * Math.min(1, dt * 4);
    p.roll += (0.45 - p.roll) * Math.min(1, dt * 3);
    p.vx *= Math.max(0, 1 - dt * 6); p.vy *= Math.max(0, 1 - dt * 6);
    if (world) world.tryMove(p, p.vx * dt, p.vy * dt);
    updateWeapon(game, dt, {});
    return;
  }

  // ── turning ──
  p.angle = num(p.angle + num(cmd.turn));
  if (p.angle > Math.PI * 4 || p.angle < -Math.PI * 4) p.angle = Math.atan2(Math.sin(p.angle), Math.cos(p.angle));

  // ── movement ──
  const fwd = clamp(num(cmd.forward), -1, 1), str = clamp(num(cmd.strafe), -1, 1);
  const ca = Math.cos(p.angle), sa = Math.sin(p.angle);
  let wx = fwd * ca - str * sa, wy = fwd * sa + str * ca;   // right vector = (-sin, cos)
  const wl = Math.hypot(wx, wy);
  if (wl > 1) { wx /= wl; wy /= wl; }
  const top = (cmd.run ? RUN_SPEED : WALK_SPEED) * (p.catnipT > 0 ? 1.12 : 1);
  const moving = wl > 0.01;
  const k = 1 - Math.exp(-(moving ? ACCEL : FRICTION) * dt);
  p.vx += (wx * top - p.vx) * k;
  p.vy += (wy * top - p.vy) * k;
  if (!moving && Math.hypot(p.vx, p.vy) < 0.02) p.vx = p.vy = 0;

  const ox = p.x, oy = p.y;
  if (game.cheats && game.cheats.noclip) { p.x += p.vx * dt; p.y += p.vy * dt; }
  else if (world) {
    const r = world.tryMove(p, p.vx * dt, p.vy * dt);
    if (r.hit && dt > 0) {        // keep only the velocity that actually happened (no sticky walls, no speed build-up)
      const ax = (p.x - ox) / dt, ay = (p.y - oy) / dt;
      if (Math.abs(ax) < Math.abs(p.vx)) p.vx = ax;
      if (Math.abs(ay) < Math.abs(p.vy)) p.vy = ay;
    }
  }
  const moved = dt > 0 ? Math.hypot(p.x - ox, p.y - oy) / dt : 0;
  p.speed = moved;

  // ── head bob (phase in cycles; amplitude follows speed) ──
  const ampT = clamp(moved / WALK_SPEED, 0, 1.25);
  p.bobAmp += (ampT - p.bobAmp) * Math.min(1, dt * 10);
  if (moved > 0.05) {
    p.bob += (moved * dt) / STEP_LEN;
    const prevStep = p.stepT;
    p.stepT = Math.floor(p.bob * 2);
    if (p.stepT !== prevStep) p.footstep = (p.footstep || 0) + 1;
  } else if (p.bobAmp < 0.02) p.bob = 0;
  if (p.bob > 1e6) p.bob -= Math.floor(p.bob);
  const bobH = Math.abs(Math.sin(p.bob * Math.PI * 2)) * BOB_AMP * p.bobAmp;
  p.camH = VIEW.EYE - BOB_AMP * 0.5 * p.bobAmp + bobH;
  // gentle roll: lean into strafes, tiny sway with the bob
  const strafeV = -p.vx * sa + p.vy * ca;
  const rollT = clamp(-strafeV * 0.006, -0.03, 0.03) + Math.sin(p.bob * Math.PI * 2) * 0.004 * p.bobAmp;
  p.roll += (rollT - p.roll) * Math.min(1, dt * 8);

  // ── use / meow ──
  if (cmd.use && world) {
    const r = world.use(p.x, p.y, p.angle, p.keys);
    if (r && r.kind === 'locked') emit(game, 'msg', { text: `Locked. You need the ${r.lock} key.`, kind: 'warn' });
  }
  if (cmd.meow && p.meowT <= 0) {
    p.meowT = 0.7;
    emit(game, 'sfx', { name: game.rng && game.rng.chance(0.12) ? 'purr' : 'meow', x: p.x, y: p.y });
    game.sys?.makeNoise?.(game, p.x, p.y, 7);
  }

  // ── weapons ──
  if (Number.isInteger(cmd.weapon) && cmd.weapon >= 0 && cmd.weapon < WEAPONS.length) {
    if (p.owned[cmd.weapon]) switchWeapon(game, cmd.weapon);
  } else if (cmd.next === 1 || cmd.next === -1) cycleWeapon(game, cmd.next);
  updateWeapon(game, dt, cmd);

  // ── hazards & status effects ──
  const hz = world ? num(world.hazardAt(p.x, p.y)) : 0;
  if (hz > 0) {
    p.hazardT += dt;
    if (p.hazardT >= 0.25) {
      damagePlayer(game, hz * p.hazardT, NaN, NaN, { hazard: true });
      p.hazardT = 0;
      if (game.rng ? game.rng.chance(0.5) : true) emit(game, 'sfx', { name: 'fondue_sizzle', x: p.x, y: p.y, vol: 0.7 });
    }
  } else p.hazardT = 0;
  p.catnipT = Math.max(0, p.catnipT - dt);
  if (p.health > 100 && p.catnipT <= 0) p.health = Math.max(100, p.health - dt * 1.5);   // overheal wears off
}

/**
 * Damage the player. `srcX/srcY` locate the attacker (NaN for environmental damage).
 * Applies skill scaling and god mode. Handles death (loses a life, status 'dead').
 */
export function damagePlayer(game, amount, srcX, srcY, opts = {}) {
  const p = game.player;
  if (!p || p.dead || !(amount > 0)) return 0;
  if (game.status && game.status !== 'playing') return 0;
  const skill = SKILLS[clamp(game.skill | 0, 0, SKILLS.length - 1)] || SKILLS[1];
  let dmg = amount * (opts.hazard ? Math.max(0.6, skill.dmgTaken) : skill.dmgTaken);
  if (game.cheats && game.cheats.god) dmg = 0;
  const hasSrc = Number.isFinite(srcX) && Number.isFinite(srcY);
  const angle = hasSrc ? Math.atan2(srcY - p.y, srcX - p.x) : p.angle;
  if (dmg <= 0) return 0;                       // god mode: no hurt feedback either
  p.health -= dmg;
  p.hurtT = 0.35;
  emit(game, 'hurt', { amount: dmg, angle });
  if (!opts.hazard || p.hurtSfxT <= 0) emit(game, 'flash', { r: 1, g: 0.1, b: 0.05, a: Math.min(0.5, 0.12 + dmg / 60) });
  if (p.health <= 0) {
    p.health = 0;
    p.dead = true; p.deadT = 0;
    p.lives = Math.max(0, p.lives - 1);
    p.beamOn = false; p.laserDot = null;
    emit(game, 'sfx', { name: 'player_die', x: p.x, y: p.y });
    emit(game, 'playerDied', { livesLeft: p.lives });
    game.status = 'dead';
    return dmg;
  }
  if (p.hurtSfxT <= 0) { emit(game, 'sfx', { name: 'player_hurt', x: p.x, y: p.y }); p.hurtSfxT = HURT_SFX_GAP; }
  return dmg;
}
