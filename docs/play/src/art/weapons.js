// weapons — first-person view-models: orange tabby paws holding the five weapons (128x128 images).
// Owner: art-weapons. Exports build() -> { 'wpn.<id>.idle': PixBuf, 'wpn.<id>.fire': PixBuf[] }.
// Deterministic (hash2 only). Light from the upper-left. Everything is built from small shaded primitives
// (capsules, rotated ellipses, rounded boxes) that carry a surface normal, so fur, metal and chrome all share
// one lighting model and stay consistent across frames.
//
// HUD placement (src/ui/hud.js): drawn at 1.5x, bottom-aligned, shifted 24 HUD px right of centre, so the
// crosshair lands at roughly image (48, 38). Muzzles point up-left toward it. Fire frame 0 is drawn untinted
// and nudged down 3 px by the HUD, so it carries the brightest flash.
import { PixBuf, ink, hash2 } from './pixbuf.js';

const S = 128;
const OUT = '#1a1420';

// ───────────── palettes (dark → light) ─────────────
const I = (arr, mat = {}) => arr.map((c) => ink(c, mat));
const ORANGE = I(['#7c3212', '#b8561a', '#f08a1c', '#fbac46', '#ffd27e']);
const STRIPE = I(['#5a200c', '#86340e', '#c25a0e', '#d8722a', '#e8904a']);
const CREAM = I(['#a87a58', '#d8b08a', '#fde3b0', '#fff2d6', '#fffaf0']);
const PINK = I(['#9a3a5a', '#d06a84', '#f498ae', '#ffc0ce', '#ffe2ea'], { gloss: 0.25 });
const CLAW = I(['#6e7288', '#a8aec0', '#dfe3ee', '#ffffff'], { gloss: 0.6, spark: 0.35 });
const STEEL = I(['#2c313b', '#4a525f', '#6c7686', '#8d98a8', '#b8c2d0', '#e8eef6'], { gloss: 0.55 });
const DSTEEL = I(['#1e2129', '#30353f', '#454c58', '#5f6876', '#7a8494', '#a8b2c0'], { gloss: 0.45 });
const BLUE = I(['#1e2a4e', '#2e4278', '#46609e', '#5a78b8', '#86a2d8', '#bcd0f4'], { gloss: 0.35 });
const GOLD = I(['#5a3208', '#8c5a12', '#c08a1e', '#ffd23e', '#ffe98a', '#fffbe0'], { gloss: 0.6, spark: 0.8 });
const RED = I(['#4a0a10', '#7e1419', '#c21f24', '#e2493a', '#f27a5a', '#ffb090'], { gloss: 0.4 });
const TEAL = I(['#0e3e46', '#16606a', '#23878f', '#3aaeb2', '#6cd2cc', '#b0f0e6'], { gloss: 0.35 });
const YARN = I(['#6a1640', '#a82c66', '#e2508e', '#ff84b6', '#ffbcd8']);
const YARN2 = I(['#58103a', '#8c2256', '#c23e78', '#e8649c', '#ff9cc4']);
const BONE = I(['#7a6e5c', '#ae9f84', '#d8ccb0', '#f2ead6', '#fffbf0'], { gloss: 0.15 });
const FUZZ = I(['#4e4852', '#6e6874', '#948e98', '#bab4bc', '#dcd8dc']);
const WOOD = I(['#2a160c', '#45261a', '#643a24', '#855032', '#a86c44'], { gloss: 0.15 });
const SMOKE = I(['#6a6474', '#8e8898', '#b4aebc', '#d8d4de', '#f2f0f4']);
const PSMOKE = I(['#8a6a84', '#b08ca8', '#d4b4cc', '#f0d8e8', '#fff2fa']);

// ───────────── math / lighting ─────────────
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const frac = (v) => v - Math.floor(v);
const tri = (v) => 1 - Math.abs(2 * frac(v) - 1);
const LV = (() => { const v = [-0.49, -0.64, 0.58], m = Math.hypot(...v); return v.map((c) => c / m); })();
const HV = (() => { const v = [LV[0], LV[1], LV[2] + 1], m = Math.hypot(...v); return v.map((c) => c / m); })();
/** Lambert term remapped so a surface facing the viewer lands mid-ramp (the palette anchor). */
function lum(g) {
  const d = g.nx * LV[0] + g.ny * LV[1] + g.nz * LV[2];
  return clamp(0.55 + (d - 0.58) * 0.78, 0, 0.999);
}
const spec = (g, p = 24) => Math.pow(Math.max(0, g.nx * HV[0] + g.ny * HV[1] + g.nz * HV[2]), p);
const pick = (R, l) => R[Math.min(R.length - 1, Math.floor(l * R.length))];
const layer = () => new PixBuf(S, S);

