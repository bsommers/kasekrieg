// KÄSEKRIEG enemies: the rats and mice of Das Rattenreich, and Der Große Käse.
// Contract: ARCHITECTURE.md §8.5. Pure sim code: no DOM, no Math.random, runs in Node.
//
// enemy = { id, type, def, x, y, angle, radius, hp, maxHp, state, t, alerted, spr, ...AI scratch }
//   state: 'stand' | 'patrol' | 'chase' | 'attack' | 'pain' | 'stun' | 'die' | 'dead'
//
// AI in one paragraph: guards stand, patrols walk straight and turn at walls (opening doors). They notice the
// player by sight (LOS + a ±70° facing cone, or any direction once alerted / within 1.5 cells) or by hearing
// (`makeNoise`, flood-filled through open cells by `world.soundMask`). Noticing → alert shout (which alerts
// friends within earshot) → a reaction pause (def.reaction × skill.reaction) → chase. Chasers follow
// `world.distField` downhill; every third enemy instead routes to a cell beside/behind the player (flanking),
// and step choice is penalised for cells other enemies occupy so packs spread out. Ranged enemies stop at a
// preferred distance and sidestep. Attacks always wind up (aim frame + rising glow) before damage; hitscan
// hit chance falls with distance and with player speed. Hits cause a pain flinch (painChance); laser hits stun
// ("mesmerised", fx.stun orbiting the head). The boss switches to phase 2 below 50% hp: cheeseball volleys
// alternate with gatling bursts, he moves faster and summons sewer rats.

import { ENEMIES, ITEMS, SKILLS } from '../core/defs.js';
import { spawnFx, emit, rngOf, skillOf, spriteLayer } from './effects.js';
import { spawnProjectile } from './projectiles.js';

// ───────────── tuning ─────────────
export const SIGHT_RANGE = 24;
export const FOV_COS = Math.cos(1.22);          // ±70° facing cone for unalerted enemies
export const FEEL_RANGE = 1.5;                  // notices you this close regardless of facing
export const SHOUT_RANGE = 6;                   // alert shout radius (cells, through open doors)
export const GUNFIRE_RANGE = 7;                 // enemy gunfire alerts friends this far
export const DIE_TIME = 0.6;                    // seconds of death animation
export const RUN_SPEED_REF = 5.6;               // player run speed (player.js RUN_SPEED)
const PREF_DIST = { mouse: 5, trooper: 4, officer: 3, panzer: 6, boss: 4.5, sewer: 0 };
const PATROL_MUL = 0.55;
const BOSS_STUN_MUL = 0.3, BOSS_STUN_IMMUNE = 2.0;
const UNREACH = 65535;
const NB = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];   // E S W N — angle = k·π/2

// ───────────── optional sibling modules (sim-player) ─────────────
// Loaded lazily so a missing / half-written file never breaks this module (and there is no import cycle).
let playerMod = null, itemsMod = null;
export const enemiesReady = Promise.all([
  import('./player.js').then((m) => { playerMod = m; }, () => {}),
  import('./items.js').then((m) => { itemsMod = m; }, () => {}),
]);

const living = (e) => !!e && e.state !== 'die' && e.state !== 'dead' && e.hp > 0;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

// per-game AI bookkeeping (player speed estimate, id counter)
const gameState = new WeakMap();
function stateOf(game) {
  let s = gameState.get(game);
  if (!s) { s = { nextId: 1, px: NaN, py: NaN, pSpeed: 0 }; gameState.set(game, s); }
  return s;
}

/** Damage the player: player.js damagePlayer (skill scaling, god mode, death) or a minimal fallback. */
export function hurtPlayer(game, amount, srcX, srcY) {
  if (!game || !(amount > 0)) return 0;
  const hook = game._hooks && game._hooks.damagePlayer;
  if (typeof hook === 'function') return hook(game, amount, srcX, srcY);
  if (playerMod && typeof playerMod.damagePlayer === 'function') return playerMod.damagePlayer(game, amount, srcX, srcY);
  const p = game.player;
  if (!p || p.dead) return 0;
  const dmg = game.cheats && game.cheats.god ? 0 : amount * skillOf(game).dmgTaken;
  p.health = (p.health ?? 100) - dmg;
  emit(game, 'hurt', { amount: dmg, angle: Math.atan2(srcY - p.y, srcX - p.x) });
  if (p.health <= 0) { p.health = 0; p.dead = true; }
  return dmg;
}

/** Chance that one hitscan shot hits: falls with distance and with how fast the player is moving. */
export function hitChance(dist, playerSpeed = 0) {
  const base = clamp(0.95 - 0.05 * dist, 0.1, 0.95);
  const pen = clamp(playerSpeed / RUN_SPEED_REF, 0, 1.2) * 0.45;
  return clamp(base * (1 - pen), 0.04, 0.95);
}

// ───────────── spawning ─────────────
function longestRunAngle(world, x, y) {
  if (!world) return 0;
  const cx = Math.floor(x), cy = Math.floor(y);
  let best = 0, bestN = -1;
  for (let k = 0; k < 4; k++) {
    let n = 0;
    while (n < 64 && !world.blocksMove(cx + DIRS[k][0] * (n + 1), cy + DIRS[k][1] * (n + 1), true)) n++;
    if (n > bestN) { bestN = n; best = k; }
  }
  return (best * Math.PI) / 2;
}

