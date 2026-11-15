// fx — effect sprites (64x64, centred, transparent). Owner: art-fx.
// Exports build() -> { [name]: PixBuf[] }. Deterministic (hash2 only). Light from the upper-left.
import { PixBuf, ink, shade, mix, hash2 } from './pixbuf.js';

const S = 64;
const OUT = '#1a1420';
const TAU = Math.PI * 2;
const clampi = (v, a, b) => (v < a ? a : v > b ? b : v);
const lay = () => new PixBuf(S, S);

// ---------- helpers ----------
const E = (c, emit, extra = {}) => ink(c, { emit, ...extra });

/** Irregular blob: radius modulated by hash noise around the angle. Calls shadeFn(nx,ny,d) -> ink|null per pixel. */
function blob(p, cx, cy, r, seed, wob, shadeFn, squash = 1) {
  const R = Math.ceil(r * (1 + wob)) + 1;
  for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++)
    for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
      const dx = x + 0.5 - cx, dy = (y + 0.5 - cy) / squash;
      const d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      // smooth angular noise from 6 lobes + a hash term per 22.5deg sector
      const k = Math.floor(((a + Math.PI) / TAU) * 16);
      const f = ((a + Math.PI) / TAU) * 16 - k;
      const n0 = hash2(k, 7, seed), n1 = hash2((k + 1) % 16, 7, seed);
      const n = n0 + (n1 - n0) * (f * f * (3 - 2 * f));
      const rr = r * (1 + (n - 0.5) * 2 * wob);
      if (d > rr) continue;
      const c = shadeFn(dx / rr, dy / rr, d / rr);
      if (c) p.set(x, y, c);
    }
}
/** Lit-from-upper-left level 0..1 for a sphere-ish normal. */
function lit(nx, ny) {
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  return clampi(0.5 + (-nx * 0.5 - ny * 0.6) * 0.55 + nz * 0.2, 0, 0.999);
}
const pick = (R, l) => R[Math.floor(l * R.length)];

/** Soft halo: concentric alpha steps (hard-edged rings with partial alpha). */
function halo(p, cx, cy, r, color, emit, a0 = 120, steps = 4) {
  for (let i = 0; i < steps; i++) {
    const rr = r * (1 - i / steps);
    const a = Math.round(a0 * ((i + 1) / steps) ** 1.4 / (steps > 1 ? 1 : 1) * 0.55);
    p.ellipse(cx, cy, rr, rr, ink(color, { emit, a }));
  }
}
/** Pointed star with `n` points. */
function star(p, cx, cy, ro, ri, n, rot, c) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n, r = i % 2 ? ri : ro;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  p.poly(pts, c);
}
/** Tapered ray from (cx,cy) outward at angle a, length from r0 to r1, base half-width w. */
function ray(p, cx, cy, a, r0, r1, w, c) {
  const ca = Math.cos(a), sa = Math.sin(a), px = -sa, py = ca;
  p.poly([[cx + ca * r0 + px * w, cy + sa * r0 + py * w], [cx + ca * r1, cy + sa * r1], [cx + ca * r0 - px * w, cy + sa * r0 - py * w]], c);
}
/** Outline only opaque, fully-solid pixels so glow halos stay soft. */
function solidOutline(p, c = OUT) {
  const k = ink(c), hits = [];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (p.rgba[(y * S + x) * 4 + 3] !== 0) continue;
    if (p.has(x - 1, y) || p.has(x + 1, y) || p.has(x, y - 1) || p.has(x, y + 1)) hits.push(x, y);
  }
  for (let i = 0; i < hits.length; i += 2) p.set(hits[i], hits[i + 1], k);
}
/** Remove pixels randomly (dissolve), threshold 0..1 — hard alpha. */
function dissolve(p, t, seed) {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++)
    if (p.rgba[(y * S + x) * 4 + 3] && hash2(x >> 1, y >> 1, seed) < t) { const o = (y * S + x) * 4; p.rgba.fill(0, o, o + 4); p.mat.fill(0, o, o + 4); }
}

