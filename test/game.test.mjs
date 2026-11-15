// sim-player tests: game orchestration, player movement, weapons, items, scene building.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, flicker, longestRunAngle } from '../src/sim/game.js';
import { WALK_SPEED, RUN_SPEED, damagePlayer } from '../src/sim/player.js';
import { giveItem, spawnPickup, resolveDrop } from '../src/sim/items.js';
import { RAISE_T, LOWER_T } from '../src/sim/weapons.js';
import { createRng } from '../src/core/rng.js';
import { LIMITS, VIEW, WEAPONS, AMMO_MAX, START } from '../src/core/defs.js';

const DT = 1 / 60;
const Z = () => ({ forward: 0, strafe: 0, turn: 0, run: false, fire: false, use: false, weapon: -1, next: 0, meow: false });
const cmd = (o = {}) => ({ ...Z(), ...o });

// 20×9 test level: long open hall, a door, a locked gold door, exit switch, decor, lights, items, guard.
const LEVEL = {
  id: 't1', name: 'Test Hall', par: 30, music: 'level_a', wall: 'wall.fort_stone', floor: 'flat.floor_stone', ceil: 'flat.ceil_stone',
  ambient: [0.05, 0.05, 0.06], fog: { color: [0, 0, 0], density: 0.03 },
  map: [
    '####################',
    '#..................#',
    '#..................#',
    '#..................#',
    '#########+##########',
    '#........#.........#',
    '#........1........X#',
    '#........#.........#',
    '####################',
  ],
  things: [
    '....................',
    '.>.......$...&....H.',
    '..........B..L......',
    '.........!.....m....',
    '....................',
    '.....G..............',
    '....................',
    '....................',
    '....................',
  ],
};
const EMPTY = {   // a box with only a start, for isolated mechanics
  id: 't2', name: 'Box', par: 10, map: ['##########', '#........#', '#........#', '#........#', '##########'],
  things: ['..........', '.>........', '..........', '..........', '..........'],
};
const SKYLVL = { ...EMPTY, id: 't3', zones: { k: { ceil: 'flat.sky' } }, zonesMap: ['..........', '.kkkk.....', '.kkkk.....', '..........', '..........'] };

function mk(levels = [LEVEL, EMPTY], skill = 2, seed = 7) {
  const g = createGame({ atlas: null, levels, rng: createRng(seed), skill });
  const events = [];
  g.bus.on('*', (type, p) => events.push([type, p]));
  return { g, events, count: (type, pred = () => true) => events.filter(([t, p]) => t === type && pred(p)).length };
}
const run = (g, n, c = Z()) => { for (let i = 0; i < n; i++) g.update(DT, typeof c === 'function' ? c(i) : c); };
const ready = (g) => run(g, Math.ceil((RAISE_T + 0.02) / DT));

test('loadLevel parses the things layer', () => {
  const { g } = mk();
  g.loadLevel(0);
  const p = g.player;
  assert.equal(p.x, 1.5); assert.equal(p.y, 1.5); assert.equal(p.angle, 0);
  assert.equal(g.enemies.length, 1);
  assert.equal(g.stats.killsTotal, 1);
  assert.equal(g.pickups.length, 3);                      // $, &, G
  assert.equal(g.stats.treasureTotal, 2);
  assert.equal(g.decor.length, 3);                        // H, B, L
  assert.equal(g.world.blocker[g.world.idx(10, 2)], 1);   // barrel blocks
  assert.equal(g.world.blocker[g.world.idx(18, 1)], 0);   // chandelier hangs, no block
  assert.equal(g.lights.length, 3);                       // chandelier, floor lamp, '!'
  assert.equal(g.status, 'playing');
  assert.equal(g.stats.par, 30);
  assert.equal(p.health, START.health); assert.equal(p.lives, START.lives);
  assert.deepEqual(p.owned, START.owned);
});