/** spawnEnemy(game, type, x, y, { patrol, angle, alerted }) → enemy (pushed onto game.enemies). */
export function spawnEnemy(game, type, x, y, opts = {}) {
  if (!game) return null;
  const o = opts || {};
  const t = ENEMIES[type] ? type : 'mouse';
  const def = ENEMIES[t];
  const skill = skillOf(game);
  const st = stateOf(game);
  const rng = rngOf(game);
  const hp = Math.max(1, Math.round(def.hp * (skill.enemyHp || 1)));
  const angle = Number.isFinite(o.angle) ? o.angle : longestRunAngle(game.world, x, y);
  const id = st.nextId++;
  const e = {
    id, kind: 'enemy', type: t, def, x: +x || 0, y: +y || 0, angle, radius: def.radius,
    hp, maxHp: hp, state: o.patrol ? 'patrol' : 'stand', t: rng.range(0, 1), alerted: false,
    spr: { frame: spriteLayer(game, `${t}.idle`, 0), size: def.size, h: 0, flipX: false, glow: 0, alpha: 1 },
    patrol: !!o.patrol, pdir: ((Math.round(angle / (Math.PI / 2)) % 4) + 4) % 4, pcell: -1, pdecided: false,
    reactT: 0, cooldown: 0, senseT: rng.range(0, 0.1), sees: false, lastSeen: null,
    atk: null, fired: false, shotsLeft: 0, shotT: 0, muzzleT: 0, hitT: 0, painDur: 0, painSfxT: 0,
    stunT: 0, stunImmuneT: 0, stunFx: null,
    wp: null, wpT: 0, walk: 0, moveX: 0, moveY: 0, stuckT: 0, sideT: 0, sideDir: 1,
    strafeT: rng.range(0.5, 1.5), strafeDir: 0,
    flank: t === 'sewer' || t === 'boss' ? 0 : [0, 1, -1][id % 3], flankGoal: null, flankT: 0,
    phase: 1, atkCount: 0, summonT: 0, summoned: !!o.summoned,
  };
  if (!Array.isArray(game.enemies)) game.enemies = [];
  game.enemies.push(e);
  if (o.alerted) { e.alerted = true; e.state = 'chase'; e.reactT = 0.3; }
  return e;
}

// ───────────── senses ─────────────
function canSee(game, e, tgt, ignoreCone) {
  const dx = tgt.x - e.x, dy = tgt.y - e.y, d = Math.hypot(dx, dy);
  if (d > SIGHT_RANGE) return false;
  if (!ignoreCone && !e.alerted && d > FEEL_RANGE && d > 0) {
    if ((Math.cos(e.angle) * dx + Math.sin(e.angle) * dy) / d < FOV_COS) return false;
  }
  const w = game.world;
  try { return !w || w.hasLOS(e.x, e.y, tgt.x, tgt.y); } catch { return false; }
}

function alert(game, e, x, y, loud) {
  if (!living(e)) return;
  const first = !e.alerted;
  e.alerted = true;
  if (Number.isFinite(x)) e.lastSeen = { x, y };
  if (first) {
    const r = e.def.reaction || [0.4, 0.8];
    e.reactT = rngOf(game).range(r[0], r[1]) * (skillOf(game).reaction || 1);
    emit(game, 'sfx', { name: e.def.sfx.alert, x: e.x, y: e.y });
    if (loud) makeNoise(game, e.x, e.y, SHOUT_RANGE, e);
  }
  if (e.state === 'stand' || e.state === 'patrol') {
    e.state = 'chase'; e.t = 0; e.wp = null;
    if (Number.isFinite(x)) e.angle = Math.atan2(y - e.y, x - e.x);
  }
}

/** makeNoise(game, x, y, range[, source]) — alerts living enemies that can hear a noise at (x, y). */
export function makeNoise(game, x, y, range, source = null) {
  if (!game || !Array.isArray(game.enemies) || !(range > 0)) return 0;
  const w = game.world;
  let mask = null;
  try { mask = w ? w.soundMask(Math.floor(x), Math.floor(y), Math.ceil(range)) : null; } catch { mask = null; }
  let n = 0;
  for (const e of game.enemies) {
    if (!living(e) || e === source) continue;
    if (Math.hypot(e.x - x, e.y - y) > range * 1.25) continue;
    if (mask) {
      const cx = Math.floor(e.x), cy = Math.floor(e.y);
      if (!w.inBounds(cx, cy) || !mask[cy * w.w + cx]) continue;
    }
    if (!e.alerted) n++;
    alert(game, e, x, y, false);
  }
  return n;
}

