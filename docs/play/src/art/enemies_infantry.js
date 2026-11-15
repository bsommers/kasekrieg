// enemies_infantry — Das Rattenreich foot soldiers: mouse (Maus Schütze), trooper (Sturmratte), officer (Ratten-Offizier).
// Owner: art-enemies-infantry. Exports build() → { '<type>.<anim>': PixBuf[] } per defs.artManifest().
//
// How it works: a parametric upright rodent rig. A *pose* (feet, bob, sway, head tilt, arm/weapon mode, face,
// whole-body rotation/squash for the collapse) is turned by an *outfit* (kit) into a back-to-front list of analytic
// primitives (ellipses, tapered capsules, polygons) in figure space (origin = between the feet, y up is negative).
// The rasteriser inverse-maps every pixel into figure space, so rotated/squashed death frames stay crisp, and shades
// each primitive from a pseudo-normal against a fixed upper-left light into a 3–5 step hue-shifted ramp.
// Frames are then fitted into 64×64 (feet on the bottom row) and outlined in #1a1420. Deterministic, no randomness.
import { PixBuf, ink, shade } from './pixbuf.js';
import { ENEMIES } from '../core/defs.js';

const S = 64;
const OUT = '#1a1420';
const TW = 128, TH = 112, AX = 64, AY = 92;        // scratch canvas + figure anchor inside it
const LX = -0.52, LY = -0.66, LZ = 0.54;           // light from upper-left, toward the viewer (normalised below)
const LN = Math.hypot(LX, LY, LZ);
const LIGHT = [LX / LN, LY / LN, LZ / LN];

// ───────────── palettes (dark → light), hue-shifted: cool shadows, warm highlights ─────────────
const R = (arr, mat = {}) => arr.map((c) => ink(c, mat));
const PAL = {
  fieldgrey: R(['#2b322f', '#454d47', '#6b7468', '#8f9a84', '#b4bb9c']),
  coat: R(['#272d2a', '#3d4540', '#59635a', '#7b8672']),
  collar: R(['#142a22', '#1f3d30', '#2f5644']),
  helmet: R(['#262c2c', '#3c4544', '#5a6662', '#82907f', '#b9c4ad'], { gloss: 0.32 }),
  helmetBig: R(['#2a302e', '#434c48', '#646f66', '#8c9884', '#c2caae'], { gloss: 0.32 }),
  boot: R(['#0e0c14', '#1d1a26', '#302c3c', '#4c4860', '#8a86a2'], { gloss: 0.5 }),
  leather: R(['#14121c', '#24222f', '#373546', '#55536c', '#9a98b8'], { gloss: 0.45 }),
  capCrown: R(['#121119', '#1f1d29', '#2e2c3b', '#46445a'], { gloss: 0.12 }),
  visor: R(['#08070c', '#16141e', '#2a2836', '#6a6884'], { gloss: 0.7 }),
  ratBrown: R(['#33201a', '#583624', '#82563a', '#a97d56']),
  ratBelly: R(['#6e5040', '#9c7a5e', '#c3a07c', '#e2c8a0']),
  mouseGrey: R(['#45414f', '#686472', '#8f8b97', '#b8b3bb']),
  mouseBelly: R(['#857f88', '#aaa3aa', '#cdc6c8', '#ebe4de']),
  ratWhite: R(['#7c7790', '#aaa4b8', '#d4cfd8', '#f6f1ec']),
  ratWhiteBelly: R(['#a39cb0', '#cbc4cf', '#e8e2e2', '#fffaf2']),
  pink: R(['#7c3a4c', '#b65e70', '#e08c98', '#ffbcbc'], { gloss: 0.12 }),
  tail: R(['#6e3446', '#a85a6a', '#d88894', '#f8b4b4'], { gloss: 0.15 }),
  metal: R(['#121218', '#24262e', '#3c414c', '#606878', '#a8b2c4'], { gloss: 0.6 }),
  steel: R(['#3c434e', '#646e7e', '#8d98a8', '#c8d0dc', '#f0f4f8'], { gloss: 0.6, spark: 0.15 }),
  wood: R(['#331a0e', '#552c16', '#7a4422', '#a06536'], { gloss: 0.2 }),
  red: R(['#520a10', '#8a141a', '#c21f24', '#e8544a']),
  gold: R(['#7a4a0a', '#c08a1e', '#ffd23e', '#fff4a8'], { gloss: 0.6, spark: 0.85 }),
  pouch: R(['#2e2216', '#4a3824', '#685034', '#8a6c46'], { gloss: 0.2 }),
};
const C = {
  out: ink(OUT),
  eye: ink('#120e16', { gloss: 0.5 }),
  eyeRed: ink('#ff4636', { emit: 0.75 }),
  eyeGlint: ink('#fff6e8', { emit: 0.35 }),
  white: ink('#f4f0e6'),
  tooth: ink('#fff4c8', { gloss: 0.3 }),
  mouth: ink('#2a0e18'),
  tongue: ink('#e8667a', { gloss: 0.3 }),
  disc: ink('#f4f0e6'),
  wedge: ink('#141018'),
  hole: ink('#060508'),
  smoke: R(['#5a5660', '#8a8690', '#b8b4bc']),
  monoRim: ink('#ffd23e', { gloss: 0.7, spark: 0.9 }),
  monoGlass: ink('#cfe6ff', { gloss: 1.0, spark: 0.6 }),
  flash0: ink('#ff7a14', { emit: 0.9, spark: 0.3 }),
  flash1: ink('#ffc93a', { emit: 1.0, spark: 0.4 }),
  flash2: ink('#fffbe0', { emit: 1.0, spark: 0.5 }),
  silver: ink('#d8dee8', { gloss: 0.6, spark: 0.5 }),
  brow: ink('#1f1620'),
};

// ───────────── primitives ─────────────
// E: ellipse  { t:'E', x, y, rx, ry, a }      C: tapered capsule { t:'C', x0, y0, x1, y1, r0, r1 }
// P: polygon  { t:'P', pts }                  common: col (ramp array | ink), edge (ink), ew, bias
const E = (x, y, rx, ry, col, o = {}) => ({ t: 'E', x, y, rx, ry, a: o.a || 0, col, ...o });
const Cap = (x0, y0, x1, y1, r0, r1, col, o = {}) => ({ t: 'C', x0, y0, x1, y1, r0, r1: r1 ?? r0, col, ...o });
const P = (pts, col, o = {}) => ({ t: 'P', pts, col, ...o });
const dot = (x, y, col) => E(x, y, 0.5, 0.5, col);

function thresholds(n) {
  return n >= 5 ? [-0.22, 0.2, 0.58, 0.9] : n === 4 ? [-0.22, 0.2, 0.6] : n === 3 ? [-0.1, 0.45] : n === 2 ? [0.25] : [];
}
const TH_CACHE = [0, 1, 2, 3, 4, 5].map(thresholds);

function primBox(p) {
  if (p.t === 'E') { const r = Math.max(p.rx, p.ry); return [p.x - r, p.y - r, p.x + r, p.y + r]; }
  if (p.t === 'C') { const r = Math.max(p.r0, p.r1); return [Math.min(p.x0, p.x1) - r, Math.min(p.y0, p.y1) - r, Math.max(p.x0, p.x1) + r, Math.max(p.y0, p.y1) + r]; }
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const [x, y] of p.pts) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); }
  return [a, b, c, d];
}

