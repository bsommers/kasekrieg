// KÄSEKRIEG menus — title, main, skill, options, controls, pause (+ quit confirm).
// Draws into the 480×270 #hud canvas over the live ray-traced attract scene (transparent background + soft scrim).
// Contract: ARCHITECTURE §12. createMenus({ atlas, audio, settings }) → { open, close, update, draw, active }.
//
// Actions returned by update(): {type:'new', skill} | {type:'continue'} | {type:'resume'} | {type:'quit'}
//   | {type:'option', key, value}   (key is a top-level settings key; for volume the value is the whole
//   {master,sfx,music} object). Terminal actions (new/continue/resume/quit) also close the menus.

import { SKILLS, VIEW } from '../core/defs.js';

// ───────────────────────────── shared UI helpers (also used by screens.js) ─────────────────────────────
let F = null;
try { F = await import('./font.js'); } catch { F = null; }

export const W = VIEW?.W ?? 480, H = VIEW?.H ?? 270;
export const PAL = {
  outline: '#1a1420', ink: '#120c18', cheddar: '#f2a91e', swiss: '#f6dc6a', cream: '#fde3b0', orange: '#f08a1c',
  stripe: '#c25a0e', red: '#c21f24', gold: '#ffd23e', steel: '#8d98a8', grey: '#6b6470', blue: '#5a78b8',
  green: '#7ad04a', fondue: '#ffb21a', panel: 'rgba(22,15,28,0.80)', dim: '#b9a58a',
};

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const ease = (x) => { x = clamp(x, 0, 1); return 1 - (1 - x) ** 3; };
export function hash(n, s = 0) { // deterministic 0..1
  let h = (Math.imul(n | 0, 374761393) + Math.imul(s | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Bitmap text (font.js), with a monospace fillText fallback if font.js is unavailable. */
export function text(ctx, s, x, y, o = {}) {
  if (F?.drawText) { try { F.drawText(ctx, s, x, y, o); return; } catch { /* fall through */ } }
  const scale = Math.max(1, Math.round(o.scale ?? 1));
  ctx.save();
  ctx.font = `${8 * scale}px monospace`; ctx.textBaseline = 'top';
  ctx.textAlign = o.align === 'center' ? 'center' : o.align === 'right' ? 'right' : 'left';
  const lines = String(s).split('\n');
  lines.forEach((l, i) => {
    const yy = y + i * 9 * scale;
    if (o.shadow !== null) { ctx.fillStyle = o.shadow ?? '#000'; ctx.fillText(l, x + scale, yy + scale); }
    ctx.fillStyle = o.color ?? '#fff'; ctx.fillText(l, x, yy);
  });
  ctx.restore();
}
export function measure(s, scale = 1) {
  if (F?.measureText) { try { return F.measureText(s, scale); } catch { /* fall through */ } }
  return Math.max(...String(s).split('\n').map((l) => [...l].length)) * 6 * Math.max(1, Math.round(scale)) - scale;
}
/** Text with a 1px dark outline all round (punchier than a drop shadow for headings). */
export function outlined(ctx, s, x, y, o = {}) {
  const sc = Math.max(1, Math.round(o.scale ?? 1)), oc = o.outline ?? PAL.outline;
  const base = { ...o, shadow: null };
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1], [sc + 1, sc + 1], [sc, sc + 1]])
    text(ctx, s, x + dx, y + dy, { ...base, color: oc });
  text(ctx, s, x, y, base);
}
/** Word-wrap to a pixel width at a scale. */
export function wrap(s, maxW, scale = 1) {
  const out = [];
  for (const para of String(s).split('\n')) {
    let line = '';
    for (const w of para.split(/\s+/)) {
      const t = line ? line + ' ' + w : w;
      if (measure(t, scale) > maxW && line) { out.push(line); line = w; } else line = t;
    }
    out.push(line);
  }
  return out;
}

