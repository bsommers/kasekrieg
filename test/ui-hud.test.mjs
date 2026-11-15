import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markExplored, getExplored, drawAutomap } from '../src/ui/automap.js';
import { createHud } from '../src/ui/hud.js';

const w = 8, h = 8;
const cells = new Uint8Array(w * h);
for (let i = 0; i < w; i++) { cells[i] = 1; cells[(h - 1) * w + i] = 1; cells[i * w] = 1; cells[i * w + w - 1] = 1; }
for (let y = 0; y < h; y++) cells[y * w + 4] = 1;   // dividing wall
const world = { w, h, cells, doors: [], doorAt: new Int16Array(w * h).fill(-1), def: { name: 't' },
  blocksSight: (x, y) => cells[y * w + x] === 1,
  hasLOS(x0, y0, x1, y1) { const n = 40; for (let i = 1; i < n; i++) { const t = i / n; if (this.blocksSight(Math.floor(x0 + (x1 - x0) * t), Math.floor(y0 + (y1 - y0) * t))) return false; } return true; } };
const game = { world, player: { x: 2.5, y: 3.5, angle: 0, health: 100, lives: 9, score: 0, ammo: {}, keys: {} }, stats: {} };

test('markExplored reveals visible cells only', () => {
  markExplored(game);
  const e = getExplored(world);
  assert.equal(e[3 * w + 2], 1);       // own cell
  assert.equal(e[3 * w + 3], 1);       // visible floor
  assert.equal(e[3 * w + 4], 1);       // dividing wall face
  assert.equal(e[3 * w + 6], 0);       // behind the wall: unexplored
});

test('hud draw and automap survive a recording ctx and bad input', () => {
  const calls = [];
  const ctx = new Proxy({ canvas: { width: 480, height: 270 } }, { get: (t, k) => (k in t ? t[k] : (...a) => { calls.push(k); return k === 'createLinearGradient' ? { addColorStop() {} } : undefined; }), set: (t, k, v) => { t[k] = v; return true; } });
  const hud = createHud({ images: new Map(), missing: [] });
  hud.onEvent('hurt', { amount: 20, angle: 1 }); hud.onEvent('msg', { text: 'hi', kind: 'warn' }); hud.onEvent('nonsense');
  assert.doesNotThrow(() => hud.draw(ctx, game, 1 / 60));
  assert.doesNotThrow(() => hud.draw(ctx, {}, 1 / 60));
  assert.doesNotThrow(() => drawAutomap(ctx, game));
  assert.ok(calls.length > 10);
});
