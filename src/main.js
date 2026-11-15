// KÄSEKRIEG app shell (ARCHITECTURE §13): boot → title → menu → levelIntro → playing ⇄ paused → intermission → …
// Every subsystem is loaded with dynamic import() inside try/catch; anything missing degrades to a small built-in
// fallback (logged to __game.errors and the on-screen overlay) instead of a blank page.
import { VIEW, LEVELS, SKILLS, CELL, SKY, TILE, artManifest } from './core/defs.js';
import { createBus } from './core/events.js';
import { createRng } from './core/rng.js';

const DT = 1 / 60;
const MAX_STEPS = 5;
const QUALITIES = ['low', 'medium', 'high', 'ultra'];
const ZERO_CMD = () => ({ forward: 0, strafe: 0, turn: 0, run: false, fire: false, use: false, weapon: -1, next: 0, meow: false });
const ZERO_MENU = () => ({ up: false, down: false, left: false, right: false, accept: false, back: false, pause: false, map: false });

// ───────────────────────────── debug handle + error capture ─────────────────────────────
const G = (window.__game = {
  ready: false, state: 'boot', game: null, renderer: null, errors: [], fps: 0,
  modules: {}, quality: null, params: null,
  start: (level, skill) => startGame((level ?? 1) - 1, skill ?? G.skill ?? 1, { intro: false }),
  cmd: (partial) => { cmdOverride = { ...(cmdOverride ?? {}), ...partial }; },
  warp: (x, y, deg) => warp(x, y, deg),
  action: (a) => handleAction(a),   // test hook: feed a menu action
});

const $ = (id) => document.getElementById(id);
const stage = $('stage'), glCanvas = $('gl'), hudCanvas = $('hud');
const ctx = hudCanvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

function report(where, err) {
  const msg = `[${where}] ${err && err.stack ? String(err.stack).split('\n').slice(0, 3).join(' | ') : (err && err.message) || String(err)}`;
  if (G.errors.length < 200 && !G.errors.includes(msg)) G.errors.push(msg);
  console.error(msg);
  const ov = $('overlay'), list = $('ov-list');
  if (ov && list && !overlayDismissed) {
    const li = document.createElement('li');
    li.textContent = msg;
    list.appendChild(li);
    ov.hidden = false;
  }
}
let overlayDismissed = false;
$('ov-close')?.addEventListener('click', () => { overlayDismissed = true; $('overlay').hidden = true; });
window.addEventListener('error', (e) => report('error', e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => report('promise', e.reason));

// ───────────────────────────── URL params ─────────────────────────────
function parseParams(search) {
  const q = new URLSearchParams(search);
  const int = (k, lo, hi) => {
    if (!q.has(k)) return null;
    const v = parseInt(q.get(k), 10);
    return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null;
  };
  const flag = (k) => q.has(k) && q.get(k) !== '0' && q.get(k) !== 'false';
  let pos = null;
  if (q.has('pos')) {
    const p = q.get('pos').split(',').map(Number);
    if (p.length >= 2 && p.slice(0, 2).every(Number.isFinite)) pos = { x: p[0], y: p[1], deg: Number.isFinite(p[2]) ? p[2] : null };
  }
  const quality = q.get('quality');
  return {
    autostart: flag('autostart'), level: int('level', 1, LEVELS.length), skill: int('skill', 0, SKILLS.length - 1),
    god: flag('god'), quality: quality && ['auto', ...QUALITIES].includes(quality) ? quality : null,
    mute: flag('mute'), demo: flag('demo'), pos, seed: int('seed', 0, 2 ** 31 - 1),
  };
}
const P = (G.params = parseParams(location.search));

// ───────────────────────────── module loading ─────────────────────────────
async function load(name, path, required = []) {
  try {
    const mod = await import(path);
    for (const k of required) if (typeof mod[k] === 'undefined') throw new Error(`missing export '${k}'`);
    G.modules[name] = 'ok';
    return mod;
  } catch (e) {
    G.modules[name] = 'fallback';
    report(`load ${name}`, e);
    return null;
  }
}

// ───────────────────────────── shell state ─────────────────────────────
let M = {};                      // loaded modules
let settings, progress, atlas, levels, input, audio, renderer = null, hud, menus, screens, font;
let softView = null;             // software raycaster fallback (no WebGL2 renderer)
let game = null, attract = null; // the played game, the title-screen attract game
let state = 'boot';
let cmdOverride = null;
let automapOn = false;
let bootProgress = { frac: 0, label: 'starting' };
let currentMusic = null;
let fx = { flash: [0, 0, 0, 0], hurt: 0, wobble: 0 };
let bot = null;
let lastStatus = null;
let pendingAfterScreen = null;
let paused = false;
const fpsMeter = { ema: 1 / 60 };
const autoQ = { enabled: false, idx: 1, slowT: 0, fastT: 0, cooldown: 0 };

function setState(s) {
  state = s; G.state = s;
  stage.classList.toggle('playing', s === 'playing');
}

// ───────────────────────────── fallbacks ─────────────────────────────
function fallbackSettings() {
  const d = () => ({ quality: 'auto', sensitivity: 1, volume: { master: 0.8, sfx: 0.9, music: 0.6 }, fov: 1.5, crt: false, showFps: false, skill: 1 });
  return {
    loadSettings: () => { try { return { ...d(), ...JSON.parse(localStorage.getItem('kasekrieg.settings.v1') || '{}') }; } catch { return d(); } },
    saveSettings: (s) => { try { localStorage.setItem('kasekrieg.settings.v1', JSON.stringify(s)); } catch { /* ignore */ } },
    loadProgress: () => ({ unlocked: 1, skill: 1, best: {} }),
    saveProgress: () => {},
  };
}

function fallbackInput(canvas) {
  const held = new Set();
  let edges = {}, menuEdges = ZERO_MENU(), mdx = 0;
  const onDown = (e) => {
    if (!e.repeat) {
      edges[e.code] = true;
      const map = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', ArrowRight: 'right',
        Enter: 'accept', Space: 'accept', Escape: 'back', KeyP: 'pause', Tab: 'map' };
      if (map[e.code]) menuEdges[map[e.code]] = true;
      if (e.code === 'Escape') menuEdges.pause = true;
    }
    held.add(e.code);
    if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  };
  const onUp = (e) => held.delete(e.code);
  const onMove = (e) => { if (document.pointerLockElement === canvas) mdx += e.movementX || 0; };
  const onMouse = (e) => { if (e.button === 0) { if (e.type === 'mousedown') held.add('Mouse0'); else held.delete('Mouse0'); } };
  window.addEventListener('keydown', onDown); window.addEventListener('keyup', onUp);
  window.addEventListener('mousemove', onMove); window.addEventListener('mousedown', onMouse); window.addEventListener('mouseup', onMouse);
  window.addEventListener('blur', () => held.clear());
  const h = (...c) => c.some((k) => held.has(k));
  const api = {
    sensitivity: 1,
    get locked() { return document.pointerLockElement === canvas; },
    requestLock() { try { canvas.requestPointerLock?.()?.catch?.(() => {}); } catch { /* ignore */ } },
    poll() {
      const c = ZERO_CMD();
      c.forward = (h('KeyW', 'ArrowUp') ? 1 : 0) - (h('KeyS', 'ArrowDown') ? 1 : 0);
      c.strafe = (h('KeyD') ? 1 : 0) - (h('KeyA') ? 1 : 0);
      c.turn = ((h('ArrowRight') ? 1 : 0) - (h('ArrowLeft') ? 1 : 0)) * 2.6 * DT + mdx * 0.0025 * api.sensitivity;
      c.run = h('ShiftLeft', 'ShiftRight');
      c.fire = h('ControlLeft', 'ControlRight', 'Mouse0');
      c.use = !!(edges.Space || edges.KeyE);
      for (let i = 0; i < 5; i++) if (edges['Digit' + (i + 1)]) c.weapon = i;
      c.next = edges.KeyQ ? 1 : 0;
      c.meow = !!edges.KeyM;
      edges = {}; mdx = 0;
      return c;
    },
    menu() { const m = menuEdges; menuEdges = ZERO_MENU(); return m; },
    dispose() {},
  };
  return api;
}

