// flats — all floors and ceilings (14 names, 64x64 opaque, seamless in both directions).
// Owner: art-flats. build() -> { [name]: PixBuf | PixBuf[] }. Deterministic (hash2 only). Light from upper-left.
// Every pattern is computed modulo 64 (periodic noise / voronoi / sines with integer periods) so wrapping is exact.
import { PixBuf, ink, shade, mix, hash2 } from './pixbuf.js';

const S = 64;
const wrap = (v) => ((v % S) + S) % S;
const OUT = '#1a1420';
const pal = (arr, mat) => arr.map((c) => ink(c, mat));

// ───────────── palettes (dark -> light) ─────────────
const DIRT = ['#2a1d17', '#3d2a1f', '#523a29', '#6a4b34', '#84603f'];
const STONE = ['#22222b', '#3b3e4a', '#525764', '#6a707c', '#858b95', '#a3a8ae'];
const MARBLE_D = ['#0e0c14', '#171420', '#221e2c', '#332e40'];
const MARBLE_L = ['#a99f8c', '#cfc5ae', '#ece2c8', '#fbf4e0'];
const CHEESE = ['#9a5a0c', '#d08a14', '#f2a91e', '#f6dc6a', '#fff2b0'];
const WOOD = ['#2a160c', '#40231255'.slice(0, 7), '#5e3520', '#76452a', '#94593a', '#b0724a'];
const RED = ['#2e060b', '#4e0c13', '#7e1419', '#a31a20', '#c21f24'];
const GOLD = ['#5a3208', '#8c5a12', '#c08a1e', '#ffd23e', '#ffe98a', '#fffbe0'];
const STEEL = ['#1e232c', '#353c48', '#4f5866', '#6a7484', '#8d98a8', '#b3bdcb', '#dfe6ee'];
const BLUE = ['#1c2646', '#2c3f74', '#3f5a98', '#5a78b8', '#86a2d8', '#bcd0f0'];
const FONDUE = ['#b84a08', '#e07a10', '#ffb21a', '#ffd04a', '#ffec96', '#fffbe0'];
const TIMBER = ['#1c100a', '#2e1c10', '#442a18', '#5e3a22', '#7c4e2e'];
const SWISS = ['#b88a2a', '#dcb23e', '#f0d060', '#f6dc6a', '#fdf0a8'];

// ───────────── periodic helpers ─────────────
/** Periodic value noise: lattice of n x n cells (n divides 64), smooth-stepped. Returns 0..1. */
function vnoise(x, y, n, seed = 0) {
  const cs = S / n, fx = wrap(x) / cs, fy = wrap(y) / cs;
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const h = (i, j) => hash2(((i % n) + n) % n, ((j % n) + n) % n, seed);
  const a = h(x0, y0), b = h(x0 + 1, y0), c = h(x0, y0 + 1), d = h(x0 + 1, y0 + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
/** Periodic voronoi with n x n jittered points. Returns {d1, d2, id, px, py} (distances in px, wrapped). */
function voronoi(x, y, n, seed = 0, jitter = 0.8) {
  const cs = S / n, cx = Math.floor(wrap(x) / cs), cy = Math.floor(wrap(y) / cs);
  let d1 = 1e9, d2 = 1e9, id = 0, bx = 0, by = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const gx = cx + i, gy = cy + j, wx = ((gx % n) + n) % n, wy = ((gy % n) + n) % n;
    const px = (gx + 0.5 + (hash2(wx, wy, seed) - 0.5) * jitter) * cs;
    const py = (gy + 0.5 + (hash2(wx, wy, seed + 77) - 0.5) * jitter) * cs;
    let dx = px - wrap(x), dy = py - wrap(y);
    const d = Math.hypot(dx, dy);
    if (d < d1) { d2 = d1; d1 = d; id = wy * n + wx; bx = dx; by = dy; } else if (d < d2) d2 = d;
  }
  return { d1, d2, id, dx: bx, dy: by };
}
/** Fill whole tile from fn(x,y) -> ink. */
function paint(fn) {
  const p = new PixBuf(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) p.set(x, y, fn(x, y));
  return p;
}
const pick = (arr, t) => arr[Math.max(0, Math.min(arr.length - 1, Math.floor(t * arr.length)))];
/** Wrapped primitives */
const wset = (p, x, y, c) => p.set(wrap(x), wrap(y), c);
function wdisc(p, cx, cy, r, c) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
    const u = x + 0.5 - cx, v = y + 0.5 - cy;
    if (u * u + v * v <= r * r) wset(p, x, y, c);
  }
}
/** Disc with light from upper-left: dark rim lower-right, highlight upper-left. */
function wball(p, cx, cy, r, ramp, hi) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
    const u = x + 0.5 - cx, v = y + 0.5 - cy, d = Math.hypot(u, v);
    if (d > r) continue;
    const l = 0.5 - (u + v) / (r * 2.2) - (d / r) * 0.15;     // brighter toward upper-left
    wset(p, x, y, pick(ramp, Math.max(0, Math.min(0.999, l))));
  }
  if (hi) wset(p, Math.round(cx - r * 0.4), Math.round(cy - r * 0.4), hi);
}