// ───────────── geometry: each returns { bb, at(px,py) → hit|null } with a unit normal ─────────────
function normalFrom(ex, ey, d, r) {
  const q = Math.min(1, d / r), k = d > 1e-6 ? q / d : 0;
  return { nx: ex * k, ny: ey * k, nz: Math.sqrt(Math.max(0, 1 - q * q)) };
}
/** Capsule A→B with radius ra→rb. tuft>0 adds pointy fur tufts on the silhouette. */
function capsule(ax, ay, bx, by, ra, rb, tuft = 0, seed = 0) {
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1, len = Math.sqrt(len2), ux = dx / len, uy = dy / len;
  const m = Math.max(ra, rb) + tuft + 1;
  return {
    bb: [Math.min(ax, bx) - m, Math.min(ay, by) - m, Math.max(ax, bx) + m, Math.max(ay, by) + m],
    at(px, py) {
      const qx = px - ax, qy = py - ay, tc = clamp((qx * dx + qy * dy) / len2, 0, 1);
      const r = ra + (rb - ra) * tc, ex = qx - dx * tc, ey = qy - dy * tc, d = Math.hypot(ex, ey);
      const cross = -uy * ex + ux * ey, along = ux * ex + uy * ey;
      let re = r;
      if (tuft) re += tuft * Math.pow(tri(tc * len / 4.6 + Math.atan2(cross, along) * r / 4.6 + seed * 0.37), 2.2);
      if (d > re) return null;
      return { ...normalFrom(ex, ey, d, r), s: tc * len, u: cross / r, t: tc, edge: re - d };
    },
  };
}
/** Rotated ellipse (rot radians). Local frame: x across, y along (−y = "forward" for paws). */
function ellipse(cx, cy, rx, ry, rot = 0, tuft = 0, seed = 0) {
  const c = Math.cos(rot), s = Math.sin(rot), m = Math.max(rx, ry) + tuft + 1;
  return {
    bb: [cx - m, cy - m, cx + m, cy + m],
    at(px, py) {
      const qx = px - cx, qy = py - cy, lx = c * qx + s * qy, ly = -s * qx + c * qy;
      const u = lx / rx, v = ly / ry, d = Math.hypot(u, v);
      let re = 1;
      if (tuft) re += (tuft / Math.min(rx, ry)) * Math.pow(tri(Math.atan2(v, u) * (rx + ry) / 9.2 + seed * 0.29), 2.2);
      if (d > re) return null;
      const q = Math.min(1, d), k = d > 1e-6 ? q / d : 0, nu = u * k, nv = v * k;
      return { nx: c * nu - s * nv, ny: s * nu + c * nv, nz: Math.sqrt(Math.max(0, 1 - q * q)), u, v, lx, ly, s: ly + ry, edge: re - d };
    },
  };
}
/** Rounded, optionally tapered box: centre, half-width at top (hwT, local −y end) and bottom (hwB), half-height hh, corner radius rc. */
function rbox(cx, cy, hwT, hwB, hh, rot = 0, rc = 4) {
  const c = Math.cos(rot), s = Math.sin(rot), m = Math.max(hwT, hwB, hh) + 2;
  return {
    bb: [cx - m * 1.5, cy - m * 1.5, cx + m * 1.5, cy + m * 1.5],
    at(px, py) {
      const qx = px - cx, qy = py - cy, lx = c * qx + s * qy, ly = -s * qx + c * qy;
      const hw = hwT + (hwB - hwT) * clamp((ly + hh) / (2 * hh), 0, 1);
      const ax = Math.abs(lx), ay = Math.abs(ly);
      if (ax > hw || ay > hh) return null;
      const r = Math.min(rc, hw, hh), dxr = Math.max(0, ax - (hw - r)), dyr = Math.max(0, ay - (hh - r));
      const q = Math.hypot(dxr, dyr) / r;
      if (q > 1) return null;
      const nu = Math.sign(lx) * dxr / r, nv = Math.sign(ly) * dyr / r;
      return { nx: c * nu - s * nv, ny: s * nu + c * nv, nz: Math.sqrt(Math.max(0, 1 - q * q)), lx, ly, u: lx / hw, s: ly + hh };
    },
  };
}
function paint(p, geo, shader) {
  const [x0, y0, x1, y1] = geo.bb;
  for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(S - 1, Math.ceil(y1)); y++)
    for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(S - 1, Math.ceil(x1)); x++) {
      const g = geo.at(x + 0.5, y + 0.5);
      if (g) { const k = shader(g, x, y); if (k) p.set(x, y, k); }
    }
  return p;
}

// ───────────── shaders ─────────────
/** Tabby fur: orange with chevron stripes, a whisper of grain, edges darker. */
const fur = ({ seed = 0, period = 8, stripes = true, width = 0.3, R = ORANGE, SR = STRIPE } = {}) => (g, x, y) => {
  let l = lum(g) + (hash2(x, y >> 1, seed) - 0.5) * 0.07;
  if (g.edge !== undefined && g.edge < 1.2) l -= 0.12;
  const st = stripes && frac(g.s / period + Math.abs(g.u) * 0.55 + seed * 0.21 + Math.sin(g.u * 2.1 + seed) * 0.08) < width;
  return pick(st ? SR : R, clamp(l, 0, 0.999));
};
const solid = (R, { sp = 0, hi = null, p = 24, bias = 0 } = {}) => (g) => {
  if (sp && spec(g, p) > sp) return hi || R[R.length - 1];
  return pick(R, clamp(lum(g) + bias, 0, 0.999));
};
/** Chrome: reflect a sky/horizon/ground environment by the normal; mirror-ish. */
const CHROME = {
  sky: ink('#ffffff', { gloss: 0.9, spark: 0.3 }), sky2: ink('#d6e6ff', { gloss: 0.9 }), sky3: ink('#9ab6dc', { gloss: 0.9 }),
  hor: ink('#2a2e3c', { gloss: 0.9 }), gr1: ink('#7a6a5e', { gloss: 0.85 }), gr2: ink('#4e4440', { gloss: 0.85 }),
};
const chrome = (g) => {
  const ry = 2 * g.nz * g.ny - 0.15 + g.nx * 0.25;
  if (ry < -0.75) return CHROME.sky;
  if (ry < -0.35) return CHROME.sky2;
  if (ry < -0.05) return CHROME.sky3;
  if (ry < 0.12) return CHROME.hor;
  if (ry < 0.5) return CHROME.gr1;
  return CHROME.gr2;
};