// ---------- palettes (dark -> light) ----------
const PINK = ['#8a2456', '#c8407c', '#f06a9e', '#ffa6c6', '#ffd4e4'];
const FIRE = ['#8a1c0c', '#d2420e', '#f2801a', '#ffb62a', '#ffe36a', '#fffbd0'];
const CHEZ = ['#b4560a', '#e88a12', '#f6b222', '#ffd84a', '#fff09a'];
const SMOKE = ['#3e414a', '#5a5e68', '#7c808a', '#a2a5ae', '#c8cad0'];
const DUST = ['#5a5348', '#7a7264', '#9c9484', '#bdb6a6', '#dcd6c8'];
const CRUMB = ['#a8680a', '#d89412', '#f6c42a', '#ffe468'];
const FUR = ['#4a4c54', '#6e7078', '#9496a0', '#b8bac2', '#dcdee4'];

// ---------- yarnball ----------
function yarnball(f) {
  const p = lay(), cx = 36, cy = 32, r = 13;
  // trailing thread (left), wavy, wiggles with frame
  const th = ink('#f06a9e', { emit: 0.12 }), thd = ink('#c8407c', { emit: 0.08 });
  let px = cx - r + 2, py = cy + 4;
  for (let i = 0; i < 20; i++) {
    const nx = px - 1, ny = cy + 4 + Math.sin(i * 0.7 + f * 1.3) * (2 + i * 0.12) + i * 0.1;
    p.line(px, py, nx, ny, i % 5 === 4 ? thd : th); px = nx; py = ny;
  }
  p.set(px, py + 1, th); p.set(px - 1, py + 2, thd);
  // ball body
  blob(p, cx, cy, r, 3, 0.0, (nx, ny) => ink(pick(PINK, lit(nx, ny)), { emit: 0.12 }));
  // wound strands: rotating tilted rings clipped to the sphere
  const rot = (f * Math.PI) / 4;
  for (let k = 0; k < 3; k++) {
    const tilt = rot + (k * Math.PI) / 3 * 1.0;
    for (let t = 0; t < TAU; t += 0.04) {
      const ex = Math.cos(t) * (r - 0.5), ey = Math.sin(t) * (r - 0.5) * 0.45;
      const x = cx + ex * Math.cos(tilt) - ey * Math.sin(tilt), y = cy + ex * Math.sin(tilt) + ey * Math.cos(tilt);
      if (Math.sin(t) < -0.1) continue; // back half hidden
      const l = lit((x - cx) / r, (y - cy) / r);
      const c = pick(PINK, clampi(l - 0.28, 0, 0.99));
      p.set(x, y, ink(c, { emit: 0.1 }));
    }
  }
  // highlight
  p.set(cx - 5, cy - 6, ink('#fff0f6', { emit: 0.25 })); p.set(cx - 4, cy - 6, ink('#ffd4e4', { emit: 0.2 })); p.set(cx - 5, cy - 5, ink('#ffd4e4', { emit: 0.2 }));
  // thread tip at top right of ball
  p.line(cx + 6, cy - 10, cx + 9, cy - 13, th);
  solidOutline(p);
  return p;
}

// ---------- cheeseball (molten flaming cheese glob) ----------
function cheeseball(f) {
  const p = lay(), cx = 32, cy = 36;
  halo(p, cx, cy - 2, 28, '#ff9a1a', 0.7, 150, 5);
  // flame tongues rising/trailing up-left, flicker per frame
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.34 + (f ? 0.1 : -0.1) * (i % 2 ? 1 : -1);
    const len = 15 + hash2(i, f, 11) * 9 + (i === 3 ? 4 : 0);
    ray(p, cx, cy - 2, a, 6, 6 + len, 4.5 - Math.abs(i - 3) * 0.5, E(i % 2 ? '#f2801a' : '#d2420e', 0.8));
    ray(p, cx, cy - 2, a, 6, 6 + len * 0.62, 2.6, E('#ffb62a', 0.9));
  }
  // glob
  blob(p, cx, cy, 13, 5 + f, 0.1, (nx, ny, d) => {
    const l = lit(nx, ny);
    return E(pick(CHEZ, clampi(l * 0.85 + 0.15, 0, 0.99)), 0.75 + l * 0.25, { gloss: 0.3 });
  });
  // holes (darker molten pockets) and hot core
  p.ellipse(cx + 6, cy + 3, 2.4, 1.6, E('#e88a12', 0.8)); p.ellipse(cx + 1, cy + 8, 1.8, 1.2, E('#e88a12', 0.8)); p.set(cx + 7, cy - 2, E('#e88a12', 0.8));
  p.ellipse(cx - 3, cy - 3, 4.5, 4, E('#fff09a', 1)); p.ellipse(cx - 4, cy - 4, 2.2, 2, E('#ffffff', 1));
  // dripping bits
  p.rect(cx + 7 - f * 2, cy + 13, 2, 3, E('#f6b222', 0.9)); p.rect(cx - 8 + f, cy + 14, 2, 2, E('#e88a12', 0.9));
  solidOutline(p, '#5a1e08');
  return p;
}

