#!/usr/bin/env node
// Level validator + colour map preview (ARCHITECTURE §6).
//   node tools/validate-level.mjs src/levels/e1m1.js [more files...] [--no-png] [--scale N] [--quiet]
// Library use: import { validateLevel, renderPreview, loadLevelFile } from './tools/validate-level.mjs'
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { encodePNG } from './sheet.mjs';
import { WALLS, DOORS, FLATS, SKY_FLAT, THINGS, ITEMS, DECOR, ENEMIES, MUSIC, LIMITS } from '../src/core/defs.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const WALL_CH = new Map(WALLS.map(([ch, name]) => [ch, name]));
const DOOR_CH = new Map(DOORS.map(([ch, name, lock]) => [ch, { tex: name, lock }]));
const WALL_NAMES = new Set(WALLS.map((w) => w[1]));
const FLAT_NAMES = new Set([...FLATS.map((f) => f[0]), SKY_FLAT]);
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

/** Classify a tile-layer character → { kind:'open'|'wall'|'door'|'push'|'exit', tex?, lock? } or null if unknown. */
export function classifyTile(ch) {
  if (ch === '.') return { kind: 'open' };
  if (ch === '#' || ch === ' ') return { kind: 'wall', tex: null };
  if (DOOR_CH.has(ch)) { const d = DOOR_CH.get(ch); return { kind: 'door', tex: d.tex, lock: d.lock }; }
  if (WALL_CH.has(ch)) return ch === 'X' ? { kind: 'exit', tex: WALL_CH.get(ch) } : { kind: 'wall', tex: WALL_CH.get(ch) };
  const up = ch.toUpperCase();
  if (ch !== up && WALL_CH.has(up)) return { kind: 'push', tex: WALL_CH.get(up), exitSwitch: up === 'X' };
  return null;
}

/**
 * Validate a level definition. Never throws on bad data.
 * @returns {{ id, errors:string[], warnings:string[], info:string[], summary, cells, w, h }}
 */
