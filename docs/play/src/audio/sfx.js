// KÄSEKRIEG audio — synthesised sound effects (ARCHITECTURE §10). Pure WebAudio, zero samples.
// Import is side-effect free (safe in Node). All sounds are built from a tiny kit: tone / noise / voice.
//
//   playSfx(ctx, dest, name, when = ctx.currentTime, { vol = 1 }) → duration in seconds (0 = unknown name)
//
// Every sound runs through its own soft-clip (tanh) stage so the peak can never reach 1.0, whatever the
// layering. `ctx` may be an AudioContext or an OfflineAudioContext.

import { SFX } from '../core/defs.js';

const MIN = 0.0001;
const midi = m => 440 * Math.pow(2, (m - 69) / 12);

// ───── shared resources (per context) ─────
const noiseBufs = new WeakMap();
function noiseBuffer(ctx) {
  let b = noiseBufs.get(ctx);
  if (b) return b;
  const len = Math.floor(ctx.sampleRate * 2);
  b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  let s = 0x9e3779b9 >>> 0;                         // xorshift32: deterministic white noise
  for (let i = 0; i < len; i++) {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    d[i] = (s / 4294967296) * 2 - 1;
  }
  noiseBufs.set(ctx, b);
  return b;
}
let SOFT = null;
function softCurve() {
  if (SOFT) return SOFT;
  const n = 2049, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * 1.25) * 0.93; }
  return (SOFT = c);
}

// Schedule a parameter from: number | [from, to] (exponential) | [[frac, value], ...] (exponential path).
function setPath(param, f, t, d) {
  const v = x => Math.max(1e-3, x);
  if (typeof f === 'number') { param.setValueAtTime(f, t); return; }
  if (!Array.isArray(f[0])) { param.setValueAtTime(v(f[0]), t); param.exponentialRampToValueAtTime(v(f[1]), t + d); return; }
  param.setValueAtTime(v(f[0][1]), t + f[0][0] * d);
  for (let i = 1; i < f.length; i++) param.exponentialRampToValueAtTime(v(f[i][1]), t + f[i][0] * d);
}
const scalePath = (f, k) => typeof f === 'number' ? f * k : Array.isArray(f[0]) ? f.map(([a, b]) => [a, b * k]) : f.map(x => x * k);