function fallbackAudio() {
  return { ready: false, unlock() {}, sfx() {}, setListener() {}, music() {}, setVolume() {}, suspend() {}, resume() {} };
}

async function fallbackAtlas(onProgress) {
  // Minimal stand-in for registry.buildAtlas: hashed-colour checker placeholders for every manifest name.
  let PixBuf = null;
  try { ({ PixBuf } = await import('./art/pixbuf.js')); } catch { /* images stay empty */ }
  const man = artManifest();
  const hashCol = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return [(h & 255), (h >> 8) & 255, (h >> 16) & 255]; };
  const fill = (rgba, off, name, frame, sprite) => {
    const [r, g, b] = hashCol(name + frame);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const i = off + (y * TILE + x) * 4, k = ((x >> 3) ^ (y >> 3)) & 1 ? 1 : 0.6;
      const inside = !sprite || (Math.abs(x - 32) < 16 && y > 16);
      rgba[i] = r * k; rgba[i + 1] = g * k; rgba[i + 2] = b * k; rgba[i + 3] = inside ? 255 : 0;
    }
  };
  const build = (kind) => {
    const list = man.filter((a) => a.kind === kind);
    const count = 1 + list.reduce((s, a) => s + a.frames, 0);
    const rgba = new Uint8Array(count * TILE * TILE * 4), mat = new Uint8Array(rgba.length);
    for (let i = 3; i < mat.length; i += 4) mat[i] = 255;
    const index = new Map(), frames = new Map(), anim = new Uint8Array(count);
    fill(rgba, 0, 'placeholder', 0, kind === 'sprite'); anim[0] = 1;
    let layer = 1;
    for (const a of list) {
      index.set(a.name, layer); frames.set(a.name, a.frames); anim[layer] = a.frames;
      for (let f = 0; f < a.frames; f++, layer++) { fill(rgba, layer * TILE * TILE * 4, a.name, f, kind === 'sprite'); if (f) anim[layer] = 1; }
    }
    return { count, rgba, mat, index, frames, anim };
  };
  onProgress?.(0.3, 'placeholders');
  const tiles = build('tile'), sprites = build('sprite');
  const images = new Map();
  if (PixBuf) for (const a of man.filter((m) => m.kind === 'image')) images.set(a.name, Array.from({ length: a.frames }, () => new PixBuf(a.w, a.h)));
  onProgress?.(1, 'done');
  return {
    tiles, sprites, images, missing: man.map((a) => a.name),
    tile: (n) => tiles.index.get(n) ?? 0,
    sprite: (n, f = 0) => { const l = sprites.index.get(n); return l == null ? 0 : l + Math.min(f, (sprites.frames.get(n) ?? 1) - 1); },
  };
}

const fallbackFont = {
  drawText(c, text, x, y, o = {}) {
    const s = Math.max(1, Math.round(o.scale ?? 1));
    c.save();
    c.font = `${8 * s}px monospace`; c.textBaseline = 'top';
    c.textAlign = o.align ?? 'left';
    if (o.shadow !== null) { c.fillStyle = o.shadow ?? '#000'; c.fillText(String(text), x + s, y + s); }
    c.fillStyle = o.color ?? '#fff'; c.fillText(String(text), x, y);
    c.restore();
  },
  measureText: (t, s = 1) => String(t).length * 6 * s,
};
const text = (...a) => { try { (font ?? fallbackFont).drawText(ctx, ...a); } catch (e) { report('font', e); font = fallbackFont; } };

function fallbackHud() {
  return {
    onEvent() {},
    draw(c, g) {
      const p = g?.player; if (!p) return;
      text(`HP ${Math.round(p.health)}  LIVES ${p.lives}  SCORE ${p.score}`, 6, VIEW.H - 12, { color: '#fde3b0' });
      const w = p.weapon ?? 0, am = p.ammo ?? {};
      text(`W${w + 1}  HAIR ${am.hair ?? 0} YARN ${am.yarn ?? 0} CELL ${am.cell ?? 0}`, VIEW.W - 6, VIEW.H - 12, { align: 'right', color: '#ffd23e' });
      c.fillStyle = '#fff'; c.fillRect(VIEW.W / 2 - 1, VIEW.H / 2, 3, 1); c.fillRect(VIEW.W / 2, VIEW.H / 2 - 1, 1, 3);
    },
  };
}

function fallbackMenus() {
  let active = false, name = 'title', sel = 1;
  return {
    get active() { return active; },
    open(n) { active = n != null; name = n ?? name; sel = 1; },
    update(dt, mi) {
      if (!active) return null;
      if (name === 'pause') { if (mi.accept || mi.back || mi.pause) { active = false; return { type: 'resume' }; } return null; }
      if (mi.left || mi.up) sel = Math.max(0, sel - 1);
      if (mi.right || mi.down) sel = Math.min(3, sel + 1);
      if (mi.accept) { active = false; return { type: 'new', skill: sel }; }
      return null;
    },
    draw(c, t) {
      c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(0, 0, VIEW.W, VIEW.H);
      if (name === 'pause') { text('PAUSED', VIEW.W / 2, 120, { scale: 3, align: 'center', color: '#ffd23e' }); return; }
      text('KÄSEKRIEG', VIEW.W / 2, 60, { scale: 5, align: 'center', color: '#f2a91e' });
      text('CLAWS OF MARMALADE', VIEW.W / 2, 104, { scale: 2, align: 'center', color: '#fde3b0' });
      text(`< ${SKILLS[sel].name} >`, VIEW.W / 2, 160, { scale: 2, align: 'center', color: '#fff' });
      if ((t * 2 | 0) % 2) text('PRESS ENTER', VIEW.W / 2, 200, { scale: 2, align: 'center', color: '#ffd23e' });
    },
  };
}