// ───────────── queries ─────────────
/** Nearest living enemy whose body the ray hits before any wall → { enemy, dist } | null. */
export function pickEnemyOnRay(game, x, y, dx, dy, maxDist = 64) {
  if (!game || !Array.isArray(game.enemies)) return null;
  const len = Math.hypot(dx, dy);
  if (!(len > 0)) return null;
  dx /= len; dy /= len;
  let limit = maxDist;
  const w = game.world;
  if (w) { try { const r = w.castRay(x, y, dx, dy, maxDist); if (r.hit) limit = Math.min(limit, r.dist); } catch { /* ignore */ } }
  let best = null, bd = Infinity;
  for (const e of game.enemies) {
    if (!living(e)) continue;
    const r = (e.radius || 0.3) + 0.04;
    const ox = e.x - x, oy = e.y - y;
    const t = ox * dx + oy * dy;
    const c2 = ox * ox + oy * oy;
    if (t < -r) continue;
    const perp2 = c2 - t * t;
    if (perp2 > r * r) continue;
    const th = c2 <= r * r ? 0 : t - Math.sqrt(r * r - perp2);
    if (th < 0 || th > limit || th >= bd) continue;
    best = e; bd = th;
  }
  return best ? { enemy: best, dist: bd } : null;
}

/** Living enemies whose body overlaps the circle (x, y, r). */
export function enemiesInRadius(game, x, y, r) {
  const out = [];
  if (!game || !Array.isArray(game.enemies)) return out;
  for (const e of game.enemies) if (living(e) && Math.hypot(e.x - x, e.y - y) <= r + (e.radius || 0)) out.push(e);
  return out;
}

// ───────────── damage ─────────────
/**
 * damageEnemy(game, enemy, amount, { stun, fromX, fromY, noPain }) → true if this hit killed it.
 * Alerts the enemy; may flinch (painChance) or, with `stun` seconds (laser), mesmerise it.
 */
export function damageEnemy(game, e, amount, opts = {}) {
  if (!game || !living(e) || !(amount > 0)) return false;
  const o = opts || {};
  const rng = rngOf(game);
  e.hp -= amount;
  e.hitT = 0.1;
  const pl = game.player;
  const fx = Number.isFinite(o.fromX) ? o.fromX : pl && pl.x, fy = Number.isFinite(o.fromY) ? o.fromY : pl && pl.y;
  const wasAlerted = e.alerted;
  alert(game, e, fx, fy, true);
  if (!wasAlerted) e.reactT = Math.min(e.reactT, 0.3);   // being shot is a strong hint
  if (e.hp <= 0) { killEnemy(game, e); return true; }
  if (e.type === 'boss' && e.phase === 1 && e.hp < e.maxHp * (e.def.phase2?.below ?? 0.5)) { enterPhase2(game, e); return false; }
  if (o.stun > 0) {
    if (e.type === 'boss' && e.stunImmuneT > 0) return false;
    const dur = e.type === 'boss' ? o.stun * BOSS_STUN_MUL : o.stun;
    if (e.state !== 'stun') {
      e.state = 'stun'; e.t = 0; e.atk = null; e.fired = false; e.wp = null;
      if (e.painSfxT <= 0) { emit(game, 'sfx', { name: e.def.sfx.pain, x: e.x, y: e.y }); e.painSfxT = 0.6; }
      if (!e.stunFx || e.stunFx.dead) {
        e.stunFx = spawnFx(game, 'stun', e.x, e.y, e.def.size * 0.95 + 0.08, {
          size: e.type === 'boss' ? 0.55 : 0.36, follow: e, followH: e.def.size * 0.95 + 0.08, life: 1e6,
          until: () => e.state !== 'stun', light: [0.9, 0.8, 0.2, 1.0],
        });
      }
    }
    e.stunT = Math.max(e.stunT, dur);
    return false;
  }
  if (!o.noPain && e.state !== 'pain' && e.state !== 'stun' && rng.chance(e.def.painChance)) {
    e.state = 'pain'; e.t = 0; e.atk = null; e.fired = false;
    e.painDur = e.type === 'boss' ? 0.35 : 0.24;
    if (e.painSfxT <= 0) { emit(game, 'sfx', { name: e.def.sfx.pain, x: e.x, y: e.y }); e.painSfxT = 0.25; }
  }
  return false;
}

function enterPhase2(game, e) {
  e.phase = 2;
  e.state = 'pain'; e.t = 0; e.painDur = 0.9; e.atk = null; e.fired = false;
  e.cooldown = 0.4; e.atkCount = 0; e.summonT = 7;
  emit(game, 'sfx', { name: 'boss_alert', x: e.x, y: e.y });
  emit(game, 'msg', { text: 'DER GROSSE KÄSE IS FURIOUS!', kind: 'warn' });
  emit(game, 'flash', { r: 1, g: 0.6, b: 0.1, a: 0.3 });
  spawnFx(game, 'explosion', e.x, e.y, 0.8, { size: 1.4, light: [2.6, 1.6, 0.4, 4] });
  summon(game, e, 2);
}