function makeKit(ctx, dest, t0, vol) {
  const bus = ctx.createWaveShaper();
  bus.curve = softCurve();
  const out = ctx.createGain();
  out.gain.value = vol;
  out.connect(bus); bus.connect(dest);
  let end = 0, nz = 0;

  const envelope = (g, t, d, peak, a, shape) => {
    g.setValueAtTime(MIN, t0 + t);
    g.linearRampToValueAtTime(Math.max(MIN, peak), t0 + t + a);
    if (shape === 'hold') g.setValueAtTime(Math.max(MIN, peak), t0 + t + d * 0.65);
    g.exponentialRampToValueAtTime(MIN, t0 + t + d);
  };
  const lfo = (target, hz, depth, t, d) => {            // add an LFO to an AudioParam
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.value = hz; g.gain.value = depth;
    o.connect(g); g.connect(target);
    o.start(t0 + t); o.stop(t0 + t + d + 0.05);
  };
  const withAm = (node, am, t, d) => {                  // amplitude modulation stage (tremolo / rough growl)
    if (!am) return node;
    const g = ctx.createGain(); g.gain.value = 1 - am[1] / 2;
    lfo(g.gain, am[0], am[1] / 2, t, d);
    node.connect(g);
    return g;
  };
  const mark = (t, d) => { end = Math.max(end, t + d); };

  const kit = {
    out,
    get end() { return end; },
    /** Oscillator note. o: {type,f,t,d,g,a,vib:[hz,depthHz],am:[hz,depth],env:'pluck'|'hold',to} */
    tone(o) {
      const { type = 'sine', f = 440, t = 0, d = 0.2, g = 0.4, a = 0.004, vib, am, env = 'pluck' } = o;
      const osc = ctx.createOscillator(); osc.type = type;
      setPath(osc.frequency, f, t0 + t, d);
      if (vib) lfo(osc.frequency, vib[0], vib[1], t, d);
      const eg = ctx.createGain(); envelope(eg.gain, t, d, g, a, env);
      osc.connect(eg); withAm(eg, am, t, d).connect(o.to || out);
      osc.start(t0 + t); osc.stop(t0 + t + d + 0.03);
      mark(t, d);
    },
    /** Filtered noise. o: {type,f,q,t,d,g,a,am,env} */
    noise(o) {
      const { type = 'bandpass', f = 1000, q = 1, t = 0, d = 0.2, g = 0.4, a = 0.002, am, env = 'pluck' } = o;
      const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx); src.loop = true;
      const fl = ctx.createBiquadFilter(); fl.type = type; fl.Q.value = q;
      setPath(fl.frequency, f, t0 + t, d);
      const eg = ctx.createGain(); envelope(eg.gain, t, d, g, a, env);
      src.connect(fl); fl.connect(eg); withAm(eg, am, t, d).connect(o.to || out);
      src.start(t0 + t, ((nz++) * 0.371) % 1.6); src.stop(t0 + t + d + 0.03);
      mark(t, d);
    },
    /** Formant voice (cat / rat / boss). Source (saw or square) + breath noise through parallel band-pass formants.
     *  o: {f:pitch path, d, g, formants:[{f:path,q,g}], vib, am, breath, type, t} */
    voice(o) {
      const { type = 'sawtooth', f = 200, t = 0, d = 0.4, g = 0.4, formants = [{ f: 800, q: 6 }], vib, am, breath = 0.05, a = 0.012 } = o;
      const osc = ctx.createOscillator(); osc.type = type;
      setPath(osc.frequency, f, t0 + t, d);
      if (vib) lfo(osc.frequency, vib[0], vib[1], t, d);
      const eg = ctx.createGain(); envelope(eg.gain, t, d, g, a, 'hold');
      osc.connect(eg);
      const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx); src.loop = true;
      const ng = ctx.createGain(); envelope(ng.gain, t, d, breath * 3, a, 'hold');   // breath noise, same envelope shape
      src.connect(ng);
      const sum = ctx.createGain(); sum.gain.value = o.boost ?? 2.6;
      for (const fm of formants) {
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = fm.q ?? 6;
        setPath(bp.frequency, fm.f, t0 + t, d);
        const fg = ctx.createGain(); fg.gain.value = fm.g ?? 1;
        eg.connect(bp); ng.connect(bp); bp.connect(fg); fg.connect(sum);
      }
      withAm(sum, am, t, d).connect(o.to || out);
      osc.start(t0 + t); osc.stop(t0 + t + d + 0.03);
      src.start(t0 + t, ((nz++) * 0.371) % 1.6); src.stop(t0 + t + d + 0.03);
      mark(t, d);
    },
    /** Short percussive click. */
    click(t, f = 3000, g = 0.4, d = 0.03) {
      kit.noise({ type: 'bandpass', f, q: 2, t, d, g, a: 0.0005 });
    },
    /** A bell-ish partial stack. */
    bell(t, f, g = 0.2, d = 0.9, ratios = [1, 2.76, 5.4, 8.93]) {
      ratios.forEach((r, i) => kit.tone({ type: 'sine', f: f * r, t, d: d / (1 + i * 0.7), g: g / (1 + i * 0.8), a: 0.002 }));
    },
    /** Sequence of notes [midi,...] spaced `step` apart. */
    notes(list, step, o = {}) {
      list.forEach((m, i) => kit.tone({ f: midi(m), t: (o.t || 0) + i * step, d: o.d ?? step * 3, g: o.g ?? 0.25, type: o.type || 'square', a: 0.003, env: o.env || 'pluck', vib: o.vib }));
    },
    /** cat vocal tract: formant paths for a given vowel contour */
    cat(o) {
      const p = o.pitch ?? 520, d = o.d ?? 0.6, harsh = o.harsh ?? 0;
      kit.voice({
        t: o.t || 0, d, g: o.g ?? 0.5, type: 'sawtooth',
        f: o.f || [[0, p * 0.8], [0.22, p * 1.18], [0.6, p * 1.0], [1, p * 0.62]],
        vib: [o.vibHz ?? 6, p * 0.025 + harsh * 40],
        am: harsh ? [38, harsh] : undefined,
        breath: 0.08 + harsh * 0.2,
        formants: [
          { f: o.f1 || [[0, 520], [0.3, 780], [1, 560]], q: 7, g: 1 },
          { f: o.f2 || [[0, 2300], [0.3, 1700], [0.7, 1150], [1, 950]], q: 9, g: 0.7 },
          { f: 3300, q: 10, g: 0.25 },
        ],
      });
    },
    /** rat / mouse squeak */
    squeak(o) {
      const p = o.f || [[0, 1800], [0.5, 2800], [1, 2200]];
      kit.voice({
        t: o.t || 0, d: o.d ?? 0.14, g: o.g ?? 0.5, type: o.type || 'sawtooth', f: p,
        vib: [o.vibHz ?? 32, o.vib ?? 90], breath: 0.03, a: 0.006,
        formants: [{ f: [[0, 1300], [1, 1700]], q: 8, g: 1 }, { f: [[0, 3100], [1, 3900]], q: 10, g: 0.8 }],
      });
    },
    /** gruff humanoid-rat shout */
    gruff(o) {
      kit.voice({
        t: o.t || 0, d: o.d ?? 0.4, g: o.g ?? 0.5, type: 'sawtooth', f: o.f,
        am: o.am ?? [55, 0.5], breath: o.breath ?? 0.1, vib: o.vib || [5, 3],
        formants: o.formants || [{ f: [[0, 700], [0.5, 420], [1, 500]], q: 6, g: 1 }, { f: [[0, 1150], [0.5, 850], [1, 1000]], q: 8, g: 0.7 }, { f: 2600, q: 8, g: 0.3 }],
      });
    },
    thud(t = 0, f = 110, g = 0.7, d = 0.25) {
      kit.tone({ f: [f, f * 0.35], t, d, g, a: 0.002 });
      kit.noise({ type: 'lowpass', f: [900, 90], t, d: d * 0.7, g: g * 0.6, a: 0.001 });
    },
    shot(t, o = {}) {
      const s = o.size ?? 1, hi = o.hi ?? 6000;
      kit.noise({ type: 'lowpass', f: [hi, 500 / s], t, d: 0.11 * s, g: 0.75, a: 0.0005 });
      kit.tone({ type: 'square', f: [(o.f ?? 900), 70], t, d: 0.09 * s, g: 0.32, a: 0.0005 });
      kit.tone({ type: 'sine', f: [150 * s, 45], t, d: 0.16 * s, g: 0.55, a: 0.001 });
    },
  };
  return kit;
}