// ───────────── floors ─────────────
function floorDirt() {
  const R = pal(DIRT, { gloss: 0 });
  const p = paint((x, y) => {
    const n = vnoise(x, y, 8, 3) * 0.55 + vnoise(x, y, 16, 4) * 0.3 + hash2(x, y, 5) * 0.25;
    return pick(R, 0.12 + n * 0.62);
  });
  // cracks (wrapped, short meandering lines)
  for (let k = 0; k < 4; k++) {
    let x = hash2(k, 1, 11) * S, y = hash2(k, 2, 11) * S, a = hash2(k, 3, 11) * 6.28;
    for (let i = 0; i < 18; i++) {
      wset(p, Math.round(x), Math.round(y), R[0]);
      wset(p, Math.round(x) - 1, Math.round(y) - 1, R[3]);
      a += (hash2(k, i, 12) - 0.5) * 1.1; x += Math.cos(a); y += Math.sin(a);
    }
  }
  // crumbs
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(hash2(i, 1, 21) * S), y = Math.floor(hash2(i, 2, 21) * S);
    wset(p, x, y, R[4]); if (hash2(i, 3, 21) > 0.5) wset(p, x + 1, y, R[3]);
    wset(p, x + 1, y + 1, R[0]);
  }
  // pebbles
  const PEB = pal(['#2b2a30', '#4a4950', '#6b6a72', '#8f8d94', '#b3b0b6']);
  for (let i = 0; i < 9; i++) {
    const x = hash2(i, 1, 31) * S, y = hash2(i, 2, 31) * S, r = 1.6 + hash2(i, 3, 31) * 1.8;
    wdisc(p, x + 1, y + 1, r, R[0]);                     // cast shadow
    wball(p, x, y, r, PEB.slice(0, 5), PEB[4]);
  }
  return p;
}