function summon(game, boss, n) {
  const type = boss.def.phase2?.summon || 'sewer';
  const w = game.world, rng = rngOf(game);
  const bx = Math.floor(boss.x), by = Math.floor(boss.y);
  const cands = [];
  for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) {
    if (Math.abs(ox) + Math.abs(oy) < 1) continue;
    const cx = bx + ox, cy = by + oy;
    if (w && (!w.inBounds(cx, cy) || w.blocksMove(cx, cy))) continue;
    if (w && !w.hasLOS(boss.x, boss.y, cx + 0.5, cy + 0.5)) continue;
    const pl = game.player;
    if (pl && Math.floor(pl.x) === cx && Math.floor(pl.y) === cy) continue;
    if ((game.enemies || []).some((o) => living(o) && Math.floor(o.x) === cx && Math.floor(o.y) === cy)) continue;
    cands.push([cx, cy]);
  }
  let made = 0;
  for (let k = 0; k < n && cands.length; k++) {
    const [cx, cy] = cands.splice(Math.floor(rng.next() * cands.length), 1)[0];
    const s = spawnEnemy(game, type, cx + 0.5, cy + 0.5, { alerted: true, summoned: true, angle: Math.atan2(boss.y - cy, boss.x - cx) + Math.PI });
    if (s) {
      made++;
      if (game.stats && Number.isFinite(game.stats.killsTotal)) game.stats.killsTotal++;
      spawnFx(game, 'puff', s.x, s.y, 0.3, { size: 0.7 });
      emit(game, 'sfx', { name: s.def.sfx.alert, x: s.x, y: s.y });
    }
  }
  return made;
}

function killEnemy(game, e) {
  e.hp = 0;
  e.state = 'die'; e.t = 0; e.atk = null; e.stunT = 0; e.wp = null;
  emit(game, 'sfx', { name: e.def.sfx.die, x: e.x, y: e.y });
  emit(game, 'kill', { type: e.type });
  if (game.stats) game.stats.kills = (game.stats.kills || 0) + 1;
  if (game.player) game.player.score = (game.player.score || 0) + (e.def.score || 0);
  spawnFx(game, 'puff', e.x, e.y, 0.25, { size: 0.6 * e.def.size });
  dropLoot(game, e);
  if (e.type === 'boss') {
    emit(game, 'bossDied', {});
    emit(game, 'flash', { r: 1, g: 0.85, b: 0.4, a: 0.6 });
    for (const o of game.enemies || []) if (o !== e && o.summoned && living(o)) killEnemyQuiet(game, o);
  }
}

function killEnemyQuiet(game, e) {   // boss minions flee the mortal plane: no score, no drop
  e.hp = 0; e.state = 'die'; e.t = 0; e.atk = null; e.stunT = 0;
  if (game.stats && Number.isFinite(game.stats.killsTotal)) game.stats.killsTotal = Math.max(game.stats.kills || 0, game.stats.killsTotal - 1);
  spawnFx(game, 'puff', e.x, e.y, 0.3, { size: 0.6 });
}

function dropLoot(game, e) {
  const drop = e.def.drop;
  if (!drop) return null;
  if (itemsMod && typeof itemsMod.dropItem === 'function') {
    try { return itemsMod.dropItem(game, drop, e.x, e.y); } catch { /* fall through */ }
  }
  // fallback (items.js unavailable): same rule — first weapon option the player lacks, else the last option
  const opts = String(drop).split('|').filter((s) => ITEMS[s]);
  if (!opts.length) return null;
  let id = opts[opts.length - 1];
  const p = game.player;
  for (const o of opts.slice(0, -1)) if (ITEMS[o].weapon !== undefined && !(p && p.owned && p.owned[ITEMS[o].weapon])) { id = o; break; }
  const it = { kind: 'pickup', id, def: ITEMS[id], x: e.x, y: e.y, h: 0, radius: 0.25, taken: false, drop: true,
    spr: { frame: spriteLayer(game, `item.${id}`, 0), size: 0.58, h: 0, flipX: false, glow: 0, alpha: 1 }, light: null };
  if (!Array.isArray(game.pickups)) game.pickups = [];
  game.pickups.push(it);
  return it;
}

// ───────────── update ─────────────
export function updateEnemies(game, dt) {
  if (!game || !(dt > 0) || !Array.isArray(game.enemies)) return;
  const st = stateOf(game);
  const pl = game.player;
  if (pl && Number.isFinite(pl.x)) {
    if (Number.isFinite(st.px)) {
      const v = Math.hypot(pl.x - st.px, pl.y - st.py) / dt;
      st.pSpeed += (Math.min(v, 12) - st.pSpeed) * Math.min(1, dt * 8);
    }
    st.px = pl.x; st.py = pl.y;
  }
  const playing = !game.status || game.status === 'playing';
  const target = pl && !pl.dead && Number.isFinite(pl.x) && playing && !(game.cheats && game.cheats.noTarget) ? pl : null;
  const list = game.enemies.slice();   // summons may be appended during the loop
  for (const e of list) if (e && e.state !== 'dead') updateOne(game, e, dt, target, st);
  separate(game);
}

