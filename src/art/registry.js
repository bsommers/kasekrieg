// Art registry — assembles every art module into texture atlases (ARCHITECTURE §5.5).
// Works in Node and the browser (no DOM, no Node built-ins). Never throws: anything missing or invalid becomes a
// generated placeholder and is listed in `atlas.missing`, so the game always boots.
import { ART_MODULES, artManifest, TILE } from '../core/defs.js';
import { PixBuf } from './pixbuf.js';

const LAYER_BYTES = TILE * TILE * 4;

function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}

/** Placeholder frame: hashed hue + checker. Sprites keep a transparent margin so they read as "a box". */
export function makePlaceholder(name, kind = 'tile', w = TILE, h = TILE, frame = 0) {
  const seed = hashStr(name);
  const hue = (seed % 360) / 360;
  const col = (l) => {
    const f = (n) => { const k = (n + hue * 12) % 12; return l * (0.5 + 0.5 * Math.max(-1, Math.min(k - 3, 9 - k, 1))); };
    return [f(0), f(8), f(4)].map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255));
  };
  const a = col(0.95), b = col(0.45);
  const p = new PixBuf(w, h);
  const cell = w >= 32 ? 8 : 4;
  const m = kind === 'sprite' ? Math.max(2, w >> 3) : 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (m && (x < m || y < m * 2 || x >= w - m || y >= h)) continue;   // transparent margin (sprites)
    const c = ((x / cell | 0) + (y / cell | 0) + frame) & 1 ? a : b;
    p.rgba[i] = c[0]; p.rgba[i + 1] = c[1]; p.rgba[i + 2] = c[2]; p.rgba[i + 3] = 255;
    p.mat[i + 3] = 255;
  }
  return p;
}

/** Layer 0 placeholder: loud magenta/black checker, so an unknown name is unmistakable. */
function layerZero() {
  const p = new PixBuf(TILE, TILE);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const i = (y * TILE + x) * 4, on = ((x >> 3) + (y >> 3)) & 1;
    p.rgba[i] = on ? 255 : 20; p.rgba[i + 1] = on ? 0 : 0; p.rgba[i + 2] = on ? 255 : 20; p.rgba[i + 3] = 255;
    p.mat[i + 3] = 255;
  }
  return p;
}

const isBuf = (f) => !!f && typeof f.w === 'number' && typeof f.h === 'number' && f.rgba && f.mat
  && f.rgba.length === f.w * f.h * 4 && f.mat.length === f.w * f.h * 4;

/** Validate one built value against a manifest entry. Returns PixBuf[] on success or a string reason. */
function validate(a, v) {
  if (v === undefined || v === null) return 'not produced';
  const fr = Array.isArray(v) ? v : [v];
  if (fr.length !== a.frames) return `frames: have ${fr.length}, want ${a.frames}`;
  for (const f of fr) {
    if (!isBuf(f)) return 'not a PixBuf';
    if (f.w !== a.w || f.h !== a.h) return `size: have ${f.w}x${f.h}, want ${a.w}x${a.h}`;
  }
  return fr;
}

/**
 * Build the atlas.
 * @param {(frac:number, label:string)=>void} [onProgress]
 * @param {{modules?:string[], importer?:(mod:string)=>Promise<any>, manifest?:object[]}} [opts] test/tool hooks
 */