// ───────────────────────────── the sounds ─────────────────────────────
const S = {};

// weapons
S.claw_swipe = k => {
  k.noise({ type: 'bandpass', f: [[0, 5200], [0.5, 1900], [1, 600]], q: 1.2, d: 0.22, g: 0.55, a: 0.04 });
  k.noise({ type: 'highpass', f: 6500, t: 0.02, d: 0.12, g: 0.2, a: 0.02 });
  k.tone({ type: 'triangle', f: [2600, 1100], t: 0.01, d: 0.16, g: 0.06, a: 0.01 });
};
S.claw_hit = k => {
  k.noise({ type: 'lowpass', f: [2000, 200], d: 0.15, g: 0.7, a: 0.001 });
  k.tone({ f: [210, 55], d: 0.2, g: 0.7, a: 0.001 });
  k.noise({ type: 'bandpass', f: 3500, q: 3, d: 0.05, g: 0.3, a: 0.001 });
  k.tone({ type: 'sawtooth', f: [900, 300], t: 0.02, d: 0.08, g: 0.1 });
};
S.pistol = k => {
  k.shot(0);
  k.noise({ type: 'bandpass', f: 400, q: 1, t: 0.02, d: 0.1, g: 0.2, a: 0.01 });   // soft hairball "fwump"
};
S.gatling = k => {
  k.noise({ type: 'lowpass', f: [5000, 700], d: 0.07, g: 0.6, a: 0.0005 });
  k.tone({ type: 'square', f: [700, 120], d: 0.06, g: 0.28, a: 0.0005 });
  k.tone({ f: [200, 70], d: 0.09, g: 0.45, a: 0.001 });
  k.tone({ type: 'triangle', f: [2200, 1500], t: 0.04, d: 0.03, g: 0.1 });
};
S.yarn_launch = k => {
  k.tone({ f: [220, 55], d: 0.3, g: 0.7 });
  k.noise({ type: 'lowpass', f: [900, 150], d: 0.25, g: 0.5, a: 0.003 });
  k.tone({ type: 'triangle', f: [[0, 300], [0.3, 700], [1, 260]], t: 0.05, d: 0.3, g: 0.2, vib: [30, 40] });
};
S.yarn_bounce = k => {
  k.tone({ f: [[0, 500], [0.4, 280], [0.7, 380], [1, 260]], d: 0.17, g: 0.4 });
  k.tone({ type: 'triangle', f: [[0, 1000], [0.4, 560], [0.7, 760], [1, 520]], d: 0.15, g: 0.1 });
};
S.laser = k => {
  k.tone({ f: [[0, 2600], [1, 1500]], d: 0.22, g: 0.3, vib: [40, 60] });
  k.tone({ type: 'sawtooth', f: [[0, 1300], [1, 700]], d: 0.22, g: 0.08 });
  k.noise({ type: 'highpass', f: 5000, d: 0.05, g: 0.1 });
};
S.no_ammo = k => {
  for (const t of [0, 0.09]) {
    k.click(t, 3000, 0.5, 0.025);
    k.tone({ type: 'square', f: [1300, 900], t, d: 0.03, g: 0.12 });
    k.tone({ f: [140, 90], t, d: 0.05, g: 0.3 });
  }
};
S.weapon_switch = k => {
  k.click(0, 1800, 0.5, 0.03); k.tone({ f: [180, 100], d: 0.05, g: 0.3 });
  k.noise({ type: 'bandpass', f: 2500, q: 2, t: 0.02, d: 0.08, g: 0.15, a: 0.02 });
  k.click(0.1, 3200, 0.55, 0.03); k.tone({ f: [260, 130], t: 0.1, d: 0.05, g: 0.3 });
};
S.explosion = k => {
  k.noise({ type: 'lowpass', f: [[0, 3500], [1, 90]], d: 1.1, g: 0.9, a: 0.002 });
  k.tone({ f: [110, 28], d: 0.9, g: 0.9, a: 0.002 });
  k.noise({ type: 'lowpass', f: [800, 100], t: 0.1, d: 0.9, g: 0.5, a: 0.05 });
  for (let i = 0; i < 9; i++) k.click(0.12 + i * 0.07 + 0.02 * Math.sin(i * 7), 1500 + 400 * ((i * 5) % 4), 0.25, 0.04);
};
S.cheese_splat = k => {
  k.noise({ type: 'bandpass', f: [[0, 1400], [1, 300]], q: 3, d: 0.28, g: 0.6, a: 0.003 });
  k.tone({ f: [[0, 380], [0.5, 140], [1, 90]], d: 0.22, g: 0.5 });
  k.tone({ f: [300, 110], t: 0.12, d: 0.15, g: 0.35 });
  k.tone({ f: [500, 200], t: 0.2, d: 0.08, g: 0.2 });
};
S.ricochet = k => {
  k.tone({ f: [[0, 3600], [0.1, 2800], [1, 900]], d: 0.38, g: 0.3 });
  k.tone({ type: 'triangle', f: [[0, 5400], [0.1, 4200], [1, 1350]], d: 0.3, g: 0.08 });
  k.noise({ type: 'bandpass', f: 5000, q: 2, d: 0.03, g: 0.3 });
};
S.hit_wall = k => {
  k.noise({ type: 'bandpass', f: [2500, 600], q: 1, d: 0.09, g: 0.6, a: 0.001 });
  k.tone({ f: [220, 80], d: 0.1, g: 0.5, a: 0.001 });
  k.click(0.05, 2200, 0.15); k.click(0.09, 3000, 0.1);
};

