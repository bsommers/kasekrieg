import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from '../src/art/fx.js';
import { artManifest } from '../src/core/defs.js';

test('fx covers manifest with right frames/sizes and non-empty frames', () => {
  const out = build();
  for (const a of artManifest().filter((m) => m.module === 'fx')) {
    const fr = [].concat(out[a.name]);
    assert.equal(fr.length, a.frames, a.name);
    for (const p of fr) {
      assert.equal(p.w, 64); assert.equal(p.h, 64);
      let n = 0; for (let i = 3; i < p.rgba.length; i += 4) if (p.rgba[i]) n++;
      assert.ok(n > 20, a.name + ' frame empty');
    }
  }
});
test('fx build is deterministic and fast', () => {
  const t = Date.now(); const a = build(); assert.ok(Date.now() - t < 100);
  const b = build();
  assert.deepEqual(a['fx.fur'][1].rgba, b['fx.fur'][1].rgba);
});