// hit-test scratch (avoid allocation in the inner loop)
let HN = [0, 0, 0], HE = false;
function hit(p, qx, qy) {
  const ew = p.ew ?? 1;
  if (p.t === 'E') {
    const ca = p._ca, sa = p._sa, dx = qx - p.x, dy = qy - p.y;
    const lx = dx * ca + dy * sa, ly = -dx * sa + dy * ca, u = lx / p.rx, v = ly / p.ry, r2 = u * u + v * v;
    if (r2 > 1) return false;
    HN[0] = u * ca - v * sa; HN[1] = u * sa + v * ca; HN[2] = Math.sqrt(1 - r2);
    if (p.edge) { const ix = p.rx - ew, iy = p.ry - ew; HE = ix <= 0 || iy <= 0 || (lx / ix) ** 2 + (ly / iy) ** 2 > 1; }
    return true;
  }
  if (p.t === 'C') {
    const vx = p.x1 - p.x0, vy = p.y1 - p.y0, l2 = vx * vx + vy * vy || 1e-6;
    let t = ((qx - p.x0) * vx + (qy - p.y0) * vy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = p.x0 + vx * t, cy = p.y0 + vy * t, r = p.r0 + (p.r1 - p.r0) * t, dx = qx - cx, dy = qy - cy, d2 = dx * dx + dy * dy;
    if (d2 > r * r) return false;
    const d = Math.sqrt(d2);
    HN[0] = dx / r; HN[1] = dy / r; HN[2] = Math.sqrt(Math.max(0, 1 - (d / r) ** 2));
    if (p.edge) HE = d > r - ew;
    return true;
  }
  // polygon, even-odd
  const pts = p.pts; let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if ((yi > qy) !== (yj > qy) && qx < ((xj - xi) * (qy - yi)) / (yj - yi) + xi) inside = !inside;
  }
  if (!inside) return false;
  if (p.en) {   // spherical shading from an ellipse {x,y,rx,ry,a}
    const e = p.en, ca = Math.cos(e.a || 0), sa = Math.sin(e.a || 0), dx = qx - e.x, dy = qy - e.y;
    let u = (dx * ca + dy * sa) / e.rx, v = (-dx * sa + dy * ca) / e.ry; const m = Math.hypot(u, v);
    if (m > 0.98) { u *= 0.98 / m; v *= 0.98 / m; }
    HN[0] = u * ca - v * sa; HN[1] = u * sa + v * ca; HN[2] = Math.sqrt(Math.max(0, 1 - u * u - v * v));
  } else {
    const bb = p._bb, cx = (bb[0] + bb[2]) / 2, hw = Math.max(1, (bb[2] - bb[0]) / 2), cy = (bb[1] + bb[3]) / 2, hh = Math.max(1, (bb[3] - bb[1]) / 2);
    const u = ((qx - cx) / hw) * (p.curve ?? 0.85), v = ((qy - cy) / hh) * (p.vcurve ?? 0.3) + (p.ny ?? 0);
    HN[0] = u; HN[1] = v; HN[2] = Math.sqrt(Math.max(0, 1 - u * u - v * v));
  }
  if (p.edge) {
    HE = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const x0 = pts[j][0], y0 = pts[j][1], vx = pts[i][0] - x0, vy = pts[i][1] - y0, l2 = vx * vx + vy * vy || 1e-6;
      let t = ((qx - x0) * vx + (qy - y0) * vy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = qx - x0 - vx * t, ey = qy - y0 - vy * t;
      if (ex * ex + ey * ey < ew * ew) { HE = true; break; }
    }
  }
  return true;
}

/** Figure → scratch-canvas transform: rotate by rot about pivot, then squash y, anchored at (AX,AY)+offset. */
function makeXf(rot = 0, sq = 1, px = 0, py = 0, ox = 0, oy = 0) {
  const c = Math.cos(rot), s = Math.sin(rot);
  return {
    fwd(x, y) { const dx = x - px, dy = y - py; return [AX + ox + px + c * dx - s * dy, AY + oy + py + (s * dx + c * dy) * sq]; },
    inv(X, Y) { const rx = X - AX - ox - px, ry = (Y - AY - oy - py) / sq; return [px + c * rx + s * ry, py - s * rx + c * ry]; },
    c, s, sq, px, py, tx: AX + ox + px, ty: AY + oy + py,
  };
}

function raster(buf, prims, X) {
  for (const p of prims) {
    if (p.t === 'P') p._bb = primBox(p);
    if (p.t === 'E') { p._ca = Math.cos(p.a); p._sa = Math.sin(p.a); }
    const [a, b, c, d] = primBox(p);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [fx, fy] of [[a, b], [c, b], [a, d], [c, d]]) {
      const [sx, sy] = X.fwd(fx, fy);
      x0 = Math.min(x0, sx); y0 = Math.min(y0, sy); x1 = Math.max(x1, sx); y1 = Math.max(y1, sy);
    }
    x0 = Math.max(0, Math.floor(x0) - 1); y0 = Math.max(0, Math.floor(y0) - 1);
    x1 = Math.min(buf.w - 1, Math.ceil(x1) + 1); y1 = Math.min(buf.h - 1, Math.ceil(y1) + 1);
    const ramp = Array.isArray(p.col), th = ramp ? TH_CACHE[Math.min(5, p.col.length)] : null;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const rx = x + 0.5 - X.tx, ry = (y + 0.5 - X.ty) / X.sq, qx = X.px + X.c * rx + X.s * ry, qy = X.py - X.s * rx + X.c * ry;
        HE = false;
        if (!hit(p, qx, qy)) continue;
        let k;
        if (p.edge && HE) k = p.edge;
        else if (!ramp) k = p.col;
        else if (p.flat !== undefined) k = p.col[p.flat];
        else {
          const nx = X.c * HN[0] - X.s * HN[1], ny = X.s * HN[0] + X.c * HN[1];
          const sh = nx * LIGHT[0] + ny * LIGHT[1] + HN[2] * LIGHT[2] + (p.bias || 0);
          let i = 0; while (i < th.length && sh > th[i]) i++;
          k = p.col[i];
        }
        buf.set(x, y, k);
      }
  }
}

// ───────────── geometry helpers ─────────────
const lerp = (a, b, t) => a + (b - a) * t;
/** Rotate a point list around (cx,cy). */
const rot2 = (x, y, cx, cy, a) => { const c = Math.cos(a), s = Math.sin(a), dx = x - cx, dy = y - cy; return [cx + c * dx - s * dy, cy + s * dx + c * dy]; };
/** Re-map a list of primitives through a rigid transform (rotation a about (cx,cy), then offset). */
function xfPrims(prims, cx, cy, a, ox = 0, oy = 0) {
  if (!a && !ox && !oy) return prims;
  return prims.map((p) => {
    const m = (x, y) => { const [u, v] = rot2(x, y, cx, cy, a); return [u + ox, v + oy]; };
    if (p.t === 'E') { const [x, y] = m(p.x, p.y); return { ...p, x, y, a: (p.a || 0) + a }; }
    if (p.t === 'C') { const [x0, y0] = m(p.x0, p.y0), [x1, y1] = m(p.x1, p.y1); return { ...p, x0, y0, x1, y1 }; }
    const q = { ...p, pts: p.pts.map(([x, y]) => m(x, y)) };
    if (p.en) { const [x, y] = m(p.en.x, p.en.y); q.en = { ...p.en, x, y, a: (p.en.a || 0) + a }; }
    return q;
  });
}
/** Points along an elliptical arc (angles in radians, screen convention: 0 = right, -π/2 = up). */
function arc(cx, cy, rx, ry, a0, a1, n = 12) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
  return pts;
}
/** Gun-local (u along the barrel, v to the "underside") → figure space at grip (gx,gy), barrel angle ang. */
function gunXf(prims, gx, gy, ang, flip = false, k = 1) {
  const c = Math.cos(ang), s = Math.sin(ang), f = flip ? -1 : 1;
  const m = (u, v) => [gx + (c * u - s * v * f) * k, gy + (s * u + c * v * f) * k];
  return prims.map((p) => {
    if (p.t === 'E') { const [x, y] = m(p.x, p.y); return { ...p, x, y, a: (p.a || 0) + ang, rx: p.rx * (p.rx > 0.6 ? k : 1), ry: p.ry * (p.ry > 0.6 ? k : 1) }; }
    if (p.t === 'C') { const [x0, y0] = m(p.x0, p.y0), [x1, y1] = m(p.x1, p.y1); return { ...p, x0, y0, x1, y1, r0: p.r0 * k, r1: p.r1 * k }; }
    return { ...p, pts: p.pts.map(([u, v]) => m(u, v)) };
  });
}