// ───────────── composition helpers ─────────────
/** Fast raw-array outline (4-neighbour) — PixBuf.outline/blit allocate per pixel and blow the time budget. */
function outlineFast(L, c) {
  const k = ink(c), a = L.rgba, m = L.mat, hits = [];
  const op = (x, y) => x >= 0 && y >= 0 && x < S && y < S && a[(y * S + x) * 4 + 3] >= 128;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (op(x, y)) continue;
    if (op(x - 1, y) || op(x + 1, y) || op(x, y - 1) || op(x, y + 1)) hits.push((y * S + x) * 4);
  }
  for (const i of hits) { a[i] = k.r; a[i + 1] = k.g; a[i + 2] = k.b; a[i + 3] = 255; m[i] = k.emit * 255; m[i + 1] = k.gloss * 255; m[i + 2] = k.spark * 255; m[i + 3] = 255; }
}
function blitFast(dst, src) {
  const a = src.rgba, m = src.mat, da = dst.rgba, dm = dst.mat;
  for (let i = 0; i < a.length; i += 4) if (a[i + 3]) {
    da[i] = a[i]; da[i + 1] = a[i + 1]; da[i + 2] = a[i + 2]; da[i + 3] = 255;
    dm[i] = m[i]; dm[i + 1] = m[i + 1]; dm[i + 2] = m[i + 2]; dm[i + 3] = 255;
  }
}
/** Paint into a fresh layer, outline it, stamp onto the target. */
function part(dst, fn, outline = OUT) {
  const L = layer();
  fn(L);
  if (outline) outlineFast(L, outline);
  blitFast(dst, L);
  return L;
}

/** Forearm from below the frame up to the wrist. */
const arm = (L, x0, y0, x1, y1, r0, r1, seed) => paint(L, capsule(x0, y0, x1, y1, r0, r1, 1.6, seed), fur({ seed, period: 9 }));

/** Back of a paw gripping something: mitten blob + a row of cream toes along its forward edge (local −y). */
function backPaw(L, cx, cy, sz, rot, seed = 0, { toes = 4, curl = 0.8 } = {}) {
  paint(L, ellipse(cx, cy, sz, sz * 0.86, rot, 1.4, seed), fur({ seed, period: 7, width: 0.26 }));
  const c = Math.cos(rot), s = Math.sin(rot);
  for (let i = 0; i < toes; i++) {
    const t = toes === 1 ? 0 : i / (toes - 1) - 0.5;
    const lx = t * sz * 1.45, ly = -sz * curl * (1 - t * t * 0.9);
    const tx = cx + c * lx - s * ly, ty = cy + s * lx + c * ly;
    const tr = sz * 0.32;
    paint(L, ellipse(tx, ty, tr, tr * 1.08, rot), solid(CREAM));
    L.ring(tx, ty, tr + 0.6, tr * 1.08 + 0.6, CREAM[0], 1);
  }
}
/** Palm of a raised paw facing the viewer: cream palm, pink pad and beans, optional claws (drawn behind). */
function palmPaw(dst, cx, cy, sz, rot, seed = 0, { claws = true, clawLen = 1, spread = 1 } = {}) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const P = (lx, ly) => [cx + c * lx - s * ly, cy + s * lx + c * ly];
  const beans = [-1.5, -0.5, 0.5, 1.5].map((k) => {
    const a = k * 0.5 * spread;
    return { a, p: P(Math.sin(a) * sz * 0.6, -Math.cos(a) * sz * 0.56 + sz * 0.04) };
  });
  if (claws) part(dst, (L) => {
    for (const b of beans) {
      const a = b.a + rot;
      const bx = cx + Math.sin(a) * sz * 0.7, by = cy - Math.cos(a) * sz * 0.7;
      const n = Math.round(sz * 0.75 * clawLen);
      for (let i = 0; i <= n; i++) {
        const t = i / n, bend = t * t * 0.55;
        const rr = sz * 0.7 + t * sz * 0.75 * clawLen;
        const x = cx + Math.sin(a + bend * 0.5) * rr - Math.cos(a) * bend * 4;
        const y = cy - Math.cos(a + bend * 0.5) * rr - Math.sin(a) * bend * 4 + bend * 5;
        const w = sz * 0.13 * (1 - t) + 0.6;
        paint(L, ellipse(x, y, w, w), solid(CLAW, { bias: 0.25 }));
      }
      void bx; void by;
    }
  });
  part(dst, (L) => {
    paint(L, ellipse(cx, cy, sz, sz * 0.94, rot, 1.6, seed), fur({ seed, period: 7, stripes: false }));
    paint(L, ellipse(cx + c * 0.6 - s * 1.2, cy + s * 0.6 + c * 1.2, sz * 0.8, sz * 0.76, rot), solid(CREAM, { bias: 0.06 }));
    // main pad: three-lobed
    const [px, py] = P(0, sz * 0.28);
    paint(L, ellipse(px, py, sz * 0.4, sz * 0.3, rot), solid(PINK, { sp: 0.92, hi: PINK[4] }));
    for (const k of [-1, 1]) { const [qx, qy] = P(k * sz * 0.25, sz * 0.4); paint(L, ellipse(qx, qy, sz * 0.22, sz * 0.2, rot), solid(PINK)); }
    const edge = ink('#b0607a');
    const ringE = (geo) => { const hit = (x, y) => !!geo.at(x + 0.5, y + 0.5); const [x0, y0, x1, y1] = geo.bb;
      for (let y = Math.floor(y0); y <= y1; y++) for (let x = Math.floor(x0); x <= x1; x++) if (hit(x, y) && (!hit(x - 1, y) || !hit(x + 1, y) || !hit(x, y - 1) || !hit(x, y + 1))) L.set(x, y, edge); };
    const pad = [ellipse(px, py, sz * 0.4, sz * 0.3, rot)];
    for (const k of [-1, 1]) { const [qx, qy] = P(k * sz * 0.25, sz * 0.4); pad.push(ellipse(qx, qy, sz * 0.22, sz * 0.2, rot)); }
    const union = { bb: [px - sz, py - sz, px + sz, py + sz], at: (x, y) => pad.some((e) => e.at(x, y)) };
    ringE(union);
    for (const b of beans) { const e = ellipse(b.p[0], b.p[1], sz * 0.15, sz * 0.19, rot + b.a); paint(L, e, solid(PINK, { sp: 0.9, hi: PINK[4] })); ringE(e); }
  });
}