// doors & mechanisms
S.door_open = k => {
  k.noise({ type: 'lowpass', f: 250, d: 0.75, g: 0.55, a: 0.1, am: [8, 0.5], env: 'hold' });
  k.voice({ type: 'sawtooth', f: [[0, 180], [0.3, 260], [0.6, 210], [1, 300]], d: 0.6, g: 0.18, breath: 0, vib: [7, 8],
    formants: [{ f: [600, 900], q: 12 }, { f: [1500, 1900], q: 14, g: 0.6 }] });
  k.tone({ f: [90, 60], t: 0.62, d: 0.15, g: 0.35 });
};
S.door_close = k => {
  k.noise({ type: 'lowpass', f: 250, d: 0.45, g: 0.5, a: 0.05, am: [9, 0.5], env: 'hold' });
  k.voice({ type: 'sawtooth', f: [[0, 300], [0.5, 220], [1, 170]], d: 0.4, g: 0.15, breath: 0,
    formants: [{ f: [900, 600], q: 12 }, { f: [1900, 1400], q: 14, g: 0.6 }] });
  k.thud(0.4, 120, 0.75, 0.25);
};
S.door_locked = k => {
  [0, 0.08, 0.17].forEach((t, i) => {
    k.tone({ type: 'square', f: [330 - i * 20, 290], t, d: 0.05, g: 0.2, a: 0.001 });
    k.tone({ type: 'triangle', f: 845 + i * 90, t, d: 0.08, g: 0.1, a: 0.001 });
    k.click(t, 2000, 0.4, 0.03);
  });
  k.thud(0, 100, 0.5, 0.2);
};
S.pushwall = k => {
  k.noise({ type: 'lowpass', f: 180, d: 1.6, g: 0.85, a: 0.15, am: [11, 0.6], env: 'hold' });
  k.tone({ type: 'sawtooth', f: [48, 40], d: 1.6, g: 0.25, a: 0.1, env: 'hold' });
  k.noise({ type: 'bandpass', f: 800, q: 1, d: 1.4, g: 0.16, a: 0.1, am: [17, 0.8], env: 'hold' });
  k.thud(1.5, 90, 0.7, 0.3);
};
S.switch = k => {
  k.tone({ f: [150, 70], d: 0.1, g: 0.7 }); k.click(0, 2500, 0.4, 0.04);
  for (let i = 0; i < 4; i++) k.click(0.12 + i * 0.05, 2800 + i * 300, 0.25, 0.02);
  k.tone({ type: 'triangle', f: 1200, t: 0.35, d: 0.25, g: 0.12 });
};

