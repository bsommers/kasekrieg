import test from 'node:test';
import assert from 'node:assert/strict';
import { artManifest } from '../src/core/defs.js';
import { build } from '../src/art/items.js';

const want = artManifest().filter((a) => a.module === 'items');
test('items: exact names, sizes, hard alpha, grounded, deterministic, fast', () => {
  const t0 = performance.now(); const a = build(); const ms = performance.now() - t0;
  assert.ok(ms < 100, `build took ${ms}ms`);
  assert.deepEqual(Object.keys(a).sort(), want.map((w) => w.name).sort());
  const b = build();
  for (const w of want) {
    const p = a[w.name]; assert.equal(p.w, 64); assert.equal(p.h, 64);
    let bottom = 0, top = 64, left = 64, right = -1;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const al = p.rgba[(y * 64 + x) * 4 + 3]; assert.ok(al === 0 || al === 255, w.name + ' soft alpha');
      if (al) { top = Math.min(top, y); left = Math.min(left, x); right = Math.max(right, x); if (y === 63) bottom++; }
    }
    assert.ok(bottom > 0, w.name + ' not on bottom row');
    assert.ok(64 - top >= 22 && 64 - top <= 42, `${w.name} height ${64 - top}`);
    assert.ok(Math.abs((left + right) / 2 - 31.5) < 6, w.name + ' off-centre');
    assert.deepEqual(p.rgba, b[w.name].rgba, w.name + ' nondeterministic');
  }
});