// ───────────── effects ─────────────
function star(cx, cy, ro, ri, n, rot) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) { const a = rot + (i * Math.PI) / n, r = i & 1 ? ri : ro; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return pts;
}
const FL = {
  o: ink('#ff7a14', { emit: 0.85 }), y: ink('#ffd23e', { emit: 0.95 }), w: ink('#fffbe0', { emit: 1 }),
  e: ink('#d8420e', { emit: 0.6 }),
};
function flash(dst, cx, cy, size, rot = 0, seed = 0) {
  part(dst, (L) => {
    L.poly(star(cx, cy, size, size * 0.42, 8, rot), FL.o);
    L.poly(star(cx, cy, size * 0.66, size * 0.3, 8, rot + 0.2), FL.y);
    L.circle(cx, cy, size * 0.24, FL.w);
    for (let i = 0; i < 6; i++) {
      const a = rot + i * 1.05 + hash2(i, seed, 7) * 0.6, r = size * (1.05 + hash2(i, seed, 9) * 0.35);
      L.rect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 2, 2, i & 1 ? FL.y : FL.w);
    }
  }, FL.e);
}
function puff(dst, cx, cy, r, seed, R = SMOKE, edge = '#4e4858') {
  part(dst, (L) => {
    for (let i = 0; i < 6; i++) {
      const a = i * 1.047 + hash2(i, seed, 3), d = r * 0.55;
      const br = r * (0.42 + hash2(i, seed, 5) * 0.2);
      paint(L, ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, br, br), solid(R, { bias: 0.08 }));
    }
    paint(L, ellipse(cx, cy, r * 0.62, r * 0.58), solid(R, { bias: 0.12 }));
  }, edge);
}
/** Glowing claw trail along a circular arc. */
function trail(L, cx, cy, R, a0, a1, w, fade = 0) {
  const n = Math.ceil(Math.abs(a1 - a0) * R / 1.2);
  const edge = ink('#9ee8ff', { emit: 0.55 }), core = ink('#ffffff', { emit: 0.9 });
  for (let pass = 0; pass < 2; pass++)
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      if (fade && hash2(i >> 2, Math.round(R), 11) < fade * (1 - t) * 1.4) continue;
      const a = a0 + (a1 - a0) * t, x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
      const ww = w * Math.sin(Math.PI * clamp(t * 0.9 + 0.1, 0, 1)) * (0.4 + 0.6 * t);
      if (pass === 0) L.circle(x, y, ww / 2 + 1, edge); else if (ww > 1.4) L.circle(x, y, ww / 2 - 0.2, core);
    }
}
function hairball(L, cx, cy, r, seed) {
  paint(L, ellipse(cx, cy, r, r * 0.92, 0, 1.3, seed), (g, x, y) => pick(FUZZ, clamp(lum(g) + (hash2(x, y, seed) - 0.5) * 0.25, 0, 0.999)));
}
function sparkle(L, x, y, r = 3) {
  const k = ink('#fffbe0', { emit: 1, spark: 1 });
  L.hline(x - r, y, r * 2 + 1, k); L.vline(x, y - r, r * 2 + 1, k); L.set(x - 1, y - 1, k); L.set(x + 1, y + 1, k);
  L.set(x + 1, y - 1, k); L.set(x - 1, y + 1, k);
}