function updateOne(game, e, dt, target, st) {
  e.t += dt;
  e.cooldown -= dt; e.reactT -= dt; e.senseT -= dt; e.muzzleT -= dt; e.hitT -= dt; e.painSfxT -= dt;
  e.stunImmuneT -= dt; e.flankT -= dt;
  e.moveX = 0; e.moveY = 0;
  switch (e.state) {
    case 'die': if (e.t >= DIE_TIME) { e.state = 'dead'; e.t = 0; } break;
    case 'pain': if (e.t >= e.painDur) resume(e); break;
    case 'stun':
      e.stunT -= dt;
      if (e.stunT <= 0) { e.stunT = 0; if (e.type === 'boss') e.stunImmuneT = BOSS_STUN_IMMUNE; resume(e); }
      break;
    case 'stand': case 'patrol':
      if (target && e.senseT <= 0) {
        e.senseT = 0.1;
        if (canSee(game, e, target, false)) { alert(game, e, target.x, target.y, true); break; }
      }
      if (e.state === 'patrol') patrolStep(game, e, dt);
      break;
    case 'chase': chase(game, e, dt, target); break;
    case 'attack': attack(game, e, dt, target, st); break;
    default: e.state = 'stand';
  }
  if (e.type === 'boss' && e.phase === 2 && living(e) && target) {
    e.summonT -= dt;
    if (e.summonT <= 0) {
      e.summonT = 9;
      const minions = (game.enemies || []).filter((o) => o.summoned && living(o)).length;
      if (minions < 3) summon(game, e, 1);
    }
  }
  updateSprite(game, e, dt, target);
}

function resume(e) { e.state = e.alerted ? 'chase' : e.patrol ? 'patrol' : 'stand'; e.t = 0; e.wp = null; }

function faceToward(e, x, y, dt, rate = 10) {
  const want = Math.atan2(y - e.y, x - e.x);
  const d = angDiff(want, e.angle);
  e.angle += clamp(d, -rate * dt, rate * dt);
}

function attackSpec(e) {
  const a = e.def.attack;
  if (e.type === 'boss' && e.phase === 2) {
    const p2 = e.def.phase2;
    if (e.atkCount % 2 === 1) {
      return { kind: 'projectile', projectile: p2.projectile, shots: 1, gap: 0, windup: 0.6, range: a.range,
        cooldown: [a.cooldown[0] * 0.7, a.cooldown[1] * 0.7], volley: p2.volley, spreadDeg: p2.spreadDeg, speedMul: p2.speedMul };
    }
    return { ...a, cooldown: [a.cooldown[0] * 0.75, a.cooldown[1] * 0.75] };
  }
  return a;
}

function speedOf(e) { return e.def.speed * (e.type === 'boss' && e.phase === 2 ? 1.25 : 1); }

function chase(game, e, dt, target) {
  if (!target) return;
  const dx = target.x - e.x, dy = target.y - e.y, d = Math.hypot(dx, dy);
  if (e.senseT <= 0) { e.senseT = 0.1; e.sees = canSee(game, e, target, true); }
  if (e.sees) e.lastSeen = { x: target.x, y: target.y };
  if (e.reactT > 0) { faceToward(e, target.x, target.y, dt); return; }   // "!?" — just noticed you
  const a = attackSpec(e);
  const reach = a.kind === 'melee' ? a.range + (target.radius || 0.27) : a.range;
  if (e.sees && e.cooldown <= 0 && d <= reach) { startAttack(game, e, a, target); return; }
  const pref = PREF_DIST[e.type] ?? 4;
  if (a.kind !== 'melee' && e.sees && d <= pref) { faceToward(e, target.x, target.y, dt); strafe(game, e, dt, target); return; }
  moveFlow(game, e, dt, target, speedOf(e));
}

function strafe(game, e, dt, target) {
  e.strafeT -= dt;
  const rng = rngOf(game);
  if (e.strafeT <= 0) {
    if (e.strafeDir) { e.strafeDir = 0; e.strafeT = rng.range(0.6, 1.6); }
    else { e.strafeDir = rng.chance(0.5) ? 1 : -1; e.strafeT = rng.range(0.35, 0.8); }
  }
  if (!e.strafeDir) return;
  const dx = target.x - e.x, dy = target.y - e.y, d = Math.hypot(dx, dy) || 1;
  const sx = (-dy / d) * e.strafeDir, sy = (dx / d) * e.strafeDir;
  const step = speedOf(e) * 0.7 * dt;
  if (moveBy(game, e, sx * step, sy * step, target)) { e.strafeDir = -e.strafeDir; }
}

/** Move by (mx, my) with world collision, never into the player. Returns true if blocked. */
function moveBy(game, e, mx, my, target) {
  if (target) {
    const minD = (e.radius || 0.3) + (target.radius || 0.27) + 0.06;
    const nd = Math.hypot(target.x - (e.x + mx), target.y - (e.y + my));
    if (nd < minD && nd < Math.hypot(target.x - e.x, target.y - e.y)) return true;
  }
  const ox = e.x, oy = e.y;
  let hit = false;
  const w = game.world;
  if (w) { try { hit = w.tryMove(e, mx, my, true).hit; } catch { e.x += mx; e.y += my; } }
  else { e.x += mx; e.y += my; }
  e.moveX += e.x - ox; e.moveY += e.y - oy;
  e.walk += Math.hypot(e.x - ox, e.y - oy);
  return hit;
}