function floorStone() {
  const R = pal(STONE, { gloss: 0.05 });
  const MORT = ink('#15151b', { gloss: 0 });
  // courses of heights, each with its own slab widths and offset
  const rows = [[0, 14], [14, 18], [32, 14], [46, 18]];
  const slabs = [[[0, 30], [30, 34]], [[0, 18], [18, 46]], [[0, 38], [38, 26]], [[0, 24], [24, 40]]];
  const p = new PixBuf(S, S);
  rows.forEach(([ry, rh], ri) => {
    slabs[ri].forEach(([sx, sw], si) => {
      const base = 0.35 + hash2(ri, si, 41) * 0.35;
      for (let y = 0; y < rh; y++) for (let x = 0; x < sw; x++) {
        const gx = sx + x, gy = ry + y;
        let t = base + (vnoise(gx, gy, 16, 9) - 0.5) * 0.35 + (hash2(gx, gy, 6) - 0.5) * 0.12;
        if (y === 0 || x === 0) t = 0.15;                                   // mortar gap
        else if (y === 1 || x === 1) t = Math.min(0.99, t + 0.28);          // lit upper-left bevel
        else if (y === rh - 1 || x === sw - 1) t = Math.max(0, t - 0.2);
        const c = (y === 0 || x === 0) ? MORT : pick(R, t);
        wset(p, gx, gy, c);
      }
    });
  });
  // wear scratches
  for (let i = 0; i < 14; i++) {
    const x = Math.floor(hash2(i, 1, 51) * S), y = Math.floor(hash2(i, 2, 51) * S), l = 2 + Math.floor(hash2(i, 3, 51) * 4);
    for (let k = 0; k < l; k++) { const c = p.get(wrap(x + k), wrap(y + (k >> 1))); if (c && c.r > 50) wset(p, x + k, y + (k >> 1), shade(c, 0.75)); }
  }
  return p;
}

function floorChecker() {
  const D = pal(MARBLE_D, { gloss: 0.62, spark: 0.06 });
  const L = pal(MARBLE_L, { gloss: 0.6, spark: 0.12 });
  const p = paint((x, y) => {
    const dark = (Math.floor(x / 32) + Math.floor(y / 32)) % 2 === 0;
    const R = dark ? D : L;
    const lx = x % 32, ly = y % 32;
    // marble veins: domain-warped diagonal bands
    const warp = vnoise(x, y, 8, dark ? 61 : 62) * 9;
    const v = Math.abs(Math.sin((x * 0.5 + y * 0.35 + warp) * Math.PI / 8 * 1) );
    const vein = v < 0.07 ? 1 : 0;
    let t = 0.42 + (vnoise(x, y, 16, dark ? 63 : 64) - 0.5) * 0.5;
    if (vein) t += dark ? 0.45 : -0.4;
    // bevelled joint: lit top/left edge, shadowed bottom/right
    if (lx === 0 || ly === 0) t = dark ? 0.0 : 0.05;
    else if (lx === 1 || ly === 1) t += 0.3;
    else if (lx === 31 || ly === 31) t -= 0.25;
    return pick(R, Math.max(0, Math.min(0.99, t)));
  });
  return p;
}

function floorCheeseTile() {
  const R = pal(CHEESE, { gloss: 0.22 });
  const HOLE = pal(['#5a3208', '#7a4a0c', '#9a5a0c', '#c47a14'], { gloss: 0.1 });
  const p = paint((x, y) => {
    const lx = x % 32, ly = y % 32;
    const sx = Math.floor(x / 32), sy = Math.floor(y / 32);
    let t = 0.45 + hash2(sx, sy, 71) * 0.2 + (vnoise(x, y, 16, 72) - 0.5) * 0.18;
    if (lx === 0 || ly === 0) return ink('#6a3c08', { gloss: 0 });
    if (lx === 1 || ly === 1) t += 0.28;
    else if (lx === 31 || ly === 31) t -= 0.24;
    return pick(R, Math.max(0, Math.min(0.99, t)));
  });
  // hole motifs: each slab gets one big hole + two small, with lit lower-right lip and dark upper-left depth
  const holes = [[[14, 14, 6], [26, 25, 2.5], [6, 25, 2]], [[12, 12, 3], [24, 20, 5.5], [6, 4, 2]], [[18, 12, 4], [6, 22, 3], [27, 25, 2]], [[16, 17, 6.5], [4, 6, 2], [27, 7, 2.5]]];
  [[0, 0], [32, 0], [0, 32], [32, 32]].forEach(([ox, oy], k) => {
    holes[k].forEach(([hx, hy, r]) => {
      const cx = ox + hx, cy = oy + hy;
      for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        const u = x + 0.5 - cx, v = y + 0.5 - cy, d = Math.hypot(u, v);
        if (d <= r) {
          const depth = (u + v < -r * 0.25) ? 0 : (u + v < r * 0.4 ? 1 : 2);   // upper-left wall is darkest
          wset(p, x, y, HOLE[depth]);
        } else if (d <= r + 1.1 && u + v > 0) wset(p, x, y, R[4]);               // lit lower-right lip
        else if (d <= r + 1.1) wset(p, x, y, R[1]);
      }
    });
  });
  return p;
}

