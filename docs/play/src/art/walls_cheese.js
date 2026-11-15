// walls_cheese — the ten cheese-themed wall tiles (64×64, opaque, seamless left↔right).
// Owner: art-walls-cheese. Deterministic: all variation comes from hash2. Light from the upper-left.
import { PixBuf, ink, hash2 } from './pixbuf.js';

const T = 64;
const wx = (x) => ((x % T) + T) % T;                      // wrap x into the tile
const wd = (a, b) => { let d = wx(a - b); if (d > T / 2) d -= T; return d; };   // wrapped signed distance
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Smooth value noise, periodic over the 64-texel tile in both axes (cell must divide 64). */
function pnoise(x, y, cell, seed) {
  const n = T / cell, gx = x / cell, gy = y / cell;
  const x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
  const h = (i, j) => hash2(((i % n) + n) % n, ((j % n) + n) % n, seed);
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = h(x0, y0) + (h(x0 + 1, y0) - h(x0, y0)) * sx;
  const b = h(x0, y0 + 1) + (h(x0 + 1, y0 + 1) - h(x0, y0 + 1)) * sx;
  return a + (b - a) * sy;
}

/** Fill every pixel from fn(x, y) → ink. */
function paint(p, fn) {
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { const c = fn(x, y); if (c) p.set(x, y, c); }
  return p;
}
/** Make a palette of inks sharing one material. */
const pal = (cols, m = {}) => cols.map((c) => ink(c, m));

/** Running-bond brick lookup. Mortar sits on the top and left of each brick. */
function brickAt(x, y, rows, mortar = 2) {
  let y0 = 0, r = 0;
  while (r < rows.length - 1 && y >= y0 + rows[r].h) { y0 += rows[r].h; r++; }
  const row = rows[r], xx = wx(x + row.off);
  let x0 = 0, c = 0;
  while (c < row.w.length - 1 && xx >= x0 + row.w[c]) { x0 += row.w[c]; c++; }
  const lx = xx - x0, ly = y - y0, w = row.w[c], h = row.h;
  return { row: r, col: c, id: r * 8 + c, lx, ly, w, h, mortar: lx < mortar || ly < mortar, m: mortar };
}

/** Bit mask helpers (x wraps, y clips). */
const mask = () => new Uint8Array(T * T);
const mget = (m, x, y) => (y < 0 || y >= T ? 0 : m[y * T + wx(x)]);
function mdisc(m, cx, cy, r) {
  for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++)
    for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r * r && y >= 0 && y < T) m[y * T + wx(x)] = 1;
    }
}

/**
 * Shade a cavity (hole / bite) given a mask. Light from upper-left: the lower-right inner wall is lit,
 * the upper-left part sinks into shadow; the lower-right outer lip catches a highlight.
 * c = { lip, rim, lit, mid, deep, deepest }
 */
function cavity(p, m, c) {
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      if (mget(m, x, y)) {
        let s = 0, t = 0;
        while (s < 24 && mget(m, x + s + 1, y + s + 1)) s++;   // steps to the lower-right wall
        while (t < 24 && mget(m, x - t - 1, y - t - 1)) t++;   // steps to the upper-left wall
        const f = (t + 0.5) / (s + t + 1);                     // 0 near upper-left edge … 1 near lower-right edge
        p.set(x, y, s === 0 ? c.lit : f > 0.72 ? c.mid : f > 0.38 ? c.deep : c.deepest);
      } else if (mget(m, x - 1, y - 1) && !mget(m, x, y)) p.set(x, y, c.lip);
      else if (mget(m, x + 1, y + 1) || mget(m, x + 1, y) || mget(m, x, y + 1)) p.set(x, y, c.rim);
    }
}

/** Emboss lighting from a height field h(x,y) (x wraps): >0 faces the upper-left light. */
function slope(h, x, y) { return (h(x - 1, y) - h(x + 1, y)) + (h(x, y - 1) - h(x, y + 1)); }

// ───────────────────────────── cheddar brick ─────────────────────────────
const CHED_ROWS = [0, 1, 2, 3].map((r) => ({ h: 16, off: r % 2 ? 16 : 0, w: [32, 32] }));
const CHED = pal(['#9c4f0c', '#cf7c14', '#f2a91e', '#ffc544', '#ffe39a'], { gloss: 0.18 });
const RIND = pal(['#3e1c08', '#5e2f0c', '#7a4214'], { gloss: 0.05 });