function goalCell(game, e, target) {
  const w = game.world;
  const pcx = Math.floor(target.x), pcy = Math.floor(target.y);
  if (!e.flank) return [pcx, pcy];
  const d = Math.hypot(target.x - e.x, target.y - e.y);
  if (e.flankT <= 0) {
    e.flankT = 1.2;
    e.flankGoal = null;
    if (d > 2.5) {
      const ux = (target.x - e.x) / d, uy = (target.y - e.y) / d;
      const px = -uy * e.flank, py = ux * e.flank;
      const pfield = w.distField(pcx, pcy);
      for (const k of [3, 2]) {
        const cx = Math.floor(target.x + px * k + ux), cy = Math.floor(target.y + py * k + uy);
        if (!w.inBounds(cx, cy) || w.blocksMove(cx, cy, true)) continue;
        const v = pfield[cy * w.w + cx];
        if (v !== UNREACH && v <= k + 3) { e.flankGoal = [cx, cy]; break; }
      }
    }
  }
  const g = e.flankGoal;
  if (!g) return [pcx, pcy];
  if (Math.hypot(g[0] + 0.5 - e.x, g[1] + 0.5 - e.y) < 1.2) { e.flankGoal = null; return [pcx, pcy]; }
  return g;
}

function moveFlow(game, e, dt, target, speed) {
  const w = game.world;
  const step = speed * dt;
  if (!w) {   // no world: walk straight at the target
    const dx = target.x - e.x, dy = target.y - e.y, d = Math.hypot(dx, dy) || 1;
    e.angle = Math.atan2(dy, dx);
    moveBy(game, e, (dx / d) * step, (dy / d) * step, target);
    return;
  }
  if (e.sideT > 0) {   // unsticking sidestep
    e.sideT -= dt;
    const a = e.angle + (Math.PI / 2) * e.sideDir;
    moveBy(game, e, Math.cos(a) * step, Math.sin(a) * step, target);
    return;
  }
  const [gx, gy] = goalCell(game, e, target);
  const field = w.distField(gx, gy);
  const cx = Math.floor(e.x), cy = Math.floor(e.y);
  e.wpT -= dt;
  const atWp = e.wp && cx === e.wp.cx && cy === e.wp.cy && Math.hypot(e.wp.cx + 0.5 - e.x, e.wp.cy + 0.5 - e.y) < 0.3;
  if (!e.wp || atWp || e.wpT <= 0) { e.wp = pickNext(game, e, field, cx, cy); e.wpT = 0.5; }
  let tx, ty;
  if (e.wp) {
    // doors: open unlocked ones and wait for them
    const di = w.doorAt[e.wp.cy * w.w + e.wp.cx];
    if (di >= 0) {
      const door = w.doors[di];
      if (door.open < 0.8) {
        if (!door.lock && (door.state === 'closed' || door.state === 'closing')) w.openDoor(door);
        tx = cx + 0.5; ty = cy + 0.5;   // line up in front of the door
        const dd = Math.hypot(tx - e.x, ty - e.y);
        faceToward(e, door.cx + 0.5, door.cy + 0.5, dt);
        if (dd > 0.05) moveBy(game, e, ((tx - e.x) / dd) * Math.min(step, dd), ((ty - e.y) / dd) * Math.min(step, dd), target);
        return;
      }
    }
    tx = e.wp.cx + 0.5; ty = e.wp.cy + 0.5;
  } else if (gx === Math.floor(target.x) && gy === Math.floor(target.y)) {
    tx = target.x; ty = target.y;   // same cell as the player (or no route): go straight for them
  } else { tx = gx + 0.5; ty = gy + 0.5; }
  const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
  if (d < 1e-4) return;
  const s = Math.min(step, d);
  e.angle = Math.atan2(dy, dx);
  const ox = e.x, oy = e.y;
  const blocked = moveBy(game, e, (dx / d) * s, (dy / d) * s, target);
  const moved = Math.hypot(e.x - ox, e.y - oy);
  const nearTarget = Math.hypot(target.x - e.x, target.y - e.y) < (e.radius + (target.radius || 0.27) + 0.2);
  if (!nearTarget && (blocked || moved < s * 0.25)) e.stuckT += dt; else e.stuckT = Math.max(0, e.stuckT - dt);
  if (e.stuckT > 0.5) { e.stuckT = 0; e.wp = null; e.sideT = 0.35; e.sideDir = rngOf(game).chance(0.5) ? 1 : -1; }
}

function pickNext(game, e, field, cx, cy) {
  const w = game.world;
  if (!w.inBounds(cx, cy)) return null;
  const cur = field[cy * w.w + cx];
  if (cur === 0) return null;
  let best = null, bestScore = Infinity;
  for (let k = 0; k < 8; k++) {
    const [ox, oy] = NB[k];
    const nx = cx + ox, ny = cy + oy;
    if (!w.inBounds(nx, ny)) continue;
    const v = field[ny * w.w + nx];
    if (v === UNREACH || (cur !== UNREACH && v >= cur)) continue;
    const diag = ox && oy;
    if (diag && (field[cy * w.w + nx] === UNREACH || field[ny * w.w + cx] === UNREACH)) continue;
    let score = v * 2 + (diag ? 1 : 0);
    for (const o of game.enemies) {   // spread out: avoid cells friends occupy or head for
      if (o === e || !living(o)) continue;
      if ((Math.floor(o.x) === nx && Math.floor(o.y) === ny) || (o.wp && o.wp.cx === nx && o.wp.cy === ny)) score += 1.6;
    }
    if (score < bestScore) { bestScore = score; best = { cx: nx, cy: ny }; }
  }
  return best;
}

