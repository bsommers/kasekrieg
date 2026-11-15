// KÄSEKRIEG game orchestration: level loading (things layer), the per-tick update order, status, and the
// sim → renderer scene (culling, light flicker, dynamic lights, viewLight).
// Contract: ARCHITECTURE.md §8.3 and §8.6. Pure sim code: no DOM, randomness from game.rng only.
//
// enemies.js / projectiles.js / effects.js are written by another agent; they are imported dynamically inside
// try/catch (top-level await) and every call goes through `game.sys`, which falls back to small built-in
// stand-ins so the game always boots even if one of those files is missing or broken.

import { THINGS, ENEMIES, DECOR, ITEMS, SKILLS, VIEW, LIMITS, SKY, CELL } from '../core/defs.js';
import { createBus } from '../core/events.js';
import { createRng } from '../core/rng.js';
import { createWorld } from './world.js';
import { createPlayer, placePlayer, updatePlayer, damagePlayer, snapshotPlayer, resetTransient } from './player.js';
import { fireWeapon, MUZZLE_T } from './weapons.js';
import { spawnPickup, dropItem, giveItem, healPlayer, updateItems, makeDecor, spriteLayer } from './items.js';

async function tryImport(path) {
  try { return await import(path); } catch (e) { return { __error: e }; }
}
const ENM = await tryImport('./enemies.js');
const PRJ = await tryImport('./projectiles.js');
const EFX = await tryImport('./effects.js');
/** Which sibling modules loaded (for tests/diagnostics). */
export const moduleStatus = {
  enemies: ENM.__error ? String(ENM.__error.message || ENM.__error) : 'ok',
  projectiles: PRJ.__error ? String(PRJ.__error.message || PRJ.__error) : 'ok',
  effects: EFX.__error ? String(EFX.__error.message || EFX.__error) : 'ok',
};

export const SPRITE_CULL_DIST = 26;     // cells
export const LIGHT_RADIUS_SCALE = 1.4;  // level/pickup light things: radius multiplier (def radii are tight; see docs/swarm/LIGHTING.md)
export const LIGHT_GAIN = 1.0;          // level/pickup light things: intensity multiplier
export const LIGHT_CULL_PAD = 16;       // cells beyond a light's radius before it is dropped
const fn = (mod, name) => (mod && typeof mod[name] === 'function' ? mod[name] : null);
const emitOn = (game, type, payload) => { try { game.bus.emit(type, payload); } catch { /* ignore */ } };
const alive = (e) => e && e.state !== 'dead' && e.state !== 'die' && !(e.hp <= 0);

// ───────────── fallbacks (only used when a sibling module is missing) ─────────────
const fallback = {
  spawnEnemy(game, type, x, y, opts = {}) {
    const def = ENEMIES[type];
    if (!def) return null;
    const hpMul = (SKILLS[game.skill | 0] || SKILLS[1]).enemyHp;
    const e = { type, def, x, y, angle: opts.angle || 0, radius: def.radius, hp: def.hp * hpMul, state: 'stand', t: 0, alerted: false,
      spr: { frame: spriteLayer(game, `${type}.idle`), size: def.size, h: 0, flipX: false, glow: 0, alpha: 1 } };
    game.enemies.push(e);
    return e;
  },
  updateEnemies() {},
  damageEnemy(game, e, amount) {
    if (!alive(e)) return;
    e.hp -= amount;
    if (e.hp <= 0) {
      e.state = 'dead'; e.spr.frame = spriteLayer(game, `${e.type}.dead`);
      emitOn(game, 'kill', { type: e.type });
      game.stats.kills++;
      if (game.player) game.player.score += e.def.score || 0;
      if (e.def.drop) dropItem(game, e.def.drop, e.x, e.y);
    }
  },
  pickEnemyOnRay(game, x, y, dx, dy, maxDist) {
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    let lim = maxDist;
    if (game.world) { const r = game.world.castRay(x, y, dx, dy, maxDist); if (r.hit) lim = r.dist; }
    let best = null;
    for (const e of game.enemies) {
      if (!alive(e)) continue;
      const ex = e.x - x, ey = e.y - y, t = ex * dx + ey * dy;
      if (t < 0 || t > lim) continue;
      const px = ex - dx * t, py = ey - dy * t;
      if (px * px + py * py > e.radius * e.radius * 1.4) continue;
      if (!best || t < best.dist) best = { enemy: e, dist: t };
    }
    return best;
  },
  enemiesInRadius(game, x, y, r) { return game.enemies.filter((e) => alive(e) && Math.hypot(e.x - x, e.y - y) <= r + (e.radius || 0)); },
  makeNoise() {},
  spawnProjectile() { return null; },
  updateProjectiles() {},
  spawnFx(game, name, x, y, h = 0.5, opts = {}) {
    const fx = { name, x, y, h, t: 0, life: opts.life || 0.25, light: null,
      spr: { frame: spriteLayer(game, `fx.${name}`), size: opts.size || 0.4, h: Math.max(0, h - (opts.size || 0.4) / 2), flipX: false, glow: 1, alpha: 1 } };
    game.effects.push(fx);
    return fx;
  },
  updateEffects(game, dt) {
    game.effects = game.effects.filter((f) => (f.t += dt) < f.life);
    game.beams = game.beams.filter((b) => (b.t = (b.t || 0) + dt) < (b.life || 0.05));
  },
  addBeam(game, b) { game.beams.push({ t: 0, ...b }); while (game.beams.length > LIMITS.BEAMS) game.beams.shift(); return b; },
};