function cheddarBase(seed = 11) {
  const p = new PixBuf(T, T);
  return paint(p, (x, y) => {
    const b = brickAt(x, y, CHED_ROWS);
    if (b.mortar) {
      if (b.ly === 0 || (b.lx === 0 && b.ly >= 2)) return RIND[0];       // shadow under/left of the brick above
      return hash2(x, y, seed + 5) > 0.8 ? RIND[2] : RIND[1];
    }
    const lx = b.lx - 2, ly = b.ly - 2, w = b.w - 2, h = b.h - 2;
    if (ly === 0 || lx === 0) return (lx === 0 && ly === 0) ? CHED[4] : CHED[3];
    if (ly === h - 1 || lx === w - 1) return CHED[1];
    if (ly === h - 2 && lx > 1 && hash2(x, y, seed) > 0.5) return CHED[1];
    // tiny pores: dark pit with a lit lower-right pixel
    if (hash2(x, y, seed + 1) > 0.975 && lx < w - 3 && ly < h - 3) return CHED[1];
    if (hash2(x - 1, y - 1, seed + 1) > 0.975 && lx > 1 && ly > 1) return CHED[4];
    const v = pnoise(x, y, 8, seed + b.id) * 0.7 + hash2(b.id, 3, seed) * 0.5;
    if (v < 0.42) return CHED[1];
    if (v > 0.98 && ly < 5) return CHED[3];
    return CHED[2];
  });
}

function cheddarBrick() { return cheddarBase(11); }

// ───────────────────────────── moldy brick ─────────────────────────────
const MOULD = pal(['#2a3c1e', '#4b6a2c', '#7a9a3a', '#b4cf62', '#e2f0a8'], { gloss: 0.02 });

function moldyBrick() {
  const p = cheddarBase(23);
  // darker, aged bricks: dim a couple of bricks
  paint(p, (x, y) => {
    const b = brickAt(x, y, CHED_ROWS), c = p.get(x, y);
    if (!b.mortar && (b.id === 1 || b.id === 16) && hash2(x >> 1, y >> 1, 4) > 0.55) return ink([c.r * 0.82, c.g * 0.78, c.b * 0.7], { gloss: 0.12 });
  });
  // cracks — dark line with a lit lower edge
  const crack = (x, y, n, seed) => {
    let dir = hash2(seed, 1, 9) > 0.5 ? 1 : -1;
    for (let i = 0; i < n; i++) {
      p.set(wx(x), y, RIND[0]); p.set(wx(x + 1), y + 1, CHED[3]);
      const r = hash2(i, seed, 77);
      if (r < 0.45) y++; else if (r < 0.8) x += dir; else { x += dir; y++; }
      if (hash2(i, seed, 78) > 0.9) dir = -dir;
    }
  };
  crack(40, 19, 11, 1); crack(6, 50, 9, 2); crack(22, 3, 8, 3); crack(56, 37, 7, 4);
  // mould patches: lumpy blobs, dark core, light fuzzy rim, spores
  const blobs = [[10, 30, 7], [58, 12, 6], [36, 54, 8], [27, 8, 3.5]];
  const field = (x, y) => {
    let f = 0;
    for (const [cx, cy, r] of blobs) { const dx = wd(x, cx), dy = y - cy; f = Math.max(f, 1 - Math.sqrt(dx * dx + dy * dy) / r); }
    return f + (pnoise(x, y, 4, 31) - 0.5) * 0.55;
  };
  paint(p, (x, y) => {
    const f = field(x, y);
    if (f <= 0.02) return;
    if (f < 0.12) return hash2(x, y, 5) > 0.5 ? MOULD[3] : undefined;       // fuzzy dithered edge
    if (f < 0.25) return MOULD[2];
    if (hash2(x, y, 6) > 0.9) return MOULD[4];                               // spores
    const lit = field(x - 1, y - 1) < f - 0.05;                             // upper-left facing bumps
    return f > 0.55 ? (lit ? MOULD[2] : MOULD[0]) : lit ? MOULD[3] : MOULD[1];
  });
  // a bite taken out of the brick at upper-right: scalloped tooth marks
  const m = mask();
  for (const [cx, cy, r] of [[47, 20, 5.2], [51, 24.5, 5], [49.5, 29.5, 4.6], [44.5, 25.5, 4.2]]) mdisc(m, cx, cy, r);
  cavity(p, m, {
    lip: CHED[4], rim: ink('#7a3a0a', { gloss: 0.1 }),
    lit: ink('#ffcf6a', { gloss: 0.1 }), mid: ink('#e89624', { gloss: 0.1 }), deep: ink('#b8640e', { gloss: 0.05 }), deepest: ink('#7a3a0a'),
  });
  // tooth ridges inside the bite
  for (const [x, y] of [[45, 18], [46, 23], [48, 27], [50, 22], [47, 31]]) { p.set(x, y, ink('#f0a83a')); p.set(x + 1, y, ink('#9a520c')); }
  return p;
}

// ───────────────────────────── swiss block ─────────────────────────────
const SWISS = pal(['#c49a2c', '#e2bf4a', '#f6dc6a', '#fbe98e', '#fff6c4'], { gloss: 0.1 });

