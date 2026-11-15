// KÄSEKRIEG tracker-style chiptune engine (ARCHITECTURE §10).
//   createMusic(ctx, destination) → { play(name), stop(), setVolume(v), current }
// Songs are plain data modules in ./songs/<name>.js (see songs/_util.js for the notation). The engine compiles a
// song into a per-step event table, then schedules notes a little ahead of the audio clock. The very same
// compile/schedule code drives OfflineAudioContext renders (renderSong), so what tests measure is what plays.
// Pure ES module: nothing touches DOM globals at import time (safe in Node).

export const MUSIC_NAMES = ['title', 'level_a', 'level_b', 'level_c', 'boss', 'intermission', 'victory', 'gameover'];

// Static dynamic-imports so bundlers / static servers resolve them.
const LOADERS = {
  title: () => import('./songs/title.js'),
  level_a: () => import('./songs/level_a.js'),
  level_b: () => import('./songs/level_b.js'),
  level_c: () => import('./songs/level_c.js'),
  boss: () => import('./songs/boss.js'),
  intermission: () => import('./songs/intermission.js'),
  victory: () => import('./songs/victory.js'),
  gameover: () => import('./songs/gameover.js'),
};

const FADE = 0.25;          // crossfade seconds
const LOOKAHEAD = 0.45;     // how far ahead of the audio clock we schedule
const TICK_MS = 90;

// ───────────────────────── notation → events ─────────────────────────
const NOTE_RE = /^([a-g])([#b]?)(-?\d)$/;
const SEMI = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/** 'c4' → 60, 'bb3' → 58, 'f#5' → 78. Throws on garbage. */
export function midi(name) {
  const m = NOTE_RE.exec(name);
  if (!m) throw new Error(`bad note "${name}"`);
  return SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) + 1) * 12;
}
export const hz = n => 440 * Math.pow(2, (n - 69) / 12);

/**
 * Parse one bar of a melodic track into [{step, len, note}] (note = midi). Tokens (space separated):
 *   `c4` 1 step · `c4*3` 3 steps · `.` rest 1 step · `.*4` rest · `-` extend the previous note by 1 step.
 */
export function parseBar(str, steps = 16) {
  const out = []; let pos = 0, last = null;
  for (const tok of String(str).trim().split(/\s+/)) {
    if (!tok) continue;
    if (tok === '-') { if (last) last.len++; pos++; continue; }
    const [nm, lenS] = tok.split('*');
    const len = lenS === undefined ? 1 : Number(lenS);
    if (!Number.isInteger(len) || len < 1) throw new Error(`bad length in "${tok}"`);
    if (nm === '.') { last = null; pos += len; continue; }
    last = { step: pos, len, note: midi(nm) };
    out.push(last); pos += len;
  }
  if (pos !== steps) throw new Error(`bar has ${pos} steps, expected ${steps}: "${str}"`);
  return out;
}

/** Parse a drum bar: one char per step ('.' = nothing), spaces ignored. Returns [{step, ch}]. */
export function parseDrums(str, steps = 16) {
  const s = String(str).replace(/\s+/g, '');
  if (s.length !== steps) throw new Error(`drum bar has ${s.length} steps, expected ${steps}: "${str}"`);
  const out = [];
  for (let i = 0; i < s.length; i++) if (s[i] !== '.') {
    if (!DRUM_CHARS.includes(s[i])) throw new Error(`bad drum char "${s[i]}"`);
    out.push({ step: i, ch: s[i] });
  }
  return out;
}
const DRUM_CHARS = 'kKsSxhHoctuC';

/**
 * Song shape:
 *  { name, bpm, steps?: 16 (steps per bar), bars?, swing?: 0..0.5, loop?: true, gain?: 1,
 *    tracks: [{ id, inst, vol, gate?, pan?, bars: [barString,…] (repeats modulo), …instrument params }] }
 * inst: 'pulse' (duty, vib:{rate,depth,delay}, a,d,s,r) · 'tri' · 'fm' (ratio, index, decay) · 'drums'.
 * → { name, stepSec, steps, bars, totalSteps, loop, gain, tracks, events: Array(totalSteps) of [{tr, note?, ch?, len}] }
 */
