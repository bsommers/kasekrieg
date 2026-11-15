// Smoke test for the app shell: boots main.js in headless Chrome against a mock sim (test/harness.html).
// Skipped when tools/shot.mjs cannot launch Chrome.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
function shot(query, evalJs, extra = []) {
  const r = spawnSync('node', ['tools/shot.mjs', '--url', `/test/harness.html?${query}`, '--out', 'out/shots/app-shell/test.png',
    '--wait', '2500', '--timeout', '60000', '--eval', evalJs, ...extra], { cwd: root, encoding: 'utf8', timeout: 90000 });
  const m = /\{[\s\S]*\}\s*$/.exec(r.stdout || '');
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

test('autostart + demo bot moves the player; pos/god params apply', (t) => {
  const out = shot('autostart=1&mute=1&god=1&demo=1&seed=3', 'JSON.stringify({s:__game.state,r:__game.ready,g:__game.game.cheats.god,t:__game.game.stats.time})');
  if (!out) return t.skip('headless Chrome unavailable');
  const v = JSON.parse(out.eval);
  assert.equal(v.s, 'playing'); assert.equal(v.r, true); assert.equal(v.g, true); assert.ok(v.t > 1);
});

test('without autostart the shell sits on the title screen', (t) => {
  const out = shot('mute=1', 'JSON.stringify({s:__game.state})');
  if (!out) return t.skip('headless Chrome unavailable');
  assert.equal(JSON.parse(out.eval).s, 'title');
});
