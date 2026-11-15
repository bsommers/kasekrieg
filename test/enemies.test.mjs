// sim-enemies tests: enemy AI, projectiles, effects. Uses a minimal fake `game` and the real world.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/events.js';
import { createRng } from '../src/core/rng.js';
import { ENEMIES, FX } from '../src/core/defs.js';
import {
  spawnEnemy, updateEnemies, damageEnemy, pickEnemyOnRay, enemiesInRadius, makeNoise, hitChance, enemiesReady, DIE_TIME,
} from '../src/sim/enemies.js';
import { spawnProjectile, updateProjectiles } from '../src/sim/projectiles.js';
import { spawnFx, updateEffects, addBeam } from '../src/sim/effects.js';

let createWorld = null;
try { ({ createWorld } = await import('../src/sim/world.js')); } catch { /* world.js missing: tests needing it skip */ }
await enemiesReady;

const DT = 1 / 60;
const ROOM = [
  '############',
  '#..........#',
  '#..........#',
  '#..........#',
  '#..........#',
  '#..........#',
  '############',
];
const TWO_ROOMS = [
  '##########',
  '#....#...#',
  '#....+...#',
  '#....#...#',
  '##########',
];
const PILLAR = [
  '##########',
  '#........#',
  '#...#....#',
  '#........#',
  '##########',
];

function makeGame(map, { seed = 1, skill = 2, px = 1.5, py = 1.5, pangle = 0 } = {}) {
  const bus = createBus();
  const events = [];
  bus.on('*', (type, payload) => events.push({ type, payload }));
  const world = createWorld({ map }, null, bus);
  const game = {
    bus, rng: createRng(seed), skill, time: 0, tick: 0, atlas: null, world, events,
    player: { x: px, y: py, angle: pangle, radius: 0.27, health: 100, lives: 9, score: 0, owned: [true, true, false, false, false], dead: false, hurtSfxT: 0 },
    enemies: [], projectiles: [], pickups: [], decor: [], effects: [], lights: [], beams: [],
    stats: { kills: 0, killsTotal: 0, treasure: 0, treasureTotal: 0 }, status: 'playing', cheats: { god: false, noclip: false, noTarget: false },
  };
  return game;
}
function step(game, seconds, each) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    game.world.update(DT, game);
    updateEnemies(game, DT);
    updateProjectiles(game, DT);
    updateEffects(game, DT);
    game.time += DT; game.tick++;
    if (each && each(game) === false) return;
  }
}
const sfx = (game, name) => game.events.filter((e) => e.type === 'sfx' && e.payload.name === name);
const W = { skip: !createWorld && 'world.js not available' };

test('spawnEnemy builds a contract-shaped enemy scaled by skill', W, () => {
  const g = makeGame(ROOM, { skill: 3 });
  const e = spawnEnemy(g, 'trooper', 5.5, 3.5, { patrol: true });
  assert.equal(g.enemies.length, 1);
  assert.equal(e.type, 'trooper');
  assert.equal(e.def, ENEMIES.trooper);
  assert.equal(e.state, 'patrol');
  assert.equal(e.hp, Math.round(50 * 1.25));
  assert.equal(e.radius, ENEMIES.trooper.radius);
  for (const k of ['frame', 'size', 'h', 'flipX', 'glow', 'alpha']) assert.ok(k in e.spr, `spr.${k}`);
  // faces the longest open run (east: 5 cells vs west 4)
  assert.equal(e.angle, 0);
  assert.equal(spawnEnemy(g, 'nonsense', 2.5, 2.5).type, 'mouse');
});

test('guards notice the player only inside their facing cone (or when close)', W, () => {
  const g = makeGame(ROOM, { px: 2.5, py: 3.5 });
  const e = spawnEnemy(g, 'mouse', 9.5, 3.5, { angle: 0 });   // facing away (east)
  step(g, 1.5);
  assert.equal(e.alerted, false);
  assert.equal(e.state, 'stand');
  e.angle = Math.PI;   // turn to face the player
  step(g, 0.2);
  assert.equal(e.alerted, true);
  assert.ok(['chase', 'attack'].includes(e.state));
  assert.ok(sfx(g, 'mouse_alert').length === 1, 'alert sfx once');
});