// ---------- explosion ----------
function explosion(f) {
  const p = lay(), cx = 32, cy = 32;
  const fire = (r, seed, wob, lvl, emit, core) => {
    blob(p, cx, cy, r, seed, wob, (nx, ny, d) => {
      const l = clampi(lit(nx, ny) * 0.55 + (1 - d) * 0.7 - 0.2 + lvl, 0, 0.999);
      return E(pick(FIRE, l), emit * (0.6 + l * 0.4));
    });
    if (core > 0) blob(p, cx - 1, cy - 1, core, seed + 9, 0.18, () => E('#fffbd0', 1));
  };
  if (f === 0) { // white-yellow flash
    halo(p, cx, cy, 24, '#ffe36a', 1, 160, 4);
    for (let i = 0; i < 8; i++) ray(p, cx, cy, i * (TAU / 8) + 0.2, 4, i % 2 ? 17 : 26, 2.5, E('#fff3a0', 1));
    star(p, cx, cy, 12, 6, 8, 0.1, E('#ffffff', 1));
    p.circle(cx, cy, 7, E('#ffffff', 1));
  } else if (f === 1) {
    halo(p, cx, cy, 29, '#ff8a1a', 0.9, 150, 4);
    fire(21, 21, 0.2, -0.1, 1, 9);
  } else if (f === 2) {
    halo(p, cx, cy, 31, '#ff8a1a', 0.8, 140, 4);
    fire(27, 22, 0.25, 0, 0.95, 11);
    for (let i = 0; i < 6; i++) { const a = i * 1.05 + 0.3; p.rect(cx + Math.cos(a) * 28 - 1, cy + Math.sin(a) * 28 - 1, 3, 3, E('#ffd84a', 1)); }
  } else if (f === 3) { // fire breaking up, smoke rim
    const R = 28;
    blob(p, cx, cy, R, 33, 0.22, (nx, ny, d) => (d > 0.62 ? ink(pick(SMOKE, lit(nx, ny) * 0.9), { gloss: 0 }) : E(pick(FIRE, clampi(0.45 - d * 0.1 + lit(nx, ny) * 0.25, 0, 0.99)), 0.85)));
    blob(p, cx - 1, cy - 1, 8, 34, 0.25, () => E('#ffe36a', 1));
    for (let i = 0; i < 7; i++) { const a = i * 0.9 + 0.5; p.rect(cx + Math.cos(a) * 25, cy + Math.sin(a) * 25, 3, 3, ink(CRUMB[2], { emit: 0.5 })); }
  } else if (f === 4) { // smoke ring with crumbs
    blob(p, cx, cy, 29, 44, 0.16, (nx, ny, d) => (d > 0.5 ? ink(pick(SMOKE, lit(nx, ny)), { gloss: 0 }) : (d > 0.38 ? E('#d2420e', 0.7) : null)));
    for (let i = 0; i < 9; i++) { const a = i * 0.7 + 0.2, r = 22 + hash2(i, 3, 5) * 8; p.rect(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 3, 3, ink(CRUMB[1 + (i & 1)], { emit: 0.55 })); }
    p.set(cx - 2, cy - 1, E('#ffb62a', 0.9)); p.set(cx + 3, cy + 2, E('#f2801a', 0.9));
  } else { // faint ring, drifting crumbs
    blob(p, cx, cy, 30, 55, 0.14, (nx, ny, d) => (d > 0.66 ? ink(pick(SMOKE, lit(nx, ny) * 0.8), { gloss: 0 }) : null));
    solidOutline(p, OUT); dissolve(p, 0.4, 66);
    for (let i = 0; i < 8; i++) { const a = i * 0.8 + 0.6, r = 26 + hash2(i, 9, 5) * 6; p.rect(cx + Math.cos(a) * r, cy + Math.sin(a) * r + 2, 2, 2, ink(CRUMB[1], { emit: 0.4 })); }
  }
  solidOutline(p, f >= 3 ? OUT : '#5a1408');
  return p;
}