// PixBuf → canvas, cached per PixBuf.
const imgCache = new WeakMap();
function toCanvas(pb) {
  if (!pb || !pb.w || !pb.rgba) return null;
  let c = imgCache.get(pb);
  if (c !== undefined) return c;
  c = null;
  try {
    if (typeof OffscreenCanvas !== 'undefined') c = new OffscreenCanvas(pb.w, pb.h);
    else if (typeof document !== 'undefined') c = Object.assign(document.createElement('canvas'), { width: pb.w, height: pb.h });
    if (c) c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(pb.rgba), pb.w, pb.h), 0, 0);
  } catch { c = null; }
  imgCache.set(pb, c);
  return c;
}
/** Canvas for atlas image `name` frame `f`, or null if missing / placeholder (so callers draw their own fallback). */
export function image(atlas, name, f = 0) {
  try {
    if (!atlas?.images?.get || atlas.missing?.includes?.(name)) return null;
    const arr = atlas.images.get(name);
    if (!arr) return null;
    const pb = Array.isArray(arr) ? arr[clamp(f | 0, 0, arr.length - 1)] : arr;
    return toCanvas(pb);
  } catch { return null; }
}
export function blit(ctx, img, x, y, w, h) { if (img) ctx.drawImage(img, Math.round(x), Math.round(y), w ?? img.width, h ?? img.height); }

export function sfx(audio, name) { try { audio?.sfx?.(name); } catch { /* audio is optional */ } }

