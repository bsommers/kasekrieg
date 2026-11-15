// KÄSEKRIEG world: grid parsing, doors, pushwalls, exit switch, ray casting, collision, navigation.
// Contract: ARCHITECTURE.md §6–7. Pure sim code: no DOM, no Math.random, runs in Node.
//
// Geometry notes (the renderer must match these):
// - A door slab is a thin plane through the cell centre. `vertical` doors lie in the plane x = cx+0.5 (slab spans
//   north–south, you walk through east–west); horizontal doors lie in y = cy+0.5.
// - Sliding: with opening fraction `open` (0 closed … 1 open) the slab covers the along-axis fraction
//   [open, 1) of the cell, i.e. the gap opens at the north (vertical door) / west (horizontal door) end and the
//   slab retracts towards +y / +x into the jamb.
// - Moving pushwalls are axis-aligned unit boxes in `movers` ({x0,y0,x1,y1,tex}); their cells are OPEN in `cells`.

import { CELL, SKY, SKY_FLAT, LIMITS, wallByChar, doorByChar, flatHazard, DOOR_JAMB } from '../core/defs.js';

export const DOOR_SPEED = 1 / 0.7;     // open fraction per second (≈0.7 s to open fully)
export const DOOR_HOLD = 4;            // seconds a door stays open before trying to close
export const PUSH_SPEED = 1;           // pushwall cells per second
export const PUSH_DIST = 2;            // cells a pushwall slides
export const USE_RANGE = 1.5;          // reach of the use action (cell units)
export const UNREACHABLE = 65535;

const EPS = 1e-6;
const WALL_LETTERS = new Set(Object.keys(wallByChar));

function makeTileLookup(atlas) {
  const cache = new Map();
  return (name) => {
    if (cache.has(name)) return cache.get(name);
    let v = 0;
    try { if (atlas && typeof atlas.tile === 'function') v = atlas.tile(name) | 0; } catch { v = 0; }
    if (!(v >= 0 && v < 0xFFFF)) v = 0;
    cache.set(name, v);
    return v;
  };
}