// ───────────── weapons ─────────────
// Side profiles in gun-local space: origin at the grip, +u toward the muzzle, +v = underside. Returns { prims, muzzle:[u,v] }.
function gunSide(kind) {
  const M = PAL.metal, W = PAL.wood, e = C.out;
  if (kind === 'smg') return {
    prims: [
      Cap(-9, -1.2, -3, -1.2, 0.6, 0.6, M, { flat: 2 }),                       // folding stock rods
      Cap(-9, -1.2, -9, 2.4, 0.6, 0.6, M, { flat: 1 }),
      P([[-0.5, 0.4], [1.6, 0.4], [1.2, 4.2], [-1.2, 4.2]], W, { edge: e }),     // pistol grip
      Cap(-3.4, -1.3, 6, -1.3, 1.7, 1.6, M, { edge: e }),                         // receiver
      Cap(-2.6, -2.4, 5.4, -2.4, 0.45, 0.45, M[4]),                              // top glint
      P([[3.2, 0], [5.3, 0], [5.0, 7.2], [3.4, 7.2]], M, { edge: e, curve: 0.5 }), // magazine
      Cap(6, -1.5, 13, -1.5, 1.05, 1.0, M, { edge: e }),                          // barrel shroud
      dot(8.5, -1.5, C.hole), dot(10.5, -1.5, C.hole),                           // shroud holes
      Cap(13, -1.5, 14.5, -1.5, 0.7, 0.7, M, { flat: 3 }),
    ], muzzle: [15, -1.5],
  };
  if (kind === 'luger') return {
    prims: [
      P([[-1.2, -0.6], [1.4, -0.6], [0.9, 4.4], [-1.9, 4.0]], W, { edge: e }),     // grip
      P([[-2.6, -2.4], [6.8, -2.4], [6.8, -0.6], [-2.6, -0.4]], M, { edge: e, curve: 0.3 }),
      Cap(-2.0, -2.9, 0.4, -2.9, 0.8, 0.8, M, { flat: 3 }),                        // toggle knob
      Cap(2.0, -0.2, 3.6, 0.8, 0.5, 0.5, M, { flat: 1 }),                          // trigger guard
      Cap(-1.8, -2.0, 6.4, -2.0, 0.4, 0.4, '#d8e0ee'),                              // bright top glint (1x legibility)
    ], muzzle: [7.4, -1.5],
  };
  return { // mouse pistol: tiny and toy-like
    prims: [
      P([[-1.0, -0.4], [1.2, -0.4], [0.9, 3.4], [-1.4, 3.2]], W, { edge: e }),
      P([[-1.8, -2.2], [4.6, -2.2], [4.6, -0.2], [-1.8, -0.2]], M, { edge: e, curve: 0.3 }),
      Cap(-1.4, -1.9, 4.2, -1.9, 0.4, 0.4, '#d8e0ee'),                              // bright top glint (1x legibility)
    ], muzzle: [5.2, -1.2],
  };
}
/** The weapon seen nearly end-on (aimed at the viewer). (x,y) = muzzle position. */
function gunFront(kind, x, y) {
  const M = PAL.metal, e = C.out;
  if (kind === 'smg') return [
    Cap(x + 5.5, y + 4, x + 1, y + 0.6, 2.0, 2.2, M, { edge: e }),            // receiver receding
    P([[x + 3.4, y + 4], [x + 5.6, y + 4], [x + 5.4, y + 10], [x + 3.6, y + 10]], M, { edge: e, curve: 0.5 }), // magazine down
    E(x, y, 2.3, 2.3, M, { edge: e }),                                          // shroud front
    E(x, y, 1.1, 1.1, C.hole),
  ];
  const big = kind === 'luger';
  const w = big ? 2.4 : 1.9, h = big ? 1.9 : 1.6;
  return [
    P([[x - w, y - h], [x + w, y - h], [x + w, y + h], [x - w, y + h]], M, { edge: e, curve: 0.5 }),
    Cap(x - w + 0.6, y - h - 0.2, x + w - 0.6, y - h - 0.2, 0.7, 0.7, M, { flat: 3 }),
    dot(x - 0.5, y + 0.5, C.hole), ...(big ? [dot(x + 0.5, y + 0.5, C.hole)] : []),
  ];
}
/** Emissive star-shaped muzzle flash centred at (x,y). */
function flash(x, y, r) {
  const star = (rad, inner, n, a0) => {
    const pts = [];
    for (let i = 0; i < n * 2; i++) { const a = a0 + (i * Math.PI) / n, rr = i % 2 ? rad * inner : rad; pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]); }
    return pts;
  };
  return [
    P(star(r, 0.42, 8, -Math.PI / 2), C.flash0, { post: true }),
    P(star(r * 0.72, 0.5, 4, -Math.PI / 4), C.flash1, { post: true }),
    E(x, y, r * 0.42, r * 0.42, C.flash1, { post: true }),
    E(x, y, r * 0.26, r * 0.26, C.flash2, { post: true }),
  ];
}

// ───────────── outfits ─────────────
const KITS = {
  mouse: {
    hipY: -14, hipX: 3.2, kneeY: -7.5, thighR: 2.6, shinR: 2.3, footR: 2.6,
    shY: -24.5, shX: 6.2, armR: 2.0, foreR: 1.8, handR: 1.9, neckY: -27, headY: -33, headRX: 7.5, headRY: 6.5,
    fur: PAL.mouseGrey, belly: PAL.mouseBelly, torso: 'tunic', hat: 'bighelmet', head: 'mouse', weapon: 'pistol',
    hemY: -12.5, hemW: 7.0, waistY: -17.5, tailBase: [2, -14],
  },
  trooper: {
    hipY: -22, hipX: 4, kneeY: -12.5, thighR: 3.2, shinR: 2.9, footR: 3.1,
    shY: -35, shX: 8.4, armR: 2.7, foreR: 2.5, handR: 2.2, neckY: -37.5, headY: -43.5, headRX: 6.6, headRY: 5.6,
    fur: PAL.ratBrown, belly: PAL.ratBelly, torso: 'greatcoat', hat: 'helmet', head: 'rat', weapon: 'smg',
    hemY: -13, hemW: 11.5, waistY: -26, tailBase: [3, -18],
  },
  officer: {
    hipY: -22.5, hipX: 3.6, kneeY: -12.5, thighR: 2.9, shinR: 2.6, footR: 2.9,
    shY: -35.5, shX: 7.6, armR: 2.4, foreR: 2.2, handR: 2.0, neckY: -38, headY: -44, headRX: 6.2, headRY: 5.4,
    fur: PAL.ratWhite, belly: PAL.ratWhiteBelly, torso: 'leather', hat: 'cap', head: 'rat', weapon: 'luger',
    hemY: -11, hemW: 9.5, waistY: -26.5, tailBase: [3, -18],
  },
};

function tail(kit, pose, bx, by) {
  const k = kit.head === 'mouse' ? 0.8 : 1, sw = pose.tail || 0, up = pose.tailUp || 0, out = [], n = 14;
  const [x0, y0] = kit.tailBase;
  const p0 = [x0 + bx, y0 + by], p1 = [x0 + 9 * k + bx * 0.5, y0 + 5 + by * 0.5];
  const p2 = [x0 + 12 * k + sw * 2, -1.2], p3 = [x0 + 17 * k + sw * 3.5, -4.5 * k - up];
  const bz = (t) => { const u = 1 - t; return [0, 1].map((i) => u * u * u * p0[i] + 3 * u * u * t * p1[i] + 3 * u * t * t * p2[i] + t * t * t * p3[i]); };
  let prev = bz(0);
  for (let i = 1; i <= n; i++) {
    const t = i / n, cur = bz(t);
    out.push(Cap(prev[0], prev[1], cur[0], cur[1], lerp(1.7, 0.55, (i - 1) / n) * k, lerp(1.7, 0.55, t) * k, PAL.tail));
    prev = cur;
  }
  return out;
}