function floorWood() {
  const G = 0.28;
  const R = pal(WOOD, { gloss: G });
  const SEAM = ink('#150a05', { gloss: 0 });
  const PH = 16;                                   // plank height; 4 planks per tile
  const p = paint((x, y) => {
    const row = Math.floor(y / PH), ly = y % PH;
    const off = Math.floor(hash2(row, 0, 81) * 64);
    const wx = x + off;
    const seamX = wrap(wx) < 1 && ((row & 1) === 0 || true);   // vertical butt seam once per row
    if (ly === 0) return SEAM;
    if (seamX) return SEAM;
    // grain: stretched noise along x, strong stripes
    const grain = vnoise(wx * 0.25 + row * 17, y * 4, 16, 82 + row);
    const grain2 = vnoise(wx, y * 2, 16, 90 + row);
    let t = 0.3 + grain * 0.28 + grain2 * 0.2 + hash2(row, 0, 83) * 0.12;
    if (ly === 1) t += 0.22;
    if (ly === PH - 1) t -= 0.16;
    if (wrap(wx) === 1) t += 0.15;
    // knots
    return pick(R, Math.max(0, Math.min(0.99, t)));
  });
  [[22, 6], [49, 38]].forEach(([kx, ky]) => {
    for (let j = -2; j <= 2; j++) for (let i = -3; i <= 3; i++) {
      const d = Math.hypot(i / 3, j / 2);
      if (d <= 1) wset(p, kx + i, ky + j, d > 0.6 ? R[1] : R[0]);
      else if (d < 1.5 && i < 0) wset(p, kx + i, ky + j, R[4]);
    }
  });
  return p;
}

function floorCarpet() {
  const R = pal(RED, { gloss: 0 });
  const G = pal(GOLD, { gloss: 0.04, spark: 0.05 });
  // 64px motif: gold double frame at the tile edge, quatrefoil-ish diamond in the middle
  const p = paint((x, y) => {
    const u = x - 31.5, v = y - 31.5;
    const dEdge = Math.min(x, y, 63 - x, 63 - y);
    const dia = Math.abs(u) + Math.abs(v);
    let c = null;
    if (dEdge === 3 || dEdge === 4) c = G[dEdge === 3 ? 3 : 2];
    else if (dEdge === 6) c = G[1];
    else if (dia >= 21 && dia <= 22) c = G[3];
    else if (dia >= 24 && dia <= 24) c = G[1];
    else if (dia < 8 && dia >= 6) c = G[2];
    else if (dia < 4) c = G[3];
    if (c) return c;
    // woven pile: checker of slightly different reds + fuzz
    const weave = ((x >> 1) + (y >> 1)) & 1;
    let t = 0.4 + weave * 0.14 + (hash2(x, y, 91) - 0.5) * 0.3;
    if (dia < 21) t += 0.08;
    return pick(R, Math.max(0, Math.min(0.99, t)));
  });
  // gold corner studs on the fold lines
  for (const [cx, cy] of [[8, 8], [55, 8], [8, 55], [55, 55]]) { wset(p, cx, cy, G[4]); wset(p, cx + 1, cy, G[2]); wset(p, cx, cy + 1, G[2]); wset(p, cx + 1, cy + 1, G[1]); }
  return p;
}