export function compileSong(song) {
  const steps = song.steps ?? 16;
  const stepSec = 60 / song.bpm / 4;
  const nBars = song.bars ?? Math.max(...song.tracks.map(t => t.bars.length));
  const totalSteps = nBars * steps;
  const events = Array.from({ length: totalSteps }, () => []);
  const tracks = song.tracks.map((t, i) => ({ ...t, index: i }));
  for (const tr of tracks) {
    if (!tr.bars || !tr.bars.length) throw new Error(`track ${tr.id} has no bars`);
    for (let b = 0; b < nBars; b++) {
      const str = tr.bars[b % tr.bars.length];
      try {
        if (tr.inst === 'drums') for (const d of parseDrums(str, steps)) events[b * steps + d.step].push({ tr, ch: d.ch, len: 1 });
        else for (const n of parseBar(str, steps)) events[b * steps + n.step].push({ tr, note: n.note, len: n.len });
      } catch (e) { throw new Error(`${song.name}/${tr.id} bar ${b + 1}: ${e.message}`); }
    }
  }
  return { name: song.name, bpm: song.bpm, stepSec, steps, bars: nBars, totalSteps, swing: song.swing ?? 0,
    loop: song.loop !== false, gain: song.gain ?? 1, tracks, events };
}

// ───────────────────────── voices ─────────────────────────
const caches = new WeakMap();      // ctx → { noise, waves: Map }
function cacheFor(ctx) {
  let c = caches.get(ctx);
  if (!c) { c = { noise: null, waves: new Map() }; caches.set(ctx, c); }
  return c;
}

function noiseBuffer(ctx) {
  const c = cacheFor(ctx);
  if (c.noise) return c.noise;
  const n = Math.floor(ctx.sampleRate * 1.5);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let s = 0x9e3779b9;                                  // xorshift32: deterministic
  for (let i = 0; i < n; i++) { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; d[i] = (s / 2147483648) - 1; }
  return (c.noise = buf);
}

function pulseWave(ctx, duty) {
  const c = cacheFor(ctx);
  const key = Math.round(duty * 1000);
  let w = c.waves.get(key);
  if (w) return w;
  const N = 48, real = new Float32Array(N + 1), imag = new Float32Array(N + 1);
  for (let k = 1; k <= N; k++) real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);   // a_k cos(kθ) series of a pulse
  w = ctx.createPeriodicWave(real, imag);
  c.waves.set(key, w);
  return w;
}

/** Amplitude envelope: attack → decay to sustain → hold to `end` → release. Returns time the sound is silent. */
function envelope(g, t, end, vol, { a = 0.004, d = 0.05, s = 0.8, r = 0.04 } = {}) {
  const p = g.gain;
  p.setValueAtTime(0, t);
  const aEnd = Math.min(t + a, end);
  p.linearRampToValueAtTime(vol * (aEnd - t) / a, aEnd);
  let level = vol * (aEnd - t) / a;
  if (end > aEnd) {
    const dEnd = Math.min(aEnd + d, end);
    level = vol * (1 - (1 - s) * (d > 0 ? (dEnd - aEnd) / d : 1));
    p.linearRampToValueAtTime(level, dEnd);
    if (end > dEnd) p.setValueAtTime(level, end);
  }
  p.linearRampToValueAtTime(0, end + r);
  return end + r;
}

function makeOsc(ctx, type, freq, t) {
  const o = ctx.createOscillator();
  if (type && type !== 'pulse') o.type = type;
  o.frequency.setValueAtTime(freq, t);
  return o;
}

