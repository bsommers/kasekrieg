import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateLevel, renderPreview } from '../tools/validate-level.mjs';
import { levels, missing, makeFallbackLevel } from '../src/levels/index.js';
import { LEVELS } from '../src/core/defs.js';

const levelsDir = join(dirname(fileURLToPath(import.meta.url)), '../src/levels');

// A minimal valid level to mutate in negative tests.
const base = () => ({
  id: 't', name: 'T', intro: 'x', par: 10, music: 'level_a', wall: 'wall.fort_stone',
  floor: 'flat.floor_stone', ceil: 'flat.ceil_stone', zones: {}, ambient: [0.1, 0.1, 0.1], fog: { color: [0, 0, 0], density: 0.02 },
  map: [
    '#######',
    '#.....#',
    '#.....#',
    '###+###',
    '#....X#',
    '#######',
  ],
  things: [
    '.......',
    '.>.....',
    '.......',
    '.......',
    '.......',
    '.......',
  ],
});
const errs = (d) => validateLevel(d).errors.join('\n');

test('base level is valid', () => {
  const r = validateLevel(base());
  assert.deepEqual(r.errors, []);
  assert.equal(r.summary.exitReachable, true);
});

test('unequal row lengths', () => {
  const d = base(); d.map[2] = '#.....';
  assert.match(errs(d), /row 2 has length 6/);
});

test('unknown tile and thing characters', () => {
  const d = base(); d.map[1] = '#..?..#';
  assert.match(errs(d), /unknown tile character "\?"/);
  const e = base(); e.things[2] = '..@....';
  assert.match(errs(e), /unknown thing character "@"/);
});

test('exactly one start', () => {
  const d = base(); d.things[1] = '.......';
  assert.match(errs(d), /no player start/);
  const e = base(); e.things[2] = '.<.....';
  assert.match(errs(e), /2 player starts/);
});

test('border must be solid', () => {
  const d = base(); d.map[1] = '......#';
  assert.match(errs(d), /border cell \(0,1\)/);
});

test('door geometry', () => {
  const d = base(); d.map[3] = '##.+###'; // door with open cell to the west and wall to the east: not a valid frame
  assert.match(errs(d), /door '\+' at \(3,3\)/);
});

test('things only on open cells', () => {
  const d = base(); d.things[0] = '.m.....';
  assert.match(errs(d), /on a wall cell/);
});

test('unknown texture names', () => {
  const d = base(); d.wall = 'wall.nope';
  assert.match(errs(d), /unknown default wall texture/);
  const e = base(); e.zones = { a: { floor: 'flat.nope' } };
  assert.match(errs(e), /zone 'a': unknown floor/);
});

test('exit unreachable without a key (key order honoured)', () => {
  const d = base(); d.map[3] = '###1###';
  d.things[4] = '....G..'; // key lies behind the lock it opens
  assert.match(errs(d), /exit switch is unreachable/);
  const e = base(); e.map[3] = '###1###'; e.things[2] = '..G....';
  assert.deepEqual(validateLevel(e).errors, []);
});

test('locked door without key', () => {
  const d = base(); d.map[3] = '###2###';
  assert.match(errs(d), /silver locked door.*no silver key/);
});

test('critical path must not need a pushwall', () => {
  const d = base();
  d.map = ['#########', '#.......#', '#.......#', '####q####'.replace('q', 'a'), '#...#..X#', '#########'];
  d.things = d.map.map(() => '.........'); d.things[1] = '.>.......';
  // lowercase 'a' = pushwall of wall.cheddar_brick; below it only 1 open cell then wall: clearance fails
  assert.match(errs(d), /pushwall 'a' at \(4,3\)/);
  const e = base();
  e.map = ['#######', '#.....#', '#.....#', '###a###', '#.....#', '#....X#', '#######'];
  e.things = e.map.map(() => '.......'); e.things[1] = '.>.....';
  assert.match(errs(e), /only reachable through a secret/);
});

test('secret treasure is allowed off the critical path', () => {
  const d = {
    ...base(),
    map: ['#########', '#.......#', '#.....X.#', '####a####', '#..#.#..#', '#.......#', '#########'],
  };
  // pushwall at (4,3): front (4,2) open, behind (4,4) and (4,5) open
  d.map = ['#########', '#......X#', '#.......#', '####a####', '#.......#', '#.......#', '#########'];
  d.things = d.map.map(() => '.........'); d.things[1] = '.>.......'; d.things[5] = '...$.....';
  const r = validateLevel(d);
  assert.deepEqual(r.errors, []);
  assert.equal(r.summary.secrets, 1);
  assert.ok(r.info.some((m) => /only reachable through a secret/.test(m)));
});

test('missing exit', () => {
  const d = base(); d.map[4] = '#.....#';
  assert.match(errs(d), /no exit switch/);
});

test('fallback level is valid and preview renders', () => {
  const f = makeFallbackLevel('e1m1', 'X');
  const r = validateLevel(f);
  assert.deepEqual(r.errors, []);
  const pv = renderPreview(f, r, 12);
  assert.equal(pv.w, 120);
  assert.equal(pv.rgba.length, pv.w * pv.h * 4);
});

test('index exposes every level in LEVELS order', () => {
  assert.equal(levels.length, LEVELS.length);
  levels.forEach((l, i) => {
    assert.ok(l.map && l.things);
    if (!missing.includes(LEVELS[i][0])) assert.equal(l.id, LEVELS[i][0]);
  });
  for (const id of missing) assert.ok(LEVELS.some(([l]) => l === id));
});

// Every level file that exists on disk must validate cleanly.
const files = readdirSync(levelsDir).filter((f) => /^e\d+m\d+\.js$/.test(f)).sort();
for (const f of files) {
  test(`level file ${f} validates`, async () => {
    const mod = await import(pathToFileURL(join(levelsDir, f)).href);
    const r = validateLevel(mod.default, f);
    assert.equal(mod.default.id, f.replace('.js', ''), 'id matches file name');
    assert.deepEqual(r.errors, [], r.errors.join('\n'));
  });
}