test('guards face the longest open run', () => {
  const { g } = mk();
  g.loadLevel(0);
  // from (1,1) the run east (17 cells) beats south (2)
  assert.equal(longestRunAngle(g.world, 1, 1), 0);
  assert.ok(Math.abs(longestRunAngle(g.world, 18, 2) - Math.PI) < 1e-9);
});

test('movement: acceleration, top speed, run, friction, walls', () => {
  const { g } = mk([EMPTY]);
  g.loadLevel(0);
  const p = g.player;
  g.update(DT, cmd({ forward: 1 }));
  assert.ok(p.speed > 0 && p.speed < WALK_SPEED * 0.5, `snappy but not instant: ${p.speed}`);
  run(g, 14, cmd({ forward: 1 }));
  assert.ok(p.speed > WALK_SPEED * 0.85, `near top speed after 0.25 s: ${p.speed}`);
  p.x = 1.5; p.y = 2.5; p.vx = p.vy = 0;
  run(g, 30, cmd({ forward: 1, run: true }));
  assert.ok(p.speed > WALK_SPEED * 1.3 && p.speed <= RUN_SPEED + 1e-6, `run faster: ${p.speed}`);
  run(g, 24, Z());
  assert.ok(p.speed < 0.05, `stops within 0.4 s: ${p.speed}`);
  // diagonal input is normalised
  p.x = 1.5; p.y = 2; p.vx = p.vy = 0;
  run(g, 30, cmd({ forward: 1, strafe: 1 }));
  assert.ok(Math.hypot(p.vx, p.vy) <= WALK_SPEED + 1e-6);
  // wall: run into the east wall, x stays inside
  run(g, 240, cmd({ forward: 1 }));
  assert.ok(p.x <= 9 - p.radius + 1e-6, `blocked by wall at x=${p.x}`);
  assert.ok(Math.abs(p.vx) < 0.5, 'velocity into the wall is cancelled');
});

test('turning and head bob', () => {
  const { g } = mk([EMPTY]);
  g.loadLevel(0);
  const p = g.player;
  g.update(DT, cmd({ turn: 0.25 }));
  assert.ok(Math.abs(p.angle - 0.25) < 1e-9);
  p.angle = 0;
  const hs = new Set();
  run(g, 50, (i) => { hs.add(p.camH.toFixed(4)); return cmd({ forward: i < 25 ? 1 : -1 }); });
  assert.ok(hs.size > 5, 'camera height bobs while walking');
  run(g, 60, Z());
  assert.ok(Math.abs(p.camH - VIEW.EYE) < 0.004, `bob settles: ${p.camH}`);
});

test('pistol: one shot per tap, ammo, cadence, sfx', () => {
  const { g, count } = mk([EMPTY]);
  g.loadLevel(0);
  const p = g.player;
  ready(g);
  assert.equal(p.weapon, 1); assert.equal(p.wstate.phase, 'ready');
  const a0 = p.ammo.hair;
  run(g, 60, cmd({ fire: true }));                      // held: semi-auto fires once
  assert.equal(p.ammo.hair, a0 - 1);
  assert.equal(count('sfx', (e) => e.name === 'pistol'), 1);
  run(g, 1, Z());
  // tapping every 6 ticks: a shot each period (0.36 s) at most, buffered taps are not lost
  run(g, 120, (i) => cmd({ fire: i % 6 === 0 }));
  const shots = a0 - 1 - p.ammo.hair;
  assert.ok(shots >= 5 && shots <= 6, `≈2 s / 0.36 s shots, got ${shots}`);
  assert.ok(count('sfx', (e) => e.name === 'pistol') === shots + 1);
});