// ═════════════ CLAWS ═════════════
function claws(pose) {
  const p = layer();
  const P = {
    idle: { L: [30, 80, 22, -0.25], R: [97, 72, 24, 0.25] },
    wind: { L: [26, 100, 20, -0.4], R: [101, 42, 21, 0.65] },
    slash: { L: [18, 114, 19, -0.5], R: [56, 60, 24, -0.75] },
    follow: { L: [6, 134, 18, -0.6], R: [34, 100, 22, -1.15] },
  }[pose];
  const [lx, ly, ls, lr] = P.L, [rx, ry, rs, rr] = P.R;
  const T = layer();
  if (pose === 'slash' || pose === 'follow') {
    const a1 = pose === 'slash' ? -2.25 : -2.9;
    for (const [k, R] of [[0, 78], [1, 92], [2, 106]]) trail(T, 122, 122, R, -1.78 + k * 0.03, a1 + k * 0.05, pose === 'slash' ? 7 : 5, pose === 'follow' ? 0.5 : 0);
    if (pose === 'follow') { sparkle(T, 80, 30, 3); sparkle(T, 50, 64, 2); sparkle(T, 108, 22, 2); }
  }
  if (pose === 'wind') { const k = ink('#fff2d6', { emit: 0.3 }); for (let i = 0; i < 3; i++) T.line(70 + i * 7, 26 - i * 2, 80 + i * 8, 14 - i * 4, k); }
  blitFast(p, T);
  part(p, (L) => arm(L, lx - 16, 160, lx + Math.sin(lr) * 6, ly + 12, 22, ls * 0.8, 3));
  palmPaw(p, lx, ly, ls, lr, 1, { clawLen: 1.05 });
  part(p, (L) => arm(L, rx + 26, 162, rx - Math.sin(rr) * 8, ry + 12, 23, rs * 0.82, 5));
  palmPaw(p, rx, ry, rs, rr, 2, { clawLen: pose === 'slash' ? 1.45 : 1.25 });
  if (pose === 'idle') { const T2 = layer(); sparkle(T2, 112, 30, 3); sparkle(T2, 22, 44, 2); blitFast(p, T2); }
  return p;
}

// ═════════════ HAIRBALL PISTOL ═════════════
function pistol(f) {
  // f: -1 idle, 0 flash, 1 recoil, 2 reload
  const kick = [0, -8, -5, -1][f + 1], tilt = [0, -0.09, -0.05, -0.01][f + 1];
  const p = layer(), g = layer();
  const ax = 74, ay = 100 + kick, rot = -0.3 + tilt;  // gun pivot, rotation (barrel points up-left)
  const c = Math.cos(rot), s = Math.sin(rot);
  const P = (lx, ly) => [ax + c * lx - s * ly, ay + s * lx + c * ly];
  // grip
  part(g, (L) => { const [x, y] = P(4, 14); paint(L, rbox(x, y, 11, 12, 16, rot + 0.2, 5), solid(BLUE)); });
  // slide / body: tapered, toy-chunky, with a red side stripe and a teal top rib
  part(g, (L) => {
    const [bx, by] = P(0, -50);
    paint(L, capsule(bx, by + 12, ...P(0, -54), 7.5, 7), solid(STEEL, { sp: 0.9 }));
    const [x, y] = P(0, -20);
    paint(L, rbox(x, y, 12, 17, 28, rot, 6), solid(STEEL, { sp: 0.94 }));
    const [sx, sy] = P(-10, -18);
    paint(L, rbox(sx, sy, 2, 3, 22, rot, 1.5), solid(RED, { sp: 0.9 }));
    const [tx2, ty2] = P(1, -36);
    paint(L, rbox(tx2, ty2, 2.5, 3, 10, rot, 1.5), solid(TEAL, { sp: 0.9 }));
    for (const [lx2, ly2] of [[-10, -44], [-11, 6], [11, 6]]) { const [rx2, ry2] = P(lx2, ly2); L.rect(rx2, ry2, 2, 2, GOLD[4]); }
  });
  // muzzle ring with cat-ear front sight
  part(g, (L) => {
    const [mx, my] = P(0, -56);
    for (const k of [-1, 1]) { const [ex, ey] = P(k * 5, -62); L.poly([[ex - 3.5, ey + 3], [ex + 3.5, ey + 3], [ex + k * 1.5, ey - 5]], RED[3]); L.set(ex + k * 0.5, ey - 1, PINK[3]); L.set(ex + k * 0.5, ey, PINK[2]); }
    paint(L, ellipse(mx, my, 10, 6, rot), solid(RED, { sp: 0.9 }));
    L.ellipse(mx, my - 0.5, 5.5, 3.2, ink('#120c14'));
  });
  // breech: open slot with a hairball
  part(g, (L) => {
    const [bx, by] = P(1, -12);
    paint(L, rbox(bx, by, 8, 8.5, 10, rot, 3), (gg) => pick(DSTEEL, clamp(0.3 - lum(gg) * 0.25, 0, 0.99)));
    if (f === -1) hairball(L, bx, by - 1, 7, 4);
    if (f === 2) hairball(L, bx + 1, by + 6, 6.5, 4);
  }, null);
  // paw gripping
  part(g, (L) => arm(L, 120, 160, 90, 118 + kick, 22, 18, 7));
  part(g, (L) => { const [x, y] = P(9, 22); backPaw(L, x, y, 17, rot - 1.5, 3, { curl: 0.75 }); });
  part(g, (L) => { const [x, y] = P(-13, 4); paint(L, ellipse(x, y, 5.5, 6.5, rot), solid(CREAM)); });   // dewclaw
  blitFast(p, g);
  if (f === 0) flash(p, ...P(0, -68), 19, 0.15, 1);
  if (f === 1) { flash(p, ...P(-1, -68), 9, 0.6, 2); const T = layer(); hairball(T, ...P(-12, -92), 5, 6); outlineFast(T, OUT); blitFast(p, T); }
  if (f === 1 || f === 2) { const [x, y] = P(2, -72 - (f === 2 ? 6 : 0)); puff(p, x + 6, y - (f === 2 ? 4 : 8), f === 2 ? 5 : 7, f + 10); }
  return p;
}