function patrolStep(game, e, dt) {
  const w = game.world;
  if (!w) return;
  const step = e.def.speed * PATROL_MUL * dt;
  const cx = Math.floor(e.x), cy = Math.floor(e.y), ci = cy * w.w + cx;
  if (ci !== e.pcell) { e.pcell = ci; e.pdecided = false; }
  let [dx, dy] = DIRS[e.pdir];
  const along = (e.x - (cx + 0.5)) * dx + (e.y - (cy + 0.5)) * dy;   // ≥ 0 once past the centre
  const turn = () => {
    const rng = rngOf(game);
    const lr = rng.chance(0.5) ? [1, 3] : [3, 1];
    for (const k of [...lr, 2]) {
      const nd = (e.pdir + k) % 4;
      if (!w.blocksMove(cx + DIRS[nd][0], cy + DIRS[nd][1], true)) { e.pdir = nd; return true; }
    }
    return false;
  };
  if (!e.pdecided && along >= -0.02) {
    e.pdecided = true;
    if (w.blocksMove(cx + dx, cy + dy, true)) turn();
    [dx, dy] = DIRS[e.pdir];
  }
  // a door ahead: open it, wait until it is passable
  const ax = cx + dx, ay = cy + dy;
  if (w.inBounds(ax, ay)) {
    const di = w.doorAt[ay * w.w + ax];
    if (di >= 0 && w.doors[di].open < 0.8 && along >= -0.05) {
      const door = w.doors[di];
      if (!door.lock) { if (door.state === 'closed' || door.state === 'closing') w.openDoor(door); }
      else turn();
      return;
    }
  }
  e.angle = e.pdir * Math.PI / 2;
  // move along the direction, easing sideways onto the cell centre line
  const lat = dx ? cy + 0.5 - e.y : cx + 0.5 - e.x;
  const corr = clamp(lat, -step, step);
  const blocked = moveBy(game, e, dx * step + (dx ? 0 : corr), dy * step + (dy ? 0 : corr), game.player);
  if (blocked && along >= -0.3) { e.pdecided = false; turn(); }
}

function startAttack(game, e, a, target) {
  e.state = 'attack'; e.t = 0;
  e.atk = a; e.fired = false; e.shotsLeft = a.shots || 1; e.shotT = 0;
  e.angle = Math.atan2(target.y - e.y, target.x - e.x);
}

function attack(game, e, dt, target, st) {
  const a = e.atk || attackSpec(e);
  if (target) faceToward(e, target.x, target.y, dt, 6);
  if (!e.fired) {
    // wind-up (telegraph): aim frame + rising glow; melee lunges in during the last part
    if (a.kind === 'melee' && target && e.t > a.windup * 0.4) {
      const dx = target.x - e.x, dy = target.y - e.y, d = Math.hypot(dx, dy) || 1;
      moveBy(game, e, (dx / d) * speedOf(e) * 0.8 * dt, (dy / d) * speedOf(e) * 0.8 * dt, target);
    }
    if (e.t < a.windup) return;
    const los = target && canSee(game, e, target, true);
    if (!target || (!los && a.kind !== 'melee')) { endAttack(game, e, 0.35); return; }   // lost you: no shot
    e.fired = true; e.shotT = 0;
    fire(game, e, a, target, st);
    return;
  }
  e.shotT += dt;
  if (e.shotsLeft > 0) {
    if (e.shotT >= (a.gap || 0.1)) {
      if (!target || !canSee(game, e, target, true)) { e.shotsLeft = 0; e.shotT = 0; return; }
      e.shotT = 0;
      fire(game, e, a, target, st);
    }
    return;
  }
  if (e.shotT >= 0.3) endAttack(game, e);
}

function endAttack(game, e, cd) {
  const a = e.atk || e.def.attack;
  const rng = rngOf(game);
  e.cooldown = cd ?? rng.range(a.cooldown[0], a.cooldown[1]) * (skillOf(game).reaction || 1);
  e.atkCount++;
  e.atk = null; e.fired = false;
  e.state = 'chase'; e.t = 0; e.wp = null;
}