function floorGrate() {
  const BAR = pal(STEEL, { gloss: 0.7, spark: 0.05 });
  const VOID = pal(['#05060a', '#090b12', '#0d101a'], { gloss: 0 });
  const PITCH = 16, W = 4;                      // 4 bar cells per tile, 4px wide bars
  const p = paint((x, y) => {
    const bx = x % PITCH, by = y % PITCH;
    const onV = bx < W, onH = by < W;
    if (onV || onH) {
      // horizontal bars on top of vertical; lit upper-left edges
      let t = 0.5;
      if (onH) { t = by === 0 ? 0.95 : by === 1 ? 0.7 : by === 2 ? 0.45 : 0.12; }
      else { t = bx === 0 ? 0.85 : bx === 1 ? 0.62 : bx === 2 ? 0.4 : 0.1; }
      t += (hash2(x, y, 101) - 0.5) * 0.08;
      return pick(BAR, Math.max(0, Math.min(0.99, t)));
    }
    // gap: faint far-away structure in the dark
    const t = vnoise(x, y, 8, 102);
    // inner shadow right under bars
    return t > 0.72 ? VOID[2] : (bx === W || by === W) ? VOID[0] : VOID[1];
  });
  // rivets where bars cross
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    const x = i * PITCH, y = j * PITCH;
    wset(p, x + 1, y + 1, BAR[6]); wset(p, x + 2, y + 2, BAR[1]);
  }
  return p;
}

function floorGold() {
  const GO = pal(GOLD, { gloss: 0.5, spark: 0.95 });
  const FOIL = pal(['#b8761a', '#e8a828', '#ffd23e', '#fff0a0'], { gloss: 0.8, spark: 1.0 });
  // dense coin packing on a 4x4 jittered voronoi: each cell is a coin disc with rim + embossed centre
  const p = paint((x, y) => {
    const v = voronoi(x, y, 6, 111, 0.55);
    const r = 5.6;
    const coin = hash2(v.id, 1, 112);
    const tilt = hash2(v.id, 2, 112);
    const edge = v.d1;
    if (edge > r + 0.4) return ink('#4a2806', { gloss: 0.2, spark: 0.1 });       // dark gap between coins
    if (edge > r - 1) {
      // rim: bright on the upper-left, dark on lower-right
      const lit = (-v.dx - v.dy) > 0;
      return lit ? GO[4] : GO[2];
    }
    // face
    // calm face: low-contrast dome shading so the floor reads as gold at 1x (no busy emboss ring)
    let t = 0.56 - (-v.dx - v.dy) / 40 + (tilt - 0.5) * 0.12;
    return pick(GO, Math.max(0.3, Math.min(0.8, t)));
  });
  // crumpled foil flecks
  for (let i = 0; i < 8; i++) {
    const x = Math.floor(hash2(i, 1, 121) * S), y = Math.floor(hash2(i, 2, 121) * S);
    wset(p, x, y, FOIL[3]); wset(p, x + 1, y, FOIL[2]);
  }
  return p;
}

function floorBlue() {
  const R = pal(BLUE, { gloss: 0.12, spark: 0.1 });
  const VEIN = ink('#cfe0ff', { gloss: 0.2, spark: 0.5 });
  const p = paint((x, y) => {
    const v = voronoi(x, y, 5, 131, 0.7);
    const gap = v.d2 - v.d1;
    if (gap < 1.4) return ink('#0e1430', { gloss: 0 });                              // grout
    let t = 0.38 + hash2(v.id, 0, 132) * 0.22 + (vnoise(x, y, 16, 133) - 0.5) * 0.2;
    // dome shading: lit upper-left of each cobble
    t += (-v.dx - v.dy) / 40;
    if (gap < 2.6) t -= 0.15;
    // blue veins: wavy bands
    const w = Math.sin((x + vnoise(x, y, 8, 134) * 14) * Math.PI / 8 + y * Math.PI / 16);
    if (Math.abs(w) < 0.1 && hash2(v.id, 5, 135) > 0.35) return hash2(x, y, 136) > 0.85 ? VEIN : ink(BLUE[5], { gloss: 0.15, spark: 0.2 });
    return pick(R, Math.max(0, Math.min(0.99, t)));
  });
  for (let i = 0; i < 10; i++) wset(p, Math.floor(hash2(i, 1, 141) * S), Math.floor(hash2(i, 2, 141) * S), ink('#ffffff', { spark: 0.9, gloss: 0.3 }));
  return p;
}