function playPitched(ctx, dest, tr, note, t, dur, vel) {
  const f = hz(note);
  const gate = tr.gate ?? 0.9;
  const end = t + Math.max(0.02, dur * gate);
  const g = ctx.createGain();
  const vol = (tr.vol ?? 0.2) * vel;
  let stopAt;
  let out = g;
  if (tr.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = tr.pan; g.connect(p); out = p; }
  out.connect(dest);

  if (tr.inst === 'fm') {
    const car = makeOsc(ctx, 'sine', f, t), mod = makeOsc(ctx, 'sine', f * (tr.ratio ?? 2), t);
    const mg = ctx.createGain();
    const idx = (tr.index ?? 2) * f;
    mg.gain.setValueAtTime(idx, t);
    mg.gain.exponentialRampToValueAtTime(Math.max(1, idx * (tr.indexEnd ?? 0.05)), t + (tr.decay ?? 0.5));
    mod.connect(mg); mg.connect(car.frequency); car.connect(g);
    stopAt = envelope(g, t, end, vol, { a: tr.a ?? 0.003, d: tr.d ?? (tr.decay ?? 0.5), s: tr.s ?? 0.15, r: tr.r ?? 0.12 });
    car.start(t); mod.start(t); car.stop(stopAt + 0.02); mod.stop(stopAt + 0.02);
    return;
  }

  const o = makeOsc(ctx, tr.inst === 'tri' ? 'triangle' : tr.inst === 'saw' ? 'sawtooth' : 'pulse', f, t);
  if (tr.inst === 'pulse') o.setPeriodicWave(pulseWave(ctx, tr.duty ?? 0.5));
  if (tr.slide) {                                      // start `slide` semitones off and glide in
    o.frequency.setValueAtTime(f * Math.pow(2, tr.slide / 12), t);
    o.frequency.exponentialRampToValueAtTime(f, t + (tr.slideTime ?? 0.04));
  }
  let lfo = null;
  if (tr.vib && dur > 0.2) {
    lfo = ctx.createOscillator(); lfo.frequency.value = tr.vib.rate ?? 5.5;
    const lg = ctx.createGain();
    lg.gain.setValueAtTime(0, t);
    lg.gain.setValueAtTime(0, t + (tr.vib.delay ?? 0.12));
    lg.gain.linearRampToValueAtTime(tr.vib.depth ?? 10, t + (tr.vib.delay ?? 0.12) + 0.15);
    lfo.connect(lg); lg.connect(o.detune);
  }
  o.connect(g);
  stopAt = envelope(g, t, end, vol, tr.inst === 'tri' ? { a: 0.005, d: 0, s: 1, r: tr.r ?? 0.03 } : { a: tr.a, d: tr.d, s: tr.s, r: tr.r });
  o.start(t); o.stop(stopAt + 0.02);
  if (lfo) { lfo.start(t); lfo.stop(stopAt + 0.02); }
}

function noiseHit(ctx, dest, t, { dur, vol, type, freq, q = 0.7, seed = 0, to }) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  src.connect(f); f.connect(g); g.connect(dest);
  src.start(t, ((seed * 0.6180339) % 1) * 1.2);       // deterministic offset into the noise
  src.stop(t + dur + 0.02);
}

function toneHit(ctx, dest, t, { f0, f1, dur, vol, type = 'sine' }) {
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.6);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g); g.connect(dest);
  o.start(t); o.stop(t + dur + 0.02);
}

function playDrum(ctx, dest, tr, ch, t, seed) {
  const v = (tr.vol ?? 0.3), acc = ch === ch.toUpperCase() && ch !== '.' ? 1 : 0.75;
  const c = ch.toLowerCase();
  const out = dest;
  if (c === 'k') { toneHit(ctx, out, t, { f0: 160, f1: 42, dur: 0.2, vol: v * 1.25 * acc }); noiseHit(ctx, out, t, { dur: 0.02, vol: v * 0.4, type: 'lowpass', freq: 3000, seed }); }
  else if (c === 's') { noiseHit(ctx, out, t, { dur: 0.17, vol: v * 0.9 * acc, type: 'bandpass', freq: 2100, q: 0.6, seed }); toneHit(ctx, out, t, { f0: 220, f1: 130, dur: 0.09, vol: v * 0.5 * acc, type: 'triangle' }); }
  else if (c === 'x') noiseHit(ctx, out, t, { dur: 0.035, vol: v * 0.7 * acc, type: 'bandpass', freq: 4200, q: 3, seed });
  else if (c === 'h') noiseHit(ctx, out, t, { dur: 0.045, vol: v * 0.55 * acc, type: 'highpass', freq: 7500, seed });
  else if (c === 'o') noiseHit(ctx, out, t, { dur: 0.24, vol: v * 0.5 * acc, type: 'highpass', freq: 6500, seed });
  else if (c === 'c') noiseHit(ctx, out, t, { dur: 1.0, vol: v * 0.55, type: 'highpass', freq: 4500, seed });
  else if (c === 't') toneHit(ctx, out, t, { f0: 230, f1: 120, dur: 0.22, vol: v * 0.9 * acc });
  else if (c === 'u') toneHit(ctx, out, t, { f0: 150, f1: 80, dur: 0.28, vol: v * 0.95 * acc });
}

/** Schedule every event of one step. `t` is the step's start time; `bus` the destination. */
export function scheduleStep(ctx, bus, song, stepIndex, t) {
  const evs = song.events[stepIndex];
  for (let i = 0; i < evs.length; i++) {
    const e = evs[i];
    if (e.ch !== undefined) playDrum(ctx, bus, e.tr, e.ch, t, stepIndex * 7 + e.tr.index);
    else playPitched(ctx, bus, e.tr, e.note, t, e.len * song.stepSec, e.tr.vel ?? 1);
  }
}