function fallbackScreens() {
  let name = null, data = null, t = 0;
  return {
    show(n, d) { name = n; data = d; t = 0; },
    update(dt, mi) { t += dt; if (name && (t > 0.4 && (mi.accept || mi.back) || t > 6)) { name = null; return 'done'; } return null; },
    draw(c) {
      if (!name) return;
      c.fillStyle = 'rgba(0,0,0,0.7)'; c.fillRect(0, 0, VIEW.W, VIEW.H);
      const title = { levelIntro: data?.name ?? 'Get ready', intermission: 'LEVEL COMPLETE', death: 'OUCH!', gameOver: 'GAME OVER', victory: 'VICTORY!' }[name] ?? name;
      text(title, VIEW.W / 2, 100, { scale: 3, align: 'center', color: '#ffd23e' });
      const s = data?.stats;
      if (s) text(`KILLS ${s.kills}/${s.killsTotal}  TREASURE ${s.treasure}/${s.treasureTotal}  SECRETS ${s.secrets}/${s.secretsTotal}`, VIEW.W / 2, 140, { align: 'center' });
      else if (data?.intro) text(data.intro, VIEW.W / 2, 140, { align: 'center' });
    },
  };
}

// ── software raycaster: used only when the WebGL2 renderer is missing or unavailable ──
function createSoftView(atl) {
  const W = 240, H = 135;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c2 = cv.getContext('2d'); const img = c2.createImageData(W, H); const px = img.data;
  const zbuf = new Float32Array(W);
  const T = TILE, T2 = T * T * 4;
  const trgba = atl?.tiles?.rgba, tmat = atl?.tiles?.mat, srgba = atl?.sprites?.rgba;
  const tex = (layer, u, v, out) => {
    if (!trgba) { out[0] = 120; out[1] = 110; out[2] = 100; out[3] = 0; return; }
    const i = layer * T2 + (((v * T) | 0) & 63) * T * 4 + (((u * T) | 0) & 63) * 4;
    out[0] = trgba[i]; out[1] = trgba[i + 1]; out[2] = trgba[i + 2]; out[3] = tmat ? tmat[i] : 0;
  };
  const anim = (layer, t) => { const n = atl?.tiles?.anim?.[layer] || 1; return layer + (Math.floor(t * 6) % n); };
  const col = [0, 0, 0, 0];
  return {
    canvas: cv,
    render(scene) {
      const wd = scene?.world; if (!wd) return;
      const { w, h, cells } = wd;
      const cam = scene.cam, fov = cam.fov || VIEW.FOV, eye = cam.h ?? VIEW.EYE;
      const ca = Math.cos(cam.angle), sa = Math.sin(cam.angle), pl = Math.tan(fov / 2);
      const f = (W / 2) / pl, hz = H / 2, t = scene.time || 0;
      const amb = scene.ambient ?? [0.1, 0.1, 0.1];
      const lightK = (d) => Math.min(1.25, 0.35 + Math.max(amb[0], 0.05) * 3 + 1.6 / (1 + d * 0.45));
      const put = (i, r, g, b, k, e) => { const m = k + e; px[i] = Math.min(255, r * m); px[i + 1] = Math.min(255, g * m); px[i + 2] = Math.min(255, b * m); px[i + 3] = 255; };
      for (let x = 0; x < W; x++) {
        const camX = 2 * (x + 0.5) / W - 1;
        const rx = ca - sa * pl * camX, ry = sa + ca * pl * camX;
        let mx = Math.floor(cam.x), my = Math.floor(cam.y);
        const ddx = Math.abs(1 / rx), ddy = Math.abs(1 / ry);
        const sx = rx < 0 ? -1 : 1, sy = ry < 0 ? -1 : 1;
        let sdx = (rx < 0 ? cam.x - mx : mx + 1 - cam.x) * ddx, sdy = (ry < 0 ? cam.y - my : my + 1 - cam.y) * ddy;
        let side = 0, dist = 64, layer = 0, hit = false;
        for (let n = 0; n < 128; n++) {
          if (sdx < sdy) { sdx += ddx; mx += sx; side = 0; } else { sdy += ddy; my += sy; side = 1; }
          if (mx < 0 || my < 0 || mx >= w || my >= h) break;
          const i = my * w + mx, cl = cells[i];
          if (cl !== CELL.OPEN) {
            if (cl === CELL.DOOR) { const di = wd.doorAt?.[i] ?? -1; const dr = di >= 0 ? wd.doors[di] : null; if (dr && dr.open > 0.7) continue; }
            dist = side === 0 ? sdx - ddx : sdy - ddy; layer = wd.wallTex?.[i] ?? 0; hit = true; break;
          }
        }
        zbuf[x] = dist;
        const top = hit ? hz - (1 - eye) * f / dist : hz, bot = hit ? hz + eye * f / dist : hz;
        let u = side === 0 ? cam.y + dist * ry : cam.x + dist * rx; u -= Math.floor(u);
        if ((side === 0 && rx < 0) || (side === 1 && ry > 0)) u = 1 - u;
        const k = lightK(dist) * (side ? 0.78 : 1), lay = anim(layer, t);
        for (let y = 0; y < H; y++) {
          const i = (y * W + x) * 4;
          if (y >= top && y < bot) {
            tex(lay, u, (y - top) / (bot - top), col); put(i, col[0], col[1], col[2], k, col[3] / 120);
          } else if (y >= bot) {
            const d = eye * f / (y - hz + 0.5), wx = cam.x + rx * d, wy = cam.y + ry * d;
            const ci = Math.floor(wy) * w + Math.floor(wx);
            const fl = wd.floorTex?.[ci] ?? 0;
            tex(anim(fl, t), wx - Math.floor(wx), wy - Math.floor(wy), col); put(i, col[0], col[1], col[2], lightK(d) * 0.85, col[3] / 120);
          } else {
            const d = (1 - eye) * f / (hz - y - 0.5), wx = cam.x + rx * d, wy = cam.y + ry * d;
            const ci = Math.floor(wy) * w + Math.floor(wx);
            const cl = wd.ceilTex?.[ci] ?? 0;
            if (cl === SKY) { const s = (hash(x, y) > 0.995) ? 220 : 0; px[i] = 8 + s; px[i + 1] = 10 + s; px[i + 2] = 28 + s; px[i + 3] = 255; }
            else { tex(cl, wx - Math.floor(wx), wy - Math.floor(wy), col); put(i, col[0], col[1], col[2], lightK(d) * 0.7, col[3] / 120); }
          }
        }
      }
      // sprites, far to near
      if (srgba && scene.sprites) {
        const list = scene.sprites.map((s) => { const dx = s.x - cam.x, dy = s.y - cam.y; return { s, dep: dx * ca + dy * sa, lat: -dx * sa + dy * ca }; })
          .filter((o) => o.dep > 0.15).sort((a, b) => b.dep - a.dep);
        for (const { s, dep, lat } of list) {
          const size = (s.size || 1) * f / dep, cx = W / 2 + lat / dep * f;
          const bottom = hz + (eye - (s.h || 0)) * f / dep, topY = bottom - size;
          const x0 = Math.max(0, Math.floor(cx - size / 2)), x1 = Math.min(W - 1, Math.ceil(cx + size / 2));
          const y0 = Math.max(0, Math.floor(topY)), y1 = Math.min(H - 1, Math.ceil(bottom));
          const base = (s.frame | 0) * T2, k = lightK(dep);
          for (let x = x0; x <= x1; x++) {
            if (zbuf[x] < dep) continue;
            let u = (x - (cx - size / 2)) / size; if (u < 0 || u >= 1) continue; if (s.flipX) u = 1 - u;
            for (let y = y0; y <= y1; y++) {
              const v = (y - topY) / size; if (v < 0 || v >= 1) continue;
              const si = base + ((v * T) | 0) * T * 4 + ((u * T) | 0) * 4;
              if (srgba[si + 3] < 128) continue;
              put((y * W + x) * 4, srgba[si], srgba[si + 1], srgba[si + 2], k, (s.glow || 0));
            }
          }
        }
      }
      c2.putImageData(img, 0, 0);
    },
  };
}
const hash = (x, y) => { let h = Math.imul(x * 374761393 + y * 668265263, 1274126177); h ^= h >>> 13; return ((h >>> 0) % 10000) / 10000; };