// pickups
S.pickup_health = k => {
  k.notes([72, 76, 79, 84], 0.07, { type: 'triangle', d: 0.3, g: 0.3 });
  k.notes([84, 88, 91, 96], 0.07, { type: 'sine', d: 0.25, g: 0.08, t: 0.01 });
};
S.pickup_catnip = k => {
  k.tone({ f: [400, 1600], d: 0.6, g: 0.25, vib: [9, 40], env: 'hold' });
  k.tone({ f: [405, 1620], d: 0.6, g: 0.18, vib: [11, 40], type: 'triangle', env: 'hold' });
  k.noise({ type: 'bandpass', f: 6000, q: 3, d: 0.5, g: 0.1, am: [20, 0.8], env: 'hold' });
  [0.1, 0.25, 0.4, 0.5].forEach((t, i) => k.tone({ f: 2000 + i * 500, t, d: 0.1, g: 0.1, type: 'triangle' }));
};
S.pickup_ammo = k => {
  k.click(0, 3000, 0.5); k.click(0.06, 3600, 0.5);
  k.tone({ f: 130, d: 0.06, g: 0.3 });
  k.tone({ type: 'triangle', f: 1568, t: 0.08, d: 0.2, g: 0.2 }); k.tone({ type: 'triangle', f: 2093, t: 0.13, d: 0.2, g: 0.18 });
};
S.pickup_weapon = k => {
  k.notes([67, 72, 76, 79], 0.07, { type: 'square', d: 0.15, g: 0.18 });
  [72, 76, 79].forEach(m => k.tone({ type: 'square', f: midi(m), t: 0.3, d: 0.55, g: 0.1, env: 'hold' }));
  k.tone({ type: 'triangle', f: midi(48), t: 0.3, d: 0.55, g: 0.3, env: 'hold' });
  k.thud(0, 200, 0.5, 0.15);
};
S.pickup_treasure = k => {
  [1568, 2093, 2637, 3136].forEach((f, i) => {
    k.tone({ f, t: i * 0.06, d: 0.5, g: 0.15 }); k.tone({ type: 'triangle', f: f * 2, t: i * 0.06, d: 0.35, g: 0.05 });
  });
  k.noise({ type: 'highpass', f: 8000, d: 0.5, g: 0.05, am: [30, 1] });
};
S.pickup_key = k => {
  k.click(0, 4000, 0.3, 0.02);
  k.bell(0.01, 988, 0.25, 0.9);
  k.bell(0.12, 1319, 0.18, 0.7);
};
S.extra_life = k => {
  k.notes([72, 76, 79, 84, 88, 91, 96], 0.075, { type: 'square', d: 0.18, g: 0.2 });
  k.tone({ type: 'square', f: midi(96), t: 0.53, d: 0.55, g: 0.18, env: 'hold', vib: [6, 10] });
  k.tone({ type: 'triangle', f: midi(60), t: 0.53, d: 0.55, g: 0.3, env: 'hold' });
  k.noise({ type: 'highpass', f: 8000, t: 0.5, d: 0.5, g: 0.05, am: [25, 1] });
};
S.secret_found = k => {
  k.notes([69, 72, 76, 81], 0.12, { type: 'triangle', d: 0.5, g: 0.28, vib: [6, 4] });
  k.bell(0.05, 440, 0.18, 1.2);
  k.tone({ f: midi(93), t: 0.5, d: 0.7, g: 0.08, vib: [7, 15], env: 'hold' });
};