function leg(kit, foot, hip) {
  const fx = foot.x, fy = foot.y, ank = fy - 3.2 * (foot.s || 1);
  const len0 = hip[1] - (-3.2), len = Math.hypot(hip[0] - fx, hip[1] - ank);
  const bend = Math.max(0, (len0 * -1 - len) * 0.35) + (foot.splay || 0);
  const out = Math.sign(fx || 1);
  const kx = lerp(hip[0], fx, 0.5) + out * bend, ky = lerp(hip[1], ank, 0.48) - (foot.lift || 0) * 0.3;
  const sc = foot.s || 1, boot = kit.torso === 'tunic' ? PAL.boot : PAL.boot;
  return [
    Cap(hip[0], hip[1], kx, ky, kit.thighR, kit.thighR * 0.92, kit.torso === 'leather' ? PAL.capCrown : PAL.fieldgrey),
    Cap(kx, ky - 0.5, fx, ank, kit.shinR + 0.3, kit.shinR * 0.95, boot, { edge: C.out }),       // jackboot shaft
    Cap(kx - kit.shinR - 0.2, ky - 0.3, kx + kit.shinR + 0.2, ky - 0.3, 0.8, 0.8, PAL.boot, { flat: 3 }), // boot top rim
    E(fx, fy - 1.9 * sc, kit.footR * sc, 2.1 * sc, boot, { edge: C.out }),                        // toe cap toward viewer
  ];
}

function arm(kit, sh, el, hand, sleeve, opts = {}) {
  return [
    Cap(sh[0], sh[1], el[0], el[1], kit.armR, kit.armR * 0.95, sleeve, { edge: C.out }),
    Cap(el[0], el[1], hand[0], hand[1], kit.foreR * (opts.near || 1), kit.foreR * (opts.near || 1), sleeve, { edge: C.out }),
  ];
}
const paw = (kit, h, s = 1) => [E(h[0], h[1], kit.handR * s, kit.handR * s * 0.95, PAL.pink, { edge: C.out })];

function armband(kit, sh, el) {
  const t0 = 0.4, t1 = 0.58, a = [lerp(sh[0], el[0], t0), lerp(sh[1], el[1], t0)], b = [lerp(sh[0], el[0], t1), lerp(sh[1], el[1], t1)];
  const mx = Math.round((a[0] + b[0]) / 2), my = Math.round((a[1] + b[1]) / 2);
  return [Cap(a[0], a[1], b[0], b[1], kit.armR + 0.05, kit.armR + 0.05, PAL.red),
    P([[mx - 1, my - 1], [mx + 1, my - 1], [mx + 1, my + 1], [mx - 1, my + 1]], C.disc), dot(mx + 0.5, my + 0.5, C.wedge)];
}

function torso(kit, pose, bx, by) {
  const { shY, shX, hemY, hemW, waistY } = kit, hs = pose.hem || 0, o = [];
  const Y = (y) => y + by, X = (x) => x + bx;
  if (kit.torso === 'tunic') {
    o.push(P([[X(-shX - 0.5), Y(shY + 0.5)], [X(shX + 0.5), Y(shY + 0.5)], [X(shX * 0.95), Y(waistY)], [hemW + bx * 0.6 + hs, Y(hemY)], [-hemW + bx * 0.6 + hs, Y(hemY)], [X(-shX * 0.95), Y(waistY)]], PAL.fieldgrey, { edge: C.out }));
    o.push(P([[X(-shX * 0.9), Y(waistY - 1)], [X(shX * 0.9), Y(waistY - 1)], [X(shX * 0.92), Y(waistY + 1.2)], [X(-shX * 0.92), Y(waistY + 1.2)]], PAL.leather));
    o.push(P([[X(-1.2), Y(waistY - 1.2)], [X(1.2), Y(waistY - 1.2)], [X(1.2), Y(waistY + 1.3)], [X(-1.2), Y(waistY + 1.3)]], PAL.steel));
    for (const yy of [shY + 3.5, shY + 6]) o.push(dot(X(0.5), Y(yy), PAL.steel[3]));
    o.push(P([[X(-3), Y(shY - 0.2)], [X(3), Y(shY - 0.2)], [X(1.2), Y(shY + 2.6)], [X(-1.2), Y(shY + 2.6)]], PAL.collar)); // collar
    // breast pockets
    o.push(P([[X(-4.6), Y(shY + 3)], [X(-1.6), Y(shY + 3)], [X(-1.6), Y(shY + 4)], [X(-4.6), Y(shY + 4)]], PAL.fieldgrey, { flat: 1 }));
    o.push(P([[X(1.6), Y(shY + 3)], [X(4.6), Y(shY + 3)], [X(4.6), Y(shY + 4)], [X(1.6), Y(shY + 4)]], PAL.fieldgrey, { flat: 1 }));
  } else if (kit.torso === 'greatcoat') {
    o.push(P([[X(-shX - 0.8), Y(shY + 0.2)], [X(shX + 0.8), Y(shY + 0.2)], [X(shX + 0.4), Y(waistY)], [hemW + bx * 0.5 + hs, Y(hemY) - by * 0.5], [-hemW + bx * 0.5 + hs, Y(hemY) - by * 0.5], [X(-shX - 0.4), Y(waistY)]], PAL.coat, { edge: C.out }));
    // front split of the skirt + shadowed fold
    o.push(P([[X(0), Y(waistY + 1)], [X(0.8) + hs * 0.5, Y(hemY) - by * 0.5], [X(-0.8) + hs * 0.5, Y(hemY) - by * 0.5]], PAL.coat, { flat: 0 }));
    // double-breasted buttons
    for (const yy of [shY + 3, shY + 6, waistY - 2]) { o.push(dot(X(-2.5), Y(yy), PAL.steel[3])); o.push(dot(X(2.5), Y(yy), PAL.steel[3])); }
    // belt, buckle and mag pouches
    o.push(P([[X(-shX - 0.3), Y(waistY - 1.1)], [X(shX + 0.3), Y(waistY - 1.1)], [X(shX + 0.4), Y(waistY + 1.2)], [X(-shX - 0.4), Y(waistY + 1.2)]], PAL.leather));
    o.push(P([[X(-1.5), Y(waistY - 1.4)], [X(1.5), Y(waistY - 1.4)], [X(1.5), Y(waistY + 1.5)], [X(-1.5), Y(waistY + 1.5)]], PAL.steel, { edge: ink('#3c434e', { gloss: 0.6 }) }));
    for (const sx of [-1, 1]) for (let i = 0; i < 2; i++) {
      const x0 = sx * (3.0 + i * 2.3);
      o.push(P([[X(x0 - 0.9 * sx), Y(waistY + 1)], [X(x0 + 0.9 * sx), Y(waistY + 1)], [X(x0 + 0.9 * sx), Y(waistY + 4.6)], [X(x0 - 0.9 * sx), Y(waistY + 4.6)]], PAL.pouch, { edge: ink('#120e0c') }));
    }
    // dark green collar with lapels
    o.push(P([[X(-4.2), Y(shY - 0.6)], [X(4.2), Y(shY - 0.6)], [X(3.2), Y(shY + 2.4)], [X(0), Y(shY + 4)], [X(-3.2), Y(shY + 2.4)]], PAL.collar, { edge: ink('#0c1612') }));
    // shoulder straps (epaulettes)
    o.push(Cap(X(-shX + 0.5), Y(shY + 0.7), X(-shX + 3.5), Y(shY + 0.3), 0.7, 0.7, PAL.coat, { flat: 3 }));
    o.push(Cap(X(shX - 0.5), Y(shY + 0.7), X(shX - 3.5), Y(shY + 0.3), 0.7, 0.7, PAL.coat, { flat: 3 }));
  } else {
    // long black leather coat, belted, glossy
    o.push(P([[X(-shX - 0.6), Y(shY + 0.2)], [X(shX + 0.6), Y(shY + 0.2)], [X(shX - 0.2), Y(waistY)], [hemW + bx * 0.5 + hs, Y(hemY) - by * 0.5], [-hemW + bx * 0.5 + hs, Y(hemY) - by * 0.5], [X(-shX + 0.2), Y(waistY)]], PAL.leather, { edge: C.out }));
    o.push(P([[X(0.4), Y(waistY + 1)], [X(1.4) + hs * 0.5, Y(hemY) - by * 0.5], [X(-0.4) + hs * 0.5, Y(hemY) - by * 0.5]], PAL.leather, { flat: 0 }));
    // lapels opening onto a field-grey tunic + white shirt + black tie
    o.push(P([[X(-3.4), Y(shY - 0.4)], [X(3.4), Y(shY - 0.4)], [X(0.6), Y(shY + 7)], [X(-0.6), Y(shY + 7)]], PAL.fieldgrey, { flat: 2 }));
    o.push(P([[X(-1.6), Y(shY - 0.4)], [X(1.6), Y(shY - 0.4)], [X(0), Y(shY + 3.4)]], C.white));
    o.push(P([[X(-0.6), Y(shY + 0.4)], [X(0.6), Y(shY + 0.4)], [X(0.5), Y(shY + 4.6)], [X(-0.5), Y(shY + 4.6)]], ink('#0e0c12')));
    o.push(P([[X(-4.6), Y(shY - 0.6)], [X(-3.0), Y(shY - 0.6)], [X(-0.2), Y(shY + 7.4)], [X(-1.4), Y(shY + 7.4)]], PAL.leather, { flat: 3 }));
    o.push(P([[X(3.0), Y(shY - 0.6)], [X(4.6), Y(shY - 0.6)], [X(1.4), Y(shY + 7.4)], [X(0.2), Y(shY + 7.4)]], PAL.leather, { flat: 2 }));
    // belt + silver buckle, buttons
    o.push(P([[X(-shX + 0.2), Y(waistY - 1)], [X(shX - 0.2), Y(waistY - 1)], [X(shX - 0.1), Y(waistY + 1)], [X(-shX + 0.1), Y(waistY + 1)]], PAL.leather, { flat: 0 }));
    o.push(P([[X(-1.3), Y(waistY - 1.3)], [X(1.3), Y(waistY - 1.3)], [X(1.3), Y(waistY + 1.3)], [X(-1.3), Y(waistY + 1.3)]], PAL.steel));
    for (const yy of [waistY + 4, waistY + 8]) { o.push(dot(X(-2.5), Y(yy), C.silver)); o.push(dot(X(2.5), Y(yy), C.silver)); }
    // silver shoulder boards
    o.push(Cap(X(-shX + 0.4), Y(shY + 0.6), X(-shX + 3.6), Y(shY + 0.2), 0.8, 0.8, C.silver));
    o.push(Cap(X(shX - 0.4), Y(shY + 0.6), X(shX - 3.6), Y(shY + 0.2), 0.8, 0.8, C.silver));
  }
  return o;
}