// ───────────────────────────── boot ─────────────────────────────
function drawBoot() {
  ctx.clearRect(0, 0, VIEW.W, VIEW.H);
  ctx.fillStyle = '#07060a'; ctx.fillRect(0, 0, VIEW.W, VIEW.H);
  text('KÄSEKRIEG', VIEW.W / 2, 92, { scale: 4, align: 'center', color: '#f2a91e', shadow: '#5a2a06' });
  text('sharpening claws…', VIEW.W / 2, 132, { align: 'center', color: '#fde3b0' });
  const bw = 200, x = (VIEW.W - bw) / 2, y = 150;
  ctx.fillStyle = '#2a2230'; ctx.fillRect(x, y, bw, 6);
  ctx.fillStyle = '#f08a1c'; ctx.fillRect(x, y, Math.round(bw * Math.min(1, bootProgress.frac)), 6);
  text(String(bootProgress.label || ''), VIEW.W / 2, 162, { align: 'center', color: '#8d98a8' });
}

async function boot() {
  setState('boot');
  drawBoot();
  const [mSettings, mInput, mFont] = await Promise.all([
    load('settings', './core/settings.js', ['loadSettings']),
    load('input', './core/input.js', ['createInput']),
    load('font', './ui/font.js', ['drawText']),
  ]);
  font = mFont ?? fallbackFont;
  M.settings = mSettings ?? fallbackSettings();
  try { settings = M.settings.loadSettings(); } catch (e) { report('settings', e); settings = fallbackSettings().loadSettings(); }
  try { progress = M.settings.loadProgress?.() ?? { unlocked: 1, skill: 1, best: {} }; } catch (e) { report('progress', e); progress = { unlocked: 1, skill: 1, best: {} }; }
  try { input = mInput ? mInput.createInput(glCanvas) : fallbackInput(glCanvas); } catch (e) { report('input', e); input = fallbackInput(glCanvas); }
  try { input.sensitivity = settings.sensitivity ?? 1; } catch { /* read-only */ }
  drawBoot();

  // art (the slow part) — progress bar
  const mReg = await load('registry', './art/registry.js', ['buildAtlas']);
  const onProgress = (frac, label) => { bootProgress = { frac: frac * 0.85, label }; drawBoot(); };
  try { atlas = mReg ? await mReg.buildAtlas(onProgress) : await fallbackAtlas(onProgress); }
  catch (e) { report('atlas', e); atlas = await fallbackAtlas(onProgress); }
  if (atlas?.missing?.length) console.warn(`[atlas] ${atlas.missing.length} placeholder art names`);
  bootProgress = { frac: 0.88, label: 'levels' }; drawBoot();

  const mods = await Promise.all([
    load('levels', './levels/index.js', ['levels']),
    load('game', './sim/game.js', ['createGame']),
    load('renderer', './render/renderer.js', ['createRenderer']),
    load('audio', './audio/audio.js', ['createAudio']),
    load('hud', './ui/hud.js', ['createHud']),
    load('automap', './ui/automap.js', ['drawAutomap']),
    load('menus', './ui/menus.js', ['createMenus']),
    load('screens', './ui/screens.js', ['createScreens']),
  ]);
  [M.levels, M.game, M.renderer, M.audio, M.hud, M.automap, M.menus, M.screens] = mods;
  levels = M.levels?.levels?.length ? M.levels.levels : await builtinLevels();
  if (M.levels?.missing?.length) console.warn('[levels] placeholder levels:', M.levels.missing.join(', '));

  bootProgress = { frac: 0.93, label: 'audio' }; drawBoot();
  try { audio = M.audio ? M.audio.createAudio() : fallbackAudio(); } catch (e) { report('audio', e); audio = fallbackAudio(); }
  G.audio = audio;
  applyVolume();
  const unlock = () => { try { audio.unlock(); } catch (e) { report('audio.unlock', e); } };
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
  stage.addEventListener('click', () => { if (state === 'playing') input.requestLock?.(); });

  bootProgress = { frac: 0.96, label: 'ray tracer' }; drawBoot();
  const qSetting = P.quality ?? settings.quality ?? 'auto';
  autoQ.enabled = qSetting === 'auto';
  const q0 = autoQ.enabled ? 'medium' : qSetting;
  autoQ.idx = QUALITIES.indexOf(q0);
  G.quality = q0;
  sizeGlCanvas();
  if (M.renderer) {
    try { renderer = M.renderer.createRenderer(glCanvas, atlas, { quality: q0 }); }
    catch (e) { report(e?.message === 'WEBGL2_UNAVAILABLE' ? 'renderer (no WebGL2 — software fallback)' : 'renderer', e); renderer = null; }
  }
  if (renderer) { applyRenderOptions(); G.renderer = renderer; }
  else { softView = createSoftView(atlas); glCanvas.style.visibility = 'hidden'; G.renderer = { soft: true, stats: { renderer: 'software fallback' } }; }

  try { hud = M.hud ? M.hud.createHud(atlas) : fallbackHud(); } catch (e) { report('hud', e); hud = fallbackHud(); }
  try { menus = M.menus ? M.menus.createMenus({ atlas, audio, settings, progress }) : fallbackMenus(); } catch (e) { report('menus', e); menus = fallbackMenus(); }
  try { screens = M.screens ? M.screens.createScreens({ atlas }) : fallbackScreens(); } catch (e) { report('screens', e); screens = fallbackScreens(); }

  window.addEventListener('resize', () => { sizeGlCanvas(); try { renderer?.resize(); } catch (e) { report('resize', e); } });
  document.addEventListener('visibilitychange', () => { try { document.hidden ? audio.suspend() : audio.resume(); } catch { /* ignore */ } });

  bootProgress = { frac: 1, label: 'ready' }; drawBoot();
  if (!(P.autostart && startGame((P.level ?? 1) - 1, P.skill ?? settings.skill ?? 1, { intro: false }))) enterTitle();
  lastT = performance.now();
  requestAnimationFrame(frame);
}

