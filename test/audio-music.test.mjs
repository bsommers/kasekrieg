import test from 'node:test';
import assert from 'node:assert/strict';
import { MUSIC } from '../src/core/defs.js';
import { MUSIC_NAMES, loadSong } from '../src/audio/music.js';

test('music names match defs.MUSIC', () => {
  assert.deepEqual([...MUSIC_NAMES].sort(), [...MUSIC].sort());
});

for (const name of MUSIC) {
  test(`song ${name} compiles with sane length and content`, async () => {
    const s = await loadSong(name);
    const dur = s.totalSteps * s.stepSec;
    if (s.loop) assert.ok(dur >= 40 && dur <= 90, `loop ${dur}s`);
    else assert.ok(dur >= 8 && dur <= 30, `jingle ${dur}s`);
    const ids = s.tracks.map(t => t.id);
    assert.ok(ids.includes('drums'), 'has drums');
    assert.ok(s.tracks.filter(t => t.inst !== 'drums').length >= 3, 'melody+bass+harmony');
    assert.ok(s.events.flat().some(e => e.note !== undefined));
  });
}