/** Soft dark scrim: overall veil + vignette + top/bottom bands. Lets the attract scene show through the middle. */
export function scrim(ctx, strength = 0.5, tint = '8,5,12') {
  ctx.save();
  ctx.fillStyle = `rgba(${tint},${0.28 * strength})`;
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, W * 0.62);
  g.addColorStop(0, `rgba(${tint},0)`);
  g.addColorStop(1, `rgba(${tint},${Math.min(0.95, 0.95 * strength + 0.15)})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const b = ctx.createLinearGradient(0, 0, 0, H);
  b.addColorStop(0, `rgba(${tint},${0.7 * strength})`); b.addColorStop(0.22, `rgba(${tint},0)`);
  b.addColorStop(0.78, `rgba(${tint},0)`); b.addColorStop(1, `rgba(${tint},${0.8 * strength})`);
  ctx.fillStyle = b; ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/** Chunky pixel panel: dark fill, outline, cheddar inner rim, rivets. */
export function panel(ctx, x, y, w, h, o = {}) {
  x |= 0; y |= 0; w |= 0; h |= 0;
  const rim = o.rim ?? PAL.cheddar;
  ctx.save();
  ctx.globalAlpha *= o.alpha ?? 1;
  ctx.fillStyle = o.fill ?? PAL.panel;
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = PAL.outline;
  ctx.fillRect(x + 1, y, w - 2, 1); ctx.fillRect(x + 1, y + h - 1, w - 2, 1);
  ctx.fillRect(x, y + 1, 1, h - 2); ctx.fillRect(x + w - 1, y + 1, 1, h - 2);
  ctx.fillStyle = rim;
  ctx.fillRect(x + 2, y + 1, w - 4, 1); ctx.fillRect(x + 1, y + 2, 1, h - 4);
  ctx.fillStyle = o.rimDark ?? PAL.stripe;
  ctx.fillRect(x + 2, y + h - 2, w - 4, 1); ctx.fillRect(x + w - 2, y + 2, 1, h - 4);
  ctx.fillStyle = PAL.gold;
  for (const [rx, ry] of [[x + 3, y + 3], [x + w - 5, y + 3], [x + 3, y + h - 5], [x + w - 5, y + h - 5]]) ctx.fillRect(rx, ry, 2, 2);
  ctx.restore();
}

/** Paw-print cursor (hud.cursor, fallback drawn by hand). */
export function paw(ctx, atlas, x, y, pressed = false) {
  const img = image(atlas, 'hud.cursor', pressed ? 1 : 0);
  if (img) { blit(ctx, img, x, y); return; }
  ctx.save();
  const c = pressed ? PAL.stripe : PAL.orange;
  ctx.fillStyle = PAL.outline; ctx.fillRect(x + 2, y + 5, 8, 7); ctx.fillRect(x, y + 2, 4, 4); ctx.fillRect(x + 8, y + 2, 4, 4); ctx.fillRect(x + 3, y, 3, 3); ctx.fillRect(x + 6, y, 3, 3);
  ctx.fillStyle = c; ctx.fillRect(x + 3, y + 6, 6, 5); ctx.fillRect(x + 1, y + 3, 2, 2); ctx.fillRect(x + 9, y + 3, 2, 2); ctx.fillRect(x + 4, y + 1, 1, 1); ctx.fillRect(x + 7, y + 1, 1, 1);
  ctx.fillStyle = PAL.cream; ctx.fillRect(x + 4, y + 7, 2, 1);
  ctx.restore();
}

/** Title logo: hud.logo (240×80) or a hand-drawn fallback. (x,y) = top-left of a 240×80 box. */
export function logo(ctx, atlas, x, y, t = 0) {
  const img = image(atlas, 'hud.logo');
  if (img) { blit(ctx, img, x, y); }
  else {
    outlined(ctx, 'KÄSEKRIEG', x + 120, y + 14, { scale: 4, color: PAL.cheddar, align: 'center' });
    // drips
    ctx.fillStyle = PAL.cheddar;
    for (let i = 0; i < 9; i++) { const dx = x + 22 + i * 23 + ((hash(i, 3) * 6) | 0), len = 2 + ((hash(i, 7) * 7) | 0); ctx.fillRect(dx, y + 42, 2, len); }
    // claw slash
    ctx.fillStyle = PAL.cream;
    for (let k = 0; k < 3; k++) for (let i = 0; i < 46; i++) ctx.fillRect(x + 150 + i + k * 6, y + 6 + i * 0.9 + k * 2, 2, 1);
    outlined(ctx, 'CLAWS OF MARMALADE', x + 120, y + 58, { scale: 1, color: PAL.cream, align: 'center' });
  }
  // twinkles on the logo (deterministic, cycle every 0.6 s)
  const k = Math.floor(t / 0.6);
  for (let i = 0; i < 3; i++) {
    const ph = (t / 0.6) % 1, sx = x + 12 + hash(k, i) * 216, sy = y + 8 + hash(k, i + 9) * 46, r = Math.round(Math.sin(ph * Math.PI) * 3);
    if (r <= 0) continue;
    ctx.fillStyle = '#fffbe0';
    ctx.fillRect(sx - r, sy, r * 2 + 1, 1); ctx.fillRect(sx, sy - r, 1, r * 2 + 1);
  }
}

/** One of the nine lives pips (hud.icon.life, fallback). */
export function lifePip(ctx, atlas, x, y, alive) {
  const img = image(atlas, 'hud.icon.life', alive ? 0 : 1);
  if (img) { blit(ctx, img, x, y); return; }
  ctx.save();
  ctx.fillStyle = alive ? PAL.outline : 'rgba(0,0,0,0)';
  if (alive) { ctx.fillRect(x, y + 1, 9, 7); }
  ctx.fillStyle = alive ? PAL.orange : PAL.grey;
  if (alive) { ctx.fillRect(x + 1, y + 2, 7, 5); ctx.fillRect(x + 1, y, 2, 2); ctx.fillRect(x + 6, y, 2, 2); ctx.fillStyle = PAL.outline; ctx.fillRect(x + 2, y + 4, 1, 1); ctx.fillRect(x + 6, y + 4, 1, 1); }
  else { ctx.fillRect(x + 1, y + 2, 7, 1); ctx.fillRect(x + 1, y + 7, 7, 1); ctx.fillRect(x, y + 2, 1, 5); ctx.fillRect(x + 8, y + 2, 1, 5); ctx.fillRect(x + 1, y, 1, 2); ctx.fillRect(x + 7, y, 1, 2); }
  ctx.restore();
}

/** Major Marmalade's portrait (hud.face, 32×32), fallback: simple orange cat head. */
export function face(ctx, atlas, x, y, frame = 0, scale = 1) {
  const img = image(atlas, 'hud.face', frame);
  if (img) { blit(ctx, img, x, y, 32 * scale, 32 * scale); return; }
  const s = scale;
  ctx.save();
  ctx.fillStyle = PAL.outline; ctx.fillRect(x + 3 * s, y + 7 * s, 26 * s, 22 * s); ctx.fillRect(x + 4 * s, y + 2 * s, 7 * s, 7 * s); ctx.fillRect(x + 21 * s, y + 2 * s, 7 * s, 7 * s);
  ctx.fillStyle = PAL.orange; ctx.fillRect(x + 4 * s, y + 8 * s, 24 * s, 20 * s); ctx.fillRect(x + 5 * s, y + 3 * s, 5 * s, 6 * s); ctx.fillRect(x + 22 * s, y + 3 * s, 5 * s, 6 * s);
  ctx.fillStyle = PAL.stripe; ctx.fillRect(x + 14 * s, y + 8 * s, 4 * s, 4 * s);
  ctx.fillStyle = PAL.cream; ctx.fillRect(x + 10 * s, y + 20 * s, 12 * s, 7 * s);
  ctx.fillStyle = frame === 21 ? PAL.outline : '#7ad04a';
  ctx.fillRect(x + 9 * s, y + 14 * s, 4 * s, 3 * s); ctx.fillRect(x + 19 * s, y + 14 * s, 4 * s, 3 * s);
  ctx.fillStyle = '#e88aa0'; ctx.fillRect(x + 15 * s, y + 20 * s, 2 * s, 2 * s);
  ctx.restore();
}

// ───────────────────────────── menu model ─────────────────────────────

const QUALITIES = ['auto', 'low', 'medium', 'high', 'ultra'];
const DEFAULTS = { quality: 'auto', sensitivity: 1, volume: { master: 0.8, sfx: 0.9, music: 0.6 }, fov: 1.5, crt: false, showFps: false, skill: 1 };
const round = (v, step) => Math.round(v / step) * step;

const CONTROLS = [
  ['MOVE', 'W A S D / ARROWS'], ['TURN', 'MOUSE / ARROWS'], ['RUN', 'SHIFT'], ['FIRE', 'CTRL / LEFT CLICK'],
  ['USE / OPEN', 'SPACE / E'], ['WEAPONS', '1 - 5'], ['NEXT WEAPON', 'WHEEL / Q'], ['MEOW', 'M'],
  ['AUTOMAP', 'TAB'], ['PAUSE', 'ESC / P'], ['GAMEPAD', 'STICKS, A, B, START'],
];

const QUIPS_TITLE = [
  'A CAT. NINE LIVES. ONE CHEESE CRISIS.', 'THE RATS HAVE STOLEN ALL THE CHEESE.', 'NO CHEESE WAS HARMED. SOME RATS WERE.',
  'SHARPEN YOUR CLAWS, MAJOR.', 'SCHLOSS GORGONZOLA AWAITS.',
];
const QUIPS_PAUSE = ['The rats are waiting. Smugly.', 'Time for a quick bath.', 'Even heroes need a nap.', 'Purr... purr... purr...'];

export function createMenus({ atlas = null, audio = null, settings = null, progress = null, canContinue } = {}) {
  const S = settings ?? structuredCloneSafe(DEFAULTS);
  for (const [k, v] of Object.entries(DEFAULTS)) if (S[k] === undefined) S[k] = typeof v === 'object' ? { ...v } : v;
  if (typeof S.volume !== 'object' || !S.volume) S.volume = { ...DEFAULTS.volume };
  let cont = canContinue ?? !!(progress && (progress.level > 0 || progress.levelIndex > 0 || progress.unlocked > 1 || progress.saved));

  const stack = [];        // [{ name, sel, t }]
  let time = 0, pressT = 9, pending = null, blinkT = 0;

  // item: { label, act?:fn→action|undefined, kind?:'choice'|'range'|'toggle', get, set, fmt, disabled? }
  function items(name) {
    switch (name) {
      case 'main': return [
        { label: 'NEW GAME', act: () => push('skill') },
        { label: 'CONTINUE', disabled: !cont, act: () => done({ type: 'continue' }) },
        { label: 'OPTIONS', act: () => push('options') },
        { label: 'CONTROLS', act: () => push('controls') },
        { label: 'QUIT', act: () => push('confirmQuit') },
      ];
      case 'skill': return SKILLS.map((s) => ({ label: s.name.toUpperCase(), skill: s, act: () => { S.skill = s.id; return done({ type: 'new', skill: s.id }); } }));
      case 'options': return [
        { label: 'QUALITY', kind: 'choice', get: () => S.quality, set: (v) => opt('quality', v), options: QUALITIES, fmt: (v) => String(v).toUpperCase() },
        { label: 'SENSITIVITY', kind: 'range', get: () => S.sensitivity, set: (v) => opt('sensitivity', v), min: 0.25, max: 3, step: 0.25, fmt: (v) => v.toFixed(2) },
        { label: 'MASTER VOL', kind: 'range', get: () => S.volume.master, set: (v) => vol('master', v), min: 0, max: 1, step: 0.1, bar: true },
        { label: 'EFFECTS VOL', kind: 'range', get: () => S.volume.sfx, set: (v) => vol('sfx', v), min: 0, max: 1, step: 0.1, bar: true },
        { label: 'MUSIC VOL', kind: 'range', get: () => S.volume.music, set: (v) => vol('music', v), min: 0, max: 1, step: 0.1, bar: true },
        { label: 'FIELD OF VIEW', kind: 'range', get: () => S.fov, set: (v) => opt('fov', v), min: 1.2, max: 1.9, step: 0.05, fmt: (v) => Math.round(v * 180 / Math.PI) + ' DEG' },
        { label: 'CRT FILTER', kind: 'toggle', get: () => !!S.crt, set: (v) => opt('crt', v) },
        { label: 'SHOW FPS', kind: 'toggle', get: () => !!S.showFps, set: (v) => opt('showFps', v) },
        { label: 'BACK', act: () => pop() },
      ];
      case 'controls': return [{ label: 'BACK', act: () => pop() }];
      case 'pause': return [
        { label: 'RESUME', act: () => done({ type: 'resume' }) },
        { label: 'OPTIONS', act: () => push('options') },
        { label: 'CONTROLS', act: () => push('controls') },
        { label: 'QUIT TO TITLE', act: () => push('confirmQuit') },
      ];
      case 'confirmQuit': return [
        { label: 'NO, KEEP CLAWING', act: () => pop() },
        { label: 'YES, LET THEM WIN', act: () => done({ type: 'quit' }) },
      ];
      default: return [];
    }
  }

  const cache = new Map();
  const itemsOf = (name) => { if (!cache.has(name)) cache.set(name, items(name)); return cache.get(name); };
  const top = () => stack[stack.length - 1] || null;

  function firstEnabled(name, from = 0) {
    const it = itemsOf(name);
    for (let i = 0; i < it.length; i++) { const j = (from + i) % it.length; if (!it[j].disabled) return j; }
    return 0;
  }
  function push(name) {
    let sel = 0;
    if (name === 'skill') sel = clamp(S.skill | 0, 0, SKILLS.length - 1);
    stack.push({ name, sel: firstEnabled(name, sel), t: 0 });
    sfx(audio, 'menu_select');
  }
  function pop() {
    if (stack.length > 1) { stack.pop(); sfx(audio, 'menu_back'); return null; }
    const cur = top();
    if (cur?.name === 'pause') return done({ type: 'resume' }, 'menu_back');
    if (cur?.name === 'main') { stack.length = 0; stack.push({ name: 'title', sel: 0, t: 0 }); sfx(audio, 'menu_back'); }
    return null;
  }
  function done(action, sound = 'menu_select') { sfx(audio, sound); stack.length = 0; return action; }
  function opt(key, value) { S[key] = value; pending = { type: 'option', key, value }; }
  function vol(ch, v) { S.volume = { ...S.volume, [ch]: v }; pending = { type: 'option', key: 'volume', value: { ...S.volume } }; }

  function adjust(it, dir) {
    if (it.kind === 'choice') {
      const i = it.options.indexOf(it.get());
      it.set(it.options[(i + dir + it.options.length) % it.options.length]);
    } else if (it.kind === 'range') {
      const v = clamp(round(it.get() + dir * it.step, it.step), it.min, it.max);
      if (Math.abs(v - it.get()) < 1e-9) return false;
      it.set(+v.toFixed(4));
    } else if (it.kind === 'toggle') it.set(!it.get());
    else return false;
    return true;
  }

  const api = {
    get active() { return stack.length > 0; },
    get current() { return top()?.name ?? null; },
    get settings() { return S; },
    get selected() { return top()?.sel ?? -1; },
    setCanContinue(v) { cont = !!v; cache.delete('main'); },
    open(name = 'title') {
      cache.clear();
      stack.length = 0;
      if (name === 'skill' || name === 'options' || name === 'controls') stack.push({ name: 'main', sel: 0, t: 0 });
      if (name === 'title' || itemsOf(name).length || name === 'controls') {
        let sel = name === 'skill' ? clamp(S.skill | 0, 0, SKILLS.length - 1) : 0;
        stack.push({ name, sel: name === 'title' ? 0 : firstEnabled(name, sel), t: 0 });
      }
      blinkT = 0;
    },
    close() { stack.length = 0; },
    update(dt, inp) {
      dt = Number.isFinite(dt) ? clamp(dt, 0, 0.25) : 0;
      time += dt; pressT += dt; blinkT += dt;
      const cur = top();
      if (!cur) return null;
      cur.t += dt;
      const m = inp || {};
      pending = null;
      if (cur.name === 'title') {
        if (cur.t > 0.25 && (m.accept || m.pause)) { push('main'); stack.splice(0, stack.length - 1); return null; }
        return null;
      }
      if (cur.t < 0.12) return null; // swallow the edge that opened us
      const list = itemsOf(cur.name);
      if (m.back || (m.pause && cur.name === 'pause')) return pop();
      if (m.pause && cur.name !== 'pause') return pop();
      if (!list.length) return null;
      if (m.up || m.down) {
        const d = m.up ? -1 : 1;
        let j = cur.sel;
        for (let k = 0; k < list.length; k++) { j = (j + d + list.length) % list.length; if (!list[j].disabled) break; }
        if (j !== cur.sel) { cur.sel = j; sfx(audio, 'menu_move'); }
        return null;
      }
      const it = list[cur.sel];
      if (!it || it.disabled) return null;
      if (m.left || m.right) {
        if (adjust(it, m.left ? -1 : 1)) sfx(audio, 'menu_move');
        return pending;
      }
      if (m.accept) {
        pressT = 0;
        if (it.act) { const r = it.act(); return r ?? null; }
        adjust(it, 1); sfx(audio, 'menu_select');
        return pending;
      }
      return null;
    },
    draw(ctx, t = time) {
      const cur = top();
      if (!cur || !ctx) return;
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      try { DRAW[cur.name]?.(ctx, cur, t); } finally { ctx.restore(); }
    },
  };

  // ───────────────────────────── drawing ─────────────────────────────

  function header(ctx, s, y, cur, sub) {
    const a = ease(cur.t * 4);
    ctx.globalAlpha = a;
    outlined(ctx, s, W / 2, y - Math.round((1 - a) * 8), { scale: 3, color: PAL.cheddar, align: 'center' });
    if (sub) text(ctx, sub, W / 2, y + 26, { color: PAL.dim, align: 'center', shadow: PAL.outline });
    ctx.globalAlpha = 1;
  }

  /** Draw a vertical list of items inside a panel. Returns nothing. */
  function list(ctx, cur, x, y, w, rowH, scale, opts = {}) {
    const its = itemsOf(cur.name);
    const ph = its.length * rowH + 14;
    panel(ctx, x, y, w, ph, { alpha: ease(cur.t * 5) });
    its.forEach((it, i) => {
      const a = ease(cur.t * 6 - i * 0.35);
      if (a <= 0) return;
      const sel = i === cur.sel;
      const ry = y + 7 + i * rowH;
      ctx.globalAlpha = a;
      const off = Math.round((1 - a) * 14);
      if (sel) {
        const pulse = 0.22 + 0.08 * Math.sin(t2 * 6);
        const g = ctx.createLinearGradient(x, 0, x + w, 0);
        g.addColorStop(0, `rgba(242,169,30,0)`); g.addColorStop(0.5, `rgba(242,169,30,${pulse})`); g.addColorStop(1, `rgba(242,169,30,0)`);
        ctx.fillStyle = g; ctx.fillRect(x + 4, ry - 2, w - 8, rowH - 1);
      }
      const col = it.disabled ? PAL.grey : sel ? PAL.swiss : PAL.cream;
      const ty = ry + Math.round((rowH - 2 - 7 * scale) / 2);
      if (it.kind) {
        text(ctx, it.label, x + 22 + off, ty, { scale, color: col, shadow: PAL.outline });
        drawValue(ctx, it, x + w - 16, ty, scale, sel);
      } else {
        const cx = opts.left ? x + 22 : x + w / 2;
        text(ctx, it.label, cx + off, ty, { scale, color: col, shadow: PAL.outline, align: opts.left ? 'left' : 'center' });
      }
      if (sel) {
        const lw = it.kind || opts.left ? 0 : measure(it.label, scale);
        const px = (it.kind || opts.left ? x + 6 : x + w / 2 - lw / 2 - 18) + Math.round(Math.sin(t2 * 8) * 1.5);
        paw(ctx, atlas, px, ty + Math.round((7 * scale - 12) / 2), pressT < 0.12);
      }
    });
    ctx.globalAlpha = 1;
  }
  let t2 = 0;

  function drawValue(ctx, it, rx, y, scale, sel) {
    const v = it.get();
    const arrows = sel ? PAL.orange : 'rgba(0,0,0,0)';
    if (it.bar) {
      const n = 10, on = Math.round(v * n), bw = 9, gap = 2, total = n * (bw + gap) - gap;
      const x0 = rx - total - 8;
      for (let i = 0; i < n; i++) {
        const bx = x0 + i * (bw + gap), hh = 4 + Math.round(i * 0.6 * scale / 2) * 1;
        const by = y + 7 * scale - hh;
        ctx.fillStyle = PAL.outline; ctx.fillRect(bx - 1, by - 1, bw + 2, hh + 2);
        ctx.fillStyle = i < on ? (i < 7 ? PAL.cheddar : PAL.fondue) : '#3a2f40';
        ctx.fillRect(bx, by, bw, hh);
        if (i < on) { ctx.fillStyle = PAL.swiss; ctx.fillRect(bx, by, bw, 1); ctx.fillStyle = PAL.stripe; ctx.fillRect(bx + 2 + (i % 3), by + 2, 2, 1); }
      }
      if (sel) { text(ctx, '<', x0 - 12, y, { scale, color: arrows, shadow: null }); text(ctx, '>', rx - 2, y, { scale, color: arrows, shadow: null }); }
      return;
    }
    let s;
    if (it.kind === 'toggle') s = v ? 'ON' : 'OFF';
    else s = it.fmt ? it.fmt(v) : String(v);
    const col = it.kind === 'toggle' ? (v ? PAL.green : PAL.dim) : sel ? PAL.swiss : PAL.cream;
    const wv = measure(s, scale);
    text(ctx, s, rx - 12, y, { scale, color: col, align: 'right', shadow: PAL.outline });
    if (sel) {
      text(ctx, '<', rx - 12 - wv - 12 * scale / 2 - 6, y, { scale, color: arrows, shadow: PAL.outline });
      text(ctx, '>', rx - 2, y, { scale, color: arrows, shadow: PAL.outline });
    }
  }

  const DRAW = {
    title(ctx, cur, t) {
      t2 = t;
      scrim(ctx, 0.55);
      const a = ease(cur.t * 1.6);
      ctx.globalAlpha = a;
      logo(ctx, atlas, (W - 240) / 2, 34 + Math.round(Math.sin(t * 1.4) * 2) - Math.round((1 - a) * 20), t);
      ctx.globalAlpha = 1;
      if (cur.t > 0.6) {
        const on = (blinkT % 1.1) < 0.75;
        if (on) outlined(ctx, 'PRESS ENTER TO POUNCE', W / 2, 168, { scale: 2, color: PAL.swiss, align: 'center' });
        paw(ctx, atlas, W / 2 - measure('PRESS ENTER TO POUNCE', 2) / 2 - 18, 169, !on);
        paw(ctx, atlas, W / 2 + measure('PRESS ENTER TO POUNCE', 2) / 2 + 6, 169, on);
      }
      const q = QUIPS_TITLE[Math.floor(t / 5) % QUIPS_TITLE.length];
      const qa = clamp(Math.min((t % 5) * 2, (5 - (t % 5)) * 2), 0, 1) * ease(cur.t - 0.8);
      ctx.globalAlpha = qa;
      text(ctx, q, W / 2, 226, { color: PAL.cream, align: 'center', shadow: PAL.outline });
      ctx.globalAlpha = 1;
      text(ctx, 'AN ORIGINAL GAME  -  ZERO ASSETS, ALL CATS', W / 2, 256, { color: PAL.grey, align: 'center', shadow: PAL.outline });
    },
    main(ctx, cur, t) {
      t2 = t;
      scrim(ctx, 0.75);
      logo(ctx, atlas, (W - 240) / 2, 10 + Math.round(Math.sin(t * 1.4) * 1.5), t);
      list(ctx, cur, W / 2 - 92, 104, 184, 19, 2);
      text(ctx, 'ARROWS: CHOOSE   ENTER: POUNCE   ESC: BACK', W / 2, 256, { color: PAL.grey, align: 'center', shadow: PAL.outline });
    },
    skill(ctx, cur, t) {
      t2 = t;
      scrim(ctx, 0.8);
      header(ctx, 'HOW MANY LIVES TO RISK?', 16, cur);
      list(ctx, cur, 18, 58, 272, 22, 2, { left: true });
      const s = SKILLS[cur.sel] ?? SKILLS[0];
      // portrait card
      const px = 302, py = 58, pw = 160, ph = 102;
      panel(ctx, px, py, pw, ph, { alpha: ease(cur.t * 5), rim: [PAL.green, PAL.cheddar, PAL.orange, PAL.red][s.id] ?? PAL.cheddar });
      const frames = [20, 0, 9, 22];
      const bob = Math.round(Math.sin(t * 3) * 1);
      face(ctx, atlas, px + pw / 2 - 32, py + 8 + bob, frames[s.id] ?? 0, 2);
      for (let i = 0; i < 4; i++) {
        const cx = px + pw / 2 - 26 + i * 14;
        ctx.fillStyle = PAL.outline; ctx.fillRect(cx - 1, py + 81, 10, 10);
        ctx.fillStyle = i <= s.id ? [PAL.green, PAL.cheddar, PAL.orange, PAL.red][s.id] : '#3a2f40';
        ctx.fillRect(cx, py + 82, 8, 8);
      }
      const lines = wrap('"' + s.blurb + '"', 400, 1);
      lines.forEach((l, i) => text(ctx, l, W / 2, 178 + i * 10, { color: PAL.swiss, align: 'center', shadow: PAL.outline }));
      const info = `DAMAGE TAKEN x${s.dmgTaken}   RAT TOUGHNESS x${s.enemyHp}   RAT REFLEXES x${(1 / s.reaction).toFixed(2)}`;
      text(ctx, info, W / 2, 200, { color: PAL.dim, align: 'center', shadow: PAL.outline });
      text(ctx, 'ENTER: START   ESC: BACK', W / 2, 256, { color: PAL.grey, align: 'center', shadow: PAL.outline });
    },
    options(ctx, cur, t) {
      t2 = t;
      scrim(ctx, 0.85);
      header(ctx, 'OPTIONS', 14, cur, 'LEFT / RIGHT TO ADJUST');
      list(ctx, cur, 62, 56, 356, 18, 2);
      text(ctx, 'CHANGES APPLY IMMEDIATELY', W / 2, 256, { color: PAL.grey, align: 'center', shadow: PAL.outline });
    },
    controls(ctx, cur, t) {
      t2 = t;
      scrim(ctx, 0.85);
      header(ctx, 'CONTROLS', 14, cur, 'HOW TO BE A CAT');
      const a = ease(cur.t * 5);
      const x = 70, y = 56, w = 340, rowH = 13, h = CONTROLS.length * rowH + 12;
      panel(ctx, x, y, w, h, { alpha: a });
      CONTROLS.forEach(([k, v], i) => {
        const ra = ease(cur.t * 7 - i * 0.25);
        ctx.globalAlpha = ra;
        const ry = y + 7 + i * rowH;
        if (i % 2) { ctx.fillStyle = 'rgba(255,220,150,0.06)'; ctx.fillRect(x + 4, ry - 2, w - 8, rowH); }
        text(ctx, k, x + 16, ry, { color: PAL.cheddar, shadow: PAL.outline });
        text(ctx, v, x + w - 16, ry, { color: PAL.cream, align: 'right', shadow: PAL.outline });
      });
      ctx.globalAlpha = 1;
      // the single BACK item
      const by = y + h + 8;
      text(ctx, 'BACK', W / 2, by + 2, { scale: 2, color: PAL.swiss, align: 'center', shadow: PAL.outline });
      paw(ctx, atlas, W / 2 - measure('BACK', 2) / 2 - 18 + Math.round(Math.sin(t * 8) * 1.5), by + 3, pressT < 0.12);
      text(ctx, 'TIP: PRESS M TO MEOW. RATS HATE IT.', W / 2, 256, { color: PAL.grey, align: 'center', shadow: PAL.outline });
    },
    pause(ctx, cur, t) {
      t2 = t;
      scrim(ctx, 0.9);
      header(ctx, 'PAUSED', 22, cur);
      const q = QUIPS_PAUSE[Math.floor(cur.t / 4) % QUIPS_PAUSE.length];
      text(ctx, q, W / 2, 50, { color: PAL.dim, align: 'center', shadow: PAL.outline });
      // napping cat + zzz
      face(ctx, atlas, W / 2 - 16, 64, 3, 1);
      for (let i = 0; i < 3; i++) {
        const ph = (t * 0.6 + i / 3) % 1;
        ctx.globalAlpha = Math.sin(ph * Math.PI);
        text(ctx, 'z', W / 2 + 18 + ph * 14 + i * 2, 70 - ph * 18, { scale: 1 + (i === 2 ? 1 : 0), color: PAL.cream, shadow: PAL.outline });
      }
      ctx.globalAlpha = 1;
      list(ctx, cur, W / 2 - 100, 106, 200, 20, 2);
    },
    confirmQuit(ctx, cur, t) {
      t2 = t;
      scrim(ctx, 0.95, '20,4,6');
      header(ctx, 'ABANDON THE CHEESE?', 40, cur, 'The rats will throw a party. A big one.');
      const img = image(atlas, 'hud.emblem');
      if (img) blit(ctx, img, W / 2 - 16, 92 + Math.round(Math.sin(t * 2) * 2));
      list(ctx, cur, W / 2 - 120, 136, 240, 22, 2);
    },
  };

  api.open('title');
  stack.length = 0; // start inactive until the shell opens something
  return api;
}

function structuredCloneSafe(o) { try { return structuredClone(o); } catch { return JSON.parse(JSON.stringify(o)); } }

export default createMenus;