function swissBlock() {
  const p = new PixBuf(T, T);
  paint(p, (x, y) => {
    if (y === 0) return SWISS[0];
    if (y === 1) return SWISS[4];
    if (y === T - 1) return SWISS[1];
    const v = pnoise(x, y, 16, 41) * 0.6 + pnoise(x, y, 8, 42) * 0.4;
    if (v > 0.66) return SWISS[3];
    if (v < 0.3) return hash2(x, y, 3) > 0.5 ? SWISS[1] : SWISS[2];       // dithered soft shadow, sparingly
    return SWISS[2];
  });
  // big round holes that read as deep, a few cut by the edges (wrapped)
  const holes = [[14, 16, 8.5], [44, 11, 5.5], [55, 38, 9], [26, 44, 7], [7, 52, 4], [38, 30, 3.5], [3, 31, 3], [46, 57, 3.5], [22, 28, 2.5], [60, 6, 2.5], [33, 59, 2], [18, 5, 2]];
  const m = mask();
  for (const [cx, cy, r] of holes) mdisc(m, cx, cy, r);
  cavity(p, m, {
    lip: SWISS[4], rim: ink('#b88a22', { gloss: 0.1 }),
    lit: ink('#f2cc52', { gloss: 0.1 }), mid: ink('#c8962a'), deep: ink('#8a5c16'), deepest: ink('#4e300c'),
  });
  return p;
}

// ───────────────────────────── blue stone ─────────────────────────────
const BS_ROWS = [{ h: 21, off: 0, w: [40, 24] }, { h: 21, off: 20, w: [28, 36] }, { h: 22, off: 8, w: [32, 32] }];
const STONE = pal(['#8f8270', '#bfae8e', '#ddd0ae', '#f2e8cc', '#fff8e6'], { gloss: 0.08 });
const MORT = pal(['#3c3c4a', '#5c5c6c', '#74748a']);
const VEIN = [ink('#1f3f60', { spark: 0.35, gloss: 0.2 }), ink('#2f6a82', { spark: 0.45, gloss: 0.2 }), ink('#5aa8b0', { spark: 0.6, gloss: 0.2 })];

function blueStone() {
  const p = new PixBuf(T, T);
  paint(p, (x, y) => {
    const b = brickAt(x, y, BS_ROWS);
    if (b.mortar) return b.ly === 0 || b.lx === 0 ? MORT[0] : MORT[1];
    const lx = b.lx - 2, ly = b.ly - 2, w = b.w - 2, h = b.h - 2;
    if (ly === 0 || lx === 0) return STONE[4];
    if (ly === h - 1 || lx === w - 1) return STONE[0];
    if (ly === h - 2 || lx === w - 2) return STONE[1];
    const v = pnoise(x, y, 8, 50 + b.id) * 0.75 + hash2(b.id, 1, 51) * 0.35;
    return v < 0.4 ? STONE[1] : v > 0.85 ? STONE[3] : STONE[2];
  });
  // mould veins: meandering wrapped walks with branches, dark core + teal fringe + glinting crystals
  const walk = (x, y, n, seed, branch) => {
    let dx = hash2(seed, 0, 60) > 0.5 ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const r = hash2(i, seed, 61);
      p.set(wx(x), y, VEIN[0]);
      if (hash2(i, seed, 62) > 0.45) p.set(wx(x + 1), y, VEIN[1]);
      if (hash2(i, seed, 63) > 0.8) p.set(wx(x - 1), y + 1, VEIN[2]);
      if (r < 0.5) { x += dx; y++; } else if (r < 0.8) y++; else x += dx;
      if (hash2(i, seed, 64) > 0.88) dx = -dx;
      if (branch && hash2(i, seed, 65) > 0.93) walk(x, y, 6 + ((hash2(i, seed, 66) * 6) | 0), seed * 7 + i, false);
      if (y >= T) break;
    }
  };
  walk(6, 0, 40, 1, true); walk(34, 4, 30, 2, true); walk(52, 22, 34, 3, true); walk(20, 30, 26, 4, true); walk(44, 46, 18, 5, false);
  // scattered blue mould specks
  for (let i = 0; i < 26; i++) {
    const x = (hash2(i, 0, 70) * T) | 0, y = (hash2(i, 1, 70) * T) | 0;
    if (!brickAt(x, y, BS_ROWS).mortar) p.set(x, y, hash2(i, 2, 70) > 0.5 ? VEIN[1] : VEIN[2]);
  }
  return p;
}