test('noTarget cheat hides the player', W, () => {
  const g = makeGame(ROOM, { px: 2.5, py: 3.5 });
  g.cheats.noTarget = true;
  const e = spawnEnemy(g, 'mouse', 6.5, 3.5, { angle: Math.PI });
  step(g, 1);
  assert.equal(e.alerted, false);
});

test('attacks are telegraphed: no damage before the wind-up has elapsed', W, () => {
  for (const type of ['mouse', 'trooper', 'officer', 'sewer']) {
    for (let seed = 1; seed <= 6; seed++) {
      const g = makeGame(ROOM, { seed, px: 2.5, py: 3.5 });
      const dist = type === 'sewer' ? 0.9 : 3;
      const e = spawnEnemy(g, type, 2.5 + dist, 3.5, { angle: Math.PI });
      let attackStart = -1, firstHurt = -1;
      step(g, 4, (gg) => {
        if (e.state === 'attack' && attackStart < 0) attackStart = gg.time;
        if (gg.player.health < 100 && firstHurt < 0) { firstHurt = gg.time; return false; }
      });
      assert.ok(firstHurt > 0, `${type} seed ${seed} eventually hits`);
      assert.ok(attackStart >= 0);
      assert.ok(firstHurt - attackStart >= ENEMIES[type].attack.windup - 1e-6, `${type}: windup respected (${(firstHurt - attackStart).toFixed(3)})`);
      // reaction delay: spotted at t≈0, can't attack before the reaction time at this skill
      assert.ok(attackStart >= ENEMIES[type].reaction[0] * 0.99 - DT, `${type}: reaction delay (${attackStart.toFixed(3)})`);
    }
  }
});

test('hit chance falls with distance and with player speed', () => {
  assert.ok(hitChance(2, 0) > hitChance(8, 0));
  assert.ok(hitChance(8, 0) > hitChance(16, 0));
  assert.ok(hitChance(4, 0) > hitChance(4, 3.4));
  assert.ok(hitChance(4, 3.4) > hitChance(4, 5.6));
  for (let d = 0; d < 30; d++) { const c = hitChance(d, 6); assert.ok(c > 0 && c <= 0.95); }
});

test('hitscan accuracy is worse far away (statistical, real AI)', W, () => {
  const hits = (dist) => {
    let total = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const g = makeGame(['######################', '#....................#', '######################'], { seed, px: 1.5, py: 1.5 });
      g.cheats.god = false;
      const e = spawnEnemy(g, 'mouse', 1.5 + dist, 1.5, { angle: Math.PI });
      e.alerted = true; e.state = 'chase'; e.reactT = 0;
      let n = 0;
      g._hooks = { damagePlayer: () => { n++; return 1; } };
      step(g, 8, () => { e.x = 1.5 + dist; e.y = 1.5; });   // pin the distance
      total += n;
    }
    return total;
  };
  const near = hits(2), far = hits(15);
  assert.ok(near > far * 1.8, `near ${near} vs far ${far}`);
});

test('chasers follow the flow field through a door into another room', W, () => {
  const g = makeGame(TWO_ROOMS, { px: 1.5, py: 3.5 });
  const e = spawnEnemy(g, 'trooper', 7.5, 1.5, { alerted: true });
  const door = g.world.doors[0];
  assert.equal(door.state, 'closed');
  let opened = false;
  step(g, 8, () => { if (door.open > 0) opened = true; });
  assert.ok(opened, 'enemy opened the door');
  // a ranged trooper stops once it has you in view at its preferred distance (≈ the doorway)
  assert.ok(e.x < 5.6, `trooper came through to the doorway (x=${e.x.toFixed(2)})`);
  assert.ok(e.sees, 'and has the player in sight');
  // a melee sewer rat goes all the way
  const g2 = makeGame(TWO_ROOMS, { px: 1.5, py: 3.5 });
  const s = spawnEnemy(g2, 'sewer', 7.5, 1.5, { alerted: true });
  step(g2, 6);
  assert.ok(Math.hypot(s.x - 1.5, s.y - 3.5) < 1.3, `sewer rat reached the player (${s.x.toFixed(2)},${s.y.toFixed(2)})`);
  assert.ok(g2.player.health < 100, 'and bit');
});