/** Head in head-local space (neck at (0, kit.neckY)); returns prims (caller rotates for tilt). */
const rectP = (x0, y0, x1, y1, col, o) => P([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], col, o);
/** Head in head-local space (neck at (0, kit.neckY)); returns prims (caller rotates for tilt). post:true = drawn after the outline. */
function head(kit, face, hatOff = false) {
  const { headY: hy, headRX: rx, headRY: ry, fur, belly } = kit, o = [], mouse = kit.head === 'mouse';
  const ey = Math.round(hy + (mouse ? 1.5 : 0.5));         // eye rows: ey-1 .. ey (rat), ey-2 .. ey (mouse)
  const ex = mouse ? 3 : 2;                                  // eye block centre x
  o.push(E(0, hy, rx, ry, fur));                             // cranium
  if (mouse) o.push(E(0, hy + 2.5, rx * 0.8, ry * 0.6, belly)); // pale cheeks
  const sl = mouse ? 4 : 6, sb = ey + sl;                    // snout tip row
  o.push(Cap(0, ey + 1, 0, sb - 0.5, mouse ? 3.6 : 3.4, mouse ? 2.2 : 1.7, belly));
  o.push(E(0, sb, 2.1, 1.25, PAL.pink, { gloss: 0.45 }));  // wet nose
  o.push(dot(-0.5, sb - 0.5, ink('#ffe6e6', { gloss: 0.6 })));
  // eyes
  for (const s of [-1, 1]) {
    const cx = s * ex, top = mouse ? ey - 2 : ey - 1;
    if (face === 'pain') o.push(Cap(cx - 1.4, ey - 1 + (s < 0 ? -0.6 : 0.6) * 0, cx + 1.4, ey - 0.4, 0.55, 0.55, C.eye), Cap(cx - 1.2, ey - 1.6 + (s > 0 ? 1.2 : 0), cx + 1.2, ey - 1.6 + (s > 0 ? 0 : 1.2), 0.5, 0.5, C.eye));
    else if (face === 'dead') o.push(Cap(cx - 1, top, cx + 1, ey + 0.6, 0.45, 0.45, C.eye), Cap(cx - 1, ey + 0.6, cx + 1, top, 0.45, 0.45, C.eye));
    else if (face === 'shut') o.push(rectP(cx - 1.5, ey - 0.6, cx + 1.5, ey + 0.4, C.eye));
    else {
      o.push(rectP(cx - 1, top, cx + 1, ey + 1, C.eye));
      o.push(dot(cx - 0.5, top + 0.5, mouse ? C.eyeGlint : C.eyeRed));
      if (!mouse) o.push(dot(cx + 0.5, ey + 0.5, ink('#7a1410', { emit: 0.3 })));
    }
  }
  // mouth / teeth under the nose
  const m0 = sb + 1;
  if (face === 'shout' || face === 'pain') {
    o.push(E(0, m0 + 1.5, 2.2, 1.8, C.mouth));
    o.push(rectP(-1, m0, 1, m0 + 1, C.tooth));
    o.push(dot(0.5, m0 + 2.5, C.tongue));
  } else if (face === 'dead') {
    o.push(rectP(-1, m0, 1, m0 + 1, C.tooth));
    o.push(rectP(0, m0 + 1, 2, m0 + 3, C.tongue));
  } else if (face === 'sneer') {
    o.push(rectP(-1, m0, 1, m0 + 2, C.tooth));
    o.push(rectP(1, m0, 3, m0 + 1, C.mouth));
  } else o.push(rectP(-1, m0, 1, m0 + 2, C.tooth));
  // hats
  if (hatOff) { /* knocked off: drawn on the floor by renderFrame */ }
  else if (kit.hat === 'helmet') o.push(...helmet(0, ey - 2.2, 1));
  else if (kit.hat === 'bighelmet') o.push(...helmet(0, ey - 3.4, 1.36, true));
  else if (kit.hat === 'cap') o.push(...cap(0, ey - 4.2));
  // ears poke out from under the hat
  if (mouse) for (const s of [-1, 1]) { o.push(E(s * 12.4, ey - 3.5, 6.2, 5.8, fur, { edge: C.out })); o.push(E(s * 12.0, ey - 3.0, 3.3, 3.1, PAL.pink, { bias: 0.1 })); }
  else for (const s of [-1, 1]) { o.push(E(s * 9.0, ey - 1.6, 3.7, 3.5, fur, { edge: C.out })); o.push(E(s * 8.8, ey - 1.2, 1.9, 1.8, PAL.pink)); }
  // monocle over the viewer's-left eye
  if (kit.hat === 'cap' && face !== 'dead') {
    o.push(E(-ex, ey, 2.7, 2.7, C.monoRim), E(-ex, ey, 1.8, 1.8, C.monoGlass));
    if (face !== 'pain' && face !== 'shut') o.push(rectP(-ex - 1, ey - 1, -ex + 1, ey + 1, C.eye), dot(-ex + 0.5, ey + 0.5, C.eyeRed));
    else o.push(rectP(-ex - 1.5, ey - 0.6, -ex + 1.5, ey + 0.4, C.eye));
    o.push(dot(-ex - 0.5, ey - 1.5, ink('#ffffff', { gloss: 1, spark: 1, emit: 0.3 })));
    o.push(Cap(-ex - 2.2, ey + 1.8, -ex - 3.4, ey + 8, 0.4, 0.4, C.monoRim));
  }
  // whiskers (after the outline so they stay hair-thin)
  const wc = mouse ? ink('#b8b2bc') : kit.fur === PAL.ratWhite ? ink('#bdb6c6') : ink('#c4b49a');
  for (const s of [-1, 1]) {
    o.push(Cap(s * 3.5, sb - 1.5, s * 7.5, sb - 2.8, 0.42, 0.4, wc, { post: true }));
    o.push(Cap(s * 3.5, sb - 0.5, s * 7.5, sb + 0.3, 0.42, 0.4, wc, { post: true }));
  }
  return o;
}

