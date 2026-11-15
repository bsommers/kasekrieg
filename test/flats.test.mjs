import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from '../src/art/flats.js';
import { artManifest } from '../src/core/defs.js';
test('flats: names, sizes, opaque, deterministic, fast', () => {
  const t0 = performance.now(); const a = build(); const ms = performance.now() - t0;
  assert.ok(ms < 100, 'build ms ' + ms);
  const b = build();
  for (const m of artManifest().filter((x) => x.module === 'flats')) {
    const f = [].concat(a[m.name]); assert.equal(f.length, m.frames, m.name);
    f.forEach((p, i) => { assert.equal(p.w, 64); for (let k = 3; k < p.rgba.length; k += 4) assert.equal(p.rgba[k], 255, m.name);
      assert.deepEqual(p.rgba, [].concat(b[m.name])[i].rgba); });
  }
});
test('flats: seamless (edge-pair contrast not extreme)', () => {
  const a = build();
  for (const [n, v] of Object.entries(a)) for (const p of [].concat(v)) {
    const d = (i, j) => Math.abs(p.rgba[i] - p.rgba[j]) + Math.abs(p.rgba[i + 1] - p.rgba[j + 1]) + Math.abs(p.rgba[i + 2] - p.rgba[j + 2]);
    let seam = 0, inner = 0;
    for (let k = 0; k < 64; k++) { seam += d((k * 64 + 63) * 4, (k * 64) * 4) + d((63 * 64 + k) * 4, k * 4); inner += d((k * 64 + 31) * 4, (k * 64 + 32) * 4) + d((31 * 64 + k) * 4, (32 * 64 + k) * 4); }
    assert.ok(seam < inner * 2.5 + 400, `${n} seam ${seam} vs inner ${inner}`);
  }
});