async function builtinLevels() {
  return LEVELS.map(([id, name]) => ({
    id, name: name + ' (placeholder)', intro: 'Level files are missing.', par: 60, music: 'level_a',
    wall: 'wall.fort_stone', floor: 'flat.floor_stone', ceil: 'flat.ceil_stone', zones: {},
    ambient: [0.08, 0.08, 0.1], fog: { color: [0.02, 0.02, 0.03], density: 0.03 }, sky: null,
    map: ['#######', '#.....#', '#.....#', '#....X#', '#######'],
    things: ['.......', '.>..!..', '...m...', '.......', '.......'],
  }));
}

function sizeGlCanvas() {
  const r = stage.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(320, Math.round(r.width * dpr)), h = Math.max(180, Math.round(r.height * dpr));
  if (glCanvas.width !== w || glCanvas.height !== h) { glCanvas.width = w; glCanvas.height = h; }
}

function applyVolume() {
  try {
    const v = settings.volume ?? { master: 0.8, sfx: 0.9, music: 0.6 };
    audio?.setVolume({ master: P.mute ? 0 : v.master, sfx: v.sfx, music: v.music });
  } catch (e) { report('audio.setVolume', e); }
}
function applyRenderOptions() {
  try { renderer?.setOption?.('crt', !!settings.crt); } catch (e) { report('renderer.setOption', e); }
}

// ───────────────────────────── game lifecycle ─────────────────────────────
function makeGame(skill, seed) {
  if (!M.game) return null;
  const bus = createBus();
  const rng = createRng(seed ?? P.seed ?? ((Math.random() * 2 ** 31) >>> 0));
  return M.game.createGame({ atlas, levels, bus, rng, skill });
}

function wireBus(g) {
  g.bus.on('sfx', (p) => { try { if (p && state !== 'title' && state !== 'menu') audio.sfx(p.name, p); } catch (e) { report('audio.sfx', e); } });
  g.bus.on('music', (p) => playMusic(p?.name ?? null));
  g.bus.on('flash', (p) => { if (p) fx.flash = [p.r ?? 1, p.g ?? 1, p.b ?? 1, Math.min(1, p.a ?? 0.4)]; });
  g.bus.on('hurt', (p) => { fx.hurt = Math.min(1, fx.hurt + Math.max(0.15, (p?.amount ?? 10) / 35)); });
  g.bus.on('*', (type, p) => { try { hud?.onEvent?.(type, p); } catch (e) { report('hud.onEvent', e); } });
}

function playMusic(name) {
  if (name === currentMusic) return;
  currentMusic = name;
  try { audio?.music(name); } catch (e) { report('audio.music', e); }
}

function enterTitle() {
  disposeBot();
  game = null; G.game = null; G.ready = false;
  setState('title');
  attract = null;
  try {
    attract = makeGame(1, 1);
    if (attract) {
      attract.cheats && (attract.cheats.god = attract.cheats.noTarget = true);
      attract.loadLevel(0, {});
      attract.cheats && (attract.cheats.god = attract.cheats.noTarget = true);
      attract._attract = { x: attract.player?.x ?? 1.5, y: attract.player?.y ?? 1.5, a: attract.player?.angle ?? 0 };
    }
  } catch (e) { report('attract', e); attract = null; }
  try { menus.open('title'); } catch (e) { report('menus.open', e); }
  playMusic('title');
}

function startGame(levelIndex, skill, { intro = true } = {}) {
  if (!M.game) { report('start', new Error('sim/game.js is unavailable — cannot start a game')); return false; }
  disposeBot();
  attract = null;
  G.skill = skill;
  try {
    game = makeGame(skill);
    wireBus(game);
    if (P.god && game.cheats) game.cheats.god = true;
    G.game = game;
    try { progress.skill = skill; M.settings.saveProgress?.(progress); } catch { /* ignore */ }
    try { menus.open?.(null); } catch { /* menus may not accept null */ }
    loadLevel(levelIndex, false, intro);
    return true;
  } catch (e) { report('startGame', e); game = null; G.game = null; enterTitle(); return false; }
}

function loadLevel(index, keepPlayer, intro) {
  game.loadLevel(index, { keepPlayer });
  if (P.god && game.cheats) game.cheats.god = true;
  lastStatus = game.status;
  fx = { flash: [0, 0, 0, 0], hurt: 0, wobble: 0 };
  automapOn = false;
  if (P.pos && !loadLevel._posDone) { loadLevel._posDone = true; warp(P.pos.x, P.pos.y, P.pos.deg); }
  playMusic(game.world?.def?.music ?? levels[index]?.music ?? 'level_a');
  if (P.demo) bot = createBot(game);
  const def = levels[index] ?? {};
  if (intro) {
    setState('levelIntro');
    showScreen('levelIntro', { index, id: def.id, name: def.name, intro: def.intro, par: def.par, skill: game.skill, def });
  } else setState('playing');
}

function warp(x, y, deg) {
  const p = (game ?? attract)?.player; if (!p) return false;
  p.x = x; p.y = y;
  if (Number.isFinite(deg)) p.angle = deg * Math.PI / 180;
  if (p.vx !== undefined) p.vx = 0;
  if (p.vy !== undefined) p.vy = 0;
  return true;
}