/** Stahlhelm, front view. (x,y) = line where the dome meets the skirt; front brim sits ~1k below. */
function helmet(x, y, k = 1, big = false) {
  const H = big ? PAL.helmetBig : PAL.helmet;
  const pts = [...arc(x, y, 8.6 * k, 8.2 * k, Math.PI, 2 * Math.PI, 18),
    [x + 10.8 * k, y + 3.3 * k], [x + 9.8 * k, y + 4.5 * k], [x + 7.2 * k, y + 2.6 * k], [x + 5.8 * k, y + 1.1 * k],
    [x - 5.8 * k, y + 1.1 * k], [x - 7.2 * k, y + 2.6 * k], [x - 9.8 * k, y + 4.5 * k], [x - 10.8 * k, y + 3.3 * k]];
  return [
    P(pts, H, { edge: C.out, en: { x, y: y - 2 * k, rx: 10.5 * k, ry: 10 * k } }),
    P([[x - 7.6 * k, y - 0.6], [x + 7.6 * k, y - 0.6], [x + 5.8 * k, y + 1.1 * k - 0.2], [x - 5.8 * k, y + 1.1 * k - 0.2]], H, { flat: 1 }), // visor ledge
    Cap(x - 7.8 * k, y - 1.2, x + 7.8 * k, y - 1.2, 0.5, 0.5, H[3]),                                      // ledge highlight
    dot(Math.round(x - 7 * k) + 0.5, Math.round(y - 3 * k) + 0.5, H[4]), dot(Math.round(x + 7 * k) - 0.5, Math.round(y - 3 * k) + 0.5, H[2]),  // vent rivets
  ];
}
/** Officer peaked cap, front view. (x,y) = band centre. */
function cap(x, y) {
  return [
    P([[x - 9.5, y - 4.4], [x - 4.5, y - 8], [x + 4.5, y - 8], [x + 9.5, y - 4.4], [x + 6.8, y - 1.2], [x - 6.8, y - 1.2]], PAL.capCrown, { edge: C.out, en: { x: x - 1, y: y - 3, rx: 11, ry: 7 } }),
    P([[x - 6.8, y - 1.6], [x + 6.8, y - 1.6], [x + 6.6, y + 1.0], [x - 6.6, y + 1.0]], PAL.red, { edge: ink('#3a0a10') }),
    Cap(x - 6.0, y - 1.9, x + 6.0, y - 1.9, 0.5, 0.5, C.silver),
    P([[x - 6.6, y + 0.8], [x + 6.6, y + 0.8], [x + 4.8, y + 3.0], [x - 4.8, y + 3.0]], PAL.visor, { edge: C.out, ny: -0.5, vcurve: 0.1 }),
    P([[x - 2.4, y - 3], [x + 2.4, y - 5.4], [x + 2.4, y - 3]], PAL.gold),                      // gold cheese-wedge badge
    dot(Math.round(x + 1) + 0.5, Math.round(y - 4) + 0.5, ink('#7a4a0a', { gloss: 0.6 })),      // its hole
    Cap(x - 2.6, y - 6.4, x + 2.6, y - 6.4, 0.55, 0.55, C.silver),                              // silver crest bar
  ];
}

// ───────────── the rig ─────────────
/**
 * Build all primitives for one frame.
 * pose: { bob, sway, feet:[L,R] ({x,y,s,lift,splay}), tilt, hx, hy, face, mode, flash, recoil, tail, tailUp, hem, arms }
 * mode: 'idle' | 'aim' | 'fire' | 'recover' | 'pain' | 'fall' | 'limp' | 'none'
 */
function figure(kit, pose) {
  const bx = pose.sway || 0, by = pose.bob || 0, o = [];
  const hipL = [-kit.hipX + bx, kit.hipY + by], hipR = [kit.hipX + bx, kit.hipY + by];
  const feet = pose.feet || [{ x: -kit.hipX - 0.5, y: 0 }, { x: kit.hipX + 0.5, y: 0 }];
  const shL = [-kit.shX + bx, kit.shY + by + 1], shR = [kit.shX + bx, kit.shY + by + 1];
  const sleeve = kit.torso === 'leather' ? PAL.leather : kit.torso === 'greatcoat' ? PAL.coat : PAL.fieldgrey;
  const arms = armPose(kit, pose, shL, shR, bx, by);

  o.push(...tail(kit, pose, bx, by));
  if (arms.behind) o.push(...arms.behind);
  // legs: the raised (or rear) one first
  const order = feet[0].y < feet[1].y ? [0, 1] : [1, 0];
  for (const i of order) o.push(...leg(kit, feet[i], i === 0 ? hipL : hipR));
  o.push(...torso(kit, pose, bx, by));
  // head with tilt about the neck
  const neck = [bx + (pose.hx || 0), kit.neckY + by + (pose.hy || 0)];
  if (kit.torso !== 'tunic') o.push(E(neck[0], neck[1] + 0.5, 3.2, 2.4, kit.fur));
  o.push(...xfPrims(head(kit, pose.face || 'normal', !!pose.loot), 0, kit.neckY, pose.tilt || 0, neck[0], neck[1] - kit.neckY));
  // arms + weapon in front
  o.push(...arms.front);
  return o;
}