// ═════════════ PURR-FORATOR (gatling) ═════════════
function gatling(f) {
  const rotB = [0, 0.52, 1.05][f + 1], shake = [0, 1, -1][f + 1];
  const p = layer();
  const rx = 68 + shake, ry = 112, fx = 52 + shake, fy = 34;
  const dx = fx - rx, dy = fy - ry, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len, px = -uy, py = ux;
  // left paw on the side handle (behind the body)
  part(p, (L) => arm(L, 2, 160, 28, 110, 21, 17, 11));
  part(p, (L) => paint(L, capsule(36, 102, 46, 96, 4, 4), solid(WOOD)));
  part(p, (L) => backPaw(L, 32, 100, 16, -0.9, 6, { curl: 0.8 }));
  // barrels
  const barrels = [];
  for (let i = 0; i < 6; i++) { const a = rotB + (i * Math.PI) / 3; barrels.push({ a, z: Math.sin(a), x: Math.cos(a) }); }
  barrels.sort((a, b) => a.z - b.z);
  const RB0 = 11, RB1 = 7;
  for (const b of barrels) part(p, (L) => {
    const o0 = b.x * RB0, o1 = b.x * RB1, h0 = -b.z * RB0 * 0.45, h1 = -b.z * RB1 * 0.45;
    const R = b.z > 0.3 ? STEEL : b.z > -0.3 ? STEEL : DSTEEL;
    paint(L, capsule(rx + px * o0, ry + py * o0 + h0 - 10, fx + px * o1, fy + py * o1 + h1, 4.2, 3.2), solid(R, { sp: 0.9, bias: b.z * 0.08 }));
    const mx = fx + px * o1 + ux * 1, my = fy + py * o1 + h1 + uy * 1;
    L.ellipse(mx, my - 0.5, 1.6, 1.2, ink('#120c14'));
  });
  // clamp rings
  for (const [t, rr, R] of [[0.12, 13, GOLD], [0.55, 11, GOLD]]) part(p, (L) => {
    const x = fx - dx * t, y = fy - dy * t;
    paint(L, rbox(x, y, rr, rr, 2.6, Math.atan2(dy, dx) - Math.PI / 2, 2), solid(R, { sp: 0.9 }));
  });
  // drum housing (round, seen from behind)
  part(p, (L) => {
    paint(L, ellipse(rx + 2, ry + 2, 22, 17, 0.25), solid(TEAL, { sp: 0.985 }));
    paint(L, ellipse(rx + 1, ry - 2, 13, 9, 0.25), solid(TEAL, { bias: 0.12 }));
    // paw-print decal
    const k = ink('#fff2d6', { gloss: 0.3 });
    L.ellipse(rx + 1, ry, 4.5, 3.5, k);
    for (const [ox, oy] of [[-4.5, -4], [-1.5, -6], [2, -6], [5, -4]]) L.ellipse(rx + 1 + ox, ry - 1 + oy, 1.4, 1.5, k);
    for (let i = 0; i < 3; i++) { const a = -2.4 + i * 0.9; L.rect(Math.round(rx + 2 + Math.cos(a) * 18), Math.round(ry + 2 + Math.sin(a) * 13.5), 2, 2, GOLD[4]); }
  });
  // fish-bone crank on the right: hub, spine with ribs, tail handle
  const ca = [-0.9, 0.2, 1.3][f + 1];
  const hx = 94 + shake, hy = 108, tx = hx + Math.cos(ca) * 16, ty = hy + Math.sin(ca) * 16 - 4;
  part(p, (L) => {
    paint(L, capsule(hx, hy, tx, ty, 2.4, 2), solid(BONE));
    const n = 4;
    for (let i = 1; i <= n; i++) {
      const t = i / (n + 1), x = hx + (tx - hx) * t, y = hy + (ty - hy) * t, nx = -(ty - hy) / 16, ny = (tx - hx) / 16, l = 4.5 * (1 - t * 0.4);
      paint(L, capsule(x - nx * l, y - ny * l, x + nx * l, y + ny * l, 0.9, 0.9), solid(BONE));
    }
    paint(L, ellipse(hx, hy, 6, 6), solid(BONE, { sp: 0.9 }));       // fish skull hub
    L.circle(hx - 1.5, hy - 1.5, 1.2, ink('#1a1420'));                 // eye socket
    L.poly([[tx, ty], [tx + Math.cos(ca + 0.6) * 6, ty + Math.sin(ca + 0.6) * 6], [tx + Math.cos(ca - 0.6) * 6, ty + Math.sin(ca - 0.6) * 6]], BONE[2]);
  });
  part(p, (L) => arm(L, 132, 160, tx + 8, ty + 16, 20, 16, 13));
  part(p, (L) => backPaw(L, tx + 3, ty + 5, 14.5, -1.2 + ca * 0.3, 8, { curl: 0.8 }));
  if (f >= 0) {
    const b = barrels[barrels.length - 1 - f];
    const o1 = b.x * RB1, h1 = -b.z * RB1 * 0.45;
    flash(p, fx + px * o1 + ux * 8, fy + py * o1 + h1 + uy * 8, f === 0 ? 16 : 12, f * 0.4, 3 + f);
    // ejected hairball fluff
    const T = layer(); hairball(T, 104 + f * 8, 70 - f * 10, 3.2, 20 + f); hairball(T, 116 - f * 4, 58 + f * 6, 2.5, 22 + f); outlineFast(T, OUT); blitFast(p, T);
  }
  return p;
}