// player & cat
S.meow = k => k.cat({ pitch: 520, d: 0.7, g: 0.55 });
S.player_hurt = k => {
  k.cat({ pitch: 620, d: 0.35, g: 0.55, harsh: 0.4, f: [[0, 560], [0.2, 840], [1, 480]] });
  k.thud(0, 160, 0.5, 0.15);
};
S.player_die = k => {
  k.cat({ pitch: 600, d: 1.3, g: 0.55, harsh: 0.35, vibHz: 7, f: [[0, 600], [0.18, 800], [0.6, 420], [1, 140]],
    f1: [[0, 600], [0.2, 900], [1, 450]], f2: [[0, 2000], [0.3, 1500], [1, 800]] });
  k.thud(1.1, 90, 0.7, 0.4);
};
S.purr = k => {
  k.noise({ type: 'lowpass', f: 420, q: 1.5, d: 1.4, g: 0.6, a: 0.25, am: [24, 0.9], env: 'hold' });
  k.tone({ type: 'sawtooth', f: [58, 52], d: 1.4, g: 0.22, a: 0.25, am: [24, 0.9], env: 'hold' });
  k.noise({ type: 'bandpass', f: 1400, q: 1, d: 1.3, g: 0.06, a: 0.25, am: [24, 1], env: 'hold' });
};
S.fondue_sizzle = k => {
  k.noise({ type: 'highpass', f: 3000, d: 0.7, g: 0.22, a: 0.05, am: [37, 0.9] });
  [0.05, 0.2, 0.33, 0.5].forEach((t, i) => k.tone({ f: [160 + i * 60, 420 + i * 80], t, d: 0.08, g: 0.3 }));
  for (let i = 0; i < 7; i++) k.click(0.05 + i * 0.09, 4000 + (i % 3) * 800, 0.18, 0.015);
};
S.trap_snap = k => {
  k.noise({ type: 'highpass', f: 2500, d: 0.05, g: 0.8, a: 0.0005 });
  k.tone({ type: 'square', f: [1800, 300], d: 0.05, g: 0.35, a: 0.0005 });
  k.tone({ f: [900, 180], t: 0.01, d: 0.13, g: 0.5, a: 0.001 });
  k.tone({ type: 'triangle', f: 420, t: 0.05, d: 0.18, g: 0.12, am: [50, 0.9] });
};

