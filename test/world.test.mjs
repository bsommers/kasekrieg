import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, DOOR_HOLD, UNREACHABLE } from '../src/sim/world.js';
import { CELL, SKY, WALLS } from '../src/core/defs.js';
import { createBus } from '../src/core/events.js';

const atlas = { tile: (n) => 1 + [...n].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 900, 7) };
const mk = (map, extra = {}) => {
  const bus = createBus(); const ev = [];
  for (const t of ['sfx', 'secret', 'exit']) bus.on(t, (p) => ev.push([t, p]));
  const world = createWorld({ id: 't', wall: 'wall.fort_stone', floor: 'flat.floor_stone', ceil: 'flat.ceil_stone', map, ...extra }, atlas, bus);
  return { world, ev, bus };
};
const step = (world, secs, game = {}) => { for (let i = 0; i < Math.round(secs * 60); i++) world.update(1 / 60, game); };
const sfx = (ev) => ev.filter((e) => e[0] === 'sfx').map((e) => e[1].name);

test('parsing: cells, textures, border, secrets, zones, hazards, sky', () => {
  const { world } = mk([
    '#########',
    '#..+..a.#',
    '#.#=#.#.#',
    '#.1.2.X.#',
    '#########',
  ].map((r) => r), { zones: { k: { floor: 'flat.floor_fondue', ceil: 'flat.sky' } }, zonesMap: ['.........', '....k....', '.........', '.........', '.........'] });
  assert.equal(world.w, 9); assert.equal(world.h, 5);
  assert.equal(world.cells[world.idx(0, 0)], CELL.WALL);
  assert.equal(world.cells[world.idx(1, 1)], CELL.OPEN);
  assert.equal(world.cells[world.idx(3, 1)], CELL.DOOR);
  assert.equal(world.cells[world.idx(6, 1)], CELL.PUSH);
  assert.equal(world.cells[world.idx(6, 3)], CELL.EXIT);
  assert.equal(world.secretsTotal, 1);
  assert.equal(world.doors.length, 4);
  assert.deepEqual(world.doors.map((d) => d.lock), [null, null, 'gold', 'silver']);
  assert.ok(world.wallTex[world.idx(0, 0)] > 0);
  assert.equal(world.wallTex[world.idx(6, 1)], atlas.tile('wall.cheddar_brick'));
  assert.equal(world.ceilTex[world.idx(4, 1)], SKY);
  assert.equal(world.floorTex[world.idx(1, 1)], atlas.tile('flat.floor_stone'));
  assert.equal(world.hazardAt(4.5, 1.5), 22);
  assert.equal(world.hazardAt(1.5, 1.5), 0);
  assert.equal(world.hazardAt(-3, 99), 0);
  assert.ok(world.jambTex > 0);
});

test('parsing: space = default wall, every wall letter maps, unknown atlas tile -> 0 safe, border sealed', () => {
  const row = WALLS.map(([c]) => c).filter((c) => c !== 'X').join('');
  const { world } = mk(['#'.repeat(row.length + 2), '#' + row + '#', '#'.repeat(row.length + 2)]);
  for (let i = 0; i < row.length; i++) assert.equal(world.cells[world.idx(i + 1, 1)], CELL.WALL);
  const w2 = createWorld({ map: ['...', '. .', '...'] }, null, null);   // no atlas, open border
  assert.equal(w2.cells[0], CELL.WALL); assert.equal(w2.cells[4], CELL.WALL);
  assert.ok(w2.isSolid(-1, 0) && w2.isSolid(0, 99));
});

test('door orientation', () => {
  const { world } = mk([
    '#####',
    '#.#.#',
    '#.+.#',
    '#.#.#',
    '###+#',
    '#...#',
    '#####',
  ]);
  assert.equal(world.doors[world.doorAt[world.idx(2, 2)]].vertical, true);   // walls N/S, pass E-W
  assert.equal(world.doors[world.doorAt[world.idx(3, 4)]].vertical, false);  // walls E/W, pass N-S
  assert.equal(world.doorAt[world.idx(1, 1)], -1);
});