function buildSys() {
  const pick = (mod, name) => fn(mod, name) || fallback[name];
  return {
    spawnEnemy: pick(ENM, 'spawnEnemy'), updateEnemies: pick(ENM, 'updateEnemies'), damageEnemy: pick(ENM, 'damageEnemy'),
    pickEnemyOnRay: pick(ENM, 'pickEnemyOnRay'), enemiesInRadius: pick(ENM, 'enemiesInRadius'), makeNoise: pick(ENM, 'makeNoise'),
    spawnProjectile: pick(PRJ, 'spawnProjectile'), updateProjectiles: pick(PRJ, 'updateProjectiles'),
    spawnFx: pick(EFX, 'spawnFx'), updateEffects: pick(EFX, 'updateEffects'), addBeam: pick(EFX, 'addBeam'),
    damagePlayer, healPlayer, giveItem, fireWeapon, spawnPickup, dropItem,
  };
}

// ───────────── helpers ─────────────
/** Angle towards the longest straight run of open cells from (cx, cy) — guards face down corridors. */
export function longestRunAngle(world, cx, cy) {
  const dirs = [[1, 0, 0], [0, 1, Math.PI / 2], [-1, 0, Math.PI], [0, -1, -Math.PI / 2]];
  let best = 0, bestA = 0;
  for (const [dx, dy, a] of dirs) {
    let n = 0;
    for (let k = 1; k < 64; k++) {
      const x = cx + dx * k, y = cy + dy * k;
      if (!world.inBounds(x, y) || world.isSolid(x, y)) break;
      const c = world.cells[world.idx(x, y)];
      if (c === CELL.DOOR) { n += 0.5; break; }
      n++;
    }
    if (n > best) { best = n; bestA = a; }
  }
  return bestA;
}