export async function buildAtlas(onProgress, opts = {}) {
  const modules = opts.modules ?? ART_MODULES;
  const manifest = opts.manifest ?? artManifest();
  const importer = opts.importer ?? ((m) => import(`./${m}.js`));
  const progress = (f, l) => { try { onProgress && onProgress(f, l); } catch { /* UI callback must not break the build */ } };

  // 1. import + build each module (fault isolated)
  const built = {}, report = {};
  for (let mi = 0; mi < modules.length; mi++) {
    const mod = modules[mi];
    const r = report[mod] = { module: mod, status: 'ok', error: null, ms: 0, total: 0, ok: 0, bad: [] };
    progress(mi / modules.length, mod);
    const t0 = (globalThis.performance ?? Date).now();
    try {
      const ns = await importer(mod);
      if (!ns || typeof ns.build !== 'function') throw new Error('module has no build() export');
      const out = await ns.build();
      if (!out || typeof out !== 'object') throw new Error('build() did not return an object');
      built[mod] = out;
    } catch (e) {
      built[mod] = null;
      r.status = 'unavailable';
      r.error = String(e && e.message ? e.message : e);
    }
    r.ms = (globalThis.performance ?? Date).now() - t0;
  }

  // 2. assemble in manifest order
  const entries = manifest;
  const missing = [];
  const resolved = [];   // { a, frames: PixBuf[], placeholder: bool }
  for (const a of entries) {
    const r = report[a.module] ?? (report[a.module] = { module: a.module, status: 'unavailable', error: 'module not in registry list', ms: 0, total: 0, ok: 0, bad: [] });
    r.total++;
    const out = built[a.module];
    let fr;
    if (!out) fr = r.error ?? 'module unavailable';
    else fr = validate(a, out[a.name]);
    if (typeof fr === 'string') {
      missing.push(a.name);
      r.bad.push(`${a.name} (${fr})`);
      if (r.status === 'ok') r.status = 'partial';
      resolved.push({ a, frames: Array.from({ length: a.frames }, (_, i) => makePlaceholder(a.name, a.kind, a.w, a.h, i)), placeholder: true });
    } else {
      r.ok++;
      resolved.push({ a, frames: fr, placeholder: false });
    }
  }
  for (const r of Object.values(report)) if (r.status === 'partial' && r.ok === 0) r.status = 'unavailable';
  progress(0.9, 'atlas');

  // 3. pack
  const tileEntries = resolved.filter((x) => x.a.kind === 'tile');
  const spriteEntries = resolved.filter((x) => x.a.kind === 'sprite');
  const count = (list) => 1 + list.reduce((s, x) => s + x.frames.length, 0);

  const pack = (list) => {
    const n = count(list);
    const rgba = new Uint8Array(n * LAYER_BYTES), mat = new Uint8Array(n * LAYER_BYTES);
    const put = (layer, f) => { rgba.set(f.rgba, layer * LAYER_BYTES); mat.set(f.mat, layer * LAYER_BYTES); };
    put(0, layerZero());
    return { n, rgba, mat, put };
  };

  const tp = pack(tileEntries);
  const tiles = { count: tp.n, rgba: tp.rgba, mat: tp.mat, index: new Map(), anim: new Uint8Array(tp.n).fill(1) };
  let layer = 1;
  for (const x of tileEntries) {
    tiles.index.set(x.a.name, layer);
    tiles.anim[layer] = x.frames.length;
    for (const f of x.frames) tp.put(layer++, f);
  }

  const sp = pack(spriteEntries);
  const sprites = { count: sp.n, rgba: sp.rgba, mat: sp.mat, index: new Map(), frames: new Map() };
  layer = 1;
  for (const x of spriteEntries) {
    sprites.index.set(x.a.name, layer);
    sprites.frames.set(x.a.name, x.frames.length);
    for (const f of x.frames) sp.put(layer++, f);
  }

  const images = new Map();
  for (const x of resolved) if (x.a.kind === 'image') images.set(x.a.name, x.frames);

  const atlas = {
    tiles, sprites, images, missing,
    report: Object.values(report),
    tile(name) { return tiles.index.get(name) ?? 0; },
    sprite(name, frame = 0) {
      const first = sprites.index.get(name);
      if (first === undefined) return 0;
      const n = sprites.frames.get(name) || 1;
      const f = Number.isFinite(frame) ? Math.floor(frame) : 0;
      return first + Math.min(n - 1, Math.max(0, f));
    },
  };
  progress(1, 'done');
  return atlas;
}

export default buildAtlas;