function floorFondue() {
  const FR = 4, TAU = Math.PI * 2;
  const R = pal(FONDUE, { emit: 0.85 });
  const HOT = ink(FONDUE[5], { emit: 1 });
  const DARK = ink(FONDUE[0], { emit: 0.55 });
  const frames = [];
  // bubbles: fixed positions; each has a phase offset in quarter-steps so over 4 frames it grows, pops, gone, regrows
  const bubbles = [];
  for (let i = 0; i < 9; i++) bubbles.push({ x: hash2(i, 1, 151) * S, y: hash2(i, 2, 151) * S, r: 4.5 + hash2(i, 3, 151) * 3, ph: Math.floor(hash2(i, 4, 151) * 4) });
  for (let f = 0; f < FR; f++) {
    const ph = (f / FR) * TAU;
    const p = paint((x, y) => {
      // flowing lava-lamp field: periodic sines with integer wavenumbers, phase-driven so frame 4 -> frame 0 is seamless
      const a = Math.sin((x / S) * TAU * 2 + ph) + Math.sin((y / S) * TAU * 3 - ph + 1.3) + Math.sin(((x + y) / S) * TAU * 2 + ph * 1 + 0.7) + Math.sin(((x - 2 * y) / S) * TAU - ph);
      const n = (a + 4) / 8 + (vnoise(x, y, 16, 152) - 0.5) * 0.18;
      return pick(R, Math.max(0, Math.min(0.99, 0.28 + n * 0.62)));
    });
    // bubbles
    for (const b of bubbles) {
      const k = (f + b.ph) % FR;                         // 0 swelling, 1 big, 2 popping ring, 3 settled dimple
      const r = [b.r * 0.45, b.r, b.r * 1.15, b.r * 0.5][k];
      if (k === 0 || k === 1) {
        wdisc(p, b.x + 0.5, b.y + 0.5, r + 1, DARK);                              // rim shadow
        wball(p, b.x, b.y, r, R.slice(1), HOT);
        wset(p, Math.round(b.x - r * 0.45), Math.round(b.y - r * 0.45), HOT);
      } else if (k === 2) {
        for (let a = 0; a < 16; a++) wset(p, Math.round(b.x + Math.cos(a / 16 * TAU) * r), Math.round(b.y + Math.sin(a / 16 * TAU) * r), a % 2 ? HOT : R[4]);   // popped ring
        wdisc(p, b.x, b.y, r - 1.8, R[1]);
      } else {
        for (let a = 0; a < 12; a++) wset(p, Math.round(b.x + Math.cos(a / 12 * TAU) * r), Math.round(b.y + Math.sin(a / 12 * TAU) * r), R[4]);
      }
    }
    // charred skin flecks that drift one pixel per frame (drift wraps, loop is exact over 4 frames x 16px/4... use 16px period)
    for (let i = 0; i < 7; i++) {
      const x = hash2(i, 1, 161) * S + f * 16, y = hash2(i, 2, 161) * S;
      wset(p, Math.floor(x), Math.floor(y), DARK); wset(p, Math.floor(x) + 1, Math.floor(y), DARK);
    }
    frames.push(p);
  }
  return frames;
}

// ───────────── ceilings ─────────────
function ceilStone() {
  const R = pal(STONE.map((c) => shade(c, 0.62)), { gloss: 0.03 });
  const p = paint((x, y) => {
    // groin vault: diagonal ribs along both diagonals (periodic), plaster-ish stone blocks in the webs
    const d1 = wrap(x - y), d2 = wrap(x + y);
    const near = Math.min(d1, 64 - d1), near2 = Math.min(d2, 64 - d2);
    const rib = Math.min(near, near2);
    let t = 0.4 + (vnoise(x, y, 16, 171) - 0.5) * 0.3 + (hash2(x, y, 172) - 0.5) * 0.1;
    // block coursing inside webs
    const bx = (x + ((y >> 4) & 1) * 8) % 16, by = y % 16;
    if (by === 0 || bx === 0) t -= 0.22;
    else if (by === 1 || bx === 1) t += 0.08;
    if (rib < 4) {
      t = 0.5 + (4 - rib) * 0.06;
      if (rib === 0) t -= 0.18;
      if (rib >= 3) t -= 0.25;
      if ((near < near2 ? d1 < 32 : d2 < 32) && rib === 1) t += 0.15;    // lit side
    }
    return pick(R, Math.max(0, Math.min(0.99, t * 0.9)));
  });
  return p;
}