// ───────────────────────────── parmesan block ─────────────────────────────
const PARM_ROWS = [{ h: 32, off: 0, w: [32, 32] }, { h: 32, off: 16, w: [32, 32] }];
const PARM = pal(['#b8975a', '#dcc48a', '#ecdba6', '#f8ecc4', '#fffbe8'], { gloss: 0.1, spark: 0.3 });
const PRIND = pal(['#6a4c22', '#9a7436', '#c49c50'], { gloss: 0.15, spark: 0.1 });
const CRYSTAL = [ink('#ffffff', { spark: 1, gloss: 0.5 }), ink('#fff4c8', { spark: 1, gloss: 0.4 }), ink('#d8c48c', { spark: 0.6 })];

function parmesanBlock() {
  const p = new PixBuf(T, T);
  paint(p, (x, y) => {
    const b = brickAt(x, y, PARM_ROWS, 0);
    const jag = hash2(x >> 1, y >> 1, 81 + b.id);
    const eL = b.lx, eT = b.ly, eR = b.w - 1 - b.lx, eB = b.h - 1 - b.ly, e = Math.min(eL, eT, eR, eB);
    if (e < 1 + jag * 1.2) return eL === e || eT === e ? '#2a1c10' : '#3e2c18';            // crumbly gap
    if (e < 3 + jag * 1.6) {                                                                // golden rind edge
      if (eT === e || eL === e) return PRIND[2];
      return eB === e || eR === e ? PRIND[0] : PRIND[1];
    }
    if (e < 5 + jag && (eT === e || eL === e)) return PARM[4];                            // lit top/left edge
    if (e < 5 + jag && (eB === e || eR === e)) return PARM[1];
    // crumbly granular body: chunky 2px grains in 3 tones, pits
    const g = pnoise(x, y, 4, 90 + b.id) * 0.6 + hash2(x >> 1, y >> 1, 91) * 0.4;
    if (hash2(x >> 1, y >> 1, 92) > 0.94) return PARM[0];
    return g < 0.36 ? PARM[1] : g > 0.68 ? PARM[3] : PARM[2];
  });
  // crystals (tyrosine): bright clusters with a dark pit below-right — the glitter
  for (let i = 0; i < 70; i++) {
    const x = (hash2(i, 0, 95) * T) | 0, y = (hash2(i, 1, 95) * T) | 0;
    const b = brickAt(x, y, PARM_ROWS, 0), e = Math.min(b.lx, b.ly, b.w - 1 - b.lx, b.h - 1 - b.ly);
    if (e < 5) continue;
    const big = hash2(i, 2, 95) > 0.6;
    p.set(x, y, CRYSTAL[0]);
    p.set(x + 1, y + 1, CRYSTAL[2]);
    if (big) { p.set(x + 1, y, CRYSTAL[1]); p.set(x, y + 1, CRYSTAL[1]); p.set(x + 1, y + 1, CRYSTAL[0]); p.set(x + 2, y + 2, CRYSTAL[2]); }
  }
  return p;
}

// ───────────────────────────── wax rind ─────────────────────────────
const WAX = pal(['#4e0a12', '#82121e', '#c21f24', '#e2473c', '#ff8f72', '#ffd8c8'], { gloss: 0.75 });

function waxHeight(x, y) {
  x = wx(x);
  if (y < 0 || y >= T) return -2;
  if (x === 0 || y === 0 || x === T - 1 || y === T - 1) return -2;                 // panel seams
  const dx = x + 0.5 - 32, dy = y + 0.5 - 32, r = Math.sqrt(dx * dx + dy * dy);
  let h = x >= 6 && x <= 57 && y >= 6 && y <= 57 ? 2 : 0;                          // raised inner panel
  if (r <= 15.5) {
    h = 3;                                                                          // seal disc
    if (r > 12 && r <= 14.5) h = 5;                                                 // embossed ring
    for (let k = 0; k < 16; k++) {                                                  // bead dots
      const a = (k / 16) * Math.PI * 2, bx = 32 + Math.cos(a) * 10, by = 32 + Math.sin(a) * 10;
      if ((x + 0.5 - bx) ** 2 + (y + 0.5 - by) ** 2 <= 1.3) h = 5;
    }
    // cheese wedge emblem with holes, raised
    const ux = x - 23, uy = y - 24;                                                 // wedge box 18×13
    if (uy >= 0 && uy <= 13 && ux >= 0 && ux <= 18 && uy >= 13 - (ux * 13) / 18 - 0.01) {
      h = 6;
      for (const [hx, hy, hr] of [[13, 7, 1.6], [9, 10.5, 1.2], [15.5, 11, 1]]) if ((ux - hx) ** 2 + (uy - hy) ** 2 <= hr * hr) h = 3;
    }
  }
  return h;
}