test('door lifecycle: open, hold, auto-close, events, blocking thresholds', () => {
  const { world, ev } = mk(['#####', '#.+.#', '#####']);
  const d = world.doors[0];
  assert.equal(d.state, 'closed');
  assert.ok(world.blocksMove(d.cx, d.cy)); assert.ok(world.blocksSight(d.cx, d.cy));
  assert.ok(!world.isSolid(d.cx, d.cy));
  const r = world.use(1.5, 1.5, 0, {});
  assert.equal(r.kind, 'door');
  assert.equal(d.state, 'opening');
  assert.deepEqual(sfx(ev), ['door_open']);
  step(world, 0.3);
  assert.ok(d.open > 0.3 && d.open < 1);
  step(world, 0.5);
  assert.equal(d.state, 'open'); assert.equal(d.open, 1);
  assert.ok(!world.blocksMove(d.cx, d.cy)); assert.ok(!world.blocksSight(d.cx, d.cy));
  step(world, DOOR_HOLD - 0.2);
  assert.equal(d.state, 'open');
  step(world, 0.4);
  assert.equal(d.state, 'closing');
  assert.ok(sfx(ev).includes('door_close'));
  step(world, 1);
  assert.equal(d.state, 'closed'); assert.equal(d.open, 0);
  // re-using an open door resets hold timer
  world.use(1.5, 1.5, 0, {}); step(world, 1);
  step(world, 3); world.use(1.5, 1.5, 0, {}); assert.equal(d.timer, 0);
});

test('door thresholds for move vs sight and enemy path', () => {
  const { world } = mk(['#####', '#.+.#', '#####']);
  const d = world.doors[0];
  d.open = 0.6; assert.ok(world.blocksMove(2, 1)); assert.ok(!world.blocksSight(2, 1));
  d.open = 0.8; assert.ok(!world.blocksMove(2, 1));
  d.open = 0; assert.ok(!world.blocksMove(2, 1, true));   // unlocked doors don't block enemy path
});

test('door does not close on an actor; closing door reopens when actor steps in', () => {
  const { world } = mk(['#####', '#.+.#', '#####']);
  const d = world.doors[0];
  const game = { player: { x: 2.5, y: 1.5, radius: 0.27 }, enemies: [] };
  world.use(1.5, 1.5, 0, {}); step(world, 0.8, game);
  step(world, DOOR_HOLD + 2, game);
  assert.equal(d.state, 'open');
  game.player.x = 0.8; step(world, 0.1, game);
  assert.equal(d.state, 'closing');
  game.player.x = 2.5; step(world, 1 / 60, game);
  assert.equal(d.state, 'opening');
  // dead enemies do not hold the door
  game.player.x = 0.8; game.enemies = [{ x: 2.5, y: 1.5, radius: 0.3, state: 'dead' }];
  step(world, 6, game);
  assert.equal(d.state, 'closed');
});

test('locked doors', () => {
  const { world, ev } = mk(['#######', '#.1.2.#', '#######']);
  assert.deepEqual(world.use(1.5, 1.5, 0, {}), { kind: 'locked', lock: 'gold' });
  assert.equal(world.doors[0].state, 'closed');
  assert.deepEqual(sfx(ev), ['door_locked']);
  assert.deepEqual(world.use(1.5, 1.5, 0, { silver: true }), { kind: 'locked', lock: 'gold' });
  assert.equal(world.use(1.5, 1.5, 0, { gold: true }).kind, 'door');
  assert.equal(world.doors[0].state, 'opening');
  assert.ok(world.blocksMove(4, 1, true));   // locked doors block enemy paths
  assert.equal(world.use(3.5, 1.5, 0, { gold: true }).kind, 'locked');
  assert.equal(world.use(3.5, 1.5, 0, { gold: true, silver: true }).kind, 'door');
});

