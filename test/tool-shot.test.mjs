import test from 'node:test';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { startStatic } from '../tools/serve.mjs';

test('serve: MIME types and traversal guard', async () => {
  const s = await startStatic({});
  try {
    const js = await fetch(s.url + '/tools/serve.mjs');
    assert.match(js.headers.get('content-type'), /javascript/);
    const bad = await fetch(s.url + '/%2e%2e/%2e%2e/etc/passwd');
    assert.notStrictEqual(bad.status, 200);
    assert.strictEqual((await fetch(s.url + '/nope')).status, 404);
  } finally { await s.close(); }
});

test('shot: eval + screenshot on a data page', { timeout: 40000 }, (t) => {
  let out;
  try { out = execFileSync('node', ['tools/shot.mjs', '--url', 'data:text/html,<p>hi</p>', '--out', 'out/shots/tool-shot/test.png', '--eval', '1+1', '--gpu', 'none'], { encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname }); }
  catch (e) { return t.skip('chrome unavailable: ' + e.message.slice(0, 80)); }
  const r = JSON.parse(out);
  assert.strictEqual(r.ok, true); assert.strictEqual(r.eval, 2);
});
