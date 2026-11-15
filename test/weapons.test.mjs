import { test } from 'node:test';
import assert from 'node:assert/strict';
import { artManifest } from '../src/core/defs.js';
import { build } from '../src/art/weapons.js';

const want = artManifest().filter((a) => a.module === 'weapons');
const sum = (f, plane, ch) => { let n = 0; for (let i = ch; i < f[plane].length; i += 4) n += f[plane][i]; return n; };

test('weapons: exact manifest names, sizes, frame counts', () => {
  const b = build();
  assert.deepEqual(Object.keys(b).sort(), want.map((a) => a.name).sort());
  for (const a of want) {
    const fr = Array.isArray(b[a.name]) ? b[a.name] : [b[a.name]];
    assert.equal(fr.length, a.frames, a.name);
    for (const f of fr) { assert.equal(f.w, 128); assert.equal(f.h, 128); }
  }
});

test('weapons: deterministic and fast', () => {
  const t0 = performance.now(); const a = build(); const ms = performance.now() - t0;
  const b = build();
  for (const k of Object.keys(a)) {
    const fa = [a[k]].flat(), fb = [b[k]].flat();
    fa.forEach((f, i) => { assert.deepEqual(f.rgba, fb[i].rgba, k); assert.deepEqual(f.mat, fb[i].mat, k); });
  }
  assert.ok(ms < 150, `build took ${ms.toFixed(1)} ms`);
});

test('weapons: anchored to the bottom edge, transparent top, hard alpha', () => {
  for (const [k, v] of Object.entries(build())) for (const f of [v].flat()) {
    let bottom = 0, top = 0, soft = 0;
    for (let x = 0; x < 128; x++) { if (f.rgba[(127 * 128 + x) * 4 + 3]) bottom++; if (f.rgba[x * 4 + 3]) top++; }
    for (let i = 3; i < f.rgba.length; i += 4) if (f.rgba[i] && f.rgba[i] < 255) soft++;
    assert.ok(bottom >= 20, `${k}: only ${bottom} opaque px on the bottom row`);
    assert.equal(top, 0, `${k}: touches top row`);
    assert.equal(soft, 0, `${k}: soft alpha`);
  }
});

test('weapons: fire frames differ from idle and from each other; frame 0 or 1 is emissive', () => {
  const b = build();
  for (const w of ['claws', 'pistol', 'gatling', 'yarn', 'laser']) {
    const idle = b[`wpn.${w}.idle`], fire = b[`wpn.${w}.fire`];
    const sigs = [idle, ...fire].map((f) => Buffer.from(f.rgba).toString('base64'));
    assert.equal(new Set(sigs).size, sigs.length, `${w}: duplicate frames`);
    assert.ok(Math.max(sum(fire[0], 'mat', 0), sum(fire[1], 'mat', 0)) > sum(idle, 'mat', 0) + 255 * 40, `${w}: fire not emissive`);
  }
});
