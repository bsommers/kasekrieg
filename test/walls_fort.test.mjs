import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from '../src/art/walls_fort.js';
import { artManifest } from '../src/core/defs.js';

const names = artManifest().filter((a) => a.module === 'walls_fort');
test('walls_fort covers manifest, opaque, right size', () => {
  build(); const t0 = performance.now(); const out = build(); const ms = performance.now() - t0;
  assert.ok(ms < 100, `build ${ms}ms`);
  for (const a of names) {
    const f = [].concat(out[a.name]); assert.equal(f.length, a.frames, a.name);
    for (const p of f) {
      assert.equal(p.w, 64); assert.equal(p.h, 64);
      for (let i = 3; i < p.rgba.length; i += 4) assert.equal(p.rgba[i], 255, a.name + ' alpha');
    }
  }
});
test('deterministic', () => {
  const a = build(), b = build();
  for (const n of Object.keys(a)) [].concat(a[n]).forEach((p, i) => assert.deepEqual(p.rgba, [].concat(b[n])[i].rgba, n));
});
test('wall.mirror has a large gloss-1.0 area', () => {
  const p = build()['wall.mirror']; let n = 0;
  for (let i = 1; i < p.mat.length; i += 4) if (p.mat[i] >= 250) n++;
  assert.ok(n > 1500, 'mirror texels ' + n);
});
test('walls tile left-right without hard seams', () => {
  const out = build();
  for (const a of names) {
    if (a.name === 'wall.exit_switch' || (a.name.startsWith('door.') && a.name !== 'door.jamb')) continue;
    const p = [].concat(out[a.name])[0]; let big = 0;
    for (let y = 0; y < 64; y++) {
      const l = (y * 64) * 4, r = (y * 64 + 63) * 4;
      let d = 0; for (let k = 0; k < 3; k++) d += Math.abs(p.rgba[l + k] - p.rgba[r + k]);
      if (d > 200) big++;
    }
    assert.ok(big < 32, `${a.name} seam rows ${big}`);
  }
});