// ---------- puff (grey smoke/dust) ----------
function puff(f) {
  const p = lay(), cx = 32, cy = 36;
  const sizes = [8, 12, 15, 17], r = sizes[f];
  const lobes = [[0, 0, 1], [-0.55, 0.15, 0.7], [0.55, 0.2, 0.7], [-0.1, -0.5, 0.65], [0.3, 0.45, 0.55]];
  lobes.forEach(([ox, oy, k], i) => {
    const sp = f * 0.2 + 0.4;
    blob(p, cx + ox * r * (0.6 + sp), cy + oy * r * (0.6 + sp) - f * 0.5, r * k * 0.7, 70 + i, 0.12, (nx, ny) => ink(pick(f < 2 ? SMOKE : DUST, lit(nx, ny))));
  });
  solidOutline(p, f === 3 ? '#4a4640' : OUT);
  if (f >= 2) dissolve(p, [0, 0, 0.14, 0.4][f], 77 + f);
  return p;
}

// ---------- spark (bullet impact) ----------
function spark(f) {
  const p = lay(), cx = 32, cy = 32;
  const R = [14, 22, 26][f];
  if (f < 2) halo(p, cx, cy, R + 2, '#ffd84a', 1, 120 - f * 20, 3);
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i * TAU) / n + 0.25 + f * 0.12, long = i % 2 === 0;
    const r1 = (long ? R : R * 0.62) * (0.85 + hash2(i, f, 4) * 0.3);
    if (f === 2) ray(p, cx, cy, a, R * 0.45, r1, 1.1, E('#ffd84a', 1));
    else ray(p, cx, cy, a, 2, r1, f ? 1.8 : 2.6, E(long ? '#fff3a0' : '#ffd84a', 1, { spark: 0.8 }));
  }
  if (f < 2) { p.circle(cx, cy, [5, 3][f], E('#ffffff', 1)); p.circle(cx, cy, [3, 1.6][f], E('#ffffff', 1)); }
  else for (let i = 0; i < 6; i++) p.set(cx + Math.cos(i * 1.2) * 12, cy + Math.sin(i * 1.2) * 12, E('#ffffff', 1));
  return p;
}

// ---------- crumbs (yellow cheese crumbs) ----------
function crumbs(f) {
  const p = lay(), cx = 32, cy = 32;
  const n = 11, spread = [10, 19, 26][f];
  for (let i = 0; i < n; i++) {
    const a = i * 2.4 + 0.3 + hash2(i, 1, 2) * 0.5, r = spread * (0.45 + hash2(i, 2, 2) * 0.6);
    const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r + f * f * 1.4);
    const sz = (i % 3 === 0 ? 4 : i % 3 === 1 ? 3 : 2) - (f === 2 && i % 2 ? 1 : 0);
    p.rect(x, y, sz, sz, ink(CRUMB[1], { emit: 0.15 }));
    p.rect(x, y, Math.max(1, sz - 1), Math.max(1, sz - 1), ink(CRUMB[3], { emit: 0.2, spark: 0.3 }));
    if (sz >= 4) p.set(x + 1, y + 1, ink(CRUMB[0])); // hole
    p.set(x + sz - 1, y + sz - 1, ink(CRUMB[0]));
  }
  if (f === 0) { p.circle(cx, cy, 4, ink(CRUMB[2], { emit: 0.3 })); p.circle(cx - 1, cy - 1, 2, ink(CRUMB[3], { emit: 0.4 })); }
  solidOutline(p);
  return p;
}

