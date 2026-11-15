import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from '../src/art/enemies_infantry.js';
import { artManifest } from '../src/core/defs.js';

const want = artManifest().filter((a) => a.module === 'enemies_infantry');
const t0 = performance.now(); const out = build(); const ms = performance.now() - t0;

test('enemies_infantry covers exactly its manifest names with right frames/sizes', () => {
  assert.deepEqual(Object.keys(out).sort(), want.map((a) => a.name).sort());
  for (const a of want) {
    assert.equal(out[a.name].length, a.frames, a.name);
    for (const f of out[a.name]) { assert.equal(f.w, 64); assert.equal(f.h, 64); }
  }
});

test('sprites: hard alpha, transparent bg, feet on the bottom row, not touching sides', () => {
  for (const a of want) for (const [i, f] of out[a.name].entries()) {
    let bottom = false, side = false;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const al = f.rgba[(y * 64 + x) * 4 + 3];
      assert.ok(al === 0 || al === 255, `${a.name}[${i}] soft alpha`);
      if (al && y === 63) bottom = true;
      if (al && (x === 0 || x === 63)) side = true;
    }
    assert.ok(bottom, `${a.name}[${i}] not on the floor`);
    assert.ok(!side, `${a.name}[${i}] clipped at the side`);
  }
});

test('attack FIRE frame has emissive muzzle flash; others do not', () => {
  const emit = (f) => { let n = 0; for (let i = 0; i < f.mat.length; i += 4) if (f.mat[i] > 200) n++; return n; };
  for (const t of ['mouse', 'trooper', 'officer']) {
    const [aim, fire] = out[`${t}.attack`];
    assert.ok(emit(fire) > 20, t);
    assert.ok(emit(aim) < 10, t);
  }
});

test('deterministic and fast', () => {
  const again = build();
  for (const k of Object.keys(out)) assert.deepEqual(again[k][0].rgba, out[k][0].rgba, k);
  assert.ok(ms < 150, `build took ${ms.toFixed(1)} ms`);
  console.log(`  build ${ms.toFixed(1)} ms`);
});