test('use: out of reach, facing away, nothing', () => {
  const { world } = mk(['#######', '#.....#', '#.....#', '#######']);
  assert.equal(world.use(3.5, 1.5, 0, {}).kind, 'none');
  const m2 = mk(['########', '#......#', '########']);
  assert.equal(m2.world.use(1.5, 1.5, Math.PI / 2, {}).kind, 'none');
  const m3 = mk(['#####', '#.+.#', '#####']);
  assert.equal(m3.world.use(3.5, 1.5, 0, {}).kind, 'none');        // facing the wall, not the door
  assert.equal(m3.world.use(3.5, 1.5, Math.PI, {}).kind, 'door');
  assert.equal(m3.world.use(1.5, 1.5, 0, {}).kind, 'door');
});

test('pushwall behaviour', () => {
  // player at (1.5,1.5) facing east into secret 'a' at (2,1); open cells (3,1),(4,1) behind it
  const { world, ev } = mk(['######', '#.a..#', '######']);
  assert.equal(world.secretsTotal, 1);
  assert.ok(world.isSolid(2, 1));
  assert.equal(world.use(1.5, 1.5, 0, {}).kind, 'pushwall');
  assert.equal(world.secretsFound, 1);
  assert.deepEqual(ev.map((e) => e[0] === 'sfx' ? e[1].name : e[0]), ['pushwall', 'secret']);
  assert.equal(world.cells[world.idx(2, 1)], CELL.OPEN);
  assert.equal(world.movers.length, 1);
  assert.ok(world.isSolid(2, 1), 'moving wall still solid at start');
  assert.equal(world.use(1.5, 1.5, 0, {}).kind, 'none', 'cannot push a moving wall again');
  assert.equal(world.secretsFound, 1);
  step(world, 0.5);
  const m = world.movers[0];
  assert.ok(Math.abs(m.x0 - 2.5) < 0.05 && m.x1 - m.x0 === 1);
  assert.ok(world.isSolid(3, 1)); assert.ok(world.isSolid(2, 1));
  // ray hits the moving box exactly
  const r = world.castRay(1.5, 1.5, 1, 0, 10);
  assert.ok(r.hit && Math.abs(r.dist - (m.x0 - 1.5)) < 1e-6 && r.side === 0);
  // tryMove cannot enter it
  const e = { x: 1.5, y: 1.5, radius: 0.27 };
  world.tryMove(e, 0.6, 0);
  assert.ok(e.x <= m.x0 - 0.27 + 1e-6);
  step(world, 2);
  assert.equal(world.movers.length, 0);
  assert.equal(world.cells[world.idx(4, 1)], CELL.WALL);
  assert.equal(world.cells[world.idx(2, 1)], CELL.OPEN);
  assert.equal(world.cells[world.idx(3, 1)], CELL.OPEN);
  assert.equal(world.wallTex[world.idx(4, 1)], atlas.tile('wall.cheddar_brick'));
  assert.equal(world.secretsFound, 1);
  assert.ok(world.isSolid(4, 1));
  assert.ok(!world.isSolid(2, 1));
});

test('pushwall: direction follows the face hit; blocked pushwall does nothing; limited to free cells', () => {
  const north = mk(['#####', '#...#', '#.c.#', '#...#', '#####']);
  // push from south side facing north: wall at (2,2); open beyond (2,1) only one cell then border
  assert.equal(north.world.use(2.5, 3.2, -Math.PI / 2, {}).kind, 'pushwall');
  step(north.world, 3);
  assert.equal(north.world.cells[north.world.idx(2, 1)], CELL.WALL);   // moved 1 cell only
  const blocked = mk(['#####', '#.a##', '#####']);
  assert.equal(blocked.world.use(1.5, 1.5, 0, {}).kind, 'none');
  assert.equal(blocked.world.secretsFound, 0);
  assert.equal(blocked.world.cells[blocked.world.idx(2, 1)], CELL.PUSH);
});