test('noise travels through open cells but not closed doors', W, () => {
  const g = makeGame(TWO_ROOMS, { px: 1.5, py: 3.5 });
  const e = spawnEnemy(g, 'mouse', 7.5, 2.5, { angle: 0 });
  makeNoise(g, 2.5, 2.5, 12);
  assert.equal(e.alerted, false, 'closed door blocks the sound');
  const d = g.world.doors[0]; d.open = 1; d.state = 'open';
  makeNoise(g, 2.5, 2.5, 12);
  assert.equal(e.alerted, true);
  const far = spawnEnemy(g, 'mouse', 8.5, 1.5, { angle: 0 });
  makeNoise(g, 1.5, 1.5, 3);
  assert.equal(far.alerted, false, 'out of range');
});

test('an alerted enemy shouts and wakes friends in earshot', W, () => {
  const g = makeGame(ROOM, { px: 2.5, py: 3.5 });
  const a = spawnEnemy(g, 'mouse', 6.5, 3.5, { angle: Math.PI });
  const b = spawnEnemy(g, 'mouse', 9.5, 1.5, { angle: 0 });   // facing away
  step(g, 0.15);
  assert.equal(a.alerted, true);
  assert.equal(b.alerted, true);
});

test('patrols walk and turn at walls, then keep moving', W, () => {
  const g = makeGame(['#########', '#.......#', '#########', '#.#######', '#########'], { px: 1.5, py: 3.5 });
  const e = spawnEnemy(g, 'mouse', 1.5, 1.5, { patrol: true, angle: 0 });
  let maxX = 0, turnedBack = false;
  step(g, 14, () => { maxX = Math.max(maxX, e.x); if (maxX > 6.5 && e.x < 5) turnedBack = true; });
  assert.ok(maxX > 6.5, `walked east (max x ${maxX.toFixed(2)})`);
  assert.ok(turnedBack, 'turned around at the end');
  assert.equal(e.alerted, false);
});

test('patrols open unlocked doors on their beat', W, () => {
  const g = makeGame(['##########', '#...+....#', '##########', '#.########', '##########'], { px: 1.5, py: 3.5 });
  g.world.doors[0].vertical = true;
  const e = spawnEnemy(g, 'mouse', 1.5, 1.5, { patrol: true, angle: 0 });
  step(g, 8);
  assert.ok(e.x > 5, `passed the door (x=${e.x.toFixed(2)})`);
});

test('killing an enemy: die → dead, drop, score, stats, kill event', W, () => {
  const g = makeGame(ROOM, { px: 2.5, py: 3.5 });
  const e = spawnEnemy(g, 'trooper', 6.5, 3.5, { angle: 0 });
  assert.equal(damageEnemy(g, e, 10, { fromX: 2.5, fromY: 3.5 }), false);
  assert.equal(e.alerted, true);
  assert.equal(damageEnemy(g, e, 1000, { fromX: 2.5, fromY: 3.5 }), true);
  assert.equal(e.state, 'die');
  assert.equal(g.stats.kills, 1);
  assert.equal(g.player.score, 300);
  assert.ok(g.events.some((x) => x.type === 'kill' && x.payload.type === 'trooper'));
  assert.equal(g.pickups.length, 1);
  assert.equal(g.pickups[0].id, 'gatling', 'player lacks the gatling → drops it');
  assert.equal(damageEnemy(g, e, 10), false, 'no double kill');
  step(g, DIE_TIME + 0.1);
  assert.equal(e.state, 'dead');
  assert.equal(pickEnemyOnRay(g, 2.5, 3.5, 1, 0, 20), null, 'corpses are not targets');
  const e2 = spawnEnemy(g, 'trooper', 6.5, 2.5);
  damageEnemy(g, e2, 1000);
  assert.equal(g.pickups[1].id, g.player.owned[2] ? 'ammo_clip' : 'gatling');
});

