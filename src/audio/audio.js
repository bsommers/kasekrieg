// KÄSEKRIEG audio engine (ARCHITECTURE §10). createAudio() → { unlock, sfx, setListener, music, setVolume, suspend, resume, ready }
// Everything is a silent no-op when AudioContext is unavailable (Node, headless, blocked autoplay).

import { playSfx, hasSfx } from './sfx.js';

const MAX_VOICES = 28;          // concurrent positional/non-positional sounds
const MIN_GAP = 0.03;           // seconds between two plays of the same name (de-dupes machine-gun spam)
const HEAR_DIST = 26;           // cells; beyond this a positional sound is inaudible

const clamp01 = v => Math.max(0, Math.min(1, v));

export function createAudio(opts = {}) {
  const Ctor = opts.AudioContext ?? globalThis.AudioContext ?? globalThis.webkitAudioContext;
  const vol = { master: 0.8, sfx: 0.9, music: 0.6 };
  const listener = { x: 0, y: 0, angle: 0 };
  let ctx = null, master = null, sfxBus = null, musicBus = null, comp = null;
  let music = null, wantMusic = null, musicLoading = null;
  let active = 0;
  const lastPlay = new Map();

  function applyVolume() {
    if (!ctx) return;
    const t = ctx.currentTime;
    master.gain.setTargetAtTime(clamp01(vol.master), t, 0.02);
    sfxBus.gain.setTargetAtTime(clamp01(vol.sfx), t, 0.02);
    musicBus.gain.setTargetAtTime(clamp01(vol.music), t, 0.02);
  }

  function build() {
    if (ctx || !Ctor) return;
    try {
      ctx = new Ctor();
      master = ctx.createGain(); sfxBus = ctx.createGain(); musicBus = ctx.createGain();
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -10; comp.knee.value = 12; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.2;
      sfxBus.connect(master); musicBus.connect(master); master.connect(comp); comp.connect(ctx.destination);
      applyVolume();
    } catch { ctx = null; }
  }

  async function startMusic() {
    if (!ctx || !wantMusic) { if (music && !wantMusic) music.stop(); return; }
    if (!music) {
      if (!musicLoading) {
        musicLoading = import('./music.js')
          .then(m => { music = m.createMusic(ctx, musicBus); })
          .catch(() => { music = null; })               // music.js is optional
          .finally(() => { musicLoading = null; });
      }
      await musicLoading;
    }
    try {
      if (music) { if (wantMusic) music.play(wantMusic); else music.stop(); }
    } catch { /* never let music break the game */ }
  }

  const audio = {
    get ready() { return !!ctx && ctx.state === 'running'; },
    get context() { return ctx; },

    /** Call from a user gesture (click / key). Safe to call repeatedly. */
    unlock() {
      build();
      if (!ctx) return;
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch { /* ignore */ } }
      if (wantMusic) startMusic();
    },

    /** Play a named effect. Positional if x,y given (equal-power pan + distance falloff). Unknown names: no-op. */
    sfx(name, o = {}) {
      if (!ctx || ctx.state !== 'running' || !hasSfx(name)) return;
      const now = ctx.currentTime;
      const last = lastPlay.get(name);
      if (last !== undefined && now - last < MIN_GAP) return;
      let gain = o.vol ?? 1, pan = 0;
      if (Number.isFinite(o.x) && Number.isFinite(o.y)) {
        const dx = o.x - listener.x, dy = o.y - listener.y;
        const dist = Math.hypot(dx, dy);
        if (dist > HEAR_DIST) return;
        const fall = 1 - dist / HEAR_DIST;
        gain *= fall * fall * (1 + 0.6 * (1 - Math.min(1, dist / 3)));      // quadratic falloff, a bit of boost up close
        if (dist > 0.3) pan = Math.sin(Math.atan2(dy, dx) - listener.angle);  // +1 = hard right (clockwise on the map)
        pan *= Math.min(1, dist / 1.5);                                       // no hard pan when the source is on top of us
      }
      if (gain < 0.01) return;
      if (active >= MAX_VOICES) return;
      lastPlay.set(name, now);
      try {
        let dest = sfxBus;
        let node = null;
        if (pan !== 0 && ctx.createStereoPanner) {
          node = ctx.createStereoPanner(); node.pan.value = Math.max(-1, Math.min(1, pan));
          node.connect(sfxBus); dest = node;
        }
        const dur = playSfx(ctx, dest, name, now + 0.005, { vol: Math.min(1.5, gain) });
        active++;
        setTimeout(() => { active--; if (node) try { node.disconnect(); } catch { /* ignore */ } }, (dur + 0.1) * 1000);
      } catch { /* never throw from sfx */ }
    },

    setListener(x, y, angle) { listener.x = x; listener.y = y; listener.angle = angle; },

    /** Start a song by defs.MUSIC name, or null to stop. */
    music(name) {
      wantMusic = name || null;
      if (ctx) startMusic();
    },

    setVolume(v = {}) {
      for (const k of ['master', 'sfx', 'music']) if (typeof v[k] === 'number' && Number.isFinite(v[k])) vol[k] = clamp01(v[k]);
      applyVolume();
    },

    suspend() { if (ctx && ctx.state === 'running') try { ctx.suspend(); } catch { /* ignore */ } },
    resume() { if (ctx && ctx.state === 'suspended') try { ctx.resume(); } catch { /* ignore */ } },
  };
  return audio;
}

export default createAudio;