test('pushwall pauses while an actor is in the way, and does not squash', () => {
  const { world } = mk(['######', '#.a..#', '######']);
  const game = { player: { x: 3.4, y: 1.5, radius: 0.27 }, enemies: [] };
  world.use(1.5, 1.5, 0, {});
  step(world, 3, game);
  assert.equal(world.movers.length, 1);
  assert.ok(world.movers[0].x1 <= 3.4 - 0.27 + 1e-6 + 0.02);
  game.player.x = 1.5; step(world, 3, game);
  assert.equal(world.movers.length, 0);
});

test('exit switch', () => {
  const { world, ev } = mk(['#####', '#..X#', '#####']);
  assert.ok(world.isSolid(3, 1));
  assert.equal(world.use(2.5, 1.5, 0, {}).kind, 'exit');
  assert.equal(world.exitTriggered, true);
  assert.deepEqual(ev.map((e) => e[0] === 'sfx' ? e[1].name : e[0]), ['switch', 'exit']);
  const tex = world.wallTex[world.idx(3, 1)];
  assert.equal(tex, atlas.tile('wall.exit_switch') + 1);
  world.use(2.5, 1.5, 0, {});
  assert.equal(ev.length, 2, 'exit fires once');
  assert.equal(world.wallTex[world.idx(3, 1)], tex);
});

test('castRay: walls, sides, distances, misses, diagonals, bounds', () => {
  const { world } = mk(['#######', '#.....#', '#.....#', '#######']);
  let r = world.castRay(1.5, 1.5, 1, 0, 100);
  assert.ok(r.hit); assert.equal(r.side, 0); assert.ok(Math.abs(r.dist - 4.5) < 1e-9); assert.equal(r.cx, 6);
  assert.ok(Math.abs(r.x - 6) < 1e-9);
  r = world.castRay(1.5, 1.5, 0, -1, 100);
  assert.equal(r.side, 1); assert.ok(Math.abs(r.dist - 0.5) < 1e-9); assert.equal(r.cy, 0);
  r = world.castRay(1.5, 1.5, 3, 0, 2);
  assert.equal(r.hit, false); assert.equal(r.dist, 2);
  r = world.castRay(1.5, 1.5, 1, 1, 100);   // diagonal: hits south wall at y=3 after 1.5*sqrt2
  assert.ok(Math.abs(r.dist - 1.5 * Math.SQRT2) < 1e-9);
  r = world.castRay(1.5, 1.5, 0, 0, 10); assert.equal(r.hit, false);
  r = world.castRay(0.5, 0.5, 1, 0, 10); assert.ok(r.hit && r.dist === 0);   // starting inside a wall
  // un-normalised direction gives the same distance
  assert.ok(Math.abs(world.castRay(1.5, 1.5, 7, 0, 100).dist - 4.5) < 1e-9);
  // never escapes the map
  for (let a = 0; a < 6.3; a += 0.1) assert.ok(world.castRay(3.5, 1.5, Math.cos(a), Math.sin(a), 1000).hit);
});