test('fire animation frames advance and return to idle', () => {
  const { g } = mk([EMPTY]);
  g.loadLevel(0);
  const p = g.player;
  ready(g);
  g.update(DT, cmd({ fire: true }));
  assert.equal(p.wstate.anim, 'fire'); assert.equal(p.wstate.frame, 0);
  const frames = new Set();
  run(g, 25, (i) => { frames.add(p.wstate.frame); return Z(); });
  assert.deepEqual([...frames].sort(), [0, 1, 2]);
  assert.equal(p.wstate.phase, 'ready'); assert.equal(p.wstate.anim, 'idle');
});

test('gatling: automatic fire at its period', () => {
  const { g } = mk([EMPTY]);
  g.loadLevel(0);
  const p = g.player;
  assert.ok(giveItem(g, 'gatling'));
  assert.equal(p.owned[2], true);
  run(g, Math.ceil((LOWER_T + RAISE_T + 0.05) / DT));
  assert.equal(p.weapon, 2); assert.equal(p.wstate.phase, 'ready');
  p.ammo.hair = 99;
  run(g, 60, cmd({ fire: true }));
  const shots = 99 - p.ammo.hair;
  assert.ok(Math.abs(shots - 1 / WEAPONS[2].period) <= 1.5, `≈10.5 shots/s, got ${shots}`);
});

test('weapon switching: lower → raise, weapon event, unowned ignored', () => {
  const { g, count } = mk([EMPTY]);
  g.loadLevel(0);
  const p = g.player;
  ready(g);
  g.update(DT, cmd({ weapon: 3 }));                      // not owned
  assert.equal(p.wstate.phase, 'ready');
  g.update(DT, cmd({ weapon: 0 }));
  assert.equal(p.wstate.phase, 'lower');
  run(g, Math.ceil(LOWER_T / DT) + 1);
  assert.equal(p.weapon, 0); assert.equal(p.wstate.phase, 'raise');
  assert.equal(count('weapon', (e) => e.index === 0), 1);
  run(g, Math.ceil(RAISE_T / DT) + 1);
  assert.equal(p.wstate.phase, 'ready');
  g.update(DT, cmd({ next: 1 }));
  run(g, 30);
  assert.equal(p.weapon, 1, 'next cycles to the pistol');
});

test('out of ammo: click and fall back to claws', () => {
  const { g, count } = mk([EMPTY]);
  g.loadLevel(0);
  const p = g.player;
  ready(g);
  p.ammo.hair = 1;
  g.update(DT, cmd({ fire: true }));
  assert.equal(p.ammo.hair, 0);
  run(g, 30, Z());
  g.update(DT, cmd({ fire: true }));
  assert.equal(count('sfx', (e) => e.name === 'no_ammo'), 1);
  run(g, 30);
  assert.equal(p.weapon, 0);
  // claws never need ammo
  g.update(DT, cmd({ fire: true }));
  assert.equal(p.wstate.anim, 'fire');
});

test('items: health, ammo caps, keys, treasure, lives, weapons', () => {
  const { g, count } = mk([EMPTY]);
  g.loadLevel(0);
  const p = g.player;
  assert.equal(giveItem(g, 'tuna'), false, 'full health refuses health');
  p.health = 50;
  assert.ok(giveItem(g, 'tuna')); assert.equal(p.health, 75);
  assert.ok(giveItem(g, 'catnip')); assert.equal(p.health, 135);
  assert.equal(giveItem(g, 'fish_treat'), false, 'over 100 refuses small heals');
  p.ammo.hair = AMMO_MAX.hair;
  assert.equal(giveItem(g, 'ammo_box'), false);
  p.ammo.hair = 90;
  assert.ok(giveItem(g, 'ammo_box')); assert.equal(p.ammo.hair, AMMO_MAX.hair);
  assert.ok(giveItem(g, 'key_gold')); assert.equal(p.keys.gold, true);
  assert.equal(giveItem(g, 'key_gold'), false);
  const s0 = p.score;
  assert.ok(giveItem(g, 'brie_wheel')); assert.equal(p.score, s0 + 500); assert.equal(g.stats.treasure, 1);
  assert.ok(giveItem(g, 'extra_life')); assert.equal(p.lives, START.lives + 1);
  assert.ok(giveItem(g, 'laser')); assert.equal(p.owned[4], true); assert.equal(p.ammo.cell, 60);
  assert.equal(count('pickup'), 7);
  assert.ok(count('msg', (m) => m.kind === 'pickup') >= 7);
});

