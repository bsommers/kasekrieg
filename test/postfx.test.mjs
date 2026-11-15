import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostFX } from '../src/render/postfx.js';

test('postfx imports in Node without DOM and rejects non-WebGL2 contexts', () => {
  assert.equal(typeof createPostFX, 'function');
  assert.throws(() => createPostFX(null), /WebGL2/);
  assert.throws(() => createPostFX({}), /WebGL2/);
});
