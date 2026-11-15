import test from 'node:test';
import assert from 'node:assert/strict';
import { createPacker, lightFalloff, QUALITY } from '../src/render/renderer.js';
import { traceFrag, VERT } from '../src/render/shaders/trace.js';

test('render-core: quality presets match ARCHITECTURE §9', () => {
  const want = { low: [320, 180], medium: [480, 270], high: [640, 360], ultra: [960, 540] };
  for (const [k, [w, h]] of Object.entries(want)) { assert.equal(QUALITY[k].w, w); assert.equal(QUALITY[k].h, h); }
});
test('render-core: light falloff is 1 at the source and 0 at range', () => {
  assert.equal(lightFalloff(0), 1); assert.equal(lightFalloff(1), 0);
  assert.ok(lightFalloff(0.5) > 0 && lightFalloff(0.5) < 1);
});
test('render-core: shader sources generate for every preset', () => {
  assert.ok(VERT.startsWith('#version 300 es'));
  for (const k of Object.keys(QUALITY)) { const s = traceFrag(QUALITY[k]); assert.ok(s.includes('void main')); assert.ok(!s.includes('undefined') && !s.includes('NaN')); }
});
test('render-core: packer is constructible without GL', () => {
  const p = createPacker({ tiles: { count: 4, anim: new Uint8Array(4).fill(1), index: new Map() } });
  assert.equal(typeof p.pack, 'function');
});