function ceilWood() {
  const T = pal(TIMBER, { gloss: 0.18 });
  const PL = pal(['#24140b', '#38200f', '#4e2e18', '#664024'], { gloss: 0.16 });
  const p = paint((x, y) => {
    const band = y % 32;
    if (band < 12) {                               // beam, shaded as a rounded square-section log
      const ly = band;
      let t = 0.35 + (vnoise(x * 0.3, y * 3, 16, 181) - 0.5) * 0.35 + (vnoise(x, y, 8, 182) - 0.5) * 0.15;
      if (ly === 0) t = 0.95; else if (ly === 1) t += 0.25; else if (ly >= 10) t -= 0.18; if (ly === 11) t = 0;
      const k = x % 32;
      if (k === 0) t = 0.0;
      return pick(T, Math.max(0, Math.min(0.99, t)));
    }
    // planks between beams, running perpendicular, each 8px wide
    const px = x % 8, ly = band - 12;
    let t = 0.3 + (vnoise(x * 3, y * 0.4, 16, 183) - 0.5) * 0.4;
    if (px === 0) t = 0.0; else if (px === 1) t += 0.2;
    if (ly < 3) t *= 0.45;                        // shadow under the beam
    return pick(PL, Math.max(0, Math.min(0.99, t)));
  });
  // iron nails along planks
  for (let i = 0; i < 8; i++) for (const y of [24, 36]) wset(p, i * 8 + 4, y, ink('#6a7484', { gloss: 0.6 }));
  return p;
}

function ceilCheese() {
  const R = pal(SWISS, { gloss: 0.12 });
  const IN = pal(['#7a4a0c', '#9a6410', '#c8901e'], { gloss: 0.05 });
  const p = paint((x, y) => {
    const t = 0.45 + (vnoise(x, y, 8, 191) - 0.5) * 0.3 + (vnoise(x, y, 16, 192) - 0.5) * 0.2 + (hash2(x, y, 193) - 0.5) * 0.07;
    return pick(R, Math.max(0, Math.min(0.99, t)));
  });
  const H = [[10, 12, 7], [38, 8, 5], [54, 24, 8], [24, 34, 6], [8, 48, 5], [44, 50, 7], [58, 56, 3], [28, 58, 3], [20, 18, 2.5], [62, 4, 3]];
  for (const [cx, cy, r] of H) {
    for (let y = Math.floor(cy - r - 2); y <= Math.ceil(cy + r + 2); y++) for (let x = Math.floor(cx - r - 2); x <= Math.ceil(cx + r + 2); x++) {
      const u = x + 0.5 - cx, v = y + 0.5 - cy, d = Math.hypot(u, v);
      if (d <= r) wset(p, x, y, (u + v < 0) ? IN[0] : (u + v < r * 0.7 ? IN[1] : IN[2]));
      else if (d <= r + 1.2) wset(p, x, y, (u + v > 0) ? R[4] : R[1]);
    }
  }
  return p;
}