test('laser hits mesmerise: stun state, fx.stun overhead that follows and ends', W, () => {
  const g = makeGame(ROOM, { px: 2.5, py: 3.5 });
  const e = spawnEnemy(g, 'officer', 7.5, 3.5, { angle: Math.PI });
  damageEnemy(g, e, 0.9, { stun: 0.6, fromX: 2.5, fromY: 3.5 });
  assert.equal(e.state, 'stun');
  const star = g.effects.find((f) => f.name === 'stun');
  assert.ok(star, 'fx.stun spawned');
  assert.ok(star.h > e.def.size * 0.8, 'above the head');
  // continuous laser keeps it mesmerised, and no second star appears
  for (let i = 0; i < 30; i++) { damageEnemy(g, e, 0.9, { stun: 0.6 }); step(g, DT); }
  assert.equal(e.state, 'stun');
  assert.equal(g.effects.filter((f) => f.name === 'stun').length, 1);
  e.x = 6.5; step(g, DT);
  assert.equal(star.x, 6.5, 'follows the rat');
  const hp = g.player.health;
  step(g, 0.5);
  assert.equal(g.player.health, hp, 'mesmerised rats do not shoot');
  step(g, 0.3);
  assert.notEqual(e.state, 'stun');
  assert.ok(!g.effects.includes(star), 'stars gone');
});

test('boss: phase 2 below half hp — summons sewer rats and fires cheeseball volleys', W, () => {
  const g = makeGame(['##############', '#............#', '#............#', '#............#', '#............#', '#............#', '##############'], { px: 2.5, py: 3.5 });
  g.cheats.god = true;
  const b = spawnEnemy(g, 'boss', 9.5, 3.5, { angle: Math.PI });
  assert.equal(b.hp, 1100);
  damageEnemy(g, b, 500, { noPain: true });
  assert.equal(b.phase, 1);
  damageEnemy(g, b, 60, { noPain: true });
  assert.equal(b.phase, 2);
  const minions = g.enemies.filter((e) => e.type === 'sewer');
  assert.equal(minions.length, 2);
  assert.ok(minions.every((m) => m.alerted && m.summoned));
  let maxBalls = 0;
  const spawned = new Set();
  step(g, 10, (gg) => {
    for (const p of gg.projectiles) if (p.kind === 'cheeseball') spawned.add(p);
    maxBalls = Math.max(maxBalls, gg.projectiles.filter((p) => p.kind === 'cheeseball').length);
    for (const m of gg.enemies) if (m.type === 'sewer' && m.state !== 'dead' && m.state !== 'die') damageEnemy(gg, m, 999);   // keep the arena clear
  });
  assert.ok(spawned.size >= 3, `cheeseballs fired: ${spawned.size}`);
  assert.ok(maxBalls >= 3, 'a 3-ball volley in flight');
  const sp = [...spawned][0];
  assert.ok(Math.hypot(sp.vx, sp.vy) > 5.5 * 1.25, 'volley sped up');
  // boss stun is brief and followed by immunity
  b.state = 'chase';
  damageEnemy(g, b, 1, { stun: 0.6 });
  assert.equal(b.state, 'stun');
  step(g, 0.25);
  assert.notEqual(b.state, 'stun');
  damageEnemy(g, b, 1, { stun: 0.6 });
  assert.notEqual(b.state, 'stun', 'immune right after');
  damageEnemy(g, b, 5000);
  assert.ok(g.events.some((x) => x.type === 'bossDied'));
  assert.ok(g.pickups.some((p) => p.id === 'cheese_crown'));
});