export function createWorld(levelDef, atlas, bus) {
  const def = levelDef || {};
  const tile = makeTileLookup(atlas);
  const emit = (type, payload) => { try { bus && bus.emit && bus.emit(type, payload); } catch (e) { /* listener errors must not break the sim */ } };

  // ───────────── parse ─────────────
  const rows = Array.isArray(def.map) && def.map.length ? def.map.map(String) : ['###', '#.#', '###'];
  const h = Math.min(rows.length, LIMITS.MAP);
  const w = Math.min(Math.max(...rows.map((r) => r.length)), LIMITS.MAP);
  const N = w * h;
  const cells = new Uint8Array(N);
  const wallTex = new Uint16Array(N);
  const floorTex = new Uint16Array(N);
  const ceilTex = new Uint16Array(N);
  const hazard = new Float32Array(N);
  const blocker = new Uint8Array(N);
  const doorAt = new Int16Array(N).fill(-1);
  const doors = [];
  const movers = [];
  const pushTex = new Uint16Array(N);   // texture of resting pushwalls (also mirrored in wallTex)
  let secretsTotal = 0;

  const defWallName = def.wall && typeof def.wall === 'string' ? def.wall : 'wall.fort_stone';
  const defWall = tile(defWallName);
  const exitTex = tile(wallByChar.X);
  const flatTex = (name) => (name === SKY_FLAT ? SKY : tile(name));
  const zones = def.zones || {};
  const zrows = Array.isArray(def.zonesMap) ? def.zonesMap.map(String) : null;

  for (let cy = 0; cy < h; cy++) {
    const row = rows[cy];
    for (let cx = 0; cx < w; cx++) {
      const i = cy * w + cx;
      const ch = cx < row.length ? row[cx] : '#';
      // floor / ceiling
      const zk = zrows && zrows[cy] ? zrows[cy][cx] : '.';
      const z = zk && zk !== '.' && zk !== ' ' && zones[zk] ? zones[zk] : null;
      const fName = (z && z.floor) || def.floor || 'flat.floor_stone';
      const cName = (z && z.ceil) || def.ceil || 'flat.ceil_stone';
      floorTex[i] = flatTex(fName);
      ceilTex[i] = flatTex(cName);
      hazard[i] = flatHazard[fName] || 0;
      // tile layer
      if (ch === '.') { cells[i] = CELL.OPEN; continue; }
      if (doorByChar[ch]) {
        const d = doorByChar[ch];
        cells[i] = CELL.DOOR;
        wallTex[i] = tile(d.tex);
        doorAt[i] = doors.length;
        doors.push({ cx, cy, vertical: true, open: 0, lock: d.lock, state: 'closed', tex: wallTex[i], timer: 0 });
        continue;
      }
      if (ch === 'X') { cells[i] = CELL.EXIT; wallTex[i] = exitTex; continue; }
      if (WALL_LETTERS.has(ch)) { cells[i] = CELL.WALL; wallTex[i] = tile(wallByChar[ch]); continue; }
      const up = ch.toUpperCase();
      if (ch !== up && WALL_LETTERS.has(up) && up !== 'X') {
        cells[i] = CELL.PUSH; wallTex[i] = pushTex[i] = tile(wallByChar[up]); secretsTotal++;
        continue;
      }
      // '#', ' ', and anything unknown → default wall
      cells[i] = CELL.WALL; wallTex[i] = defWall;
    }
  }
  // force a solid outer border (validator enforces it; this guards against broken levels)
  for (let cx = 0; cx < w; cx++) for (const cy of [0, h - 1]) sealBorder(cx, cy);
  for (let cy = 0; cy < h; cy++) for (const cx of [0, w - 1]) sealBorder(cx, cy);
  function sealBorder(cx, cy) {
    const i = cy * w + cx;
    if (cells[i] === CELL.WALL || cells[i] === CELL.EXIT) return;
    if (cells[i] === CELL.PUSH) secretsTotal--;
    if (doorAt[i] >= 0) { doors[doorAt[i]].dead = true; doorAt[i] = -1; }
    cells[i] = CELL.WALL; wallTex[i] = defWall;
  }
  if (doors.some((d) => d.dead)) {   // compact door list after sealing
    const keep = doors.filter((d) => !d.dead);
    doors.length = 0; doorAt.fill(-1);
    for (const d of keep) { doorAt[d.cy * w + d.cx] = doors.length; doors.push(d); }
  }
  // door orientation: walls north & south → vertical slab (passage east–west)
  const solidForDoor = (cx, cy) => cx < 0 || cy < 0 || cx >= w || cy >= h ||
    cells[cy * w + cx] === CELL.WALL || cells[cy * w + cx] === CELL.PUSH || cells[cy * w + cx] === CELL.EXIT;
  for (const d of doors) {
    const ns = solidForDoor(d.cx, d.cy - 1) && solidForDoor(d.cx, d.cy + 1);
    const ew = solidForDoor(d.cx - 1, d.cy) && solidForDoor(d.cx + 1, d.cy);
    d.vertical = ns ? true : ew ? false : !(solidForDoor(d.cx, d.cy - 1) || solidForDoor(d.cx, d.cy + 1)) ? false : true;
    if (!ns && !ew) {
      // ambiguous: prefer the axis whose two neighbours are open as the passage
      const openEW = !solidForDoor(d.cx - 1, d.cy) && !solidForDoor(d.cx + 1, d.cy);
      d.vertical = openEW;
    }
  }

  // ───────────── basic queries ─────────────
  const idx = (cx, cy) => cy * w + cx;
  const inBounds = (cx, cy) => cx >= 0 && cy >= 0 && cx < w && cy < h;
  const staticSolid = (cx, cy) => {
    if (!inBounds(cx, cy)) return true;
    const c = cells[cy * w + cx];
    return c === CELL.WALL || c === CELL.PUSH || c === CELL.EXIT;
  };
  const moverOverlapsCell = (m, cx, cy) => m.x0 < cx + 1 - EPS && m.x1 > cx + EPS && m.y0 < cy + 1 - EPS && m.y1 > cy + EPS;
  function isSolid(cx, cy) {
    if (staticSolid(cx, cy)) return true;
    for (const m of movers) if (moverOverlapsCell(m, cx, cy)) return true;
    return false;
  }
  function blocksMove(cx, cy, forEnemyPath = false) {
    if (isSolid(cx, cy)) return true;
    const i = cy * w + cx;
    if (blocker[i]) return true;
    const di = doorAt[i];
    if (di >= 0) {
      const d = doors[di];
      if (forEnemyPath) return !!d.lock && d.open < 0.8;
      return d.open < 0.8;
    }
    return false;
  }
  function blocksSight(cx, cy) {
    if (isSolid(cx, cy)) return true;
    const di = doorAt[cy * w + cx];
    return di >= 0 && doors[di].open < 0.5;
  }
  function hazardAt(x, y) {
    const cx = Math.floor(x), cy = Math.floor(y);
    return inBounds(cx, cy) ? hazard[cy * w + cx] : 0;
  }

  // ───────────── rays ─────────────
  function rayBox(x, y, dx, dy, bx0, by0, bx1, by1) {
    // slab test; returns { t, side } of entry, or null. Origin inside → t = 0.
    let tmin = -Infinity, tmax = Infinity, side = 0;
    if (Math.abs(dx) < 1e-12) { if (x <= bx0 || x >= bx1) return null; }
    else {
      let t0 = (bx0 - x) / dx, t1 = (bx1 - x) / dx; if (t0 > t1) [t0, t1] = [t1, t0];
      if (t0 > tmin) { tmin = t0; side = 0; } tmax = Math.min(tmax, t1);
    }
    if (Math.abs(dy) < 1e-12) { if (y <= by0 || y >= by1) return null; }
    else {
      let t0 = (by0 - y) / dy, t1 = (by1 - y) / dy; if (t0 > t1) [t0, t1] = [t1, t0];
      if (t0 > tmin) { tmin = t0; side = 1; } tmax = Math.min(tmax, t1);
    }
    if (tmax < Math.max(tmin, 0)) return null;
    return { t: Math.max(tmin, 0), side };
  }

  function doorSlabT(d, x, y, dx, dy, t0, t1) {
    let t, along;
    if (d.vertical) {
      if (Math.abs(dx) < 1e-12) return -1;
      t = (d.cx + 0.5 - x) / dx; along = y + dy * t - d.cy;
    } else {
      if (Math.abs(dy) < 1e-12) return -1;
      t = (d.cy + 0.5 - y) / dy; along = x + dx * t - d.cx;
    }
    if (t < t0 - EPS || t > t1 + EPS || t < 0) return -1;
    if (along < -EPS || along > 1 + EPS) return -1;
    return along >= d.open ? t : -1;
  }

  function castRay(x, y, dx, dy, maxDist = 64) {
    const len = Math.hypot(dx, dy);
    const miss = (dist) => {
      const px = len ? x + (dx / len) * dist : x, py = len ? y + (dy / len) * dist : y;
      return { hit: false, dist, x: px, y: py, cx: Math.floor(px), cy: Math.floor(py), side: -1, door: null };
    };
    if (!(len > 0) || !(maxDist > 0)) return miss(0);
    dx /= len; dy /= len;
    const hitAt = (t, side, cx, cy, door) => ({ hit: true, dist: t, x: x + dx * t, y: y + dy * t, cx, cy, side, door });

    // moving pushwalls: exact boxes
    let limit = maxDist, mHit = null;
    for (const m of movers) {
      const r = rayBox(x, y, dx, dy, m.x0, m.y0, m.x1, m.y1);
      if (r && r.t <= limit) { limit = r.t; mHit = r; }
    }
    const moverResult = () => hitAt(mHit.t, mHit.side, Math.floor(x + dx * (mHit.t + 1e-4)), Math.floor(y + dy * (mHit.t + 1e-4)), null);

    let cx = Math.floor(x), cy = Math.floor(y);
    if (staticSolid(cx, cy)) return hitAt(0, 0, cx, cy, null);
    const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity, tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    let tMaxX = dx > 0 ? (cx + 1 - x) * tdx : dx < 0 ? (x - cx) * tdx : Infinity;
    let tMaxY = dy > 0 ? (cy + 1 - y) * tdy : dy < 0 ? (y - cy) * tdy : Infinity;
    let tEnter = 0;
    for (let iter = 0; iter < 4 * (w + h) + 8; iter++) {
      const tExit = Math.min(tMaxX, tMaxY);
      const di = doorAt[cy * w + cx];
      if (di >= 0) {
        const d = doors[di];
        const t = doorSlabT(d, x, y, dx, dy, tEnter, Math.min(tExit, limit));
        if (t >= 0) return hitAt(t, d.vertical ? 0 : 1, cx, cy, d);
      }
      if (tExit > limit) break;
      let side;
      if (tMaxX < tMaxY) { cx += stepX; tEnter = tMaxX; tMaxX += tdx; side = 0; }
      else { cy += stepY; tEnter = tMaxY; tMaxY += tdy; side = 1; }
      if (staticSolid(cx, cy)) return hitAt(tEnter, side, cx, cy, null);
    }
    return mHit ? moverResult() : miss(maxDist);
  }

  function hasLOS(x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0);
    if (d < 1e-9) return !staticSolid(Math.floor(x0), Math.floor(y0));
    const r = castRay(x0, y0, x1 - x0, y1 - y0, d);
    return !r.hit;
  }

  // ───────────── collision ─────────────
  // Entities are axis-aligned squares of half-size `radius`. Blocking cells and moving pushwalls are boxes.
  function forEachBlockingBox(x0, y0, x1, y1, fn) {
    const cx0 = Math.floor(x0), cy0 = Math.floor(y0), cx1 = Math.floor(x1 - 1e-9), cy1 = Math.floor(y1 - 1e-9);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      if (staticSolid(cx, cy) || (inBounds(cx, cy) && blocksMoveNoMover(cx, cy))) fn(cx, cy, cx + 1, cy + 1);
    }
    for (const m of movers) if (m.x0 < x1 && m.x1 > x0 && m.y0 < y1 && m.y1 > y0) fn(m.x0, m.y0, m.x1, m.y1);
  }
  function blocksMoveNoMover(cx, cy) {
    const i = cy * w + cx;
    if (blocker[i]) return true;
    const di = doorAt[i];
    return di >= 0 && doors[di].open < 0.8;
  }
  const boxOverlap = (ax0, ay0, ax1, ay1, bx0, by0, bx1, by1) => ax0 < bx1 && ax1 > bx0 && ay0 < by1 && ay1 > by0;

  function moveAxis(ent, r, axis, delta) {
    if (!delta) return false;
    const ox = ent.x, oy = ent.y;
    const nx = axis === 0 ? ox + delta : ox, ny = axis === 1 ? oy + delta : oy;
    let limit = null;
    forEachBlockingBox(nx - r, ny - r, nx + r, ny + r, (bx0, by0, bx1, by1) => {
      if (boxOverlap(ox - r, oy - r, ox + r, oy + r, bx0, by0, bx1, by1)) return;   // already inside: let it escape
      const e = axis === 0 ? (delta > 0 ? bx0 - r - EPS : bx1 + r + EPS) : (delta > 0 ? by0 - r - EPS : by1 + r + EPS);
      limit = limit === null ? e : delta > 0 ? Math.min(limit, e) : Math.max(limit, e);
    });
    if (limit === null) { if (axis === 0) ent.x = nx; else ent.y = ny; return false; }
    const o = axis === 0 ? ox : oy, n = axis === 0 ? nx : ny;
    const v = delta > 0 ? Math.max(o, Math.min(n, limit)) : Math.min(o, Math.max(n, limit));
    if (axis === 0) ent.x = v; else ent.y = v;
    return true;
  }

  // forEnemy is accepted for contract compatibility; physical collision is identical for players and enemies.
  function tryMove(ent, dx, dy, forEnemy = false) {   // eslint-disable-line no-unused-vars
    const r = Math.max(0, Math.min(0.49, Number(ent.radius) || 0));
    dx = Number.isFinite(dx) ? dx : 0; dy = Number.isFinite(dy) ? dy : 0;
    const maxStep = Math.max(0.05, Math.min(0.2, r * 0.9));
    const n = Math.min(4096, Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / maxStep)));
    const sx = dx / n, sy = dy / n;
    let hit = false;
    for (let k = 0; k < n; k++) {
      if (moveAxis(ent, r, 0, sx)) hit = true;
      if (moveAxis(ent, r, 1, sy)) hit = true;
    }
    return { x: ent.x, y: ent.y, hit };
  }

  // ───────────── navigation ─────────────
  let version = 0;
  const fieldCache = new Map();
  const bump = () => { version++; fieldCache.clear(); world.version = version; };

  function distField(tcx, tcy) {
    tcx = Math.max(0, Math.min(w - 1, tcx | 0)); tcy = Math.max(0, Math.min(h - 1, tcy | 0));
    const key = tcy * w + tcx;
    const hitc = fieldCache.get(key);
    if (hitc) return hitc;
    const f = new Uint16Array(N).fill(UNREACHABLE);
    const q = new Int32Array(N);
    let qh = 0, qt = 0;
    f[key] = 0; q[qt++] = key;
    while (qh < qt) {
      const i = q[qh++], cx = i % w, cy = (i / w) | 0, nd = f[i] + 1;
      if (cx > 0) visit(i - 1, cx - 1, cy);
      if (cx < w - 1) visit(i + 1, cx + 1, cy);
      if (cy > 0) visit(i - w, cx, cy - 1);
      if (cy < h - 1) visit(i + w, cx, cy + 1);
      function visit(j, jx, jy) { if (f[j] === UNREACHABLE && !blocksMove(jx, jy, true)) { f[j] = nd; q[qt++] = j; } }
    }
    if (fieldCache.size >= 48) fieldCache.delete(fieldCache.keys().next().value);
    fieldCache.set(key, f);
    return f;
  }

  const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  function nextStep(field, cx, cy) {
    if (!field || !inBounds(cx, cy)) return null;
    const cur = field[cy * w + cx];
    if (cur === 0) return null;
    let best = null, bestScore = cur === UNREACHABLE ? UNREACHABLE : cur * 2;   // compare in half-steps
    for (const [ox, oy] of NB) {
      const nx = cx + ox, ny = cy + oy;
      if (!inBounds(nx, ny)) continue;
      const v = field[ny * w + nx];
      if (v === UNREACHABLE) continue;
      if (ox && oy) {   // diagonal: both orthogonal neighbours must be passable (no corner cutting)
        if (field[cy * w + nx] === UNREACHABLE || field[ny * w + cx] === UNREACHABLE) continue;
        if (v * 2 + 1 < bestScore) { bestScore = v * 2 + 1; best = { cx: nx, cy: ny }; }
      } else if (v * 2 < bestScore) { bestScore = v * 2; best = { cx: nx, cy: ny }; }
    }
    return best;
  }

  function soundMask(scx, scy, range = 12) {
    const m = new Uint8Array(N);
    if (!inBounds(scx, scy)) return m;
    const dist = new Int16Array(N).fill(-1);
    const q = new Int32Array(N);
    let qh = 0, qt = 0;
    const s = scy * w + scx;
    dist[s] = 0; m[s] = 1; q[qt++] = s;
    while (qh < qt) {
      const i = q[qh++];
      if (dist[i] >= range) continue;
      const cx = i % w, cy = (i / w) | 0;
      for (const [ox, oy] of NB.slice(0, 4)) {
        const nx = cx + ox, ny = cy + oy;
        if (!inBounds(nx, ny)) continue;
        const j = ny * w + nx;
        if (dist[j] >= 0 || isSolid(nx, ny)) continue;
        const di = doorAt[j];
        if (di >= 0 && doors[di].state === 'closed') continue;
        dist[j] = dist[i] + 1; m[j] = 1; q[qt++] = j;
      }
    }
    return m;
  }

  // ───────────── doors ─────────────
  function setDoorState(d, state) {
    if (d.state === state) return;
    d.state = state;
    bump();
  }
  function openDoor(d) {
    if (!d) return;
    if (d.state === 'closed' || d.state === 'closing') {
      if (d.state === 'closed') emit('sfx', { name: 'door_open', x: d.cx + 0.5, y: d.cy + 0.5 });
      setDoorState(d, 'opening');
    } else if (d.state === 'open') d.timer = 0;
  }
  function actorsOf(game) {
    const out = [];
    if (!game) return out;
    if (game.player && Number.isFinite(game.player.x)) out.push(game.player);
    if (Array.isArray(game.enemies)) for (const e of game.enemies) {
      if (e && Number.isFinite(e.x) && e.state !== 'dead' && e.state !== 'die') out.push(e);
    }
    return out;
  }
  function boxHasActor(actors, x0, y0, x1, y1) {
    for (const a of actors) {
      const r = Number(a.radius) || 0.25;
      if (boxOverlap(a.x - r, a.y - r, a.x + r, a.y + r, x0, y0, x1, y1)) return true;
    }
    return false;
  }

  // ───────────── pushwalls ─────────────
  function cellFreeForPush(cx, cy) {
    if (!inBounds(cx, cy)) return false;
    const i = cy * w + cx;
    if (cells[i] !== CELL.OPEN || blocker[i] || doorAt[i] >= 0) return false;
    for (const m of movers) if (moverOverlapsCell(m, cx, cy) || (m.dcx === cx && m.dcy === cy)) return false;
    return true;
  }
  function startPushwall(cx, cy, sx, sy) {
    if (movers.length >= LIMITS.MOVERS) return false;
    let dist = 0;
    while (dist < PUSH_DIST && cellFreeForPush(cx + sx * (dist + 1), cy + sy * (dist + 1))) dist++;
    if (!dist) return false;
    const i = cy * w + cx, tex = pushTex[i] || wallTex[i];
    cells[i] = CELL.OPEN; wallTex[i] = 0; pushTex[i] = 0;
    movers.push({ x0: cx, y0: cy, x1: cx + 1, y1: cy + 1, tex, dx: sx, dy: sy, left: dist, dcx: cx + sx * dist, dcy: cy + sy * dist });
    world.secretsFound++;
    bump();
    emit('sfx', { name: 'pushwall', x: cx + 0.5, y: cy + 0.5 });
    emit('secret', { x: cx + 0.5, y: cy + 0.5 });
    return true;
  }

  // ───────────── use ─────────────
  function use(x, y, angle, keys = {}) {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    // walk the grid along the view ray and take the first non-open cell within reach
    let cx = Math.floor(x), cy = Math.floor(y);
    const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
    const tdx = Math.abs(dx) > 1e-12 ? Math.abs(1 / dx) : Infinity, tdy = Math.abs(dy) > 1e-12 ? Math.abs(1 / dy) : Infinity;
    let tMaxX = dx > 0 ? (cx + 1 - x) * tdx : dx < 0 ? (x - cx) * tdx : Infinity;
    let tMaxY = dy > 0 ? (cy + 1 - y) * tdy : dy < 0 ? (y - cy) * tdy : Infinity;
    let side = -1;
    const here = inBounds(cx, cy) ? doorAt[cy * w + cx] : -1;
    let target = null;
    if (here >= 0) target = { cx, cy, side: -1 };
    for (let n = 0; !target && n < 8; n++) {
      let t;
      if (tMaxX < tMaxY) { cx += stepX; t = tMaxX; tMaxX += tdx; side = 0; } else { cy += stepY; t = tMaxY; tMaxY += tdy; side = 1; }
      if (t > USE_RANGE) break;
      if (!inBounds(cx, cy)) break;
      if (cells[cy * w + cx] !== CELL.OPEN) { target = { cx, cy, side }; break; }
      if (isSolid(cx, cy)) break;   // a moving pushwall in the way
    }
    if (!target) return { kind: 'none' };
    const i = target.cy * w + target.cx;
    const c = cells[i];
    if (c === CELL.DOOR) {
      const d = doors[doorAt[i]];
      if (d.lock && !(keys && keys[d.lock]) && d.state === 'closed') {
        emit('sfx', { name: 'door_locked', x: d.cx + 0.5, y: d.cy + 0.5 });
        return { kind: 'locked', lock: d.lock };
      }
      openDoor(d);
      return { kind: 'door' };
    }
    if (c === CELL.PUSH) {
      const sx = target.side === 0 ? stepX : 0, sy = target.side === 1 ? stepY : 0;
      return startPushwall(target.cx, target.cy, sx, sy) ? { kind: 'pushwall' } : { kind: 'none' };
    }
    if (c === CELL.EXIT) {
      if (!world.exitTriggered) {
        world.exitTriggered = true;
        wallTex[i] = exitTex + 1;   // frame 1: lever down, green lamp
        emit('sfx', { name: 'switch', x: target.cx + 0.5, y: target.cy + 0.5 });
        emit('exit', {});
      }
      return { kind: 'exit' };
    }
    return { kind: 'none' };
  }

  function setBlocker(cx, cy, on) {
    if (!inBounds(cx, cy)) return;
    const v = on ? 1 : 0, i = cy * w + cx;
    if (blocker[i] !== v) { blocker[i] = v; bump(); }
  }

  // ───────────── update ─────────────
  function update(dt, game) {
    if (!(dt > 0)) return;
    const actors = actorsOf(game);
    for (const d of doors) {
      if (d.state === 'opening') {
        d.open = Math.min(1, d.open + dt * DOOR_SPEED);
        if (d.open >= 1) { d.timer = 0; setDoorState(d, 'open'); }
      } else if (d.state === 'open') {
        d.timer += dt;
        if (d.timer >= DOOR_HOLD) {
          if (boxHasActor(actors, d.cx, d.cy, d.cx + 1, d.cy + 1)) d.timer = DOOR_HOLD;   // wait until clear
          else { setDoorState(d, 'closing'); emit('sfx', { name: 'door_close', x: d.cx + 0.5, y: d.cy + 0.5 }); }
        }
      } else if (d.state === 'closing') {
        if (boxHasActor(actors, d.cx, d.cy, d.cx + 1, d.cy + 1)) { setDoorState(d, 'opening'); continue; }
        d.open = Math.max(0, d.open - dt * DOOR_SPEED);
        if (d.open <= 0) { d.timer = 0; setDoorState(d, 'closed'); }
      }
    }
    for (let k = movers.length - 1; k >= 0; k--) {
      const m = movers[k];
      const s = Math.min(m.left, dt * PUSH_SPEED);
      const nx0 = m.x0 + m.dx * s, ny0 = m.y0 + m.dy * s;
      if (boxHasActor(actors, nx0, ny0, nx0 + 1, ny0 + 1) && !boxHasActor(actors, m.x0, m.y0, m.x1, m.y1)) continue;   // pause: someone is in the way
      m.x0 = nx0; m.y0 = ny0; m.x1 = nx0 + 1; m.y1 = ny0 + 1; m.left -= s;
      if (m.left <= 1e-9) {
        const i = m.dcy * w + m.dcx;
        cells[i] = CELL.WALL; wallTex[i] = m.tex;
        movers.splice(k, 1);
        bump();
      }
    }
  }

  const world = {
    w, h, def,
    cells, wallTex, floorTex, ceilTex, hazard,
    jambTex: tile(DOOR_JAMB[0]),
    doors, doorAt, movers, blocker,
    secretsTotal: Math.max(0, secretsTotal), secretsFound: 0, exitTriggered: false,
    version: 0,
    idx, inBounds, isSolid, blocksMove, blocksSight, hazardAt, castRay, hasLOS, tryMove,
    use, openDoor, setBlocker, update,
    distField, nextStep, soundMask,
  };
  return world;
}

export default createWorld;