function waxRind() {
  const p = new PixBuf(T, T);
  paint(p, (x, y) => {
    const h = waxHeight(x, y), s = slope(waxHeight, x, y);
    const groove = h === -2;
    let k = s >= 3 ? 4 : s > 0 ? 3 : s === 0 ? 2 : s <= -3 ? 0 : 1;
    if (groove && s === 0) k = 0;
    if (s === 0 && h === 2) {                                                      // glossy highlight streaks on flat wax
      const d = x + y;
      if (d > 20 && d < 25 && x > 7 && y > 7) k = (d === 22 && hash2(x, y, 1) > 0.3) ? 5 : 3;
      else if (d > 27 && d < 29 && x > 8 && y > 8) k = 3;
      else if (pnoise(x, y, 16, 111) < 0.28) k = 1;
    }
    if (s === 0 && h >= 3 && h < 5 && x + y < 58 && x + y > 54) k = 3;
    const c = WAX[k];
    return groove ? ink(c, { gloss: 0.35 }) : c;
  });
  // crisp seal emblem: a cheese wedge with holes, on a flat disc inside the embossed ring
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const r = Math.hypot(x + 0.5 - 32, y + 0.5 - 32);
    if (r <= 11.5) p.set(x, y, r > 10.5 ? WAX[1] : r > 9.5 ? WAX[4] : WAX[2]);
  }
  const CH = [ink('#f2a91e', { gloss: 0.5 }), ink('#ffd54a', { gloss: 0.6 }), ink('#fff0a8', { gloss: 0.7 })];
  p.poly([[21, 38], [43, 38], [43, 26]], WAX[0]);
  p.poly([[22, 37], [42, 37], [42, 28]], CH[1]);
  p.hline(22, 36, 20, CH[0]); p.hline(22, 37, 20, CH[0]);
  p.line(22, 36, 41, 28, CH[2]);
  for (const [hx, hy, hr] of [[37, 33, 1.7], [31, 34.5, 1.4], [40, 35, 1]]) p.circle(hx, hy, hr, CH[0]);
  // a wax drip running from the seam over the lower band
  for (const [x, y0, n] of [[12, 57, 4], [47, 58, 3]]) {
    for (let j = 0; j < n; j++) { p.set(x, y0 + j, WAX[3]); p.set(x + 1, y0 + j, WAX[1]); }
    p.set(x, y0 + n, WAX[4]); p.set(x + 1, y0 + n, WAX[1]);
  }
  return p;
}

// ───────────────────────────── gold foil ─────────────────────────────
const GOLD = [
  ink('#5e3c0a', { gloss: 0.7, spark: 0.4 }), ink('#9a6a14', { gloss: 0.8, spark: 0.6 }), ink('#d29e22', { gloss: 0.85, spark: 0.7 }),
  ink('#ffd23e', { gloss: 0.9, spark: 0.8 }), ink('#ffe88a', { gloss: 0.9, spark: 0.9 }), ink('#fffbe0', { gloss: 1, spark: 1 }),
];

function goldFoil() {
  const p = new PixBuf(T, T);
  const N = 34, pts = [];
  for (let i = 0; i < N; i++) {
    const a = hash2(i, 3, 120) * Math.PI * 2;
    pts.push({ x: hash2(i, 0, 120) * T, y: hash2(i, 1, 120) * T, b: hash2(i, 2, 120), gx: Math.cos(a), gy: Math.sin(a) });
  }
  const near = (x, y) => {
    let d1 = 1e9, d2 = 1e9, i1 = 0, i2 = 0;
    for (let i = 0; i < N; i++) {
      const dx = wd(x, pts[i].x), dyr = y - pts[i].y, dy = dyr - Math.round(dyr / T) * T, d = Math.sqrt(dx * dx + dy * dy);
      if (d < d1) { d2 = d1; i2 = i1; d1 = d; i1 = i; } else if (d < d2) { d2 = d; i2 = i; }
    }
    return { d1, d2, i1, i2 };
  };
  paint(p, (x, y) => {
    const { d1, d2, i1, i2 } = near(x + 0.5, y + 0.5), q = pts[i1];
    if (d2 - d1 < 1.1) {                                                           // crinkle creases: ridge or valley
      const ridge = hash2(Math.min(i1, i2), Math.max(i1, i2), 121) > 0.45;
      return ridge ? GOLD[5] : GOLD[0];
    }
    // each facet is a tilted plane: base brightness + gradient across it
    const dx = wd(x + 0.5, q.x), dyr = y + 0.5 - q.y, dy = dyr - Math.round(dyr / T) * T;
    let v = q.b * 0.75 + 0.15 + ((dx * q.gx + dy * q.gy) / 10) * 0.35;
    v += (pnoise(x, y, 32, 122) - 0.5) * 0.25;                                     // broad light falloff
    if (hash2(x, y, 123) > 0.985) return GOLD[5];                                  // pin glints
    return GOLD[clamp(Math.floor(v * 5), 0, 4)];
  });
  return p;
}