test('pickups are collected by walking over them and removed', () => {
  const { g, count } = mk();
  g.loadLevel(0);
  const p = g.player;
  ready(g);
  run(g, 330, cmd({ forward: 1 }));      // walk east along row 1 over the cheddar ($) and brie (&)
  assert.equal(g.stats.treasure, 2);
  assert.equal(g.pickups.length, 1);
  assert.equal(count('sfx', (e) => e.name === 'pickup_treasure'), 2);
  assert.ok(p.score >= 600);
});

test('drops: resolveDrop picks a missing weapon first, spawnPickup drop counts treasure', () => {
  const { g } = mk([EMPTY]);
  g.loadLevel(0);
  assert.equal(resolveDrop(g, 'gatling|ammo_clip'), 'gatling');
  g.player.owned[2] = true;
  assert.equal(resolveDrop(g, 'gatling|ammo_clip'), 'ammo_clip');
  const t0 = g.stats.treasureTotal;
  spawnPickup(g, 'cheese_crown', 3.5, 2.5, { drop: true });
  assert.equal(g.stats.treasureTotal, t0 + 1);
});

test('damage: skill scaling, god mode, hurt direction', () => {
  for (const [skill, mul] of [[0, 0.45], [3, 1.5]]) {
    const { g, events } = mk([EMPTY], skill);
    g.loadLevel(0);
    damagePlayer(g, 10, g.player.x + 1, g.player.y);
    assert.ok(Math.abs(g.player.health - (100 - 10 * mul)) < 1e-9);
    const hurt = events.find(([t]) => t === 'hurt')[1];
    assert.ok(Math.abs(hurt.angle) < 1e-9, 'damage came from the east');
  }
  const { g } = mk([EMPTY]);
  g.loadLevel(0);
  g.cheats.god = true;
  damagePlayer(g, 500, 0, 0);
  assert.equal(g.player.health, 100); assert.equal(g.player.dead, false);
});

test('death: lose a life, status dead, restart restores level-start loadout', () => {
  const { g, count } = mk([EMPTY]);
  g.loadLevel(0);
  const p = g.player;
  p.score = 1234;
  g.loadLevel(0, { keepPlayer: true });                  // snapshot taken here (score 1234)
  giveItem(g, 'gatling'); p.score = 5000; p.ammo.hair = 50;
  damagePlayer(g, 1000, NaN, NaN);
  assert.equal(p.dead, true); assert.equal(g.status, 'dead');
  assert.equal(p.lives, START.lives - 1);
  assert.equal(count('playerDied', (e) => e.livesLeft === START.lives - 1), 1);
  run(g, 60);                                            // death cam keeps ticking without throwing
  assert.ok(p.camH < 0.3);
  g.loadLevel(0, { keepPlayer: true });
  const q = g.player;
  assert.equal(q.dead, false); assert.equal(q.health, 100); assert.equal(q.lives, START.lives - 1);
  assert.equal(q.score, 1234); assert.equal(q.owned[2], false); assert.equal(q.ammo.hair, START.ammo.hair);
  assert.equal(g.status, 'playing');
});

test('next level keeps the player but resets keys', () => {
  const { g } = mk();
  g.loadLevel(0);
  const p = g.player;
  giveItem(g, 'key_gold'); giveItem(g, 'gatling'); p.score = 777; p.health = 60;
  g.loadLevel(1, { keepPlayer: true });
  assert.equal(g.player, p);
  assert.equal(p.score, 777); assert.equal(p.health, 60); assert.equal(p.owned[2], true); assert.equal(p.keys.gold, false);
  g.loadLevel(0, { keepPlayer: false });
  assert.equal(g.player.score, 0);
});