function showScreen(name, data) {
  try { screens.show(name, data); } catch (e) { report('screens.show', e); }
}

function onScreenDone() {
  const s = state;
  if (s === 'levelIntro') setState('playing');
  else if (s === 'intermission') {
    const next = game.levelIndex + 1;
    if (game.status === 'victory' || next >= levels.length) { setState('victory'); showScreen('victory', { stats: { ...game.stats }, score: game.player?.score ?? 0 }); playMusic('victory'); }
    else loadLevel(next, true, true);
  } else if (s === 'death') {
    const lives = game.player?.lives ?? 0;
    if (game.status === 'dead' || game.player?.dead) {
      if (lives > 0) loadLevel(game.levelIndex, true, false);
      else { setState('gameOver'); showScreen('gameOver', { score: game.player?.score ?? 0, stats: { ...game.stats } }); playMusic('gameover'); }
    } else setState('playing');   // the sim already restarted the level
  } else if (s === 'gameOver' || s === 'victory') enterTitle();
}

function checkStatus() {
  const st = game.status;
  if (st === lastStatus) return;
  lastStatus = st;
  if (st === 'complete' || st === 'victory') {
    const def = levels[game.levelIndex] ?? {};
    try {
      progress.unlocked = Math.max(progress.unlocked ?? 1, Math.min(levels.length, game.levelIndex + 2));
      const best = (progress.best ??= {});
      const prev = best[def.id];
      if (!prev || (game.player?.score ?? 0) > (prev.score ?? 0)) best[def.id] = { score: game.player?.score ?? 0, time: game.stats.time, kills: game.stats.kills, treasure: game.stats.treasure, secrets: game.stats.secrets };
      M.settings.saveProgress?.(progress);
    } catch (e) { report('saveProgress', e); }
    setState('intermission');
    showScreen('intermission', { index: game.levelIndex, id: def.id, name: def.name, stats: { ...game.stats }, score: game.player?.score ?? 0, last: st === 'victory' || game.levelIndex + 1 >= levels.length });
    playMusic('intermission');
  } else if (st === 'dead') {
    setState('death');
    showScreen('death', { livesLeft: game.player?.lives ?? 0, score: game.player?.score ?? 0 });
  }
}

// ───────────────────────────── demo bot ─────────────────────────────
function createBot(g) {
  const rng = createRng((P.seed ?? 7) + 101);
  let visits = null, path = [], replanT = 0, lastPos = { x: 0, y: 0 }, stuckT = 0, wiggle = 0, wiggleDir = 1, useT = 0, worldRef = null;
  const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  const passable = (wd, cx, cy, keys) => {
    if (!wd.inBounds?.(cx, cy) && (cx < 0 || cy < 0 || cx >= wd.w || cy >= wd.h)) return false;
    const i = cy * wd.w + cx, c = wd.cells[i];
    if (wd.blocker?.[i]) return false;
    if (c === CELL.OPEN) return !(wd.movers?.some?.((m) => cx + 0.5 > m.x0 && cx + 0.5 < m.x1 && cy + 0.5 > m.y0 && cy + 0.5 < m.y1));
    if (c === CELL.DOOR) { const d = wd.doors?.[wd.doorAt?.[i]]; return !d?.lock || !!keys?.[d.lock]; }
    return false;
  };
  // after a while the bot heads for the exit switch (a cell next to a CELL.EXIT wall)
  const wantExit = () => (g.stats?.time ?? g.time ?? 0) > 25;
  const exitAdj = (wd, cx, cy) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => wd.inBounds?.(cx + dx, cy + dy) !== false && wd.cells[(cy + dy) * wd.w + cx + dx] === CELL.EXIT);
  function exitCell(wd, p) {
    const cx = Math.floor(p.x), cy = Math.floor(p.y);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (wd.cells[(cy + dy) * wd.w + cx + dx] === CELL.EXIT) return { cx: cx + dx, cy: cy + dy };
    return null;
  }
  function plan(wd, p) {
    const W = wd.w, H = wd.h, sx = Math.floor(p.x), sy = Math.floor(p.y);
    const prev = new Int32Array(W * H).fill(-1), seen = new Uint8Array(W * H);
    const q = [sy * W + sx]; seen[q[0]] = 1;
    let best = -1, bestScore = Infinity;
    for (let qi = 0; qi < q.length; qi++) {
      const i = q[qi], cx = i % W, cy = (i / W) | 0;
      const depth = (() => { let d = 0, j = i; while (prev[j] >= 0 && d < 200) { j = prev[j]; d++; } return d; })();
      if (i !== q[0] && wd.cells[i] === CELL.OPEN) {
        let score = visits[i] * 6 + depth + rng.next() * 0.5;
        if (wantExit()) score = exitAdj(wd, cx, cy) ? -1000 + depth : Infinity;
        if (score < bestScore) { bestScore = score; best = i; }
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy, ni = ny * W + nx;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[ni]) continue;
        if (!passable(wd, nx, ny, p.keys)) continue;
        seen[ni] = 1; prev[ni] = i; q.push(ni);
      }
    }
    const out = [];
    for (let j = best; j >= 0 && j !== q[0]; j = prev[j]) out.push(j);
    return out.reverse().map((i) => ({ cx: i % W, cy: (i / W) | 0 }));
  }
  function visibleEnemy(p, wd) {
    let best = null, bd = Infinity;
    for (const e of g.enemies ?? []) {
      if (!e || e.state === 'die' || e.state === 'dead' || (e.hp ?? 1) <= 0) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d > 16 || d >= bd) continue;
      try { if (wd.hasLOS && !wd.hasLOS(p.x, p.y, e.x, e.y)) continue; } catch { continue; }
      best = e; bd = d;
    }
    return best ? { e: best, d: bd } : null;
  }
  const api = {
    target: null,
    tick(dt) {
      const cmd = ZERO_CMD();
      const p = g.player, wd = g.world;
      if (!p || !wd || g.status !== 'playing' || p.dead) return cmd;
      if (wd !== worldRef) { worldRef = wd; visits = new Uint16Array(wd.w * wd.h); path = []; replanT = 0; }
      const ci = Math.floor(p.y) * wd.w + Math.floor(p.x);
      if (visits[ci] < 65000 && (g.tick ?? 0) % 30 === 0) visits[ci]++;
      useT -= dt;
      // combat: face and shoot visible enemies
      const tgt = visibleEnemy(p, wd);
      api.target = tgt?.e ?? null;
      if (tgt) {
        const want = Math.atan2(tgt.e.y - p.y, tgt.e.x - p.x), d = angDiff(want, p.angle);
        cmd.turn = Math.max(-0.09, Math.min(0.09, d));
        cmd.fire = Math.abs(d) < 0.12;
        const melee = (p.weapon ?? 1) === 0;
        if (melee) cmd.forward = tgt.d > 0.9 ? 1 : 0;
        else if (tgt.d < 2) cmd.forward = -0.6;
        // best owned weapon with ammo (not the laser unless out of others)
        const am = p.ammo ?? {}, own = p.owned ?? [];
        let wpn = 0;
        if (own[1] && am.hair > 0) wpn = 1;
        if (own[2] && am.hair > 0) wpn = 2;
        if (own[3] && am.yarn > 0 && tgt.d > 3) wpn = 3;
        if (own[4] && am.cell > 0 && wpn < 1) wpn = 4;
        if (wpn !== p.weapon && (g.tick ?? 0) % 20 === 0) cmd.weapon = wpn;
        return cmd;
      }
      // exploration
      replanT -= dt;
      if (replanT <= 0 || path.length === 0) { path = plan(wd, p); replanT = 1.0; }
      while (path.length && Math.floor(p.x) === path[0].cx && Math.floor(p.y) === path[0].cy) path.shift();
      const next = path[0];
      const ex = !next && wantExit() ? exitCell(wd, p) : null;
      if (ex) {   // standing beside the exit switch: face it and use it
        const d = angDiff(Math.atan2(ex.cy + 0.5 - p.y, ex.cx + 0.5 - p.x), p.angle);
        cmd.turn = Math.max(-0.1, Math.min(0.1, d));
        if (Math.abs(d) < 0.15 && useT <= 0) { cmd.use = true; useT = 0.6; }
      }
      if (next) {
        const want = Math.atan2(next.cy + 0.5 - p.y, next.cx + 0.5 - p.x), d = angDiff(want, p.angle);
        cmd.turn = Math.max(-0.08, Math.min(0.08, d));
        cmd.forward = Math.abs(d) < 0.6 ? 1 : 0.15;
        cmd.run = Math.abs(d) < 0.3;
        const ni = next.cy * wd.w + next.cx;
        if (wd.cells[ni] === CELL.DOOR && useT <= 0 && Math.abs(d) < 0.5) {
          const dr = wd.doors?.[wd.doorAt?.[ni]];
          if (!dr || dr.open < 0.8) { cmd.use = true; useT = 0.5; }
        }
      }
      // exit switch next to us and facing it → use it
      const fx2 = Math.floor(p.x + Math.cos(p.angle) * 0.8), fy2 = Math.floor(p.y + Math.sin(p.angle) * 0.8);
      if (fx2 >= 0 && fy2 >= 0 && fx2 < wd.w && fy2 < wd.h && wd.cells[fy2 * wd.w + fx2] === CELL.EXIT && useT <= 0) { cmd.use = true; useT = 0.6; }
      // stuck detection
      const moved = Math.hypot(p.x - lastPos.x, p.y - lastPos.y);
      lastPos = { x: p.x, y: p.y };
      stuckT = moved < 0.004 && cmd.forward > 0 ? stuckT + dt : Math.max(0, stuckT - dt);
      if (stuckT > 0.6) { wiggle = 0.5; wiggleDir = rng.chance(0.5) ? 1 : -1; stuckT = 0; path = []; if (useT <= 0) { cmd.use = true; useT = 0.5; } }
      if (wiggle > 0) { wiggle -= dt; cmd.strafe = wiggleDir; cmd.forward = -0.3; cmd.turn = 0.04 * wiggleDir; }
      return cmd;
    },
  };
  return api;
}
function disposeBot() { bot = null; }