// ───────────────────────────── fondue fall (4 frames) ─────────────────────────────
const LIP = pal(['#2e2824', '#4a423a', '#6b6258', '#8d8478', '#b4ab9c'], { gloss: 0.1 });
const FON = [
  ink('#b85008', { emit: 0.55 }), ink('#e07a10', { emit: 0.72 }), ink('#ffb21a', { emit: 0.88 }),
  ink('#ffd24a', { emit: 0.95 }), ink('#ffec96', { emit: 1 }), ink('#fffbe0', { emit: 1 }),
];

function stoneLip(p, y0, h, seed, top) {
  for (let y = y0; y < y0 + h; y++)
    for (let x = 0; x < T; x++) {
      const ly = y - y0, xx = wx(x + (top ? 0 : 16)), lx = xx % 32;
      let c;
      if (lx === 0) c = LIP[0];
      else if (ly === 0) c = LIP[4];
      else if (lx === 1) c = LIP[3];
      else if (ly === h - 1) c = LIP[0];
      else if (ly === h - 2 || lx === 31) c = LIP[1];
      else c = pnoise(x, y, 4, seed) > 0.6 ? LIP[3] : hash2(x, y, seed) > 0.93 ? LIP[1] : LIP[2];
      p.set(x, y, c);
    }
}

function fondueFrame(f) {
  const p = new PixBuf(T, T);
  const shift = f * 8;                                                             // streak period 32 → 4-frame loop
  const TOP = 7, FOAM = 52, BOT = 58;
  for (let y = TOP; y < BOT; y++)
    for (let x = 0; x < T; x++) {
      const cg = x >> 1;                                                           // 2px-wide strands
      const ph = (hash2(cg, 0, 131) * 32) | 0, len = 5 + ((hash2(cg, 1, 131) * 9) | 0);
      const rib = pnoise(x, 0, 8, 132);                                            // vertical ribbons of depth
      let k = rib < 0.35 ? 1 : rib > 0.7 ? 3 : 2;
      const u = (((y - shift - ph) % 32) + 32) % 32;
      if (u < len) {                                                               // bright streak sliding down
        k = Math.min(5, k + (u === len - 1 ? 2 : 1));
      } else if (u >= len + 6 && u < len + 9 && hash2(cg, 2, 131) > 0.5) k = Math.max(0, k - 1);   // trailing trough
      if (y === TOP) k = 0;                                                        // shadow under the lip
      else if (y === TOP + 1) k = Math.min(k, 1);
      else if (y === TOP + 2) k = 4;                                               // sheen where it pours over
      p.set(x, y, FON[k]);
    }
  // churning foam/splash band with bubbles that grow and pop (each bubble has its own phase)
  for (let y = FOAM; y < BOT; y++)
    for (let x = 0; x < T; x++) {
      const w = Math.sin(((x + f * 4) / T) * Math.PI * 4) * 1.2 + Math.sin(((x - f * 8) / T) * Math.PI * 6);
      const ly = y - FOAM + w;
      p.set(x, y, ly < 1 ? FON[5] : ly < 3 ? FON[4] : ly < 5 ? FON[3] : FON[2]);
    }
  for (let i = 0; i < 9; i++) {
    const bx = (hash2(i, 0, 140) * T) | 0, by = FOAM + 1 + ((hash2(i, 1, 140) * 4) | 0), life = (f + i) % 4;
    if (life === 3) { for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [-1, -1], [1, -1]]) p.set(wx(bx + dx), by + dy, FON[5]); continue; }
    const r = life + 1;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const d = dx * dx + dy * dy;
      if (d > r * r + 0.5) continue;
      p.set(wx(bx + dx), by + dy, d >= (r - 1) * (r - 1) + 0.5 && dx + dy > 0 ? FON[1] : dx + dy < -r + 1 ? FON[5] : FON[3]);
    }
  }
  // splash droplets leaping above the foam
  for (let i = 0; i < 6; i++) {
    const bx = (hash2(i, 5, 141) * T) | 0, life = (f + i * 3) % 4, hgt = [2, 5, 6, 4][life];
    p.set(wx(bx), FOAM - hgt, FON[5]); if (life < 2) p.set(wx(bx), FOAM - hgt + 1, FON[4]);
  }
  stoneLip(p, 0, TOP, 150, true);
  stoneLip(p, BOT, T - BOT, 151, false);
  return p;
}

// ───────────────────────────── cheese glass ─────────────────────────────
const GS_ROWS = [0, 1, 2, 3].map((r) => ({ h: 16, off: r % 2 ? 12 : 0, w: [24, 20, 20] }));
const GSTONE = pal(['#3a3430', '#5a524a', '#7d7468', '#9c9384', '#bab2a2'], { gloss: 0.06 });
const LEAD = ink('#1a1420', { gloss: 0.4 });

function inWindow(x, y) {
  if (y > 52 || y < 8) return false;
  const dx = x + 0.5 - 32, dy = y + 0.5 - 23;
  return y >= 23 ? x >= 18 && x <= 45 : dx * dx + dy * dy <= 14 * 14;
}