test('use: locked door message, exit switch completes, last level is victory', () => {
  const { g, count } = mk();
  g.loadLevel(0);
  const p = g.player;
  p.x = 8.5; p.y = 6.5; p.angle = 0;                     // facing the gold door at (9,6)
  g.update(DT, cmd({ use: true }));
  assert.ok(count('msg', (m) => /gold/.test(m.text)) >= 1);
  p.keys.gold = true;
  g.update(DT, cmd({ use: true }));
  assert.equal(g.world.doors.find((d) => d.lock === 'gold').state, 'opening');
  p.x = 17.5; p.y = 6.5; p.angle = 0;                    // exit switch at (18,6), 0.5 away
  g.update(DT, cmd({ use: true }));
  assert.equal(g.status, 'complete');
  assert.equal(count('levelComplete'), 1);
  const st = g.stats; assert.ok(st.time > 0);
  g.update(DT, cmd({ forward: 1 }));                     // frozen after completion
  // last level → victory
  const { g: g2 } = mk([LEVEL]);
  g2.loadLevel(0); g2.player.x = 17.5; g2.player.y = 6.5; g2.player.angle = 0;
  g2.update(DT, cmd({ use: true }));
  assert.equal(g2.status, 'victory');
});

test('hazard floor and mousetrap hurt the player', () => {
  const lv = { ...EMPTY, zones: { f: { floor: 'flat.floor_fondue' } }, zonesMap: ['..........', '..........', '...f......', '..........', '..........'],
    things: ['..........', '.>........', '......w...', '..........', '..........'] };
  const { g, count } = mk([lv]);
  g.loadLevel(0);
  const p = g.player;
  p.x = 3.5; p.y = 2.5;
  run(g, 60);
  assert.ok(p.health < 100 && p.health > 60, `fondue burns: ${p.health}`);
  const h = p.health;
  p.x = 6.5; p.y = 2.5;
  run(g, 5);
  assert.ok(p.health < h - 5, 'trap snaps');
  assert.equal(count('sfx', (e) => e.name === 'trap_snap'), 1);
  run(g, 30);
  assert.equal(count('sfx', (e) => e.name === 'trap_snap'), 1, 'one-shot');
});

test('combat: shooting an enemy in front damages it (real or fallback enemies)', () => {
  const lv = { ...EMPTY, things: ['..........', '.>....m...', '..........', '..........', '..........'] };
  const { g } = mk([lv]);
  g.loadLevel(0);
  const e = g.enemies[0];
  assert.ok(e, 'enemy spawned');
  g.cheats.god = true;
  const hp0 = e.hp;
  ready(g);
  g.player.ammo.hair = 99;
  run(g, 600, (i) => cmd({ fire: i % 4 === 0 }));
  assert.ok(e.hp < hp0, `enemy took damage: ${hp0} → ${e.hp}`);
  assert.ok(g.stats.kills >= 1 || e.hp <= 0 || e.state === 'die' || e.state === 'dead');
});