/** Arm + weapon layout per weapon kind and mode. Returns { behind:[], front:[] }. */
function armPose(kit, pose, shL, shR, bx, by) {
  const sleeve = kit.torso === 'leather' ? PAL.leather : kit.torso === 'greatcoat' ? PAL.coat : PAL.fieldgrey;
  const mode = pose.mode || 'idle', w = kit.weapon, front = [], behind = [];
  const at = (x, y) => [x + bx, y + by];
  const band = (sh, el) => armband(kit, sh, el);
  const recoil = pose.recoil || 0;
  if (mode === 'none') return { front, behind };

  if (w === 'smg') {
    if (mode === 'idle') {
      // port arms: SMG diagonal across the body, muzzle up-left
      const elL = at(-10.5, -27.5), hL = at(-4.5, -31), elR = at(10.8, -27), hR = at(4.5, -23.5);
      front.push(...arm(kit, shR, elR, hR, sleeve), ...band(shR, elR));
      front.push(...gunXf(gunSide('smg').prims, hR[0] - 0.5, hR[1] - 1, -2.3 + (pose.gunTilt || 0), false, 1.25));
      front.push(...arm(kit, shL, elL, hL, sleeve), ...paw(kit, hL), ...paw(kit, hR));
    } else if (mode === 'aim' || mode === 'fire' || mode === 'recover') {
      // fired from the hip, aimed at the viewer
      const up = mode === 'recover' ? -2.5 : 0, mz = at(-1.5, -24.5 + up - recoil);
      const hL = at(-4.2, -22 + up - recoil), hR = at(5.6, -21 + up - recoil);
      const elL = at(-10.5, -26), elR = at(11, -25.5);
      front.push(...arm(kit, shR, elR, hR, sleeve), ...band(shR, elR));
      front.push(...arm(kit, shL, elL, hL, sleeve));
      front.push(...gunFront('smg', mz[0], mz[1]));
      front.push(...paw(kit, hL), ...paw(kit, hR));
      if (mode === 'fire') front.push(...flash(mz[0], mz[1], 8.5));
      if (mode === 'recover') front.push(E(mz[0] - 1, mz[1] - 4, 1.6, 1.4, C.smoke), E(mz[0] - 2.5, mz[1] - 7, 1.2, 1.1, C.smoke));
    } else if (mode === 'pain') {
      const elL = at(-12, -31), hL = at(-14, -38), elR = at(12.5, -29), hR = at(15, -34);
      front.push(...arm(kit, shR, elR, hR, sleeve), ...band(shR, elR), ...paw(kit, hR));
      front.push(...gunXf(gunSide('smg').prims, hL[0], hL[1] + 1, -1.9));
      front.push(...arm(kit, shL, elL, hL, sleeve), ...paw(kit, hL));
    } else if (mode === 'fall') {
      const elL = at(-12, -33), hL = at(-13, -41), elR = at(12, -32), hR = at(13.5, -40);
      front.push(...arm(kit, shR, elR, hR, sleeve), ...band(shR, elR), ...paw(kit, hR));
      front.push(...arm(kit, shL, elL, hL, sleeve), ...paw(kit, hL));
    } else { // limp
      const elL = at(-10, -27), hL = at(-11, -20), elR = at(10, -27), hR = at(11, -20);
      front.push(...arm(kit, shR, elR, hR, sleeve), ...band(shR, elR), ...paw(kit, hR));
      front.push(...arm(kit, shL, elL, hL, sleeve), ...paw(kit, hL));
    }
  } else if (w === 'luger') {
    // left (screen-right) hand on the hip, akimbo, unless flailing
    const akimbo = () => { const el = at(12.6, -29.5), h = at(7.6, -25.5); front.push(...arm(kit, shR, el, h, sleeve), ...band(shR, el), ...paw(kit, h)); };
    if (mode === 'idle') {
      akimbo();
      const el = at(-11.8, -28.5), h = at(-10.6, -36.5);
      front.push(...gunXf(gunSide('luger').prims, h[0], h[1], -Math.PI / 2 + 0.08, true, 1.7));
      front.push(...arm(kit, shL, el, h, sleeve), ...paw(kit, h));
    } else if (mode === 'aim' || mode === 'fire' || mode === 'recover') {
      akimbo();
      const up = mode === 'recover' ? -4 : 0, mz = at(-3.5, -33.5 + up - recoil), h = at(-3.5, -30.5 + up - recoil), el = at(-8.5, -30 + up * 0.5);
      front.push(...arm(kit, shL, el, h, sleeve, { near: 1.2 }), ...paw(kit, h, 1.25));
      front.push(...gunFront('luger', mz[0], mz[1]));
      if (mode === 'fire') front.push(...flash(mz[0], mz[1], 7.5));
      if (mode === 'recover') front.push(E(mz[0] - 1, mz[1] - 4, 1.5, 1.3, C.smoke), E(mz[0] - 2, mz[1] - 7, 1.1, 1.0, C.smoke));
    } else if (mode === 'pain') {
      const elR = at(12.5, -30), hR = at(15, -36), elL = at(-12, -31), hL = at(-14.5, -37);
      front.push(...arm(kit, shR, elR, hR, sleeve), ...band(shR, elR), ...paw(kit, hR));
      front.push(...gunXf(gunSide('luger').prims, hL[0], hL[1], -2.4, true));
      front.push(...arm(kit, shL, elL, hL, sleeve), ...paw(kit, hL));
    } else if (mode === 'fall') {
      const elL = at(-12, -33), hL = at(-13, -41), elR = at(12, -32), hR = at(13.5, -40);
      front.push(...arm(kit, shR, elR, hR, sleeve), ...band(shR, elR), ...paw(kit, hR));
      front.push(...arm(kit, shL, elL, hL, sleeve), ...paw(kit, hL));
    } else {
      const elL = at(-9.5, -27.5), hL = at(-10.5, -20.5), elR = at(9.5, -27.5), hR = at(10.5, -20.5);
      front.push(...arm(kit, shR, elR, hR, sleeve), ...band(shR, elR), ...paw(kit, hR));
      front.push(...arm(kit, shL, elL, hL, sleeve), ...paw(kit, hL));
    }
  } else { // mouse pistol
    if (mode === 'idle') {
      const elL = at(-8, -19.5), hL = at(-7.6, -14.5), elR = at(8, -19.5), hR = at(7.4, -14.8);
      front.push(...arm(kit, shR, elR, hR, sleeve), ...band(shR, elR), ...paw(kit, hR));
      front.push(...gunXf(gunSide('pistol').prims, hL[0], hL[1], Math.PI / 2 - 0.25, true, 1.7));
      front.push(...arm(kit, shL, elL, hL, sleeve), ...paw(kit, hL));
    } else if (mode === 'aim' || mode === 'fire' || mode === 'recover') {
      const up = mode === 'recover' ? -3 : 0, mz = at(0, -21.5 + up - recoil);
      const hL = at(-2.2, -19 + up - recoil), hR = at(2.2, -19 + up - recoil), elL = at(-7.5, -19), elR = at(7.5, -19);
      front.push(...arm(kit, shR, elR, hR, sleeve), ...band(shR, elR));
      front.push(...arm(kit, shL, elL, hL, sleeve));
      front.push(...gunFront('pistol', mz[0], mz[1]));
      front.push(...paw(kit, hL), ...paw(kit, hR));
      if (mode === 'fire') front.push(...flash(mz[0], mz[1] - 0.5, 6.5));
      if (mode === 'recover') front.push(E(mz[0] - 0.5, mz[1] - 4, 1.4, 1.2, C.smoke), E(mz[0] - 1.5, mz[1] - 6.5, 1.0, 0.9, C.smoke));
    } else if (mode === 'pain') {
      const elL = at(-9.5, -22), hL = at(-12, -28), elR = at(9.5, -22), hR = at(12, -28);
      front.push(...arm(kit, shR, elR, hR, sleeve), ...band(shR, elR), ...paw(kit, hR));
      front.push(...gunXf(gunSide('pistol').prims, hL[0], hL[1], -2.2, true));
      front.push(...arm(kit, shL, elL, hL, sleeve), ...paw(kit, hL));
    } else if (mode === 'fall') {
      const elL = at(-9.5, -24), hL = at(-10.5, -31), elR = at(9.5, -24), hR = at(10.5, -31);
      front.push(...arm(kit, shR, elR, hR, sleeve), ...band(shR, elR), ...paw(kit, hR));
      front.push(...arm(kit, shL, elL, hL, sleeve), ...paw(kit, hL));
    } else {
      const elL = at(-7.5, -19), hL = at(-8.5, -14), elR = at(7.5, -19), hR = at(8.5, -14);
      front.push(...arm(kit, shR, elR, hR, sleeve), ...band(shR, elR), ...paw(kit, hR));
      front.push(...arm(kit, shL, elL, hL, sleeve), ...paw(kit, hL));
    }
  }
  return { front, behind };
}

// ───────────── poses per animation ─────────────
function feetStand(kit, d = 0) { return [{ x: -kit.hipX - 0.6 - d, y: 0 }, { x: kit.hipX + 0.6 + d, y: 0 }]; }