/** Time offset of step s within its beat pair (swing delays odd steps). */
export function stepTime(song, absStep) {
  return absStep * song.stepSec + ((absStep & 1) ? song.swing * song.stepSec : 0);
}

/**
 * Offline helper: schedule `loops` repetitions (or one pass for non-looping songs) starting at t0. Returns the
 * time (relative to t0) at which one loop ends. For use with OfflineAudioContext.
 */
export function renderSong(ctx, dest, song, { loops = 1, t0 = 0 } = {}) {
  const n = song.loop ? loops : 1;
  const bus = ctx.createGain(); bus.gain.value = song.gain; bus.connect(dest);
  for (let l = 0; l < n; l++)
    for (let s = 0; s < song.totalSteps; s++) scheduleStep(ctx, bus, song, s, t0 + stepTime(song, l * song.totalSteps + s));
  return song.totalSteps * song.stepSec;
}

// ───────────────────────── the player ─────────────────────────
export async function loadSong(name) {
  const load = LOADERS[name];
  if (!load) throw new Error(`unknown song "${name}"`);
  const mod = await load();
  const data = mod.default ?? mod.song;
  return compileSong({ name, ...data });
}

export function createMusic(ctx, destination) {
  const out = ctx.createGain();
  out.gain.value = 1;
  out.connect(destination);
  let want = null;            // requested name
  let token = 0;
  let cur = null;             // active player
  const dying = new Set();
  const compiled = new Map();

  function retire(p) {
    if (!p) return;
    p.fading = true;
    try {
      const t = ctx.currentTime;
      p.bus.gain.cancelScheduledValues(t);
      p.bus.gain.setValueAtTime(p.bus.gain.value, t);
      p.bus.gain.linearRampToValueAtTime(0, t + FADE);
    } catch { /* ignore */ }
    dying.add(p);
    setTimeout(() => { clearInterval(p.timer); try { p.bus.disconnect(); } catch { /* ignore */ } dying.delete(p); }, (FADE + LOOKAHEAD + 1.6) * 1000);
  }

  function start(song) {
    const bus = ctx.createGain();
    const now = ctx.currentTime;
    bus.gain.setValueAtTime(0, now);
    bus.gain.linearRampToValueAtTime(song.gain, now + FADE);
    bus.connect(out);
    const p = { song, bus, step: 0, loops: 0, next: now + 0.03, ended: false, fading: false, timer: null };
    const tick = () => {
      if (p.fading || p.ended) return;
      const clock = ctx.currentTime;
      if (p.next < clock - 0.15) p.next = clock + 0.02;                       // timer starved or ctx was suspended: resync
      while (p.next < clock + LOOKAHEAD) {
        const st = p.step;
        const t = p.next + ((st & 1) ? song.swing * song.stepSec : 0);
        scheduleStep(ctx, bus, song, st, t);
        p.next += song.stepSec;
        if (++p.step >= song.totalSteps) {
          if (!song.loop) { p.ended = true; setTimeout(() => { clearInterval(p.timer); }, 4000); break; }
          p.step = 0; p.loops++;
        }
      }
    };
    p.timer = setInterval(tick, TICK_MS);
    tick();
    cur = p;
  }

  const api = {
    play(name) {
      if (!name) { api.stop(); return; }
      if (name === want && cur && !cur.ended && !cur.fading) return;
      want = name;
      const my = ++token;
      const go = song => {
        if (my !== token) return;                                            // superseded
        const old = cur; cur = null;
        retire(old);
        start(song);
      };
      const hit = compiled.get(name);
      if (hit) { go(hit); return; }
      loadSong(name).then(song => { compiled.set(name, song); go(song); }).catch(() => { /* bad/missing song: stay silent */ });
    },
    stop() {
      want = null; token++;
      const old = cur; cur = null;
      retire(old);
    },
    setVolume(v) {
      const x = Math.max(0, Math.min(1, Number.isFinite(v) ? v : 1));
      try { out.gain.setTargetAtTime(x, ctx.currentTime, 0.02); } catch { out.gain.value = x; }
    },
    get current() { return want; },
    get playing() { return !!cur && !cur.ended; },
  };
  return api;
}

export default createMusic;