// enemies
S.mouse_alert = k => { k.squeak({ f: [[0, 1700], [0.5, 2700], [1, 2100]], d: 0.12 }); k.squeak({ t: 0.17, f: [[0, 2000], [0.5, 3100], [1, 2400]], d: 0.15 }); };
S.mouse_pain = k => k.squeak({ f: [[0, 2600], [0.3, 3500], [1, 1500]], d: 0.26, vib: 140 });
S.mouse_die = k => { k.squeak({ f: [[0, 3000], [0.2, 3500], [1, 450]], d: 0.6, vib: 160, g: 0.4 }); k.thud(0.55, 260, 0.25, 0.08); };
S.trooper_alert = k => {
  k.gruff({ f: [[0, 140], [0.3, 175], [1, 110]], d: 0.42 });
  k.noise({ type: 'bandpass', f: 3500, q: 2, t: 0.15, d: 0.08, g: 0.2, a: 0.01 });
};
S.trooper_die = k => {
  k.gruff({ f: [[0, 165], [0.3, 140], [1, 55]], d: 0.7, am: [28, 0.6],
    formants: [{ f: [500, 280], q: 6 }, { f: [900, 650], q: 8, g: 0.7 }] });
  k.thud(0.6, 100, 0.55, 0.25);
};
S.officer_alert = k => {
  k.gruff({ f: [[0, 220], [0.2, 310], [1, 200]], d: 0.4, am: [70, 0.35],
    formants: [{ f: [600, 800], q: 7 }, { f: [1700, 1300], q: 9, g: 0.8 }, { f: 3000, q: 8, g: 0.3 }] });
  k.noise({ type: 'bandpass', f: 5200, q: 3, t: 0.27, d: 0.1, g: 0.2 });
};
S.officer_die = k => {
  k.gruff({ f: [[0, 270], [0.3, 320], [1, 90]], d: 0.75, am: [45, 0.4],
    formants: [{ f: [800, 400], q: 7 }, { f: [1500, 800], q: 9, g: 0.7 }] });
  k.thud(0.65, 110, 0.5, 0.25);
};
S.sewer_alert = k => {
  k.noise({ type: 'bandpass', f: [[0, 2500], [1, 1200]], q: 4, d: 0.4, g: 0.4, am: [45, 0.8], env: 'hold' });
  k.gruff({ f: [[0, 330], [1, 260]], d: 0.4, g: 0.3, am: [60, 1],
    formants: [{ f: 900, q: 6 }, { f: 1500, q: 8, g: 0.7 }] });
  k.squeak({ t: 0.05, f: [[0, 2200], [1, 2700]], d: 0.07, g: 0.15 }); k.squeak({ t: 0.18, f: [[0, 2300], [1, 2800]], d: 0.07, g: 0.15 });
};
S.sewer_bite = k => {
  [0, 0.09].forEach(t => {
    k.noise({ type: 'bandpass', f: 2000, q: 1.5, t, d: 0.08, g: 0.55, a: 0.001 });
    k.tone({ f: [300, 100], t, d: 0.1, g: 0.45 });
    k.click(t + 0.01, 4000, 0.3, 0.015);
  });
};
S.sewer_die = k => { k.squeak({ f: [[0, 2400], [0.3, 2600], [1, 400]], d: 0.4, vib: 130, g: 0.4 }); k.noise({ type: 'bandpass', f: [900, 300], q: 4, t: 0.25, d: 0.2, g: 0.2, am: [30, 0.9] }); };
S.panzer_alert = k => {
  k.noise({ type: 'bandpass', f: 1500, q: 2, d: 0.15, g: 0.3 });
  k.gruff({ f: [[0, 80], [0.5, 95], [1, 70]], d: 0.7, g: 0.6, am: [32, 0.7],
    formants: [{ f: [300, 500], q: 5 }, { f: [700, 1000], q: 7, g: 0.8 }] });
};
S.panzer_fire = k => {
  k.tone({ f: [140, 35], d: 0.5, g: 0.9 });
  k.noise({ type: 'lowpass', f: [2500, 120], d: 0.45, g: 0.7, a: 0.002 });
  k.tone({ type: 'sawtooth', f: [[0, 500], [1, 100]], d: 0.3, g: 0.18 });
  k.noise({ type: 'bandpass', f: [800, 300], q: 4, t: 0.1, d: 0.4, g: 0.25 });
};
S.panzer_die = k => {
  k.gruff({ f: [[0, 95], [1, 33]], d: 1.0, g: 0.6, am: [20, 0.7],
    formants: [{ f: [450, 250], q: 5 }, { f: [800, 500], q: 7, g: 0.7 }] });
  [310, 497, 823, 1150].forEach(f => { k.tone({ f, t: 0.5, d: 0.5, g: 0.12 }); k.tone({ f: f * 1.02, t: 0.62, d: 0.4, g: 0.1 }); });
  k.noise({ type: 'lowpass', f: [3000, 200], t: 0.5, d: 0.5, g: 0.5 });
  k.thud(0.5, 80, 0.8, 0.4);
};
S.rat_pain = k => k.gruff({ f: [[0, 420], [0.3, 520], [1, 300]], d: 0.25, g: 0.45, am: [50, 0.4],
  formants: [{ f: 800, q: 6 }, { f: 1800, q: 8, g: 0.7 }] });
S.boss_alert = k => {
  [0, 0.3, 0.6].forEach((t, i) => k.gruff({ t, f: [[0, 100 + i * 8], [0.4, 140 + i * 10], [1, 80]], d: 0.22 + i * 0.12, g: 0.65,
    am: [14, 0.3], formants: [{ f: 450, q: 5 }, { f: 800, q: 7, g: 0.8 }, { f: 2400, q: 8, g: 0.15 }] }));
  k.noise({ type: 'bandpass', f: 1200, q: 1, t: 0.85, d: 0.25, g: 0.1, a: 0.1 });
};
S.boss_fire = k => {
  k.shot(0, { size: 1.8, hi: 4500, f: 500 });
  k.tone({ type: 'sawtooth', f: [90, 40], d: 0.25, g: 0.3 });
  k.tone({ type: 'triangle', f: [2000, 1200], t: 0.05, d: 0.04, g: 0.1 });
};
S.boss_pain = k => {
  k.gruff({ f: [[0, 130], [0.3, 180], [1, 80]], d: 0.5, g: 0.65, am: [25, 0.5],
    formants: [{ f: [500, 700], q: 5 }, { f: [900, 1200], q: 7, g: 0.8 }] });
  k.thud(0.05, 90, 0.5, 0.2);
};
S.boss_die = k => {
  k.gruff({ f: [[0, 120], [0.3, 150], [1, 28]], d: 2.0, g: 0.7, am: [14, 0.8],
    formants: [{ f: [550, 250], q: 5 }, { f: [900, 500], q: 7, g: 0.8 }] });
  k.noise({ type: 'lowpass', f: [[0, 3000], [1, 80]], t: 0.9, d: 1.5, g: 0.8, a: 0.01 });
  k.tone({ f: [80, 25], t: 1.0, d: 1.2, g: 0.8 });
  for (let i = 0; i < 12; i++) k.tone({ f: 2200 + ((i * 7) % 5) * 520, t: 1.2 + i * 0.065 + 0.02 * Math.sin(i * 3), d: 0.18, g: 0.09 });
};
S.enemy_pistol = k => {
  k.noise({ type: 'lowpass', f: [7000, 900], d: 0.1, g: 0.6, a: 0.0005 });
  k.tone({ type: 'square', f: [1400, 160], d: 0.08, g: 0.3, a: 0.0005 });
  k.tone({ f: [260, 90], d: 0.1, g: 0.35, a: 0.001 });
};
S.enemy_smg = k => {
  k.noise({ type: 'lowpass', f: [8000, 1200], d: 0.06, g: 0.6, a: 0.0005 });
  k.tone({ type: 'square', f: [1700, 300], d: 0.05, g: 0.25, a: 0.0005 });
  k.tone({ f: [300, 110], d: 0.07, g: 0.3, a: 0.001 });
};