// ---------- fur (grey tufts) ----------
function tuft(p, x, y, ang, len, w) {
  // three tapered curved wisps fanning from one root
  for (let k = -1; k <= 1; k++) {
    const a = ang + k * 0.2, L = len * (k === 0 ? 1.2 : 0.8);
    const ca = Math.cos(a), sa = Math.sin(a), bend = k * 0.12;
    const pts = [];
    for (let i = 0; i <= 5; i++) { const t = i / 5, d = L * t, off = bend * d * t;
      pts.push([x + ca * d - sa * off, y + sa * d + ca * off, (1 - t) * (w * 0.45) + 0.4]); }
    p.poly([...pts.map(([px, py, hw]) => [px - sa * hw, py + ca * hw]), ...pts.reverse().map(([px, py, hw]) => [px + sa * hw, py - ca * hw])], ink(FUR[2]));
    const [ex, ey] = pts[0];
    p.set(ex, ey, ink(FUR[4])); p.set(ex - ca, ey - sa, ink(FUR[3]));
  }
  p.set(x, y, ink(FUR[1])); p.set(x + 1, y, ink(FUR[1])); p.set(x, y + 1, ink(FUR[1]));
}
function fur(f) {
  const p = lay(), cx = 32, cy = 32;
  const n = [9, 11, 9][f], spread = [7, 13, 19][f];
  if (f < 2) { // soft puff body of fluff under the tufts
    const R = f === 0 ? 9 : 8;
    p.circle(cx, cy, R, ink(FUR[2])); p.circle(cx - 2, cy - 2, R * 0.6, ink(FUR[3])); p.circle(cx - 3, cy - 3, R * 0.25, ink(FUR[4]));
  }
  for (let i = 0; i < n; i++) {
    const a = i * 0.7 + 0.4, r = spread * (0.5 + hash2(i, 5, 3) * 0.55);
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.9 + f * 3;
    tuft(p, x, y, a + 0.2 + f * 0.4, 7 + (i % 3) * 2, 6);
  }
  solidOutline(p);
  return p;
}

// ---------- sparkle (four-point twinkle) ----------
function sparkle(f) {
  const p = lay(), cx = 32, cy = 32;
  const R = [9, 17, 24, 13][f], fade = [1, 1, 0.85, 0.7][f];
  halo(p, cx, cy, R * 0.9, '#fff3b0', 1, 90 * fade, 3);
  const w = [1.6, 2.4, 3, 2][f];
  for (let i = 0; i < 4; i++) ray(p, cx, cy, (i * Math.PI) / 2, 0, R, w, E(i % 2 ? '#ffe98a' : '#fff6c8', 1, { spark: 1 }));
  if (f === 2) for (let i = 0; i < 4; i++) ray(p, cx, cy, Math.PI / 4 + (i * Math.PI) / 2, 0, R * 0.38, 1.2, E('#ffd23e', 1));
  p.circle(cx, cy, [1.8, 2.8, 3.4, 2.2][f], E('#ffffff', 1));
  if (f === 3) { p.set(cx + 10, cy - 9, E('#ffffff', 1)); p.set(cx - 12, cy + 8, E('#ffe98a', 1)); }
  return p;
}

// ---------- laser_dot ----------
function laser_dot(f) {
  const p = lay(), cx = 32, cy = 32;
  halo(p, cx, cy, [15, 18][f], '#ff2030', 1, 130, 5);
  p.circle(cx, cy, [6, 7][f], E('#ff1428', 1));
  p.circle(cx, cy, [4, 5][f], E('#ff5a50', 1));
  p.circle(cx - 0.5, cy - 0.5, 2.2, E('#ffffff', 1));
  if (f) { p.set(cx - 9, cy, E('#ff5a50', 1)); p.set(cx + 9, cy, E('#ff5a50', 1)); p.set(cx, cy - 9, E('#ff5a50', 1)); p.set(cx, cy + 9, E('#ff5a50', 1)); }
  return p;
}

