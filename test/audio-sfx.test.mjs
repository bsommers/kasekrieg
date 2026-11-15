import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { SFX } from '../src/core/defs.js';
import { SFX_NAMES, SFX_MISSING, hasSfx, playSfx } from '../src/audio/sfx.js';
import { createAudio } from '../src/audio/audio.js';

test('every defs.SFX name has a synthesiser, and no extras', () => {
  assert.deepEqual(SFX_MISSING, []);
  assert.deepEqual([...SFX_NAMES].sort(), [...SFX].sort());
  assert.equal(hasSfx('nope'), false);
});

test('audio is a silent no-op without AudioContext', () => {
  const a = createAudio();
  assert.equal(a.ready, false);
  a.unlock(); a.sfx('meow'); a.sfx('bogus', { x: 1, y: 2 }); a.setListener(1, 2, 3);
  a.music('title'); a.music(null); a.setVolume({ master: 0.5 }); a.suspend(); a.resume();
  assert.equal(a.ready, false);
});

// minimal recording fake of the WebAudio graph
function fakeCtx() {
  const pans = [], plays = [];
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} });
  const node = extra => ({ connect() {}, disconnect() {}, start() {}, stop() {}, gain: param(), frequency: param(), Q: param(), ...extra });
  class Ctx {
    constructor() { this.state = 'suspended'; this.currentTime = 1; this.sampleRate = 8000; this.destination = node(); }
    resume() { this.state = 'running'; }
    suspend() { this.state = 'suspended'; }
    createGain() { return node(); } createOscillator() { return node(); } createBiquadFilter() { return node(); }
    createWaveShaper() { plays.push(1); return node(); } createDynamicsCompressor() { return node({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }); }
    createBuffer(c, n) { return { getChannelData: () => new Float32Array(n) }; }
    createBufferSource() { return node(); }
    createStereoPanner() { const p = node({ pan: param() }); pans.push(p); return p; }
  }
  return { Ctx, pans, plays };
}

test('positional sfx: equal-power pan direction and falloff', () => {
  const { Ctx, pans, plays } = fakeCtx();
  const a = createAudio({ AudioContext: Ctx });
  a.unlock();
  assert.equal(a.ready, true);
  a.setListener(10, 10, 0);                       // facing east
  a.sfx('pistol', { x: 14, y: 10 });              // straight ahead -> centred, no panner
  assert.equal(pans.length, 0);
  assert.equal(plays.length, 1);
  a.sfx('claw_hit', { x: 10, y: 14 });            // south of an east-facing player = right
  assert.ok(pans[0].pan.value > 0.9, 'right');
  a.sfx('mouse_pain', { x: 10, y: 6 });           // north = left
  assert.ok(pans[1].pan.value < -0.9, 'left');
  const before = plays.length;
  a.sfx('explosion', { x: 100, y: 100 });         // out of earshot
  a.sfx('meow', { x: 10, y: 14, vol: 0.001 });    // too quiet
  assert.equal(plays.length, before);
  a.sfx('not_a_sound'); a.sfx('menu_move');       // unknown: no-op; non-positional: plays
  assert.equal(plays.length, before + 1);
});

test('same-name spam inside MIN_GAP is dropped', () => {
  const { Ctx, plays } = fakeCtx();
  const a = createAudio({ AudioContext: Ctx }); a.unlock();
  a.sfx('gatling'); a.sfx('gatling');
  assert.equal(plays.length, 1);
});

test('playSfx on a fake context returns plausible durations', () => {
  const { Ctx } = fakeCtx(); const c = new Ctx();
  for (const n of SFX) { const d = playSfx(c, c.destination, n, 0); assert.ok(d > 0.05 && d < 4, `${n}: ${d}`); }
});

test('headless Chrome OfflineAudioContext render: non-silent, peak<1, sane duration', { skip: !existsSync('/usr/bin/google-chrome') && 'no chrome' }, () => {
  const r = spawnSync(process.execPath, ['tools/shot.mjs', '--url', '/src/audio/sfx-demo.html', '--out', 'out/shots/audio-sfx/test.png',
    '--wait-for', 'window.__demoReady===true', '--eval', 'window.__renderAll().then(r=>JSON.stringify(r))', '--strict'], { encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname, timeout: 120000 });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const rows = JSON.parse(JSON.parse(r.stdout).eval);
  assert.equal(rows.length, SFX.length);
  const bad = rows.filter(x => !x.ok);
  assert.deepEqual(bad, []);
  console.log('name'.padEnd(18) + 'dur'.padStart(7) + 'audible'.padStart(9) + 'peak'.padStart(8) + 'rms'.padStart(8));
  for (const x of rows) console.log(x.name.padEnd(18) + String(x.dur).padStart(7) + String(x.audible).padStart(9) + String(x.peak).padStart(8) + String(x.rms).padStart(8));
});