test('castRay: doors (closed slab, partially open, open, both orientations)', () => {
  const { world } = mk(['#####', '#.+.#', '#####']);
  const d = world.doors[0];
  let r = world.castRay(1.5, 1.5, 1, 0, 50);
  assert.ok(r.hit && r.door === d && Math.abs(r.dist - 1) < 1e-9 && r.side === 0);   // slab at x=2.5
  d.open = 0.9;   // slab covers along-y in [0.9,1) → y offset 0.5 is inside the gap
  r = world.castRay(1.5, 1.5, 1, 0, 50);
  assert.ok(r.hit && r.door === null && r.cx === 4);
  d.open = 0.4; r = world.castRay(1.5, 1.7, 1, 0, 50);   // along = 0.7 ≥ open → slab
  assert.equal(r.door, d);
  r = world.castRay(1.5, 1.2, 1, 0, 50);                 // along = 0.2 < open → gap
  assert.equal(r.door, null);
  d.open = 1; assert.equal(world.castRay(1.5, 1.9, 1, 0, 50).door, null);
  // horizontal door
  const h = mk(['###', '#.#', '#+#', '#.#', '###']);
  const hd = h.world.doors[0]; assert.equal(hd.vertical, false);
  r = h.world.castRay(1.5, 1.5, 0, 1, 50);
  assert.ok(r.door === hd && Math.abs(r.dist - 1) < 1e-9 && r.side === 1);
  // ray running along a door corridor wall-parallel does not hit the slab
  const par = world.castRay(1.5, 1.5, 0, 1, 0.4);
  assert.equal(par.hit, false);
  // door limit: ray shorter than slab misses
  d.open = 0; assert.equal(world.castRay(1.5, 1.5, 1, 0, 0.9).hit, false);
});

test('hasLOS', () => {
  const { world } = mk(['#######', '#..#..#', '#.+...#', '#######']);
  assert.ok(world.hasLOS(1.5, 2.5, 1.5, 1.5) === true);
  assert.ok(!world.hasLOS(1.5, 1.5, 4.5, 1.5));          // wall at (3,1)
  assert.ok(!world.hasLOS(1.5, 2.5, 4.5, 2.5));          // closed door
  world.openDoor(world.doors[0]); step(world, 1);
  assert.ok(world.hasLOS(1.5, 2.5, 4.5, 2.5));
  assert.ok(world.hasLOS(1.5, 1.5, 1.5, 1.5));
  assert.ok(!world.hasLOS(0.5, 0.5, 0.6, 0.6));
  assert.ok(world.hasLOS(4.5, 1.5, 4.5, 2.5) && world.hasLOS(4.5, 2.5, 4.5, 1.5));
});

test('tryMove: stop, slide, corners, diagonal into wall, enemy flag, no tunnelling', () => {
  const { world } = mk(['#######', '#.....#', '#.....#', '#..#..#', '#.....#', '#######']);
  const R = 0.27;
  let e = { x: 3.5, y: 1.5, radius: R };
  let r = world.tryMove(e, 0, -1);
  assert.ok(r.hit && Math.abs(e.y - (1 + R)) < 1e-4 && r.x === e.x && r.y === e.y);
  // slide: diagonal into the north wall keeps x progress
  e = { x: 2.5, y: 1.5, radius: R };
  r = world.tryMove(e, 0.3, -0.5);
  assert.ok(r.hit && Math.abs(e.x - 2.8) < 1e-6 && Math.abs(e.y - (1 + R)) < 1e-4);
  // free movement
  e = { x: 1.5, y: 1.5, radius: R }; r = world.tryMove(e, 0.5, 0.25);
  assert.equal(r.hit, false); assert.ok(Math.abs(e.x - 2) < 1e-9 && Math.abs(e.y - 1.75) < 1e-9);
  // pillar at (3,3): cannot enter it
  e = { x: 1.5, y: 3.5, radius: R }; world.tryMove(e, 3, 0);
  assert.ok(e.x <= 3 - R + 1e-6);
  // corner: diagonal run at a convex pillar corner does not stick or pass through
  e = { x: 2.3, y: 2.3, radius: R };
  for (let i = 0; i < 60; i++) world.tryMove(e, 0.05, 0.05);
  assert.ok(!(e.x + R > 3 && e.x - R < 4 && e.y + R > 3 && e.y - R < 4), 'inside pillar');
  // 0 radius, zero move, NaN input
  e = { x: 1.5, y: 1.5, radius: 0 }; r = world.tryMove(e, 0, 0); assert.equal(r.hit, false);
  r = world.tryMove(e, NaN, Infinity); assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y));
  // blockers and doors
  world.setBlocker(4, 1, true);
  e = { x: 3.5, y: 1.5, radius: R }; world.tryMove(e, 1, 0);
  assert.ok(e.x <= 4 - R + 1e-6);
  world.setBlocker(4, 1, false);
  world.tryMove(e, 1, 0); assert.ok(e.x > 4);
});