function fire(game, e, a, target, st) {
  const rng = rngOf(game);
  e.shotsLeft--;
  e.muzzleT = 0.1;
  const dx = target.x - e.x, dy = target.y - e.y, d = Math.hypot(dx, dy);
  const ang = Math.atan2(dy, dx);
  const handH = e.def.size * 0.55;
  if (a.kind === 'melee') {
    emit(game, 'sfx', { name: e.def.sfx.fire, x: e.x, y: e.y });
    if (d <= a.range + (target.radius || 0.27)) hurtPlayer(game, rng.int(a.dmg[0], a.dmg[1]), e.x, e.y);
    return;
  }
  emit(game, 'sfx', { name: e.def.sfx.fire, x: e.x, y: e.y });
  const mo = e.radius + 0.12;
  spawnFx(game, 'muzzle', e.x + Math.cos(ang) * mo, e.y + Math.sin(ang) * mo, handH, { size: 0.35 * e.def.size, life: 0.08, light: [2.4, 1.7, 0.7, 2.5] });
  if (a.kind === 'projectile') {
    const n = a.volley || 1, spread = ((a.spreadDeg || 0) * Math.PI) / 180;
    const w = game.world;
    for (let i = 0; i < n; i++) {
      const pa = ang + (i - (n - 1) / 2) * spread;
      let sx = e.x + Math.cos(pa) * (e.radius + 0.15), sy = e.y + Math.sin(pa) * (e.radius + 0.15);
      if (w && w.isSolid(Math.floor(sx), Math.floor(sy))) { sx = e.x; sy = e.y; }
      const p = spawnProjectile(game, a.projectile, sx, sy, handH + 0.05, pa, e);
      if (p && a.speedMul) { p.vx *= a.speedMul; p.vy *= a.speedMul; }
    }
  } else {   // hitscan
    if (rng.chance(hitChance(d, st.pSpeed))) {
      const dmg = rng.int(a.dmg[0], a.dmg[1]) * (d < 1.5 ? 1.25 : 1);
      hurtPlayer(game, Math.round(dmg), e.x, e.y);
    } else {
      // near miss: a spark where the bullet hits the wall behind you
      const err = (rng.chance(0.5) ? 1 : -1) * rng.range(0.05, 0.16);
      const w = game.world;
      if (w) {
        const r = w.castRay(e.x, e.y, Math.cos(ang + err), Math.sin(ang + err), a.range + 4);
        if (r.hit) {
          spawnFx(game, 'spark', r.x - Math.cos(ang + err) * 0.04, r.y - Math.sin(ang + err) * 0.04, rng.range(0.25, 0.65), { size: 0.2, light: [1.4, 1.0, 0.5, 1.0] });
          if (rng.chance(0.35)) emit(game, 'sfx', { name: 'ricochet', x: r.x, y: r.y, vol: 0.6 });
        }
      }
    }
  }
  makeNoise(game, e.x, e.y, GUNFIRE_RANGE, e);
}

function separate(game) {
  const list = game.enemies;
  const n = list.length;
  for (let i = 0; i < n; i++) {
    const a = list[i];
    if (!living(a)) continue;
    for (let j = i + 1; j < n; j++) {
      const b = list[j];
      if (!living(b)) continue;
      const dx = b.x - a.x, dy = b.y - a.y, min = a.radius + b.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || 1e-3;
      const push = (min - d) * 0.5;
      const ux = d2 > 1e-9 ? dx / d : 1, uy = d2 > 1e-9 ? dy / d : 0;
      const w = game.world;
      if (w) { w.tryMove(a, -ux * push, -uy * push, true); w.tryMove(b, ux * push, uy * push, true); }
      else { a.x -= ux * push; a.y -= uy * push; b.x += ux * push; b.y += uy * push; }
    }
  }
}

function updateSprite(game, e, dt, target) {
  const anims = e.def.anims;
  let anim = 'idle', f = 0;
  const moving = Math.hypot(e.moveX, e.moveY) > 1e-5;
  switch (e.state) {
    case 'stand': f = Math.floor(e.t * 2); break;
    case 'patrol': case 'chase':
      if (moving) { anim = 'walk'; f = Math.floor(e.walk * 4); }
      else f = Math.floor(e.t * 2);
      break;
    case 'attack': {
      anim = 'attack';
      if (anims.attack <= 2) f = e.fired ? 1 : 0;
      else f = !e.fired ? 0 : e.muzzleT > 0 ? 1 : 2;
      break;
    }
    case 'pain': anim = 'pain'; break;
    case 'stun': anim = Math.floor(e.t * 3) % 2 ? 'pain' : 'idle'; break;
    case 'die': anim = 'die'; f = Math.min(anims.die - 1, Math.floor((e.t / DIE_TIME) * anims.die)); break;
    case 'dead': anim = 'dead'; break;
  }
  const s = e.spr;
  s.frame = spriteLayer(game, `${e.type}.${anim}`, f % (anims[anim] || 1));
  s.size = e.def.size; s.h = 0; s.alpha = 1;
  let glow = 0;
  if (e.muzzleT > 0) glow = 0.9;
  else if (e.state === 'attack' && !e.fired && e.atk) glow = 0.35 * clamp(e.t / e.atk.windup, 0, 1);
  if (e.hitT > 0) glow = Math.max(glow, 0.45);
  if (e.type === 'boss' && e.phase === 2 && living(e)) glow = Math.max(glow, 0.15 + 0.1 * Math.sin(e.t * 9));
  s.glow = glow;
  if (e.state === 'stun') s.flipX = Math.floor(e.t * 3) % 2 === 1;
  else if (moving && target) {
    // flip so the sprite seems to walk the way it moves on screen (cross of view dir and motion)
    const vx = e.x - target.x, vy = e.y - target.y;
    const cr = vx * e.moveY - vy * e.moveX;
    if (Math.abs(cr) > 1e-6) s.flipX = cr < 0;
  } else if (e.state === 'die' || e.state === 'dead') { /* keep */ }
}