test('pickEnemyOnRay: nearest body before walls; enemiesInRadius', W, () => {
  const g = makeGame(PILLAR, { px: 1.5, py: 2.5 });
  const near = spawnEnemy(g, 'mouse', 3.5, 1.5);
  const far = spawnEnemy(g, 'mouse', 6.5, 1.5);
  const hidden = spawnEnemy(g, 'mouse', 6.5, 2.5);   // behind the pillar at (4,2)
  let r = pickEnemyOnRay(g, 1.5, 1.5, 1, 0, 20);
  assert.equal(r.enemy, near);
  assert.ok(Math.abs(r.dist - (2 - near.radius - 0.04)) < 1e-6);
  r = pickEnemyOnRay(g, 1.5, 2.5, 1, 0, 20);
  assert.equal(r, null, 'pillar blocks');
  r = pickEnemyOnRay(g, 1.5, 1.5, 1, 0, 1.5);
  assert.equal(r, null, 'max distance');
  damageEnemy(g, near, 999);
  assert.equal(pickEnemyOnRay(g, 1.5, 1.5, 1, 0, 20).enemy, far);
  const around = enemiesInRadius(g, 6.5, 2, 0.3);
  assert.deepEqual(new Set(around), new Set([far, hidden]));
  assert.equal(enemiesInRadius(g, 3.5, 1.5, 1).length, 0, 'dying enemies excluded');
});

test('cheeseball: flies, hits the player, splashes with light', W, () => {
  const g = makeGame(ROOM, { px: 2.5, py: 3.5 });
  const shooter = spawnEnemy(g, 'panzer', 8.5, 3.5);
  const p = spawnProjectile(g, 'cheeseball', 7.5, 3.5, 0.6, Math.PI, shooter);
  assert.ok(p.light && p.light.r > 0);
  assert.equal(p.vx, -5.5);
  step(g, 1.5);
  assert.equal(g.projectiles.length, 0);
  assert.ok(g.player.health < 100, `hurt (${g.player.health})`);
  assert.ok(g.events.some((e) => e.type === 'hurt'));
  assert.ok(sfx(g, 'cheese_splat').length === 1);
  assert.ok(g.events.some((e) => e.type === 'sfx' && e.payload.name === 'cheese_splat'));
});

test('enemy projectiles pass through other rats; walls stop them', W, () => {
  const g = makeGame(PILLAR, { px: 8.5, py: 3.5 });
  const shooter = spawnEnemy(g, 'panzer', 1.5, 2.5);
  const buddy = spawnEnemy(g, 'mouse', 2.5, 2.5);
  spawnProjectile(g, 'cheeseball', 1.9, 2.5, 0.6, 0, shooter);
  step(g, 1);
  assert.equal(buddy.hp, ENEMIES.mouse.hp, 'friendly fire off');
  assert.equal(g.projectiles.length, 0, 'burst on the pillar');
  assert.equal(g.player.health, 100);
});

test('yarn bomb: bounces off walls, then explodes and splashes enemies (not through walls)', W, () => {
  const g = makeGame(PILLAR, { px: 1.5, py: 1.5 });
  const p = spawnProjectile(g, 'yarnball', 7.5, 1.5, 0.4, 0, 'player');
  step(g, 0.2);
  assert.ok(p.vx < 0, 'bounced off the east wall');
  assert.ok(sfx(g, 'yarn_bounce').length >= 1);
  const g2 = makeGame(PILLAR, { px: 1.5, py: 3.5 });
  const a = spawnEnemy(g2, 'trooper', 6.5, 1.5);
  const b = spawnEnemy(g2, 'trooper', 6.5, 2.6);   // within splash
  const c = spawnEnemy(g2, 'trooper', 3.4, 2.5);   // other side of the pillar from the burst
  spawnProjectile(g2, 'yarnball', 5.0, 1.5, 0.4, 0, 'player');
  step(g2, 0.5);
  assert.ok(a.hp < 50 && b.hp < 50, `direct+splash (${a.hp}, ${b.hp})`);
  assert.ok(a.state === 'die' || a.alerted);
  assert.equal(c.hp, 50, 'pillar shields');
  assert.ok(g2.effects.some((f) => f.name === 'explosion'));
  assert.ok(sfx(g2, 'explosion').length === 1);
});