function cheeseGlass() {
  const p = new PixBuf(T, T);
  paint(p, (x, y) => {
    const b = brickAt(x, y, GS_ROWS);
    if (b.mortar) return b.ly === 0 || b.lx === 0 ? GSTONE[0] : GSTONE[1];
    const lx = b.lx - 2, ly = b.ly - 2, w = b.w - 2, h = b.h - 2;
    if (ly === 0 || lx === 0) return GSTONE[4];
    if (ly === h - 1 || lx === w - 1) return GSTONE[1];
    const v = pnoise(x, y, 8, 160 + b.id) * 0.7 + hash2(b.id, 0, 161) * 0.4;
    return v < 0.4 ? GSTONE[1] : v > 0.9 ? GSTONE[3] : GSTONE[2];
  });
  // dressed-stone surround (3px), lit on the upper-left, plus a sill
  const DRESS = pal(['#5e564c', '#a69c8a', '#cfc6b2', '#e8e0cc'], { gloss: 0.08 });
  for (let y = 4; y < 58; y++) for (let x = 13; x < 51; x++) {
    if (inWindow(x, y)) continue;
    let near = false, ul = false;
    for (let k = 1; k <= 3 && !near; k++) {
      if (inWindow(x + k, y) || inWindow(x, y + k) || inWindow(x + k, y + k)) { near = true; ul = true; }
      else if (inWindow(x - k, y) || inWindow(x, y - k) || inWindow(x - k, y - k)) near = true;
    }
    if (near) p.set(x, y, ul ? DRESS[2] : DRESS[1]);
  }
  for (let x = 14; x < 50; x++) { p.set(x, 53, DRESS[3]); p.set(x, 54, DRESS[2]); p.set(x, 55, DRESS[1]); p.set(x, 56, DRESS[0]); }
  // glass: diamond quarries in blue/teal, a cheese wedge in the middle, lead cames
  const BLUE = [ink('#1e2f7a', { emit: 0.45 }), ink('#2c4aa8', { emit: 0.55 }), ink('#3f6ad0', { emit: 0.65 }), ink('#2a7a8a', { emit: 0.55 }), ink('#9ad0ff', { emit: 0.85 })];
  const WEDGE = [ink('#c8700e', { emit: 0.8 }), ink('#ffb21a', { emit: 0.9 }), ink('#ffd23e', { emit: 0.95 }), ink('#fff0a0', { emit: 1 })];
  const wedge = [[21, 47], [43, 47], [43, 29]];
  const inWedge = (x, y) => x >= 21 && x <= 43 && y <= 47 && y >= 47 - ((x - 21) * 18) / 22;
  const wHoles = [[36, 41, 2.6], [30, 44.5, 1.8], [40, 36, 1.6], [26, 46, 1.2]];
  const inHole = (x, y) => wHoles.some(([hx, hy, r]) => (x + 0.5 - hx) ** 2 + (y + 0.5 - hy) ** 2 <= r * r);
  for (let y = 8; y <= 52; y++) for (let x = 17; x <= 46; x++) {
    if (!inWindow(x, y)) continue;
    const edge = !inWindow(x - 1, y) || !inWindow(x + 1, y) || !inWindow(x, y - 1) || !inWindow(x, y + 1);
    if (edge) { p.set(x, y, LEAD); continue; }
    const iw = inWedge(x, y), wEdge = iw !== inWedge(x - 1, y) || iw !== inWedge(x, y + 1) || iw !== inWedge(x + 1, y) || iw !== inWedge(x, y - 1);
    if (wEdge && x <= 44) { p.set(x, y, LEAD); continue; }
    if (iw) {
      if (inHole(x, y)) { p.set(x, y, (x + y) % 2 && inHole(x - 1, y - 1) ? WEDGE[0] : WEDGE[1]); continue; }
      const top = !inWedge(x - 1, y - 1) || !inWedge(x, y - 2);
      p.set(x, y, top ? WEDGE[3] : x > 40 ? WEDGE[1] : WEDGE[2]);
      continue;
    }
    const a = x + y, b2 = x - y + 64;
    if (a % 8 === 0 || b2 % 8 === 0) { p.set(x, y, LEAD); continue; }
    const q = hash2(Math.floor(a / 8), Math.floor(b2 / 8), 170);
    let c = q < 0.3 ? BLUE[0] : q < 0.62 ? BLUE[1] : q < 0.85 ? BLUE[3] : BLUE[2];
    if (a % 8 === 1 || b2 % 8 === 1) c = q < 0.3 ? BLUE[1] : BLUE[2];                    // lit inner edge of the quarry
    if (y < 20 && hash2(x, y, 171) > 0.93) c = BLUE[4];                                     // moonlit sparkles in the arch
    p.set(x, y, c);
  }
  void wedge;
  // lead cross-bar
  for (let x = 18; x <= 45; x++) if (!inWedge(x, 23)) p.set(x, 23, LEAD);
  // keystone
  for (let y = 4; y < 9; y++) for (let x = 29; x < 35; x++) p.set(x, y, y === 4 || x === 29 ? DRESS[3] : y === 8 || x === 34 ? DRESS[0] : DRESS[2]);
  return p;
}