export function validateLevel(def, label = '') {
  const errors = [], warnings = [], info = [];
  const id = def && typeof def.id === 'string' ? def.id : (label || '?');
  const err = (m) => errors.push(m);
  const warn = (m) => warnings.push(m);
  const result = { id, errors, warnings, info, summary: null, cells: null, w: 0, h: 0 };
  if (!def || typeof def !== 'object') { err('level definition is not an object'); return result; }

  // ---- header fields
  if (typeof def.id !== 'string' || !def.id) err('missing string `id`');
  if (typeof def.name !== 'string' || !def.name) err('missing string `name`');
  if (typeof def.intro !== 'string') warn('missing `intro` flavour text');
  if (typeof def.par !== 'number' || !(def.par > 0)) warn('`par` should be a positive number of seconds');
  if (!MUSIC.includes(def.music)) err(`unknown music ${JSON.stringify(def.music)} (known: ${MUSIC.join(', ')})`);
  if (!WALL_NAMES.has(def.wall)) err(`unknown default wall texture ${JSON.stringify(def.wall)} (field \`wall\`)`);
  if (!FLAT_NAMES.has(def.floor) || def.floor === SKY_FLAT) err(`unknown floor texture ${JSON.stringify(def.floor)} (field \`floor\`)`);
  if (!FLAT_NAMES.has(def.ceil)) err(`unknown ceiling texture ${JSON.stringify(def.ceil)} (field \`ceil\`)`);
  const zones = def.zones && typeof def.zones === 'object' ? def.zones : {};
  for (const [k, z] of Object.entries(zones)) {
    if (k.length !== 1) err(`zone key ${JSON.stringify(k)} must be a single character`);
    if (k === '.') err(`zone key '.' is reserved for the default zone`);
    if (z.floor !== undefined && (!FLAT_NAMES.has(z.floor) || z.floor === SKY_FLAT)) err(`zone '${k}': unknown floor texture ${JSON.stringify(z.floor)}`);
    if (z.ceil !== undefined && !FLAT_NAMES.has(z.ceil)) err(`zone '${k}': unknown ceiling texture ${JSON.stringify(z.ceil)}`);
  }
  const isVec3 = (a) => Array.isArray(a) && a.length === 3 && a.every((n) => typeof n === 'number');
  if (!isVec3(def.ambient)) warn('`ambient` should be [r,g,b]');
  if (!def.fog || !isVec3(def.fog.color) || typeof def.fog.density !== 'number') warn('`fog` should be { color:[r,g,b], density }');
  const usesSky = def.ceil === SKY_FLAT || Object.values(zones).some((z) => z.ceil === SKY_FLAT);
  if (usesSky && !(def.sky && isVec3(def.sky.moonDir) && isVec3(def.sky.moonColor))) warn('sky ceiling used but `sky.moonDir` / `sky.moonColor` missing');

  // ---- layer shape
  const map = def.map, things = def.things, zmap = def.zonesMap;
  const rowsOk = (a) => Array.isArray(a) && a.length > 0 && a.every((r) => typeof r === 'string');
  if (!rowsOk(map)) { err('`map` must be a non-empty array of strings'); return result; }
  const h = map.length, w = map[0].length;
  result.w = w; result.h = h;
  const showRow = (layer, y) => `      row ${y}: ${JSON.stringify(layer[y])}`;
  let shapeOk = true;
  if (w > LIMITS.MAP || h > LIMITS.MAP) err(`map is ${w}x${h}; maximum is ${LIMITS.MAP}x${LIMITS.MAP}`);
  for (let y = 0; y < h; y++) if (map[y].length !== w) { err(`map row ${y} has length ${map[y].length}, expected ${w}\n${showRow(map, y)}`); shapeOk = false; }
  if (!rowsOk(things)) { err('`things` must be a non-empty array of strings'); shapeOk = false; }
  else {
    if (things.length !== h) { err(`things has ${things.length} rows, map has ${h}`); shapeOk = false; }
    for (let y = 0; y < things.length; y++) if (things[y].length !== w) { err(`things row ${y} has length ${things[y].length}, expected ${w}\n${showRow(things, y)}`); shapeOk = false; }
  }
  if (zmap !== undefined) {
    if (!rowsOk(zmap)) { err('`zonesMap` must be an array of strings when present'); shapeOk = false; }
    else {
      if (zmap.length !== h) { err(`zonesMap has ${zmap.length} rows, map has ${h}`); shapeOk = false; }
      for (let y = 0; y < zmap.length; y++) if (zmap[y].length !== w) { err(`zonesMap row ${y} has length ${zmap[y].length}, expected ${w}\n${showRow(zmap, y)}`); shapeOk = false; }
    }
  }
  if (!shapeOk) return result;

  // ---- tile layer
  const cells = new Array(w * h);
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? { kind: 'wall' } : cells[y * w + x]);
  const exits = [];
  let pushCount = 0;
  const wallCount = { n: 0 };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = map[y][x];
    const c = classifyTile(ch);
    if (!c) { err(`map (${x},${y}) [row ${y}, col ${x}]: unknown tile character ${JSON.stringify(ch)}\n${showRow(map, y)}`); cells[y * w + x] = { kind: 'wall', bad: true }; continue; }
    c.ch = ch;
    cells[y * w + x] = c;
    if (c.kind === 'exit') exits.push({ x, y });
    if (c.kind === 'push') {
      pushCount++;
      if (c.exitSwitch) err(`map (${x},${y}): 'x' makes the exit switch a pushwall; use 'X' for the exit`);
    }
    if (c.kind === 'wall') wallCount.n++;
  }
  result.cells = cells;
  const solid = (c) => c.kind === 'wall' || c.kind === 'push' || c.kind === 'exit';

  // border
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x !== 0 && y !== 0 && x !== w - 1 && y !== h - 1) continue;
    const c = cells[y * w + x];
    if (c.kind === 'open' || c.kind === 'door') err(`border cell (${x},${y}) is ${c.kind === 'open' ? 'open' : 'a door'}; the outer border must be solid\n${showRow(map, y)}`);
    else if (c.kind === 'push') err(`border cell (${x},${y}) is a pushwall; the outer border must be solid\n${showRow(map, y)}`);
  }

  // door geometry
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = cells[y * w + x];
    if (c.kind !== 'door') continue;
    const n = at(x, y - 1), s = at(x, y + 1), e = at(x + 1, y), wv = at(x - 1, y);
    const ns = solid(n) && solid(s) && e.kind === 'open' && wv.kind === 'open';
    const ew = solid(e) && solid(wv) && n.kind === 'open' && s.kind === 'open';
    if (!ns && !ew) {
      err(`door '${c.ch}' at (${x},${y}): needs walls on two opposite sides and open cells on the other two (N=${n.kind} S=${s.kind} E=${e.kind} W=${wv.kind})\n${showRow(map, y)}`);
    }
  }

  // pushwall clearance
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = cells[y * w + x];
    if (c.kind !== 'push') continue;
    const ok = DIRS.some(([dx, dy]) => at(x - dx, y - dy).kind === 'open' && at(x + dx, y + dy).kind === 'open' && at(x + 2 * dx, y + 2 * dy).kind === 'open');
    if (!ok) err(`pushwall '${c.ch}' at (${x},${y}): needs an open cell in front and 2 open cells directly behind it (slides 2 cells)\n${showRow(map, y)}`);
  }

  // ---- zones map
  if (zmap) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const z = zmap[y][x];
    if (z !== '.' && !(z in zones)) err(`zonesMap (${x},${y}) [row ${y}, col ${x}]: unknown zone ${JSON.stringify(z)}\n${showRow(zmap, y)}`);
  }

  // ---- things
  const starts = [];
  const enemies = {}, itemsCount = {}, decorCount = {};
  let enemyTotal = 0, itemTotal = 0, treasure = 0, lights = 0, bosses = 0;
  const placed = []; // { x, y, kind, ch, type? }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = things[y][x];
    if (ch === '.' || ch === ' ') continue;
    const t = THINGS[ch];
    if (!t) { err(`things (${x},${y}) [row ${y}, col ${x}]: unknown thing character ${JSON.stringify(ch)}\n${showRow(things, y)}`); continue; }
    const c = cells[y * w + x];
    if (c.kind !== 'open') err(`thing '${ch}' (${t.kind}${t.type ? ' ' + t.type : t.id ? ' ' + t.id : ''}) at (${x},${y}) is on a ${c.kind} cell; things must sit on open cells\n${showRow(things, y)}`);
    placed.push({ x, y, kind: t.kind, ch, type: t.type, id: t.id });
    if (t.kind === 'start') starts.push({ x, y, ch });
    else if (t.kind === 'enemy') { enemies[t.type] = (enemies[t.type] || 0) + 1; enemyTotal++; if (t.type === 'boss') bosses++; }
    else if (t.kind === 'item') { itemsCount[t.id] = (itemsCount[t.id] || 0) + 1; itemTotal++; if (ITEMS[t.id].treasure) treasure++; }
    else if (t.kind === 'decor') { decorCount[t.id] = (decorCount[t.id] || 0) + 1; if (DECOR[t.id].light) lights++; }
    else if (t.kind === 'light') lights++;
  }
  if (starts.length === 0) err('no player start found (use one of ^ > v < in `things`)');
  if (starts.length > 1) err(`${starts.length} player starts found, exactly one allowed: ${starts.map((s) => `(${s.x},${s.y})`).join(' ')}`);
  if (exits.length === 0) err("no exit switch: place at least one 'X' wall in the tile layer");
  if (def.id === 'e1m6' && bosses === 0) warn('final level has no boss (Z)');
  if (bosses > 1) warn(`${bosses} bosses placed`);

  // ---- reachability (keys honoured, pushwalls only in secret mode)
  const start = starts[0];
  let reachCrit = null, reachSecret = null, exitCrit = false, exitSecret = false;
  if (start && at(start.x, start.y).kind === 'open') {
    const flood = (allowPush) => {
      const keys = new Set();
      const seen = new Uint8Array(w * h);
      const keyAt = new Map();
      for (const p of placed) if (p.kind === 'item' && ITEMS[p.id].key) keyAt.set(p.y * w + p.x, ITEMS[p.id].key);
      let changed = true;
      while (changed) {
        changed = false;
        seen.fill(0);
        const q = [[start.x, start.y]];
        seen[start.y * w + start.x] = 1;
        while (q.length) {
          const [cx, cy] = q.pop();
          const k = keyAt.get(cy * w + cx);
          if (k && !keys.has(k)) { keys.add(k); changed = true; }
          for (const [dx, dy] of DIRS) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[ny * w + nx]) continue;
            const c = cells[ny * w + nx];
            let pass = c.kind === 'open' || (c.kind === 'door' && (!c.lock || keys.has(c.lock))) || (allowPush && c.kind === 'push');
            if (!pass) continue;
            seen[ny * w + nx] = 1;
            q.push([nx, ny]);
          }
        }
      }
      return { seen: Uint8Array.from(seen), keys };
    };
    reachCrit = flood(false);
    reachSecret = flood(true);
    const exitReach = (r) => exits.some(({ x, y }) => DIRS.some(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < w && ny < h && r.seen[ny * w + nx]; }));
    exitCrit = exitReach(reachCrit);
    exitSecret = exitReach(reachSecret);
    if (exits.length) {
      if (!exitCrit && exitSecret) err('exit is only reachable through a secret pushwall; the critical path must not need one (it also fails if a required key sits behind a pushwall)');
      else if (!exitCrit) err('exit switch is unreachable from the start (check key order: a lock may need a key that lies behind it, or the exit is walled off)');
    }
    for (const p of placed) {
      if (p.kind !== 'item' && p.kind !== 'enemy') continue;
      const i = p.y * w + p.x;
      const what = p.kind === 'item' ? `item ${p.id}` : `enemy ${p.type}`;
      if (!reachSecret.seen[i]) err(`${what} '${p.ch}' at (${p.x},${p.y}) is unreachable from the start (even through secrets / with all keys)\n${showRow(things, p.y)}`);
      else if (!reachCrit.seen[i] && p.kind === 'item') info.push(`${what} at (${p.x},${p.y}) is only reachable through a secret`);
    }
    for (const [name, lock] of [['gold', 'gold'], ['silver', 'silver']]) {
      const locks = cells.filter((c) => c.kind === 'door' && c.lock === lock).length;
      const keyItems = placed.filter((p) => p.kind === 'item' && ITEMS[p.id].key === lock).length;
      if (locks && !keyItems) err(`${name} locked door(s) present but no ${name} key placed`);
      if (!locks && keyItems) warn(`${name} key placed but no ${name} door`);
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (cells[y * w + x].kind !== 'push') continue;
      if (!DIRS.some(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < w && ny < h && reachCrit.seen[ny * w + nx]; }))
        warn(`pushwall at (${x},${y}) is not adjacent to any cell reachable without secrets`);
    }
  } else if (start) err(`player start at (${start.x},${start.y}) is not on an open cell`);

  result.summary = {
    size: `${w}x${h}`, enemies: enemies, enemyTotal, items: itemsCount, itemTotal, treasure,
    secrets: pushCount, lights, doors: cells.filter((c) => c.kind === 'door').length, exits: exits.length,
    decor: decorCount, start, exitReachable: exitCrit, keys: reachCrit ? [...reachCrit.keys] : [],
  };
  result.placed = placed;
  result.reach = reachSecret;
  return result;
}