test('yarn bomb fuse runs out', W, () => {
  const g = makeGame(['##########', '#........#', '##########'], { px: 1.5, py: 1.5 });
  const p = spawnProjectile(g, 'yarnball', 4.5, 1.5, 0.4, Math.PI / 2, 'player');   // pointed into the wall: bounces back and forth
  step(g, 2.4);
  assert.ok(p.dead);
  assert.equal(g.projectiles.length, 0);
});

test('spawnFx / updateEffects / addBeam', () => {
  const g = { effects: [], beams: [], rng: createRng(3), atlas: null };
  const f = spawnFx(g, 'explosion', 3, 4, 0.5, { light: [2, 1, 0.5, 3] });
  assert.equal(f.life, FX.explosion.frames / 12);
  assert.equal(f.spr.h, Math.max(0, 0.5 - f.size / 2));
  assert.equal(f.light.r, 2);
  updateEffects(g, f.life / 2);
  assert.ok(f.light.r < 2 && f.light.r > 0, 'light fades');
  updateEffects(g, f.life);
  assert.equal(g.effects.length, 0);
  const loop = spawnFx(g, 'laser_dot', 0, 0, 0.4, { life: 1 });
  assert.ok(loop.loop);
  const unk = spawnFx(g, 'nope', 0, 0, 0.4);
  assert.equal(unk.name, 'puff');
  for (let i = 0; i < 400; i++) spawnFx(g, 'spark', i, 0, 0.5);
  assert.ok(g.effects.length <= 192);
  for (let i = 0; i < 6; i++) addBeam(g, { x0: 0, y0: 0, x1: i, y1: 1, life: 0.05 });
  assert.equal(g.beams.length, 4);
  assert.equal(g.beams[3].x1, 5);
  updateEffects(g, 0.06);
  assert.equal(g.beams.length, 0);
});

test('sprite frames come from the atlas (walk / attack / die)', W, () => {
  const g = makeGame(ROOM, { px: 2.5, py: 3.5 });
  const names = new Map();
  let next = 1;
  g.atlas = {
    sprites: { index: new Map(), frames: new Map() },
    sprite(name, frame = 0) { if (!names.has(name)) { names.set(name, next); next += 8; } return names.get(name) + frame; },
  };
  for (const [type, d] of Object.entries(ENEMIES)) for (const [anim, n] of Object.entries(d.anims)) {
    g.atlas.sprites.frames.set(`${type}.${anim}`, n); g.atlas.sprite(`${type}.${anim}`); g.atlas.sprites.index.set(`${type}.${anim}`, names.get(`${type}.${anim}`));
  }
  const e = spawnEnemy(g, 'mouse', 8.5, 3.5, { angle: Math.PI });
  const seen = new Set();
  step(g, 3, () => { seen.add(e.spr.frame); });
  const base = (n) => names.get(n);
  assert.ok([...seen].some((f) => f >= base('mouse.walk') && f < base('mouse.walk') + 4), 'walk frames');
  assert.ok(seen.has(base('mouse.attack')), 'aim frame');
  damageEnemy(g, e, 999);
  step(g, DIE_TIME / 2);
  assert.ok(e.spr.frame >= base('mouse.die') && e.spr.frame < base('mouse.die') + 4);
  step(g, DIE_TIME);
  assert.equal(e.spr.frame, base('mouse.dead'));
});

test('deterministic for a given seed', W, () => {
  const run = (seed) => {
    const g = makeGame(TWO_ROOMS, { seed, px: 1.5, py: 3.5 });
    spawnEnemy(g, 'trooper', 7.5, 1.5, { alerted: true });
    spawnEnemy(g, 'mouse', 7.5, 3.5, { alerted: true });
    spawnEnemy(g, 'sewer', 6.5, 2.5, { alerted: true });
    step(g, 6);
    return JSON.stringify([g.player.health, g.enemies.map((e) => [e.x.toFixed(5), e.y.toFixed(5), e.state])]);
  };
  assert.equal(run(5), run(5));
});