// ───────────────────────────── crate stack ─────────────────────────────
const WOOD = pal(['#3a220e', '#6a4320', '#94622e', '#b47e40', '#d6a464', '#ecc890'], { gloss: 0.05 });
const PAINT = ink('#241a14', { gloss: 0.02 }), RED = ink('#a81c20', { gloss: 0.02 });

function crateStack() {
  const p = new PixBuf(T, T);
  const stencil = {};                                                               // crate id → paint ink or null
  stencil['0,0'] = PAINT; stencil['1,1'] = RED; stencil['1,0'] = null; stencil['0,1'] = null;
  paint(p, (x, y) => {
    const row = y >> 5, xx = wx(x + (row === 0 ? 16 : 0)), col = xx >> 5, lx = xx & 31, ly = y & 31;
    const id = row * 2 + col, tint = hash2(id, 0, 180);
    if (lx === 31 || ly === 31) return WOOD[0];                                       // gap between crates
    if (lx === 30 || ly === 30) return WOOD[1];
    const frame = lx < 4 || lx > 26 || ly < 4 || ly > 26;
    if (frame) {
      if (ly === 0 || lx === 0) return WOOD[5];
      if ((lx === 3 || lx === 27) && ly > 3 && ly < 27) return lx === 3 ? WOOD[1] : WOOD[4];
      if ((ly === 3 || ly === 27) && lx > 3 && lx < 27) return ly === 3 ? WOOD[1] : WOOD[4];
      if ((lx === 2 || lx === 28) && (ly === 2 || ly === 28)) return ink('#d8d0c0', { gloss: 0.6 });   // nail heads
      if ((lx === 3 || lx === 29) && (ly === 3 || ly === 29)) return WOOD[1];
      const g = hash2(lx < 4 || lx > 26 ? x : x >> 3, ly < 4 || ly > 26 ? y >> 3 : y, 181 + id);
      return g > 0.82 ? WOOD[2] : WOOD[3];
    }
    // inner planks
    if (ly === 11 || ly === 19) return WOOD[0];
    if (ly === 12 || ly === 20) return WOOD[4];
    const grain = hash2(x >> 2, y, 182 + id);
    if (grain > 0.86) return WOOD[2];
    if (grain < 0.05) return WOOD[4];
    return tint > 0.5 ? WOOD[3] : mixW(WOOD[3], WOOD[2]);
  });
  // stencilled cheese-wedge emblems (worn paint)
  for (const key of Object.keys(stencil)) {
    const c = stencil[key]; if (!c) continue;
    const [row, col] = key.split(',').map(Number);
    const ox = col * 32 - (row === 0 ? 16 : 0), oy = row * 32;
    for (let ly = 7; ly <= 24; ly++) for (let lx = 6; lx <= 25; lx++) {
      const ux = lx - 7, uy = ly - 8;                                                // wedge 18 wide × 14 tall
      const inW = ux >= 0 && ux <= 17 && uy >= 0 && uy <= 14 && uy >= 14 - (ux * 14) / 17;
      if (!inW) continue;
      const hole = [[12, 8, 2], [7, 12, 1.6], [15, 12.5, 1.3]].some(([hx, hy, r]) => (ux - hx) ** 2 + (uy - hy) ** 2 <= r * r);
      if (hole || hash2(ox + lx, oy + ly, 190) > 0.84) continue;
      if (oy + ly === oy + 11 || oy + ly === oy + 19) continue;                        // paint skips plank gaps
      p.set(wx(ox + lx), oy + ly, c);
    }
  }
  return p;
}
function mixW(a, b) { return ink([(a.r + b.r) >> 1, (a.g + b.g) >> 1, (a.b + b.b) >> 1], { gloss: a.gloss }); }

// ───────────────────────────── build ─────────────────────────────
export function build() {
  return {
    'wall.cheddar_brick': cheddarBrick(),
    'wall.swiss_block': swissBlock(),
    'wall.blue_stone': blueStone(),
    'wall.parmesan_block': parmesanBlock(),
    'wall.wax_rind': waxRind(),
    'wall.gold_foil': goldFoil(),
    'wall.fondue_fall': [0, 1, 2, 3].map(fondueFrame),
    'wall.cheese_glass': cheeseGlass(),
    'wall.moldy_brick': moldyBrick(),
    'wall.crate_stack': crateStack(),
  };
}

export default build;
