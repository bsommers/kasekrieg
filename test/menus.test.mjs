import test from 'node:test';
import assert from 'node:assert/strict';
import { createMenus } from '../src/ui/menus.js';
import { createScreens } from '../src/ui/screens.js';

const dt = 1 / 60;
const tick = (o, n, inp = {}) => { let r = null; for (let i = 0; i < n; i++) { const x = o.update(dt, i === 0 ? inp : {}); if (x) r = x; } return r; };

test('menus: title -> main -> skill -> new game', () => {
  const m = createMenus({ settings: { skill: 1 }, canContinue: false });
  assert.equal(m.active, false);
  m.open('title'); tick(m, 20);
  tick(m, 1, { accept: true }); assert.equal(m.current, 'main');
  tick(m, 10); tick(m, 1, { accept: true }); assert.equal(m.current, 'skill');
  tick(m, 10);
  const a = tick(m, 1, { accept: true });
  assert.deepEqual(a, { type: 'new', skill: 1 }); assert.equal(m.active, false);
});
test('menus: continue disabled is skipped; pause resume; options emit actions', () => {
  const m = createMenus({ canContinue: false });
  m.open('main'); tick(m, 10); tick(m, 1, { down: true }); assert.equal(m.selected, 2);
  m.open('pause'); tick(m, 10);
  assert.deepEqual(tick(m, 1, { pause: true }), { type: 'resume' });
  m.open('options'); tick(m, 10);
  const o = tick(m, 1, { right: true }); assert.equal(o.type, 'option'); assert.equal(o.key, 'quality');
});
test('menus: draw never throws without atlas, with stub ctx proxy', () => {
  const ctx = new Proxy(function () {}, { get: (t, k) => (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
  const m = createMenus({});
  for (const n of ['title', 'main', 'skill', 'options', 'controls', 'pause']) { m.open(n); tick(m, 30); m.draw(ctx, 1); }
});
test('screens: intermission skip then done; others complete', () => {
  const s = createScreens({});
  s.show('intermission', { stats: { kills: 3, killsTotal: 4, treasure: 0, treasureTotal: 0, secrets: 0, secretsTotal: 0, time: 10, par: 20 }, score: 5 });
  tick(s, 30); assert.equal(s.update(dt, { accept: true }), null);
  assert.equal(s.update(dt, { accept: true }), 'done'); assert.equal(s.active, false);
  s.show('levelIntro', { index: 0, name: 'X' }); assert.equal(tick(s, 60 * 5), 'done');
  s.show('gameOver', {}); assert.equal(tick(s, 100, {}), null); assert.equal(tick(s, 1, { accept: true }), 'done');
  s.show('death', { livesLeft: 3 }); assert.equal(tick(s, 60 * 5), 'done');
  s.show('victory', {}); tick(s, 200); assert.equal(tick(s, 1, { accept: true }), 'done');
});