// ───────────────────────────── frame loop ─────────────────────────────
let lastT = 0, acc = 0, timeT = 0;
const scene = { sprites: [], lights: [], beams: [] };

function nextCmd() {
  let c;
  try { c = input.poll(); } catch (e) { report('input.poll', e); c = ZERO_CMD(); }
  if (bot) { try { c = bot.tick(DT); } catch (e) { report('bot', e); bot = null; } }
  if (cmdOverride) { c = { ...ZERO_CMD(), ...c, ...cmdOverride }; cmdOverride = null; }
  return c;
}

function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = Math.min(0.25, Math.max(0, (now - lastT) / 1000));
  lastT = now;
  timeT += rawDt;
  if (rawDt > 0) { fpsMeter.ema += (rawDt - fpsMeter.ema) * 0.05; G.fps = Math.round(10 / fpsMeter.ema) / 10; }
  let mi;
  try { mi = input.menu(); } catch (e) { report('input.menu', e); mi = ZERO_MENU(); }

  try { update(rawDt, mi); } catch (e) { report(`update(${state})`, e); }
  try { draw(rawDt); } catch (e) { report(`draw(${state})`, e); }
  autoQuality(rawDt);
}

function update(dt, mi) {
  switch (state) {
    case 'title': case 'menu': {
      if (attract) {
        try { attract.update(DT, ZERO_CMD()); } catch (e) { report('attract.update', e); attract = null; }
      }
      if (state === 'title' && Object.values(mi).some(Boolean)) setState('menu');
      const act = menus.update(dt, mi);
      if (act) handleAction(act);
      break;
    }
    case 'playing': {
      if (mi.pause) { paused = true; setState('paused'); try { menus.open('pause'); } catch (e) { report('menus.open', e); } input.clear?.(); break; }
      if (mi.map) automapOn = !automapOn;
      acc += dt;
      let steps = 0;
      while (acc >= DT && steps < MAX_STEPS) {
        game.update(DT, nextCmd());
        acc -= DT; steps++;
        if (game.status !== 'playing') break;
      }
      if (steps === MAX_STEPS) acc = Math.min(acc, DT);
      checkStatus();
      break;
    }
    case 'paused': {
      const act = menus.update(dt, mi);
      if (act) handleAction(act);
      else if (mi.pause && !menus.active) resume();
      break;
    }
    case 'levelIntro': case 'intermission': case 'death': case 'gameOver': case 'victory': {
      if (state === 'death' && game) { try { game.update(DT, ZERO_CMD()); } catch (e) { report('game.update(death)', e); } }
      let r = null;
      try { r = screens.update(dt, mi); } catch (e) { report('screens.update', e); r = 'done'; }
      if (P.autostart && state === 'levelIntro') r = 'done';
      if (r === 'done') onScreenDone();
      break;
    }
  }
  // post-fx decay
  fx.hurt = Math.max(0, fx.hurt - dt * 1.4);
  fx.flash[3] = Math.max(0, fx.flash[3] - dt * 2.5);
  const dead = game?.player?.dead || state === 'death';
  fx.wobble = dead ? Math.min(1, fx.wobble + dt) : Math.max(0, fx.wobble - dt * 2);
}