test('tryMove: no tunnelling at run speed over many frames, huge steps, thin pushwall movers', () => {
  const { world } = mk(['#########', '#.......#', '#.......#', '#########']);
  const R = 0.27, speed = 6 / 60;   // generous run speed per tick
  const e = { x: 4.5, y: 1.5, radius: R };
  for (let i = 0; i < 500; i++) {
    const a = i * 0.37;
    world.tryMove(e, Math.cos(a) * speed, Math.sin(a) * speed);
    assert.ok(e.x > 1 + R - 1e-6 && e.x < 8 - R + 1e-6 && e.y > 1 + R - 1e-6 && e.y < 3 - R + 1e-6, `escaped at ${i}`);
  }
  for (let i = 0; i < 400; i++) { world.tryMove(e, 2 * (i % 2 ? 1 : -1), 1.3 * (i % 3 - 1)); assert.ok(e.x > 1 && e.x < 8 && e.y > 1 && e.y < 3); }
  // door: closed blocks at any speed, open lets through
  const d = mk(['#####', '#.+.#', '#####']);
  const p = { x: 1.5, y: 1.5, radius: R };
  d.world.tryMove(p, 5, 0); assert.ok(p.x < 2 + 1e-6);
  d.world.openDoor(d.world.doors[0]); step(d.world, 1);
  d.world.tryMove(p, 1.5, 0); assert.ok(p.x > 2.5);
  // opening door (open<0.8) still blocks
  const d2 = mk(['#####', '#.+.#', '#####']);
  d2.world.doors[0].open = 0.5; const q = { x: 1.5, y: 1.5, radius: R };
  d2.world.tryMove(q, 1, 0); assert.ok(q.x <= 2 - R + 1e-6);
});

test('tryMove: entity already overlapping a wall can escape; walking through a doorway centred', () => {
  const { world } = mk(['#####', '#.#.#', '#...#', '#####']);
  const e = { x: 2.0, y: 1.5, radius: 0.27 };   // embedded in wall at (2,1)
  world.tryMove(e, -0.1, 0); assert.ok(e.x < 2);
  const p = { x: 1.5, y: 2.5, radius: 0.27 };
  for (let i = 0; i < 100; i++) world.tryMove(p, 0.05, 0);
  assert.ok(p.x > 3 && Math.abs(p.y - 2.5) < 1e-9);
});

test('distField, nextStep', () => {
  const { world } = mk([
    '#######',
    '#..#..#',
    '#..#..#',
    '#.....#',
    '#######',
  ]);
  const f = world.distField(1, 1);
  assert.equal(f[world.idx(1, 1)], 0);
  assert.equal(f[world.idx(2, 1)], 1);
  assert.equal(f[world.idx(5, 1)], 8);                  // around the wall
  assert.equal(f[world.idx(3, 1)], UNREACHABLE);        // wall
  assert.equal(world.distField(1, 1), f, 'cached');
  assert.equal(world.nextStep(f, 1, 1), null);
  // path follows the field monotonically to the target from anywhere reachable
  for (let cy = 0; cy < world.h; cy++) for (let cx = 0; cx < world.w; cx++) {
    if (f[world.idx(cx, cy)] === UNREACHABLE) { continue; }
    let c = { cx, cy }, n = 0;
    while (f[world.idx(c.cx, c.cy)] !== 0 && n++ < 50) {
      const s = world.nextStep(f, c.cx, c.cy);
      assert.ok(s, `stuck at ${c.cx},${c.cy}`);
      assert.ok(f[world.idx(s.cx, s.cy)] < f[world.idx(c.cx, c.cy)] || (s.cx !== c.cx && s.cy !== c.cy));
      assert.ok(!world.blocksMove(s.cx, s.cy, true));
      if (s.cx !== c.cx && s.cy !== c.cy) { // no corner cutting
        assert.ok(!world.blocksMove(s.cx, c.cy, true) && !world.blocksMove(c.cx, s.cy, true));
      }
      c = s;
    }
    assert.equal(f[world.idx(c.cx, c.cy)], 0);
  }
    assert.equal(world.nextStep(null, 1, 1), null);
  assert.equal(world.nextStep(f, -5, 2), null);
});