function walkPose(kit, i) {
  const hx = kit.hipX + 0.6;
  const F = [
    [{ x: -hx, y: 0, s: 1.12 }, { x: hx - 0.4, y: -1.2, s: 0.9 }],
    [{ x: -hx + 0.3, y: 0, s: 1.0 }, { x: hx - 0.6, y: -5.2, s: 1.08, lift: 5 }],
    [{ x: -hx + 0.4, y: -1.2, s: 0.9 }, { x: hx, y: 0, s: 1.12 }],
    [{ x: -hx + 0.6, y: -5.2, s: 1.08, lift: 5 }, { x: hx - 0.3, y: 0, s: 1.0 }],
  ][i];
  return { feet: F, bob: [1, 0, 1, 0][i], sway: [-0.5, -1, 0.5, 1][i], hem: [1, 0.5, -1, -0.5][i], tail: [-1, 0, 1, 0][i], tilt: [0.03, 0, -0.03, 0][i], mode: 'idle', gunTilt: [0.04, 0, -0.04, 0][i] };
}

function posesFor(type) {
  const kit = KITS[type], st = feetStand(kit);
  const P0 = { feet: st, mode: 'idle', face: type === 'officer' ? 'sneer' : 'normal' };
  const fx = (o) => ({ ...P0, ...o });
  return {
    idle: [fx({})],
    walk: [0, 1, 2, 3].map((i) => fx(walkPose(kit, i))),
    attack: [
      fx({ mode: 'aim', face: type === 'officer' ? 'sneer' : 'normal', feet: feetStand(kit, 0.6) }),
      fx({ mode: 'fire', face: 'shout', recoil: 1, sway: 0.5, feet: feetStand(kit, 0.6), tilt: -0.04 }),
      fx({ mode: 'recover', face: type === 'officer' ? 'sneer' : 'normal', feet: feetStand(kit, 0.6), tilt: 0.03 }),
    ],
    pain: [fx({ mode: 'pain', face: 'pain', tilt: 0.28, hx: 1.2, sway: 1.5, bob: 1, feet: [{ x: -kit.hipX - 1.2, y: 0 }, { x: kit.hipX + 0.2, y: -1.5, s: 0.95 }], tail: 1, tailUp: 4 })],
    die: [
      { ...P0, mode: 'fall', face: 'shut', tilt: -0.35, hy: 0.5, bob: 0, sway: -1, tail: 1.5, tailUp: 6, R: { rot: -0.1 } },
      { ...P0, mode: 'limp', face: 'dead', tilt: 0.3, bob: 5, feet: [{ x: -kit.hipX - 2, y: 0, splay: 2.5 }, { x: kit.hipX + 2, y: 0, splay: 2.5 }], tail: 1, R: { rot: 0.18 } },
      { ...P0, mode: 'limp', face: 'dead', tilt: 0.4, bob: 6, feet: [{ x: -kit.hipX - 2, y: 0, splay: 2.5 }, { x: kit.hipX + 2, y: 0, splay: 2.5 }], tail: 0.5, R: { rot: 0.85, sq: 0.85 } },
      { ...P0, mode: 'limp', face: 'dead', tilt: 0.25, bob: 4, tail: 0, R: { rot: 1.32, sq: 0.68 } },
    ],
    dead: [{ ...P0, mode: 'limp', face: 'dead', tilt: 0.15, bob: 2, tail: -0.5, feet: [{ x: -kit.hipX - 1, y: -5, splay: 3 }, { x: kit.hipX + 1, y: -6, splay: 3 }], R: { rot: Math.PI / 2, sq: 0.6 }, loot: true }],
  };
}

// ───────────── frame assembly ─────────────
const SCR = [0, 1, 2].map(() => new PixBuf(TW, TH));
function renderFrame(type, pose) {
  const kit = KITS[type], R0 = pose.R || {};
  const scratch = SCR[0].clear(), post = SCR[1].clear();
  const X = makeXf(R0.rot || 0, R0.sq || 1, 0, 0);
  const prims = figure(kit, pose);
  raster(scratch, prims.filter((p) => !p.post), X);
  raster(post, prims.filter((p) => p.post), X);
  let bbox = opaqueBox(scratch);
  const lying = Math.abs(R0.rot || 0) > 1.2;
  // dropped gear lies on the floor just *behind* the body (higher on screen = further away)
  if (lying) {
    const id = makeXf(0, 1, 0, 0), loot = [];
    const top = bbox[1] + 0.5 - AY, headRight = (R0.rot || 0) > 0;
    const hx = (headRight ? bbox[2] - 6 : bbox[0] + 6) - AX, gx = (headRight ? bbox[0] + 6 : bbox[2] - 18) - AX;
    if (pose.loot) {
      if (kit.hat === 'cap') loot.push(...cap(hx - 3, top + 0.5));
      else loot.push(...helmet(hx - 5, top - 0.5, kit.hat === 'bighelmet' ? 0.9 : 0.72, kit.hat === 'bighelmet'));
    }
    loot.push(...gunXf(gunSide(kit.weapon).prims, gx, top + 1.5, 0.08, false, kit.weapon === 'smg' ? 1.1 : 1.2));
    const lay = SCR[2].clear();
    raster(lay, loot, id);
    copyOver(lay, scratch, 0, 0);
    scratch.clear(); copyOver(scratch, lay, 0, 0);
    bbox = opaqueBox(scratch);
  }
  const pb = opaqueBox(post);
  if (pb[2] >= 0) bbox = [Math.min(bbox[0], pb[0]), Math.min(bbox[1], pb[1]), Math.max(bbox[2], pb[2]), bbox[3]];
  // fit into 64×64: standing frames keep the feet anchored; tipped/lying frames sit on the bottom row, clamped in
  let dx = 32 - AX, dy = R0.rot ? 62 - bbox[3] : 63 - AY;
  if (pose.loot) dx = Math.round(32 - (bbox[0] + bbox[2] + 1) / 2);
  if (bbox[0] + dx < 2) dx = 2 - bbox[0];
  if (bbox[2] + dx > 61) dx = 61 - bbox[2];
  const f = new PixBuf(S, S);
  copyOver(f, scratch, dx, dy);
  f.outline(OUT);
  copyOver(f, post, dx, dy);
  return f;
}

/** Fast opaque copy (src pixels with alpha > 0 overwrite dst), offset by (dx,dy). */
function copyOver(dst, src, dx, dy) {
  for (let y = 0; y < src.h; y++) {
    const ty = y + dy; if (ty < 0 || ty >= dst.h) continue;
    for (let x = 0; x < src.w; x++) {
      const tx = x + dx; if (tx < 0 || tx >= dst.w) continue;
      const si = (y * src.w + x) * 4; if (!src.rgba[si + 3]) continue;
      const di = (ty * dst.w + tx) * 4;
      for (let k = 0; k < 4; k++) { dst.rgba[di + k] = src.rgba[si + k]; dst.mat[di + k] = src.mat[si + k]; }
    }
  }
}

function opaqueBox(p) {
  let a = p.w, b = p.h, c = -1, d = -1;
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (p.rgba[(y * p.w + x) * 4 + 3] >= 128) { if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > d) d = y; }
  return [a, b, c, d];
}

export const TYPES = ['mouse', 'trooper', 'officer'];

export function build() {
  const out = {};
  for (const type of TYPES) {
    const poses = posesFor(type), anims = ENEMIES[type].anims;
    for (const anim of Object.keys(anims)) {
      const list = poses[anim] || poses.idle;
      const frames = [];
      for (let i = 0; i < anims[anim]; i++) frames.push(renderFrame(type, list[Math.min(i, list.length - 1)]));
      out[`${type}.${anim}`] = frames;
    }
  }
  return out;
}

// exported for tests / other tools
export { KITS, posesFor, renderFrame };