// UI & jingles
S.menu_move = k => { k.tone({ type: 'square', f: [900, 1050], d: 0.05, g: 0.16, a: 0.002 }); };
S.menu_select = k => {
  k.tone({ type: 'square', f: midi(76), d: 0.07, g: 0.2, a: 0.002 }); k.tone({ type: 'square', f: midi(83), t: 0.07, d: 0.12, g: 0.2, a: 0.002 });
  k.tone({ type: 'triangle', f: midi(88), t: 0.07, d: 0.15, g: 0.1 });
};
S.menu_back = k => { k.tone({ type: 'square', f: [700, 420], d: 0.1, g: 0.18, a: 0.002 }); k.tone({ type: 'triangle', f: [350, 210], d: 0.1, g: 0.15 }); };
S.level_complete = k => {
  k.notes([72, 76, 79, 84], 0.12, { type: 'square', d: 0.22, g: 0.18 });
  k.notes([55, 60, 64, 67], 0.12, { type: 'triangle', d: 0.25, g: 0.3 });
  [79, 84, 88].forEach(m => k.tone({ type: 'square', f: midi(m), t: 0.72, d: 1.1, g: 0.14, env: 'hold', vib: [6, 6] }));
  k.tone({ type: 'triangle', f: midi(48), t: 0.72, d: 1.1, g: 0.35, env: 'hold' });
  k.tone({ type: 'triangle', f: midi(60), t: 0.72, d: 1.1, g: 0.2, env: 'hold' });
  [0.8, 0.95, 1.1, 1.25].forEach((t, i) => k.bell(t, 2093 + i * 330, 0.06, 0.5, [1, 2.76]));
};
S.tally_tick = k => { k.tone({ type: 'square', f: [1800, 1500], d: 0.045, g: 0.16, a: 0.001 }); k.click(0, 5000, 0.18, 0.02); };
S.game_over = k => {
  k.notes([64, 63, 62, 61], 0.32, { type: 'sawtooth', d: 0.5, g: 0.16, vib: [5, 5] });
  k.notes([52, 51, 50, 49], 0.32, { type: 'triangle', d: 0.5, g: 0.3 });
  k.tone({ type: 'sawtooth', f: midi(40), t: 1.3, d: 0.9, g: 0.18, env: 'hold', vib: [4, 3] });
  k.tone({ type: 'triangle', f: midi(28), t: 1.3, d: 0.9, g: 0.4, env: 'hold' });
};

/** Names this module can synthesise. Every name in defs.SFX must be present (checked by test/audio-sfx.test.mjs). */
export const SFX_NAMES = Object.keys(S);
export const SFX_MISSING = SFX.filter(n => !S[n]);

export function hasSfx(name) { return Object.prototype.hasOwnProperty.call(S, name); }

/**
 * Schedule `name` into `dest` starting at `when`. Returns the sound's duration in seconds (0 for unknown names).
 * opts.vol scales the pre-clip level (default 1).
 */
export function playSfx(ctx, dest, name, when = ctx.currentTime, opts = {}) {
  if (!hasSfx(name)) return 0;
  const kit = makeKit(ctx, dest, when, (opts.vol ?? 1) * 0.8);
  S[name](kit);
  return kit.end + 0.06;
}