// ═════════════ YARN BOMBER ═════════════
function yarnBomber(f) {
  const kick = [0, 8, 5, 2][f + 1];
  const p = layer();
  const rx = 72, ry = 120 + kick, fx = 58, fy = 56 + kick;
  const rot = Math.atan2(fy - ry, fx - rx) + Math.PI / 2;
  // left paw under the barrel front
  part(p, (L) => arm(L, 0, 160, 32, 106 + kick, 21, 17, 21));
  // barrel: fat blue-cheese tube, brass bands, knitted cosy
  part(p, (L) => {
    paint(L, capsule(rx, ry, fx, fy + 6, 22, 19), solid(BLUE, { sp: 0.95 }));
    // knitted cosy band (teal/cream rows)
    const kc = capsule(rx - 1, ry - 22, fx + 6, fy + 36, 22.6, 21.2);
    paint(L, kc, (g, x, y) => {
      const row = Math.floor(g.s / 3), v = ((x + (row & 1)) >> 1) & 1;
      const R = TEAL;
      return pick(R, clamp(lum(g) - v * 0.1, 0, 0.999));
    });
    for (const t of [0.12, 0.86]) {
      const x = rx + (fx - rx) * t, y = ry + (fy + 6 - ry) * t;
      paint(L, rbox(x, y, 22 - t * 2.5, 22 - t * 2.5, 2.5, rot, 2), solid(GOLD, { sp: 0.9 }));
    }
  });
  // bell-mouth muzzle (visible opening, cartoon license) + cat-ear sights
  part(p, (L) => {
    for (const k of [-1, 1]) { const ex = fx + k * 11, ey = fy - 6; L.poly([[ex - 4, ey + 3], [ex + 4, ey + 3], [ex + k * 2, ey - 6]], GOLD[3]); L.set(ex + k * 1, ey - 2, YARN[3]); L.set(ex + k * 1, ey - 1, YARN[2]); }
    paint(L, ellipse(fx, fy, 23, 11, rot), solid(GOLD, { sp: 0.9 }));
    paint(L, ellipse(fx, fy + 0.5, 18, 8, rot), (g) => pick(I(['#0c080e', '#1a1222', '#2a2032']), clamp(1 - lum(g), 0, 0.999)));
  });
  // yarn ball in the muzzle (idle), or flying away (fire 0)
  const yb = (L, cx, cy, r, seed) => {
    paint(L, ellipse(cx, cy, r, r), (g, x, y) => {
      const a = Math.floor((g.u * 0.8 + g.v * 1.6 + 8) * 2.2), b = Math.floor((g.u * 1.7 - g.v * 0.5 + 8) * 2.4);
      return pick(((a + (hash2(b, 0, seed) > 0.5 ? 1 : 0)) & 1) ? YARN : YARN2, lum(g));
    });
  };
  if (f === -1) part(p, (L) => {
    yb(L, fx - 1, fy - 5, 12, 1);
    const k = YARN[2]; L.line(fx + 9, fy - 2, fx + 15, fy + 5, k); L.line(fx + 15, fy + 5, fx + 13, fy + 12, k);
  });
  if (f === 0) { part(p, (L) => { yb(L, 46, 12, 7, 2); }); }
  if (f === 0) { const T = layer(); const k = ink('#ff84b6', { emit: 0.4 }); T.line(fx - 2, fy - 12, 47, 20, k); T.line(fx - 1, fy - 12, 48, 20, k); blitFast(p, T); }
  // right paw on the rear trigger grip
  part(p, (L) => paint(L, rbox(96, 110 + kick, 6, 7, 10, 0.35, 3), solid(WOOD)));
  part(p, (L) => arm(L, 132, 162, 106, 124 + kick, 21, 17, 23));
  part(p, (L) => backPaw(L, 100, 112 + kick, 16, -1.25, 9));
  part(p, (L) => backPaw(L, 36, 96 + kick, 16, 0.6, 5, { curl: 0.82 }));
  if (f === 0) { puff(p, fx, fy - 14, 15, 30, PSMOKE, '#7a4a70'); const T = layer(); T.ellipse(fx, fy - 14, 6, 5, ink('#fff2fa', { emit: 0.7 })); sparkle(T, fx - 18, fy - 22, 3); sparkle(T, fx + 17, fy - 26, 2); blitFast(p, T); }
  if (f === 1) { puff(p, fx - 4, fy - 24, 12, 31, PSMOKE, '#7a4a70'); puff(p, fx + 10, fy - 12, 7, 32, PSMOKE, '#7a4a70'); }
  if (f === 2) { puff(p, fx - 8, fy - 36, 7, 33, SMOKE); const T = layer(); const k = YARN[2]; T.line(fx + 4, fy - 4, fx + 6, fy + 4, k); T.line(fx + 6, fy + 4, fx + 3, fy + 10, k); blitFast(p, T); }
  return p;
}