function steelPanels(lamp) {
  const R = pal(STEEL, { gloss: 0.5 });
  const p = paint((x, y) => {
    const lx = x % 32, ly = y % 32;
    let t = 0.42 + (vnoise(x, y, 8, 201) - 0.5) * 0.14 + (hash2(x, y, 202) - 0.5) * 0.06;
    if (lx === 0 || ly === 0) return ink('#0c0e13', { gloss: 0.1 });
    if (lx === 1 || ly === 1) t += 0.35;
    else if (lx === 31 || ly === 31) t -= 0.2;
    else if (lx === 2 || ly === 2) t += 0.08;
    // brushed streaks
    if (hash2(x >> 3, y, 203) > 0.9) t += 0.07;
    return pick(R, Math.max(0, Math.min(0.99, t)));
  });
  for (const ox of [0, 32]) for (const oy of [0, 32]) for (const [bx, by] of [[4, 4], [26, 4], [4, 26], [26, 26]]) {
    const x = ox + bx, y = oy + by;
    wset(p, x + 1, y + 2, ink(OUT, { gloss: 0 })); wset(p, x + 2, y + 1, ink(OUT)); wset(p, x + 2, y + 2, ink(OUT));
    wset(p, x, y, R[6]); wset(p, x + 1, y, R[5]); wset(p, x, y + 1, R[5]); wset(p, x + 1, y + 1, R[3]);
  }
  if (lamp) {
    // 24x24 recessed lamp centred on the tile (steel frame, hot emissive diffuser)
    const L = ink('#fff4c8', { emit: 1 }), L2 = ink('#ffe08a', { emit: 0.9 }), L3 = ink('#ffc850', { emit: 0.75 });
    p.rect(18, 18, 28, 28, ink('#0c0e13'));
    p.rect(19, 19, 26, 26, R[5]); p.rect(20, 20, 24, 24, R[1]);
    p.hline(19, 19, 26, R[6]); p.vline(19, 19, 26, R[6]);
    p.rect(21, 21, 22, 22, L3);
    p.rect(22, 22, 20, 20, L2);
    p.rect(24, 24, 16, 16, L);
    for (let i = 0; i < 4; i++) { p.hline(22, 27 + i * 4, 20, L2); }       // diffuser ribs
    p.hline(21, 42, 22, ink('#c08a20', { emit: 0.6 })); p.vline(42, 21, 22, ink('#c08a20', { emit: 0.6 }));
  }
  return p;
}

/**
 * Polish pass: cellar flats were fully matte, so floors and ceilings showed no reflections or glints.
 * Raise gloss to at least `gloss` on the lighter texels (cracks and joints stay matte) and add sparse sparkles.
 */
function sheen(p, gloss, sparkOneIn, seed) {
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    const i = (y * p.w + x) * 4;
    const lum = (p.rgba[i] * 0.3 + p.rgba[i + 1] * 0.59 + p.rgba[i + 2] * 0.11) / 255;
    const g = Math.round(255 * gloss * Math.min(1, 0.35 + lum * 2.2));
    if (p.mat[i + 1] < g) p.mat[i + 1] = g;
    let h = (x * 374761393 + y * 668265263 + seed * 2246822519) >>> 0;
    h = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
    if (sparkOneIn && h % sparkOneIn === 0 && lum > 0.12) p.mat[i + 2] = Math.max(p.mat[i + 2], 170);
  }
  return p;
}

export function build() {
  return {
    'flat.floor_dirt': sheen(floorDirt(), 0.13, 150, 1),
    'flat.floor_stone': sheen(floorStone(), 0.2, 110, 2),
    'flat.floor_checker': floorChecker(),
    'flat.floor_cheese_tile': floorCheeseTile(),
    'flat.floor_wood': floorWood(),
    'flat.floor_carpet': floorCarpet(),
    'flat.floor_grate': floorGrate(),
    'flat.floor_gold': floorGold(),
    'flat.floor_blue': floorBlue(),
    'flat.floor_fondue': floorFondue(),
    'flat.ceil_stone': sheen(ceilStone(), 0.12, 220, 3),
    'flat.ceil_wood': ceilWood(),
    'flat.ceil_cheese': ceilCheese(),
    'flat.ceil_panel': steelPanels(false),
    'flat.ceil_lamp_panel': steelPanels(true),
  };
}