// ---------------------------------------------------------------- preview
const C = {
  floor: [34, 34, 42], wall: [126, 128, 140], exit: [60, 230, 90], woodDoor: [150, 100, 50], steelDoor: [110, 150, 190],
  gold: [255, 210, 40], silver: [215, 225, 240], push: [230, 60, 220], start: [40, 230, 240], enemy: [230, 40, 40],
  boss: [150, 0, 20], itemKey: [255, 255, 255], treasure: [255, 190, 20], health: [90, 240, 120], ammo: [255, 140, 30], weapon: [255, 90, 200],
  decor: [110, 80, 150], light: [255, 250, 160], unreach: [255, 0, 0],
};
const ZONE_TINT = [[0, 0, 0], [10, 6, -6], [-6, 6, 12], [12, -6, 6], [-4, 12, -2], [10, 10, 0], [0, 10, 10], [10, 0, 10]];

/** Render a colour map; returns { w, h, rgba } (pixel size = scale per cell). */
export function renderPreview(def, res, scale = 12) {
  const { w, h, cells } = res;
  const W = w * scale, H = h * scale;
  const rgba = new Uint8Array(W * H * 4);
  const fillRect = (px, py, pw, ph, col) => {
    for (let y = py; y < py + ph; y++) for (let x = px; x < px + pw; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const o = (y * W + x) * 4; rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 255;
    }
  };
  const zkeys = Object.keys(def.zones || {});
  const zmap = Array.isArray(def.zonesMap) ? def.zonesMap : null;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = cells[y * w + x];
    const px = x * scale, py = y * scale;
    let col;
    switch (c.kind) {
      case 'wall': col = c.bad ? C.unreach : C.wall; break;
      case 'exit': col = C.exit; break;
      case 'push': col = C.push; break;
      case 'door': col = c.lock === 'gold' ? C.gold : c.lock === 'silver' ? C.silver : c.ch === '=' ? C.steelDoor : C.woodDoor; break;
      default: {
        col = C.floor;
        const zi = zmap && zmap[y] ? zkeys.indexOf(zmap[y][x]) + 1 : 0;
        if (zi > 0) { const t = ZONE_TINT[zi % ZONE_TINT.length]; col = col.map((v, i) => Math.max(0, Math.min(255, v + t[i] * 2))); }
      }
    }
    fillRect(px, py, scale, scale, col);
    if (c.kind === 'door') { // door slab as a thin darker bar along its passage axis
      const vert = (x > 0 && cells[y * w + x - 1].kind !== 'open');
      const dark = col.map((v) => Math.round(v * 0.55));
      if (vert) fillRect(px + Math.floor(scale * 0.38), py, Math.max(2, Math.floor(scale * 0.24)), scale, dark);
      else fillRect(px, py + Math.floor(scale * 0.38), scale, Math.max(2, Math.floor(scale * 0.24)), dark);
    }
    if (c.kind === 'wall' || c.kind === 'exit' || c.kind === 'push') { // 1px lighter top-left edge for blocky readability
      const l = col.map((v) => Math.min(255, v + 25));
      fillRect(px, py, scale, 1, l); fillRect(px, py, 1, scale, l);
    }
  }
  const unreach = res.reach ? res.reach.seen : null;
  const inset = Math.max(1, Math.floor(scale / 4)), sz = scale - inset * 2;
  for (const p of res.placed || []) {
    const px = p.x * scale + inset, py = p.y * scale + inset;
    let col = null, big = false;
    if (p.kind === 'start') {
      col = C.start; big = true;
      fillRect(p.x * scale + 1, p.y * scale + 1, scale - 2, scale - 2, col);
      const t = THINGS[p.ch], dx = Math.round(Math.cos(t.angle)), dy = Math.round(Math.sin(t.angle));
      const cx = p.x * scale + Math.floor(scale / 2), cy = p.y * scale + Math.floor(scale / 2);
      for (let k = 0; k < Math.floor(scale / 2); k++) fillRect(cx + dx * k - 0, cy + dy * k - 0, 2, 2, [0, 40, 60]);
      continue;
    } else if (p.kind === 'enemy') { col = p.type === 'boss' ? C.boss : C.enemy; big = p.type === 'boss' || p.type === 'panzer'; }
    else if (p.kind === 'item') {
      const it = ITEMS[p.id];
      col = it.key ? C.itemKey : it.treasure ? C.treasure : it.weapon !== undefined ? C.weapon : it.ammo ? C.ammo : C.health;
      if (it.key) col = it.key === 'gold' ? [255, 240, 120] : [200, 230, 255];
    } else if (p.kind === 'decor') col = C.decor;
    else if (p.kind === 'light') col = C.light;
    if (!col) continue;
    if (p.kind === 'decor' || p.kind === 'light') { const s = Math.max(2, Math.floor(scale / 3)); fillRect(p.x * scale + Math.floor((scale - s) / 2), p.y * scale + Math.floor((scale - s) / 2), s, s, col); }
    else if (p.kind === 'enemy') { // enemies drawn as a filled disc-ish square with dark outline; patrol = hollow centre
      const o = big ? Math.max(1, inset - 1) : inset, s = scale - o * 2;
      fillRect(p.x * scale + o - 1, p.y * scale + o - 1, s + 2, s + 2, [20, 0, 0]);
      fillRect(p.x * scale + o, p.y * scale + o, s, s, col);
      if (THINGS[p.ch] && THINGS[p.ch].patrol) fillRect(p.x * scale + Math.floor(scale / 2) - 1, p.y * scale + Math.floor(scale / 2) - 1, 2, 2, [255, 255, 255]);
    } else { // item: diamond-ish small square with a bright pip
      fillRect(px, py, sz, sz, col);
      fillRect(px + Math.floor(sz / 2) - 1, py + Math.floor(sz / 2) - 1, 2, 2, [20, 20, 20]);
    }
    if (unreach && !unreach[p.y * w + p.x] && (p.kind === 'item' || p.kind === 'enemy')) fillRect(p.x * scale, p.y * scale, scale, 2, C.unreach);
  }
  return { w: W, h: H, rgba };
}