function resume() {
  paused = false;
  try { if (menus.active) menus.open?.(null); } catch { /* ignore */ }
  setState('playing');
  acc = 0;
}

function handleAction(act) {
  switch (act.type) {
    case 'new': startGame(0, act.skill ?? 1, { intro: true }); break;
    case 'continue': {
      const lvl = Math.max(0, Math.min(levels.length - 1, (progress?.unlocked ?? 1) - 1));
      startGame(lvl, progress?.skill ?? settings.skill ?? 1, { intro: true });
      break;
    }
    case 'resume': resume(); break;
    case 'quit': enterTitle(); break;
    case 'option': setOption(act.key, act.value); break;
    case 'level': startGame(act.level ?? 0, act.skill ?? settings.skill ?? 1, { intro: true }); break;   // tolerated extra
    default: break;
  }
}

function setOption(key, value) {
  if (typeof key !== 'string') return;
  const parts = key.split('.');
  let o = settings;
  for (let i = 0; i < parts.length - 1; i++) o = (o[parts[i]] ??= {});
  o[parts[parts.length - 1]] = value;
  try { M.settings.saveSettings(settings); } catch (e) { report('saveSettings', e); }
  if (key.startsWith('volume')) applyVolume();
  else if (key === 'sensitivity') { try { input.sensitivity = value; } catch { /* ignore */ } }
  else if (key === 'crt') applyRenderOptions();
  else if (key === 'quality') {
    autoQ.enabled = value === 'auto';
    const q = autoQ.enabled ? QUALITIES[autoQ.idx] ?? 'medium' : value;
    if (QUALITIES.includes(q)) { autoQ.idx = QUALITIES.indexOf(q); setQuality(q); }
  }
}

function setQuality(q) {
  G.quality = q;
  try { renderer?.setQuality?.(q); } catch (e) { report('renderer.setQuality', e); }
}

function autoQuality(dt) {
  if (!autoQ.enabled || !renderer || state === 'boot') return;
  autoQ.cooldown -= dt;
  const ft = fpsMeter.ema;
  if (ft > 1 / 45) { autoQ.slowT += dt; autoQ.fastT = 0; } else if (ft < 1 / 58) { autoQ.fastT += dt; autoQ.slowT = 0; } else { autoQ.slowT = autoQ.fastT = 0; }
  if (autoQ.cooldown > 0) return;
  if (autoQ.slowT > 1.5 && autoQ.idx > 0) { autoQ.idx--; setQuality(QUALITIES[autoQ.idx]); autoQ.cooldown = 3; autoQ.slowT = 0; }
  else if (autoQ.fastT > 6 && autoQ.idx < 2) { autoQ.idx++; setQuality(QUALITIES[autoQ.idx]); autoQ.cooldown = 8; autoQ.fastT = 0; }
}

function buildScene(g, attractCam) {
  scene.sprites = []; scene.lights = []; scene.beams = [];
  g.buildScene(scene);
  if (scene.cam) {
    scene.cam.fov = settings.fov ?? scene.cam.fov ?? VIEW.FOV;
    if (attractCam) {
      const a = g._attract, t = timeT;
      scene.cam.x = a.x + Math.cos(t * 0.13) * 0.25; scene.cam.y = a.y + Math.sin(t * 0.13) * 0.25;
      scene.cam.angle = a.a + t * 0.22; scene.cam.h = VIEW.EYE + Math.sin(t * 0.7) * 0.03; scene.cam.roll = 0;
    }
  }
  return scene;
}

function render3D(g, attractCam) {
  const sc = buildScene(g, attractCam);
  if (renderer) {
    try {
      renderer.setOption?.('flash', fx.flash);
      renderer.setOption?.('hurt', fx.hurt);
      renderer.setOption?.('wobble', fx.wobble);
      renderer.render(sc);
    } catch (e) { report('renderer.render', e); renderer = null; softView = createSoftView(atlas); glCanvas.style.visibility = 'hidden'; }
  } else if (softView) {
    softView.render(sc);
    ctx.drawImage(softView.canvas, 0, 0, VIEW.W, VIEW.H);
  }
  if (!attractCam) {
    const p = g.player;
    if (p) { try { audio.setListener(p.x, p.y, p.angle); } catch (e) { report('audio.setListener', e); } }
  }
  return sc;
}

function draw(dt) {
  ctx.clearRect(0, 0, VIEW.W, VIEW.H);
  ctx.imageSmoothingEnabled = false;
  const t = timeT;
  switch (state) {
    case 'boot': drawBoot(); return;
    case 'title': case 'menu':
      if (attract) render3D(attract, true);
      else { ctx.fillStyle = '#100c14'; ctx.fillRect(0, 0, VIEW.W, VIEW.H); }
      menus.draw(ctx, t);
      break;
    default: {
      if (!game) break;
      render3D(game, false);
      if (state === 'playing' || state === 'paused' || state === 'death') {
        try { hud.draw(ctx, game, dt); } catch (e) { report('hud.draw', e); hud = fallbackHud(); }
        if (automapOn && state === 'playing') { try { M.automap?.drawAutomap(ctx, game); } catch (e) { report('automap', e); automapOn = false; } }
        if (!renderer) drawSoftFx();
        if (!G.ready && state === 'playing') G.ready = true;
      }
      if (state === 'paused') menus.draw(ctx, t);
      if (state !== 'playing' && state !== 'paused') { try { screens.draw(ctx, t); } catch (e) { report('screens.draw', e); } }
    }
  }
  if (settings?.showFps || P.demo) text(`${Math.round(G.fps)} fps ${G.quality ?? ''}${P.demo ? ' DEMO' : ''}`, VIEW.W - 4, 4, { align: 'right', color: '#9f9', scale: 1 });
}

function drawSoftFx() {
  if (fx.flash[3] > 0) { const [r, g, b, a] = fx.flash; ctx.fillStyle = `rgba(${r * 255 | 0},${g * 255 | 0},${b * 255 | 0},${a * 0.6})`; ctx.fillRect(0, 0, VIEW.W, VIEW.H); }
  if (fx.hurt > 0) { ctx.fillStyle = `rgba(200,0,0,${fx.hurt * 0.35})`; ctx.fillRect(0, 0, VIEW.W, VIEW.H); }
}

boot().catch((e) => {
  report('boot', e);
  setState('error');
  try { ctx.fillStyle = '#200'; ctx.fillRect(0, 0, VIEW.W, VIEW.H); text('BOOT FAILED — see overlay', VIEW.W / 2, 130, { align: 'center', color: '#f88', scale: 2 }); } catch { /* nothing left */ }
});