test('buildScene: shape, limits, muzzle light, flicker, sky', () => {
  // crowded level: 150 decor lamps, 40 lights
  const rows = 14, cols = 30;
  const map = [], things = [];
  for (let y = 0; y < rows; y++) {
    map.push(y === 0 || y === rows - 1 ? '#'.repeat(cols) : '#' + '.'.repeat(cols - 2) + '#');
    let t = '';
    for (let x = 0; x < cols; x++) t += y === 1 && x === 1 ? '>' : y > 1 && y < rows - 1 && x > 0 && x < cols - 1 && (x + y) % 2 === 0 ? (x % 3 ? 'x' : 'c') : '.';
    things.push(t);
  }
  const { g } = mk([{ id: 'c', name: 'crowd', map, things }]);
  g.loadLevel(0);
  assert.ok(g.decor.length > LIMITS.SPRITES);
  assert.ok(g.lights.length > LIMITS.LIGHTS);
  const s = g.buildScene({});
  for (const k of ['time', 'cam', 'world', 'sprites', 'lights', 'beams', 'ambient', 'fog', 'viewLight']) assert.ok(k in s, k);
  assert.ok(s.sprites.length <= LIMITS.SPRITES && s.sprites.length > 50);
  assert.ok(s.lights.length <= LIMITS.LIGHTS);
  assert.equal(s.sky, null);
  assert.equal(s.viewLight.length, 3);
  for (const sp of s.sprites) for (const k of ['x', 'y', 'h', 'size', 'frame', 'flipX', 'glow', 'alpha']) assert.ok(k in sp, k);
  for (const l of s.lights) for (const k of ['x', 'y', 'h', 'r', 'g', 'b', 'radius']) assert.ok(Number.isFinite(l[k]), k);
  // nearest sprites first in importance: the closest decor must be included
  const near = g.decor.reduce((a, d) => (Math.hypot(d.x - 1.5, d.y - 1.5) < Math.hypot(a.x - 1.5, a.y - 1.5) ? d : a));
  assert.ok(s.sprites.some((sp) => sp.x === near.x && sp.y === near.y));
  assert.equal(g.scene, s); assert.equal(g.viewLight, s.viewLight);

  // muzzle flash adds a light right in front of the player
  const { g: g2 } = mk([EMPTY]);
  g2.loadLevel(0); ready(g2);
  const s1 = g2.buildScene({});
  const n0 = s1.lights.length, vl0 = s1.viewLight[0];
  g2.update(DT, cmd({ fire: true }));
  const s2 = g2.buildScene({});
  assert.ok(s2.lights.length >= n0 + 1);
  assert.ok(s2.lights.some((l) => Math.hypot(l.x - 1.95, l.y - 1.5) < 0.05 && l.r > 2), 'muzzle light in front of the gun');
  assert.ok(s2.viewLight[0] > vl0, 'muzzle flash brightens the view-model');
  // sky only when a sky zone exists
  const { g: g3 } = mk([SKYLVL]);
  g3.loadLevel(0);
  assert.ok(g3.buildScene({}).sky);
});

test('flicker: steady lights are constant, flickering lights vary, beacon pulses', () => {
  assert.equal(flicker(0, 1.23, 0.4), 1);
  const v = new Set(), b = [];
  for (let i = 0; i < 60; i++) { v.add(flicker(0.3, i / 60, 0.2).toFixed(3)); b.push(flicker(1, i / 60, 0.1)); }
  assert.ok(v.size > 20);
  assert.ok(Math.min(...b) < 0.2 && Math.max(...b) > 0.9);
  for (let i = 0; i < 200; i++) { const f = flicker(0.06, i * 0.037, 0.5); assert.ok(f > 0.85 && f <= 1.01); }
});

test('determinism: same seed + same commands → identical state', () => {
  const play = () => {
    const { g } = mk(undefined, 2, 99);
    g.loadLevel(0);
    run(g, 400, (i) => cmd({ forward: 1, strafe: Math.sin(i / 20), turn: 0.01, fire: i % 7 === 0, use: i % 50 === 0 }));
    const p = g.player;
    return JSON.stringify([p.x, p.y, p.angle, p.health, p.ammo, p.score, g.enemies.map((e) => [e.x, e.y, e.hp, e.state])]);
  };
  assert.equal(play(), play());
});

test('update tolerates a missing / partial cmd', () => {
  const { g } = mk([EMPTY]);
  g.loadLevel(0);
  g.update(DT, {}); g.update(DT, null); g.update(DT, { forward: NaN, turn: undefined });
  assert.ok(Number.isFinite(g.player.x) && Number.isFinite(g.player.angle));
});