// ---------------------------------------------------------------- CLI
export async function loadLevelFile(file) {
  const abs = resolve(file);
  const mod = await import(pathToFileURL(abs).href + '?t=' + Date.now());
  return mod.default;
}

export function formatReport(res) {
  const lines = [];
  const s = res.summary;
  lines.push(`${res.errors.length ? 'FAIL' : 'OK  '} ${res.id}`);
  for (const e of res.errors) lines.push(`  ERROR   ${e}`);
  for (const e of res.warnings) lines.push(`  warn    ${e}`);
  for (const e of res.info) lines.push(`  info    ${e}`);
  if (s) {
    const list = (o) => Object.entries(o).map(([k, v]) => `${k}:${v}`).join(' ') || '-';
    lines.push(`  size ${s.size} | doors ${s.doors} | exits ${s.exits} | secrets ${s.secrets} | lights ${s.lights} | treasure ${s.treasure}`);
    lines.push(`  enemies (${s.enemyTotal}): ${list(s.enemies)}`);
    lines.push(`  items (${s.itemTotal}): ${list(s.items)}`);
    if (Object.keys(s.decor).length) lines.push(`  decor: ${list(s.decor)}`);
  }
  return lines.join('\n');
}

export async function validateFile(file, { png = true, scale = 16, quiet = false } = {}) {
  let def;
  try { def = await loadLevelFile(file); }
  catch (e) { return { id: file, errors: [`could not import ${file}: ${e && e.message ? e.message : e}`], warnings: [], info: [], summary: null }; }
  const res = validateLevel(def, file);
  if (png && res.cells) {
    const pv = renderPreview(def, res, scale);
    const dir = join(root, 'out/previews/levels');
    mkdirSync(dir, { recursive: true });
    const out = join(dir, `${res.id.replace(/[^\w.-]/g, '_')}.png`);
    writeFileSync(out, encodePNG(pv.w, pv.h, pv.rgba));
    res.preview = out;
  }
  return res;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const files = []; let png = true, scale = 16, quiet = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--no-png') png = false;
    else if (args[i] === '--quiet') quiet = true;
    else if (args[i] === '--scale') scale = Math.max(8, parseInt(args[++i], 10) || 16);
    else files.push(args[i]);
  }
  if (!files.length) { console.error('usage: validate-level.mjs <level.js...> [--no-png] [--scale N] [--quiet]'); process.exit(2); }
  let bad = 0;
  for (const f of files) {
    const res = await validateFile(f, { png, scale: Math.max(8, scale) });
    if (res.errors.length) bad++;
    if (!quiet || res.errors.length) console.log(formatReport(res));
    if (res.preview) console.log(`  preview ${res.preview}`);
  }
  process.exit(bad ? 1 : 0);
}