// ═════════════ DER ROTE PUNKT (laser pointer) ═════════════
function laser(f) {
  const p = layer();
  const rx = 100, ry = 128, tx = 58, ty = 50;
  const dx = tx - rx, dy = ty - ry, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len, rot = Math.atan2(dy, dx) + Math.PI / 2;
  part(p, (L) => {
    paint(L, capsule(rx, ry, tx, ty, 8.5, 6.5), chrome);
    // knurled grip band + red button
    for (let i = 0; i < 6; i++) { const t = 0.38 + i * 0.022; const x = rx + dx * t, y = ry + dy * t; paint(L, capsule(x - uy * 8.2, y + ux * 8.2, x + uy * 8.2, y - ux * 8.2, 0.6, 0.6), solid(DSTEEL)); }
  });
  part(p, (L) => {   // clip
    paint(L, capsule(rx + dx * 0.12 + uy * 8, ry + dy * 0.12 - ux * 8, rx + dx * 0.33 + uy * 8, ry + dy * 0.33 - ux * 8, 1.6, 1.4), chrome);
  });
  // lens housing + lens
  const lx = tx + ux * 2, ly = ty + uy * 2;
  part(p, (L) => {
    paint(L, ellipse(lx, ly, 8.5, 5, rot), solid(GOLD, { sp: 0.9 }));
    const emit = f === -1 ? 0.45 : 1;
    const LENS = I(['#5a0a10', '#a8141c', '#ff2a2a', '#ff8a7a', '#fff0e8'], { emit, gloss: 0.8 });
    paint(L, ellipse(lx, ly - 0.5, 5.6, 3.3, rot), (g) => pick(LENS, clamp(lum(g) + (f >= 0 ? 0.25 : 0), 0, 0.999)));
  });
  // button + paw
  const bx = rx + dx * 0.28 - uy * 6.5, by = ry + dy * 0.28 + ux * 6.5;
  part(p, (L) => paint(L, ellipse(bx, by + (f >= 0 ? 1 : 0), 3.2, 2.4, rot), solid(RED, { sp: 0.9 })));
  part(p, (L) => arm(L, 132, 160, 100, 118, 22, 18, 31));
  part(p, (L) => backPaw(L, 86, 104, 17, rot - 1.7, 12, { curl: 0.8 }));
  part(p, (L) => paint(L, ellipse(bx - 3, by - 3 + (f >= 0 ? 1.5 : 0), 5.5, 6.5, rot + 0.4), solid(CREAM)));   // thumb toe on the button
  if (f >= 0) part(p, (L) => {
    const R1 = ink('#ff3a2a', { emit: 0.9 }), R2 = ink('#ff9a8a', { emit: 1 }), W = ink('#fff4f0', { emit: 1 });
    const ext = f === 0 ? 22 : 15, a0 = f === 0 ? 0 : Math.PI / 4;
    for (let i = 0; i < 4; i++) { const a = a0 + i * Math.PI / 2; for (let r = 0; r < ext; r++) { const w = r < ext * 0.3 ? 1 : 0; const x = lx + Math.cos(a) * r, y = ly - 3 + Math.sin(a) * r; L.set(x, y, r < ext * 0.5 ? R2 : R1); if (w) { L.set(x + Math.sin(a), y - Math.cos(a), R1); L.set(x - Math.sin(a), y + Math.cos(a), R1); } } }
    L.ring(lx, ly - 3, f === 0 ? 10 : 13, f === 0 ? 10 : 13, R1, 1);
    L.circle(lx, ly - 3, f === 0 ? 6 : 4.5, R2);
    L.circle(lx, ly - 3, f === 0 ? 3.5 : 2.5, W);
  }, null);
  return p;
}

// ───────────── build ─────────────
export function build() {
  return {
    'wpn.claws.idle': claws('idle'),
    'wpn.claws.fire': [claws('wind'), claws('slash'), claws('follow')],
    'wpn.pistol.idle': pistol(-1),
    'wpn.pistol.fire': [pistol(0), pistol(1), pistol(2)],
    'wpn.gatling.idle': gatling(-1),
    'wpn.gatling.fire': [gatling(0), gatling(1)],
    'wpn.yarn.idle': yarnBomber(-1),
    'wpn.yarn.fire': [yarnBomber(0), yarnBomber(1), yarnBomber(2)],
    'wpn.laser.idle': laser(-1),
    'wpn.laser.fire': [laser(0), laser(1)],
  };
}