function hash1(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
/** Light flicker multiplier for amount f (0..1) at time t; phase de-syncs lights. f ≥ 0.99 = rotating beacon. */
export function flicker(f, t, phase) {
  if (!(f > 0)) return 1;
  if (f >= 0.99) { const s = Math.max(0, Math.sin(t * Math.PI * 3 + phase * 6.283)); return 0.12 + 0.88 * s * s; }
  const n = 0.45 * Math.sin(t * 11.3 + phase * 41) + 0.3 * Math.sin(t * 23.9 + phase * 17) + 0.25 * (hash1(Math.floor(t * 14) + phase * 977) * 2 - 1);
  return Math.max(0, 1 - f * (0.55 + 0.45 * n));
}

const lightOf = (l, x, y, hDefault) => {
  if (!l) return null;
  if (Array.isArray(l)) return { x, y, h: hDefault, r: +l[0] || 0, g: +l[1] || 0, b: +l[2] || 0, radius: +l[3] || 2 };
  if (typeof l === 'object') return { x: Number.isFinite(l.x) ? l.x : x, y: Number.isFinite(l.y) ? l.y : y, h: Number.isFinite(l.h) ? l.h : hDefault, r: +l.r || 0, g: +l.g || 0, b: +l.b || 0, radius: +l.radius || 2 };
  return null;
};

// ───────────── game ─────────────
export function createGame({ atlas = null, levels = [], bus = null, rng = null, skill = 1 } = {}) {
  const game = {
    bus: bus || createBus(), rng: rng || createRng(1), atlas, levels, skill: Number.isFinite(skill) ? Math.max(0, Math.min(SKILLS.length - 1, skill | 0)) : 1,
    time: 0, tick: 0,
    levelIndex: 0, world: null, player: createPlayer(),
    enemies: [], projectiles: [], pickups: [], decor: [], effects: [], lights: [], beams: [],
    stats: { kills: 0, killsTotal: 0, treasure: 0, treasureTotal: 0, secrets: 0, secretsTotal: 0, time: 0, par: 0 },
    status: 'playing',
    cheats: { god: false, noclip: false, noTarget: false },
    sys: buildSys(),
    scene: null, viewLight: [1, 1, 1],
    hasSky: false, hasExit: true, bossDeadT: -1,
    loadLevel, update, buildScene,
  };

  // bus bookkeeping: kills, secrets, boss
  // kills / score are counted by enemies.js (killEnemy) — or by the fallback damageEnemy below — not here.
  game._hooks = { damagePlayer };   // enemies.js hurtPlayer() prefers this hook (no lazy-import race)
  game.bus.on('secret', () => {
    game.stats.secrets = game.world ? game.world.secretsFound : game.stats.secrets + 1;
    emitOn(game, 'sfx', { name: 'secret_found' });
    emitOn(game, 'msg', { text: 'You found a secret!', kind: 'secret' });
  });
  game.bus.on('bossDied', () => { if (game.bossDeadT < 0) game.bossDeadT = 0; });

  function loadLevel(index = 0, { keepPlayer = false } = {}) {
    const n = Math.max(1, game.levels.length);
    index = Math.max(0, Math.min(n - 1, index | 0));
    const def = game.levels[index] || game.levels[0] || null;
    game.levelIndex = index;
    game.world = createWorld(def, game.atlas, game.bus);
    game.enemies = []; game.projectiles = []; game.pickups = []; game.decor = []; game.effects = []; game.lights = []; game.beams = [];
    game.time = 0; game.tick = 0; game.bossDeadT = -1;

    // player
    let p = game.player;
    if (!keepPlayer || !p) p = game.player = createPlayer();
    else if (p.dead || p.health <= 0) {            // restart after a death: back to the level-start loadout
      const s = p.levelStart || snapshotPlayer(createPlayer());
      p.score = s.score; p.ammo = { ...s.ammo }; p.owned = [...s.owned]; p.weapon = s.weapon;
      p.health = 100;
    }
    resetTransient(p);
    if (!p.owned[p.weapon]) p.weapon = 1;
    p.levelStart = snapshotPlayer(p);

    const W = game.world;
    const stats = game.stats = { kills: 0, killsTotal: 0, treasure: 0, treasureTotal: 0, secrets: 0, secretsTotal: W.secretsTotal, time: 0, par: (def && def.par) || 0 };
    let started = false;
    const rows = def && Array.isArray(def.things) ? def.things.map(String) : [];
    const guards = [];
    for (let cy = 0; cy < Math.min(rows.length, W.h); cy++) {
      const row = rows[cy];
      for (let cx = 0; cx < Math.min(row.length, W.w); cx++) {
        const ch = row[cx];
        const t = THINGS[ch];
        if (!t) continue;
        const x = cx + 0.5, y = cy + 0.5;
        if (t.kind === 'start') {
          if (!started) { placePlayer(game, x, y, t.angle); started = true; }
        } else if (t.kind === 'enemy') {
          const angle = longestRunAngle(W, cx, cy);
          let e = null;
          try { e = game.sys.spawnEnemy(game, t.type, x, y, { patrol: !!t.patrol, angle }); } catch (err) { e = null; }
          if (e) {
            if (!game.enemies.includes(e)) game.enemies.push(e);
            e.angle = angle;
            guards.push(e);
          }
        } else if (t.kind === 'item') {
          const it = spawnPickup(game, t.id, x, y);
          if (it && ITEMS[t.id].treasure) stats.treasureTotal++;
        } else if (t.kind === 'decor') {
          const d = makeDecor(game, t.id, x, y);
          if (!d) continue;
          game.decor.push(d);
          if (DECOR[t.id].block) W.setBlocker(cx, cy, true);
          const L = DECOR[t.id].light;
          if (L) game.lights.push({ x, y, h: L[4], r: L[0], g: L[1], b: L[2], radius: L[3], flicker: L[5] || 0, phase: hash1(cx * 31 + cy * 17), src: d });
        } else if (t.kind === 'light') {
          const L = t.light;
          game.lights.push({ x, y, h: L[4], r: L[0], g: L[1], b: L[2], radius: L[3], flicker: L[5] || 0, phase: hash1(cx * 13 + cy * 7) });
        }
      }
    }
    if (!started) {   // no start marker: first open cell
      outer: for (let cy = 1; cy < W.h - 1; cy++) for (let cx = 1; cx < W.w - 1; cx++) {
        if (!W.blocksMove(cx, cy)) { placePlayer(game, cx + 0.5, cy + 0.5, 0); break outer; }
      }
    }
    stats.killsTotal = game.enemies.length;
    // sky / exit
    game.hasSky = false;
    for (let i = 0; i < W.ceilTex.length; i++) if (W.ceilTex[i] === SKY && W.cells[i] !== CELL.WALL) { game.hasSky = true; break; }
    game.hasExit = false;
    for (let i = 0; i < W.cells.length; i++) if (W.cells[i] === CELL.EXIT) { game.hasExit = true; break; }
    game.status = 'playing';
    game.scene = null;
    return game;
  }

  function update(dt = 1 / 60, cmd = {}) {
    if (!game.world) return;
    cmd = cmd || {};
    const st = game.status;
    if (st === 'complete' || st === 'victory') return;
    const S = game.sys;
    if (st === 'dead') {        // keep the world alive behind the death screen
      game.time += dt;
      updatePlayer(game, dt, {});
      safe(() => game.world.update(dt, game));
      safe(() => S.updateEnemies(game, dt));
      safe(() => S.updateProjectiles(game, dt));
      safe(() => S.updateEffects(game, dt));
      return;
    }
    game.time += dt; game.tick++;
    game.stats.time += dt;
    updatePlayer(game, dt, cmd);
    game.world.update(dt, game);
    S.updateEnemies(game, dt);
    S.updateProjectiles(game, dt);
    updateItems(game, dt);
    S.updateEffects(game, dt);
    // status checks
    game.stats.secrets = game.world.secretsFound;
    if (game.status !== 'playing') return;
    const last = game.levelIndex >= game.levels.length - 1;
    if (game.world.exitTriggered) finish(last);
    else if (game.bossDeadT >= 0) {
      game.bossDeadT += dt;
      if (!game.hasExit && game.bossDeadT > 3) finish(last);
    }
  }
  function finish(last) {
    game.status = last ? 'victory' : 'complete';
    const p = game.player;
    emitOn(game, 'sfx', { name: 'level_complete' });
    emitOn(game, 'levelComplete', { stats: { ...game.stats }, score: p ? p.score : 0, victory: last });
  }
  function safe(f) { try { f(); } catch { /* death-screen ticking must never throw */ } }

  // ───────────── scene ─────────────
  function buildScene(scene = {}) {
    const W = game.world, p = game.player, def = (W && W.def) || {};
    const t = game.time;
    scene.time = t;
    const camH = p ? (Number.isFinite(p.camH) ? p.camH : VIEW.EYE) : VIEW.EYE;
    scene.cam = { x: p ? p.x : 1.5, y: p ? p.y : 1.5, h: camH, angle: p ? p.angle : 0, fov: VIEW.FOV, roll: p ? p.roll || 0 : 0 };
    scene.world = W;
    scene.ambient = Array.isArray(def.ambient) ? def.ambient.slice(0, 3) : [0.06, 0.06, 0.07];
    scene.fog = def.fog && Array.isArray(def.fog.color) ? { color: def.fog.color.slice(0, 3), density: +def.fog.density || 0 } : { color: [0.02, 0.02, 0.03], density: 0.03 };
    scene.sky = game.hasSky ? (def.sky ? { moonDir: def.sky.moonDir || [0.45, 0.8, 0.35], moonColor: def.sky.moonColor || [0.55, 0.65, 1] } : { moonDir: [0.45, 0.8, 0.35], moonColor: [0.55, 0.65, 1] }) : null;
    if (!W) { scene.sprites = []; scene.lights = []; scene.beams = []; scene.viewLight = scene.ambient.slice(); return scene; }

    const cx = scene.cam.x, cy = scene.cam.y, fx = Math.cos(scene.cam.angle), fy = Math.sin(scene.cam.angle);
    const halfCos = Math.cos(Math.min(Math.PI * 0.49, (scene.cam.fov || VIEW.FOV) * 0.5 + 0.25));
    const losCache = new Map();
    const los = (x, y) => {
      const k = (Math.floor(y) * W.w + Math.floor(x));
      let v = losCache.get(k);
      if (v === undefined) { v = W.hasLOS(cx, cy, Math.floor(x) + 0.5, Math.floor(y) + 0.5) || W.hasLOS(cx, cy, x, y); losCache.set(k, v); }
      return v;
    };
    // visibility score: lower = more important. Things behind walls / the camera stay (shadows, reflections) but rank last.
    const rank = (x, y, pad) => {
      const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
      if (d < 1.5) return d;
      const inFront = (dx * fx + dy * fy) / d > halfCos - pad / d;
      const seen = los(x, y);
      return d + (inFront ? 0 : 6) + (seen ? 0 : 14);
    };

    // sprites
    const cand = [];
    const addSpr = (e, x, y) => {
      const s = e.spr;
      if (!s || !(s.alpha > 0 || s.alpha === undefined)) return;
      const d = Math.hypot(x - cx, y - cy);
      if (d > SPRITE_CULL_DIST) return;
      cand.push({ r: rank(x, y, s.size || 1), x, y, h: s.h || 0, size: s.size || 1, frame: s.frame | 0, flipX: !!s.flipX, glow: s.glow || 0, alpha: s.alpha === undefined ? 1 : s.alpha });
    };
    for (const e of game.enemies) if (e && e.spr && !e.hidden) addSpr(e, e.x, e.y);
    for (const it of game.pickups) addSpr(it, it.x, it.y);
    for (const d of game.decor) addSpr(d, d.x, d.y);
    for (const pr of game.projectiles) if (pr && pr.spr && !pr.dead) addSpr(pr, pr.x, pr.y);
    for (const ef of game.effects) if (ef && ef.spr && !ef.dead && Math.hypot(ef.x - cx, ef.y - cy) > 0.3) addSpr(ef, ef.x, ef.y);   // never fill the screen with an fx
    cand.sort((a, b) => a.r - b.r);
    if (cand.length > LIMITS.SPRITES) cand.length = LIMITS.SPRITES;
    scene.sprites = cand.map((c) => ({ x: c.x, y: c.y, h: c.h, size: c.size, frame: c.frame, flipX: c.flipX, glow: c.glow, alpha: c.alpha }));

    // lights
    const lc = [];
    const addLight = (L, boost = 0) => {
      if (!L || !(L.radius > 0)) return;
      const lum = L.r * 0.3 + L.g * 0.55 + L.b * 0.15;
      if (!(lum > 0.01)) return;
      const d = Math.hypot(L.x - cx, L.y - cy);
      if (d > L.radius + LIGHT_CULL_PAD) return;
      const seen = d < L.radius + 1 || los(L.x, L.y);
      const score = d - L.radius * 0.6 - Math.min(2, lum) * 0.8 - boost + (seen ? 0 : 10);
      lc.push({ score, L });
    };
    for (const l of game.lights) {
      const m = flicker(l.flicker, t, l.phase || 0);
      addLight({ x: l.x, y: l.y, h: l.h, r: l.r * m * LIGHT_GAIN, g: l.g * m * LIGHT_GAIN, b: l.b * m * LIGHT_GAIN, radius: l.radius * LIGHT_RADIUS_SCALE * (0.92 + 0.08 * m) });
    }
    for (const it of game.pickups) if (it.light) {
      const pulse = 0.85 + 0.15 * Math.sin(t * 3 + it.phase * 6.28);
      addLight({ x: it.x, y: it.y, h: it.light.h, r: it.light.r * pulse * LIGHT_GAIN, g: it.light.g * pulse * LIGHT_GAIN, b: it.light.b * pulse * LIGHT_GAIN, radius: it.light.radius * LIGHT_RADIUS_SCALE });
    }
    for (const pr of game.projectiles) if (pr && !pr.dead && pr.light) addLight(lightOf(pr.light, pr.x, pr.y, pr.h ?? 0.4), 1);
    for (const ef of game.effects) if (ef && !ef.dead && ef.light) addLight(lightOf(ef.light, ef.x, ef.y, ef.h ?? 0.5), 0.5);
    for (const e of game.enemies) if (e && e.light) addLight(lightOf(e.light, e.x, e.y, 0.5), 1);
    if (p && !p.dead) {
      if (p.flashT > 0) {   // muzzle flash: in front of the gun, a touch to the right
        const k = (p.flashT / MUZZLE_T) * (p.flashI || 1);
        addLight({ x: p.x + fx * 0.45, y: p.y + fy * 0.45, h: VIEW.EYE - 0.06, r: 3.2 * k, g: 2.2 * k, b: 0.9 * k, radius: 4.5 }, 4);
      }
      if (p.laserDot) addLight({ x: p.laserDot.x, y: p.laserDot.y, h: p.laserDot.h, r: 2.4, g: 0.12, b: 0.08, radius: 1.6 }, 3);
      // faint "cat-eye" fill so pitch-dark corners never go fully black around the player
      addLight({ x: p.x, y: p.y, h: VIEW.EYE + 0.15, r: 0.1, g: 0.09, b: 0.08, radius: 2.2 }, -6);
    }
    lc.sort((a, b) => a.score - b.score);
    if (lc.length > LIMITS.LIGHTS) lc.length = LIMITS.LIGHTS;
    scene.lights = lc.map(({ L }) => ({ x: L.x, y: L.y, h: L.h, r: L.r, g: L.g, b: L.b, radius: L.radius }));

    // beams
    scene.beams = (game.beams || []).slice(-LIMITS.BEAMS).map((b) => ({ x0: b.x0, y0: b.y0, h0: b.h0, x1: b.x1, y1: b.y1, h1: b.h1, r: b.r, g: b.g, b: b.b, width: b.width }));

    // viewLight: ambient + unshadowed-by-walls contribution of each light at the player's eye
    const vl = scene.ambient.map((v) => v * 2.2);
    for (const L of scene.lights) {
      const d = Math.hypot(L.x - cx, L.y - cy, (L.h ?? 0.5) - camH);
      if (d >= L.radius) continue;
      if (d > 0.7 && !W.hasLOS(cx, cy, L.x, L.y)) continue;
      const f = (1 - d / L.radius) ** 2;
      vl[0] += L.r * f; vl[1] += L.g * f; vl[2] += L.b * f;
    }
    if (scene.sky) { const m = scene.sky.moonColor; const open = W.ceilTex[W.idx(Math.floor(cx), Math.floor(cy))] === SKY; if (open) { vl[0] += m[0] * 0.25; vl[1] += m[1] * 0.25; vl[2] += m[2] * 0.25; } }
    scene.viewLight = vl.map((v) => Math.min(1.6, Math.max(0.12, v)));
    game.scene = scene;
    game.viewLight = scene.viewLight;
    return scene;
  }

  return game;
}

export default createGame;