test('distField: doors (unlocked passable, locked not), invalidation on state change, blockers, pushwalls', () => {
  const { world } = mk(['#######', '#.+.1.#', '#######']);
  let f = world.distField(1, 1);
  assert.equal(f[world.idx(3, 1)], 2);                       // through the unlocked closed door
  assert.equal(f[world.idx(5, 1)], UNREACHABLE);             // gold door blocks
  world.setBlocker(3, 1, true);
  const f2 = world.distField(1, 1);
  assert.notEqual(f2, f); assert.equal(f2[world.idx(3, 1)], UNREACHABLE);
  world.setBlocker(3, 1, false);
  world.use(3.5, 1.5, Math.PI, {});   // nothing; ensure no throw
  const g = mk(['######', '#.a..#', '######']);
  const a = g.world.distField(1, 1);
  g.world.use(1.5, 1.5, 0, {});
  const b = g.world.distField(1, 1);
  assert.notEqual(a, b);
  // locked door opened: enemies path through once open >= 0.8
  const l = mk(['#####', '#.1.#', '#####']);
  assert.equal(l.world.distField(1, 1)[l.world.idx(3, 1)], UNREACHABLE);
  l.world.use(1.5, 1.5, 0, { gold: true }); step(l.world, 1);
  assert.equal(l.world.distField(1, 1)[l.world.idx(3, 1)], 2);
});

test('soundMask: range, doors stop sound, open doors pass, walls stop', () => {
  const { world } = mk(['#########', '#..#....#', '#..+....#', '#..#....#', '#########']);
  const m = world.soundMask(1, 1, 20);
  assert.equal(m[world.idx(1, 1)], 1); assert.equal(m[world.idx(2, 3)], 1);
  assert.equal(m[world.idx(3, 1)], 0);                        // wall
  assert.equal(m[world.idx(4, 2)], 0);                        // behind closed door
  assert.equal(m[world.idx(3, 2)], 0);                        // the closed door cell itself
  const near = world.soundMask(1, 1, 1);
  assert.equal(near[world.idx(2, 1)], 1); assert.equal(near[world.idx(2, 2)], 0); assert.equal(near[world.idx(3, 3)], 0);
  world.openDoor(world.doors[0]); step(world, 0.2);           // opening: sound passes
  const m2 = world.soundMask(1, 1, 20);
  assert.equal(m2[world.idx(6, 2)], 1);
  assert.equal(world.soundMask(-1, -1, 5).reduce((a, b) => a + b, 0), 0);
  assert.equal(world.soundMask(1, 1, 0).reduce((a, b) => a + b, 0), 1);
});

test('determinism & robustness: same map gives identical state; no bus is fine', () => {
  const map = ['#####', '#.+.#', '#.a.#', '#####'];
  const a = createWorld({ map }, atlas), b = createWorld({ map }, atlas);
  assert.deepEqual([...a.cells], [...b.cells]);
  a.use(1.5, 1.5, 0, {}); step(a, 1);
  assert.doesNotThrow(() => a.update(0.016, null));
  assert.doesNotThrow(() => a.update(-1, {}));
  const bad = createWorld({}, atlas); assert.ok(bad.w >= 3);
});