// ---------- stun (three little stars orbiting) ----------
function stun(f) {
  const p = lay(), cx = 32, cy = 32;
  const rx = 22, ry = 8, base = f * (TAU / 6);
  // faint orbit trail dots
  for (let t = 0; t < TAU; t += 0.35) p.set(cx + Math.cos(t) * rx, cy + Math.sin(t) * ry, ink('#ffe98a', { emit: 0.5, a: 110 }));
  const stars = [];
  for (let i = 0; i < 3; i++) { const t = base + (i * TAU) / 3; stars.push({ x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry, z: Math.sin(t), t }); }
  stars.sort((a, b) => a.z - b.z);
  for (const s of stars) {
    const big = s.z > 0 ? 1 : 0.78, ro = 9 * big;
    star(p, s.x, s.y, ro + 1, ro * 0.42, 5, -Math.PI / 2 + s.t * 0.5, ink(OUT));
    star(p, s.x, s.y, ro, ro * 0.45, 5, -Math.PI / 2 + s.t * 0.5, E(s.z > 0 ? '#ffe45a' : '#e8b820', 0.9, { spark: 0.5 }));
    p.set(s.x, s.y, E('#fffbd0', 1));
  }
  return p;
}

// ---------- splash (molten cheese droplets) ----------
function splash(f) {
  const p = lay(), cx = 32, cy = 36;
  halo(p, cx, cy, [14, 22, 26][f], '#ff9a1a', 0.7, 100, 3);
  // central splat flattening
  const rx = [9, 14, 15][f], ry = [7, 6, 4][f];
  blob(p, cx, cy, rx, 90 + f, 0.18, (nx, ny) => E(pick(CHEZ, clampi(lit(nx, ny) * 0.8 + 0.2, 0, 0.99)), 0.85, { gloss: 0.3 }), ry / rx);
  // droplets flung outward
  const n = [5, 8, 8][f];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI + (i + 0.5) * (Math.PI / n) * (f === 0 ? 1 : 1) + hash2(i, f, 8) * 0.2;
    const r = [8, 17, 24][f] * (0.7 + hash2(i, 4, 8) * 0.5);
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.9 + f * f * 1.5 - 2;
    const sz = clampi((3 - (i % 3) - (f === 2 ? 1 : 0)) + 1, 1, 4);
    p.ellipse(x, y, sz * 0.7, sz * 0.7, E('#f6b222', 0.9));
    p.set(x - 1, y - 1, E('#fff09a', 1));
    if (f === 0 && i % 2) p.line(x, y, cx + Math.cos(a) * 4, cy + Math.sin(a) * 4, E('#e88a12', 0.85));
  }
  solidOutline(p, '#5a1e08');
  return p;
}

// ---------- muzzle (star-shaped flash) ----------
function muzzle(f) {
  const p = lay(), cx = 32, cy = 32;
  halo(p, cx, cy, 25, '#ffb62a', 1, 130, 4);
  const n = 8, rot = f * (Math.PI / 8) + 0.1;
  for (let i = 0; i < n; i++) {
    const long = i % 2 === 0;
    ray(p, cx, cy, rot + (i * TAU) / n, 3, (long ? 27 : 15) * (f ? 0.9 : 1), long ? 3.6 : 2.6, E(long ? '#ffd84a' : '#ffb62a', 1));
  }
  star(p, cx, cy, 15, 8, 8, rot, E('#fff3a0', 1));
  p.circle(cx, cy, 8, E('#ffffff', 1));
  p.circle(cx, cy, 5, E('#ffffff', 1));
  return p;
}

export function build() {
  const mk = (fn, n) => Array.from({ length: n }, (_, f) => fn(f));
  return {
    'fx.yarnball': mk(yarnball, 4),
    'fx.cheeseball': mk(cheeseball, 2),
    'fx.explosion': mk(explosion, 6),
    'fx.puff': mk(puff, 4),
    'fx.spark': mk(spark, 3),
    'fx.crumbs': mk(crumbs, 3),
    'fx.fur': mk(fur, 3),
    'fx.sparkle': mk(sparkle, 4),
    'fx.laser_dot': mk(laser_dot, 2),
    'fx.stun': mk(stun, 2),
    'fx.splash': mk(splash, 3),
    'fx.muzzle': mk(muzzle, 2),
  };
}
