// decor — scenery sprites (64×64, transparent, feet on the bottom row; `hang` pieces touch the top row).
// Owner: art-decor. Deterministic (hash2 only). Light from the upper-left; 1px #1a1420 outline.
import { PixBuf, ink, ramp, hash2, shade, mix } from './pixbuf.js';

const OUT = '#1a1420';
const rp = (base, m = {}, n = 4) => ramp(base, n).map((c) => ink(c, m));     // dark → light
const sprite = () => new PixBuf(64, 64);
const done = (p) => p.outline(OUT);
const I = (c, m) => ink(c, m);

/** Shaded ellipse lit from the upper-left using a 4-step ramp (dark..light). */
function ball(p, cx, cy, rx, ry, r) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry, d = u * u + v * v;
      if (d > 1) continue;
      const l = -0.55 * u - 0.65 * v + 0.55 * Math.sqrt(1 - d);
      p.set(x, y, r[l > 0.62 ? 3 : l > 0.2 ? 2 : l > -0.28 ? 1 : 0]);
    }
}
/** Vertical cylinder shading by column (light on the left). */
function cyl(p, x, y, w, h, r) {
  for (let i = 0; i < w; i++) {
    const f = (i + 0.5) / w, c = r[f < 0.2 ? 3 : f < 0.5 ? 2 : f < 0.8 ? 1 : 0];
    for (let j = 0; j < h; j++) p.set(x + i, y + j, c);
  }
}
/** Horizontal cylinder shading by row (light on top). */
function cylH(p, x, y, w, h, r) {
  for (let j = 0; j < h; j++) {
    const f = (j + 0.5) / h, c = r[f < 0.25 ? 3 : f < 0.55 ? 2 : f < 0.85 ? 1 : 0];
    for (let i = 0; i < w; i++) p.set(x + i, y + j, c);
  }
}
/** Small cheese-wedge emblem (side view), `s` = height. */
function wedge(p, x, y, s, c, hole) {
  p.poly([[x, y + s], [x + s * 2, y + s], [x + s * 2, y + Math.round(s * 0.35)]], c);
  if (hole) { p.set(x + Math.round(s * 1.2), y + Math.round(s * 0.75), hole); if (s > 5) p.set(x + Math.round(s * 0.6), y + s - 2, hole); }
}
const flame = (p, cx, y, big = 1, lean = 0) => {          // emissive candle flame, base at y
  const h = big ? 5 : 3;
  p.poly([[cx - 2, y], [cx + 2, y], [cx + 1 + lean, y - h + 1], [cx + lean, y - h - 1]], I('#ff7a14', { emit: 1 }));
  p.poly([[cx - 1, y], [cx + 1, y], [cx + lean, y - h + 1]], I('#ffc030', { emit: 1 }));
  p.rect(cx, y - 1, 1, 2 + (big ? 1 : 0), I('#fff6c0', { emit: 1 }));
};

// shared ramps
const WOOD = rp('#7a4a22', { gloss: 0.12 });
const OAK = rp('#8a5a2a', { gloss: 0.1 });
const IRON = rp('#4e5560', { gloss: 0.3 });
const STEEL = rp('#8d98a8', { gloss: 0.6 });
const BRASS = rp('#c8921e', { gloss: 0.5, spark: 0.15 });
const CHED = rp('#f2a91e', { gloss: 0.15 });
const SWISS = rp('#f6dc6a', { gloss: 0.12 });
const RIND = rp('#a85a10', { gloss: 0.08 });
const STONE = rp('#8b8f92');
const CREAM = rp('#fde3b0');
const RED = rp('#c21f24', { gloss: 0.1 });
const GREY = rp('#6b7468');
const CLOTH = rp('#e8dcc4');
const CANDLE = rp('#f3e6c4');

// ───────────────────────────── barrel ─────────────────────────────
function barrel() {
  const p = sprite();
  const top = 20, bot = 61;
  const half = (y) => { const t = (y - top) / (bot - top); return Math.round(14 + 4 * Math.sin(Math.PI * t)); };
  for (let y = top; y <= bot; y++) {
    const hw = half(y);
    for (let x = 32 - hw; x < 32 + hw; x++) {
      const f = (x - (32 - hw)) / (2 * hw), stave = Math.floor((x + 3) / 5);
      let k = f < 0.2 ? 3 : f < 0.5 ? 2 : f < 0.82 ? 1 : 0;
      if ((x + 3) % 5 === 0) k = Math.max(0, k - 1);
      const c = OAK[k];
      p.set(x, y, hash2(stave, 7, 3) > 0.7 && k > 0 ? OAK[k - 1] : c);
    }
  }
  p.ellipse(32, top + 0.5, 14.5, 4.5, OAK[3]);                    // lid
  p.ring(32, top + 0.5, 14.5, 4.5, OAK[1]);
  p.ellipse(32, top + 0.5, 10, 2.8, OAK[2]);
  p.hline(24, top, 5, OAK[3]);
  for (const by of [26, 40, 55]) {                                // iron bands, following the bulge
    for (let y = by; y < by + 3; y++) {
      const hw = half(y);
      for (let x = 32 - hw; x < 32 + hw; x++) {
        const f = (x - (32 - hw)) / (2 * hw);
        p.set(x, y, IRON[y === by ? (f < 0.5 ? 3 : 2) : f < 0.2 ? 2 : f < 0.7 ? 1 : 0]);
      }
    }
    for (const rx of [-9, 0, 9]) p.set(32 + rx, by + 1, IRON[3]);
  }
  wedge(p, 24, 43, 8, I('#e8a020'), I('#6b3a0a'));               // branded cheese emblem
  p.rect(24, 51, 16, 1, I('#e8a020'));
  return done(p);
}

// ───────────────────────────── cheese wheels ─────────────────────────────
function wheel(p, cx, yb, rx, h, seed, topCol = 3) {
  const ry = Math.round(rx * 0.3), yt = yb - h;
  for (let x = cx - rx; x < cx + rx; x++) {
    const u = (x + 0.5 - cx) / rx, f = (x - (cx - rx)) / (2 * rx), k = f < 0.18 ? 3 : f < 0.5 ? 2 : f < 0.82 ? 1 : 0;
    const yBot = yb + Math.round(Math.sqrt(Math.max(0, 1 - u * u)) * ry);
    for (let y = yt; y <= yBot; y++) p.set(x, y, y >= yBot - 2 ? RIND[Math.max(0, k)] : y <= yt + 2 ? RIND[k] : CHED[k]);
  }
  p.ellipse(cx, yt, rx, ry, CHED[topCol]);                        // top face
  p.ring(cx, yt, rx, ry, RIND[3]);
  p.ellipse(cx - 2, yt - 1, rx * 0.6, ry * 0.5, SWISS[3]);
  for (let i = 0; i < 5; i++) {                                    // holes on the side
    const hx = cx - rx + 4 + Math.floor(hash2(i, seed, 1) * (2 * rx - 11)), hy = yt + 4 + Math.floor(hash2(i, seed, 2) * Math.max(1, h - 9));
    p.rect(hx, hy, 3, 2, I('#7a3c06')); p.rect(hx, hy + 2, 3, 1, I('#e0900f')); p.set(hx + 1, hy - 1, I('#7a3c06'));
  }
  for (const [dx, dy] of [[-6, -1], [4, 0], [9, -2]]) { p.rect(cx + dx, yt + dy, 2, 1, I('#8a4a08')); }
}
function cheese_stack() {
  const p = sprite();
  wheel(p, 32, 61, 25, 15, 1);
  wheel(p, 32, 46, 21, 14, 2);
  // top wheel, sliced in half: we look at the flat cut face, back half of the rim above it
  const yt = 20, yb = 33, rx = 17, ry = 5, cx = 32;
  for (let y = yt - ry; y < yt; y++) for (let x = cx - rx; x < cx + rx; x++) {
    const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - yt) / ry;
    if (u * u + v * v <= 1) p.set(x, y, v < -0.62 ? RIND[3] : CHED[3]);
  }
  for (let y = yt; y < yb; y++) for (let x = cx - rx; x < cx + rx; x++) {
    const f = (x - (cx - rx)) / (2 * rx), edge = x < cx - rx + 2 || x >= cx + rx - 2 || y >= yb - 2;
    p.set(x, y, edge ? RIND[f < 0.5 ? 3 : 1] : I(f < 0.3 ? '#ffe898' : f < 0.7 ? '#ffd770' : '#f2bc48', { gloss: 0.2 }));
  }
  p.hline(cx - rx, yt, 2 * rx, RIND[2]);
  for (const [hx, hy, r] of [[24, 26, 3], [35, 24, 2], [41, 29, 3], [30, 29, 1.5], [21, 30, 1.5]]) {
    p.ellipse(hx, hy, r, r, I('#c9780f')); p.ellipse(hx - 0.5, hy - 0.5, r - 0.8, r - 0.8, I('#8a4a08'));
    p.hline(hx - 1, hy + Math.ceil(r) - 0, 2, I('#fff0b8'));
  }
  return done(p);
}

// ───────────────────────────── table ─────────────────────────────
function table_cheese() {
  const p = sprite();
  const cl = rp('#e9dcc2');
  cyl(p, 27, 40, 10, 18, WOOD);                                    // pedestal
  p.ellipse(32, 58.5, 17, 3.5, WOOD[1]); p.ellipse(32, 57.5, 15, 2.5, WOOD[2]);
  p.rect(23, 61, 18, 1, WOOD[0]);
  for (let y = 36; y <= 46; y++) {                                 // cloth skirt with folds
    const f = (y - 36) / 10, hw = Math.round(25 - 1 * f);
    for (let x = 32 - hw; x < 32 + hw; x++) {
      const fold = Math.sin((x - 32) * 0.55) * 0.5 + 0.5, lit = (x - (32 - hw)) / (2 * hw);
      const k = Math.max(0, Math.min(3, Math.floor(fold * 1.8 + (lit < 0.3 ? 1.2 : lit < 0.6 ? 0.5 : -0.3))));
      p.set(x, y, RED[k]);
    }
  }
  for (let x = 8; x < 56; x++) if ((x & 3) < 2) p.set(x, 47, I('#ffd23e', { spark: 0.3 })); // gold fringe
  p.ellipse(32, 35.5, 25, 7, cl[3]);                               // table top cloth
  p.ring(32, 35.5, 25, 7, cl[1]);
  p.ellipse(32, 34.5, 19, 4.5, cl[2]);
  // platter + cheeses
  p.ellipse(30, 33, 13, 3.5, STEEL[2]); p.ring(30, 33, 13, 3.5, STEEL[3]); p.ellipse(30, 32.5, 9, 2, STEEL[1]);
  p.poly([[17, 33], [35, 33], [35, 22], [28, 21]], CHED[2]); p.poly([[17, 33], [24, 33], [24, 24], [28, 21]], CHED[3]);
  p.poly([[30, 33], [35, 33], [35, 22], [31, 22]], CHED[1]); p.hline(17, 33, 19, RIND[2]);
  p.set(27, 29, I('#8a4a08')); p.set(28, 29, I('#8a4a08')); p.set(31, 26, I('#8a4a08')); p.set(22, 31, I('#8a4a08'));
  ball(p, 39, 29, 5, 4, SWISS); p.ring(39, 29, 5, 4, RIND[1]); p.set(40, 28, I('#a88a1a')); p.set(38, 31, I('#a88a1a'));
  // candle
  cyl(p, 44, 20, 4, 12, CANDLE);
  p.ellipse(46, 32, 4, 1.5, BRASS[2]);
  flame(p, 46, 19, 1, 0);
  return done(p);
}

// ───────────────────────────── chandelier ─────────────────────────────
function chandelier() {
  const p = sprite();
  for (let y = 0; y < 15; y++) { const f = y & 1; p.set(31 + f, y, IRON[2]); p.set(32 + f, y, IRON[1]); if (f === 0) p.set(31, y, IRON[3]); }
  ball(p, 32, 17, 5, 4, IRON);                                      // hub
  const cx = 32, cy = 31, rx = 27, ry = 8;
  p.ring(cx, cy, rx, ry, IRON[1], 3);
  p.ring(cx, cy, rx, ry, IRON[2], 1);
  for (let a = 0; a < 6; a++) {                                     // spokes
    const ang = (a / 6) * Math.PI * 2 + 0.5, ex = cx + Math.cos(ang) * (rx - 1), ey = cy + Math.sin(ang) * (ry - 1);
    p.line(32, 19, ex, ey, IRON[1]);
  }
  const cs = [];
  for (let a = 0; a < 6; a++) { const ang = (a / 6) * Math.PI * 2 + 0.5; cs.push([Math.round(cx + Math.cos(ang) * rx), Math.round(cy + Math.sin(ang) * ry), Math.sin(ang)]); }
  cs.sort((u, v) => u[1] - v[1]);
  for (const [x, y] of cs) {
    cyl(p, x - 1, y - 8, 3, 8, CANDLE);
    p.rect(x - 2, y - 1, 5, 2, BRASS[2]);
    flame(p, x, y - 9, 1, 0);
  }
  ball(p, 32, 42, 3, 4, BRASS);                                     // finial drop
  p.poly([[31, 46], [34, 46], [32, 51]], BRASS[1]);
  return done(p);
}

// ───────────────────────────── floor lamp ─────────────────────────────
function floor_lamp() {
  const p = sprite();
  cyl(p, 30, 19, 4, 40, BRASS);
  p.rect(30, 38, 4, 2, BRASS[3]); p.rect(30, 46, 4, 1, BRASS[0]);
  ball(p, 32, 36, 3, 2, BRASS);
  p.ellipse(32, 59.5, 13, 3.5, BRASS[1]); p.ellipse(32, 58.5, 11, 2.5, BRASS[2]); p.ellipse(31, 57.5, 5, 1.2, BRASS[3]);
  p.rect(25, 61, 14, 1, BRASS[0]);
  // wedge-shaped glowing shade
  const em = (c) => I(c, { emit: 0.9 });
  p.poly([[20, 19], [44, 19], [39, 3], [25, 3]], em('#ffd860'));
  p.poly([[20, 19], [29, 19], [27, 3], [25, 3]], em('#fff0a8'));
  p.poly([[39, 3], [44, 19], [38, 19], [36, 3]], em('#f0b030'));
  for (const [x, y] of [[31, 7], [35, 12], [28, 15], [33, 16]]) { p.set(x, y, I('#c07a10', { emit: 0.5 })); p.set(x + 1, y, I('#c07a10', { emit: 0.5 })); }
  p.hline(21, 18, 22, BRASS[2]); p.hline(25, 3, 14, BRASS[3]);
  p.rect(30, 19, 4, 2, BRASS[0]);
  return done(p);
}

// ───────────────────────────── candelabra ─────────────────────────────
function candelabra(f) {
  const p = sprite();
  p.ellipse(32, 59.5, 12, 3.5, IRON[1]); p.ellipse(32, 58.5, 10, 2.5, IRON[2]); p.hline(26, 57, 6, IRON[3]);
  cyl(p, 30, 28, 4, 30, IRON);
  ball(p, 32, 48, 5, 3, IRON); ball(p, 32, 35, 4, 3, IRON);
  // arms
  const armCols = [IRON[2], IRON[1]];
  const draw = (pts, th = 2) => { for (let i = 0; i + 1 < pts.length; i++) for (let t = 0; t < th; t++) p.line(pts[i][0] + t, pts[i][1], pts[i + 1][0] + t, pts[i + 1][1], armCols[t]); };
  draw([[32, 30], [32, 18]]);
  draw([[32, 40], [24, 40], [17, 34], [15, 28]]);
  draw([[34, 40], [41, 40], [48, 34], [50, 28]]);
  const cups = [[33, 17, 0], [16, 27, -1], [50, 27, 1]];
  const lean = f ? [1, -1, 1] : [-1, 1, -1], big = f ? [0, 1, 0] : [1, 0, 1];
  cups.forEach(([x, y], i) => {
    p.rect(x - 3, y, 6, 2, BRASS[2]); p.set(x - 3, y, BRASS[3]);
    cyl(p, x - 1, y - 8, 3, 8, CANDLE);
    flame(p, x, y - 9, big[i], lean[i]);
  });
  return done(p);
}

// ───────────────────────────── rat armour ─────────────────────────────
function rat_armor() {
  const p = sprite();
  p.rect(14, 58, 28, 4, WOOD[1]); p.rect(14, 58, 28, 1, WOOD[3]); p.rect(15, 61, 26, 1, WOOD[0]);
  // legs / greaves
  cyl(p, 22, 46, 6, 12, STEEL); cyl(p, 30, 46, 6, 12, STEEL);
  p.rect(21, 56, 8, 2, STEEL[1]); p.rect(29, 56, 8, 2, STEEL[1]);
  // tassets
  p.poly([[19, 40], [39, 40], [41, 49], [17, 49]], STEEL[1]);
  for (let i = 0; i < 4; i++) p.hline(18 + i, 41 + i * 2, 22 - i * 2 + 0, i % 2 ? STEEL[1] : STEEL[2]);
  p.hline(18, 48, 24, STEEL[0]);
  // breastplate
  p.poly([[19, 22], [39, 22], [41, 31], [38, 40], [20, 40], [17, 31]], STEEL[2]);
  p.poly([[19, 22], [28, 22], [25, 40], [20, 40], [17, 31]], STEEL[3]);
  p.poly([[34, 24], [39, 22], [41, 31], [38, 40], [33, 40]], STEEL[1]);
  p.vline(28, 24, 15, STEEL[0]);
  wedge(p, 22, 28, 5, I('#e8a020', { gloss: 0.5, spark: 0.3 }));  // gilt emblem
  p.hline(19, 38, 20, STEEL[3]);
  // pauldrons
  ball(p, 17, 25, 6, 5, STEEL); ball(p, 41, 25, 6, 5, STEEL);
  // arms
  cyl(p, 11, 29, 5, 14, STEEL); cyl(p, 42, 29, 5, 14, STEEL);
  ball(p, 13.5, 44, 3, 2.5, STEEL); ball(p, 44.5, 44, 3, 2.5, STEEL);
  // helmet
  ball(p, 29, 14, 7.5, 8, STEEL);
  p.rect(21, 14, 17, 2, STEEL[1]);
  p.rect(23, 15, 13, 1, I('#15101c'));  // visor slit
  p.rect(25, 18, 9, 1, I('#15101c'));
  p.vline(29, 6, 14, STEEL[0]);
  p.poly([[28, 6], [32, 0], [35, 7], [30, 6]], I('#c21f24'));   // plume
  p.poly([[31, 1], [36, 2], [35, 8]], RED[1]);
  p.set(30, 2, RED[3]);
  // halberd
  cyl(p, 50, 6, 2, 56, WOOD);
  p.poly([[46, 14], [50, 3], [54, 14], [54, 9], [58, 12], [54, 18], [50, 20]], STEEL[2]);
  p.poly([[50, 3], [51, 3], [51, 16], [47, 14]], STEEL[3]);
  p.poly([[50, 3], [52, 0], [52, 5]], STEEL[3]);
  return done(p);
}

// ───────────────────────────── plant ─────────────────────────────
function leaf(p, x, y, ang, len, w, r) {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  for (let t = 0; t <= 1.0001; t += 0.04) {
    const px = x + dx * len * t, py = y + dy * len * t, rad = Math.max(0.8, w * Math.sin(Math.PI * Math.min(1, t * 0.95 + 0.05)));
    for (let j = -Math.ceil(rad); j <= Math.ceil(rad); j++) for (let i = -Math.ceil(rad); i <= Math.ceil(rad); i++) {
      if (i * i + j * j > rad * rad) continue;
      const l = (-(i + 0.3) * 0.5 - j * 0.5) / rad;
      p.set(Math.round(px + i), Math.round(py + j), r[l > 0.4 ? 3 : l > -0.05 ? 2 : l > -0.5 ? 1 : 0]);
    }
  }
  for (let t = 0.1; t < 0.9; t += 0.1) p.set(Math.round(x + dx * len * t), Math.round(y + dy * len * t), r[0]);
}
function plant() {
  const p = sprite();
  const G = rp('#4f9a3a', { gloss: 0.08 }), TC = rp('#c0603a', { gloss: 0.05 });
  const leaves = [[-2.9, 20, 4], [-0.2, 20, 4], [-2.4, 24, 4.5], [-0.75, 24, 4.5], [-1.57, 27, 4.5], [-2.0, 25, 4], [-1.13, 25, 4]];
  for (const [a, l, w] of leaves) leaf(p, 32, 46, a, l, w, G);
  for (const [fx, fy] of [[20, 24], [44, 26], [32, 17]]) { p.set(fx, fy, I('#d9b8ff')); p.set(fx + 1, fy, I('#f2e0ff', { spark: 0.5 })); p.set(fx, fy + 1, I('#a478d8')); }
  // pot
  p.poly([[19, 46], [45, 46], [41, 62], [23, 62]], TC[2]);
  p.poly([[19, 46], [28, 46], [26, 62], [23, 62]], TC[3]);
  p.poly([[40, 46], [45, 46], [41, 62], [37, 62]], TC[1]);
  p.rect(17, 44, 30, 5, TC[2]); p.rect(17, 44, 30, 1, TC[3]); p.rect(41, 44, 6, 5, TC[1]); p.hline(17, 48, 30, TC[0]);
  p.rect(18, 45, 12, 1, TC[3]);
  p.rect(19, 45, 26, 1, TC[3]);
  for (let x = 20; x < 44; x++) p.set(x, 47, mix(TC[1], TC[0], 0.3));
  p.hline(24, 56, 16, TC[1]);
  return done(p);
}

// ───────────────────────────── pillar ─────────────────────────────
function pillar() {
  const p = sprite();
  const S = rp('#9a9da0', { gloss: 0.1 });
  cyl(p, 17, 0, 30, 64, S);
  for (const fx of [22, 27, 32, 37, 42]) { p.vline(fx, 10, 44, S[0]); p.vline(fx + 1, 10, 44, S[2]); }
  p.rect(17, 0, 30, 1, S[3]);
  // capital (carved)
  p.rect(10, 0, 44, 5, S[2]); p.rect(10, 0, 44, 1, S[3]); p.rect(48, 0, 6, 5, S[1]);
  p.poly([[12, 5], [52, 5], [48, 12], [16, 12]], S[2]);
  p.poly([[12, 5], [22, 5], [20, 12], [16, 12]], S[3]);
  p.poly([[44, 5], [52, 5], [48, 12], [43, 12]], S[1]);
  p.hline(12, 5, 40, S[0]);
  wedge(p, 25, 5, 6, I('#f0b22a', { gloss: 0.3 }), I('#7a4a10'));
  p.rect(27, 6, 1, 1, I('#f0c860'));
  for (let x = 14; x < 50; x += 6) p.rect(x, 12, 3, 1, S[0]);
  // base
  p.rect(10, 56, 44, 8, S[2]); p.rect(10, 56, 44, 1, S[3]); p.rect(48, 56, 6, 8, S[1]); p.rect(10, 62, 44, 2, S[1]);
  p.poly([[16, 52], [48, 52], [52, 56], [12, 56]], S[2]); p.poly([[16, 52], [24, 52], [20, 56], [12, 56]], S[3]);
  p.hline(10, 61, 44, S[0]);
  return done(p);
}

// ───────────────────────────── flag stand ─────────────────────────────
function flag_stand() {
  const p = sprite();
  p.ellipse(32, 59.5, 14, 3.5, BRASS[1]); p.ellipse(32, 58.5, 12, 2.5, BRASS[2]); p.hline(25, 57, 7, BRASS[3]);
  p.rect(18, 61, 28, 1, BRASS[0]);
  cyl(p, 30, 8, 4, 50, BRASS);
  ball(p, 32, 4, 3, 3, BRASS);
  cylH(p, 14, 8, 36, 3, BRASS);
  ball(p, 13, 9.5, 2, 2, BRASS); ball(p, 50, 9.5, 2, 2, BRASS);
  // banner (waving)
  const wave = (y) => Math.round(Math.sin(y * 0.28) * 1.2);
  for (let y = 11; y < 46; y++) {
    const w = wave(y);
    for (let x = 17 + w; x < 47 + w; x++) {
      if (y > 40 && Math.abs(x - 32 - w) < (y - 40) * 2.2 && false) continue;
      const f = (x - 17 - w) / 30, fold = Math.sin(y * 0.28 + 1) > 0.5 ? -1 : 0;
      p.set(x, y, RED[Math.max(0, Math.min(3, (f < 0.22 ? 3 : f < 0.6 ? 2 : 1) + fold))]);
    }
  }
  for (let y = 41; y < 46; y++) for (let x = 32 - (y - 40) * 2 + 1; x < 32 + (y - 40) * 2 - 1; x++) p.erase(x + wave(y) , y);   // swallow-tail notch
  for (let x = 17; x < 47; x += 2) { const w = wave(46); p.set(x + w, 46, BRASS[2]); }
  const dw = wave(26);
  p.ellipse(32 + dw, 26, 9, 9, I('#f4f0e6')); p.ring(32 + dw, 26, 9, 9, I('#cfc8b8'));
  p.poly([[27 + dw, 31], [37 + dw, 31], [37 + dw, 21]], I('#1d1820'));
  p.set(34 + dw, 28, I('#f4f0e6')); p.set(31 + dw, 29, I('#f4f0e6')); p.set(35 + dw, 25, I('#f4f0e6'));
  p.hline(17, 11, 30, RED[3]);
  return done(p);
}

// ───────────────────────────── fish bones ─────────────────────────────
function fish_bones() {
  const p = sprite();
  const B = rp('#e8e2cf', { gloss: 0.1 });
  const sy = 56;
  p.hline(14, sy, 32, B[2]); p.hline(14, sy + 1, 32, B[1]);                   // spine
  for (let i = 0; i < 7; i++) {                                                // ribs
    const x = 17 + i * 4, l = 5 - Math.abs(i - 3) * 0.6;
    p.line(x, sy, x - 1, Math.round(sy - l), B[3]); p.line(x, sy + 1, x - 1, Math.round(sy + 1 + l * 0.8), B[2]);
    p.set(x - 1, Math.round(sy - l), B[3]);
  }
  p.ellipse(11, sy + 0.5, 6, 5, B[2]);                                         // skull
  p.ellipse(10, sy - 0.5, 4, 3.5, B[3]);
  p.rect(8, sy - 1, 3, 3, I('#2a2230'));
  p.poly([[5, sy + 2], [1, sy + 4], [6, sy + 5]], B[2]);                       // jaw
  p.poly([[46, sy - 1], [58, sy - 6], [56, sy + 0.5], [58, sy + 6], [46, sy + 2]], B[2]);   // tail
  p.line(47, sy, 57, sy - 4, B[0]); p.line(47, sy + 1, 57, sy + 5, B[0]);
  for (const [x, y] of [[22, 61], [32, 60], [38, 61], [50, 61], [44, 60], [26, 59], [8, 61]]) { p.set(x, y, I('#d9a84a')); p.set(x + 1, y, I('#b8842a')); }
  return done(p);
}

// ───────────────────────────── mousetrap ─────────────────────────────
function mousetrap(sprung) {
  const p = sprite();
  p.poly([[8, 52], [20, 47], [54, 47], [56, 52]], WOOD[3]);                    // top face
  p.poly([[8, 52], [56, 52], [56, 60], [8, 60]], WOOD[2]);
  p.rect(8, 52, 48, 1, WOOD[3]); p.rect(8, 59, 48, 1, WOOD[0]); p.rect(50, 52, 6, 8, WOOD[1]);
  p.rect(8, 60, 48, 2, WOOD[0]);
  for (const [x, y] of [[14, 55], [22, 56], [40, 54]]) p.hline(x, y, 6, WOOD[1]);
  // bait cheese
  p.poly([[44, 51], [54, 51], [54, 45]], CHED[2]); p.poly([[44, 51], [49, 51], [49, 48]], CHED[3]); p.set(51, 49, I('#8a4a08')); p.set(47, 50, I('#8a4a08'));
  // spring
  for (let i = 0; i < 3; i++) p.hline(9 + i * 3, 48, 2, STEEL[1 + (i & 1)]);
  const W = STEEL[3], W2 = STEEL[1];
  if (!sprung) {                                                               // armed: bar lies across the board
    p.rect(12, 49, 34, 2, W); p.rect(12, 51, 34, 1, W2);
    p.rect(11, 47, 2, 5, W);
    p.rect(40, 46, 2, 6, W2);
    p.rect(35, 45, 2, 7, STEEL[2]);
    p.hline(34, 44, 5, STEEL[3]);
  } else {                                                                     // sprung: hammer snapped upright at the left
    p.rect(14, 24, 2, 28, W); p.rect(15, 24, 1, 28, STEEL[2]);
    p.rect(33, 24, 2, 28, W2);
    p.rect(14, 24, 21, 2, W); p.rect(14, 26, 21, 1, W2);
    p.rect(9, 52, 6, 2, STEEL[2]);
    p.set(52, 49, I('#8a4a08'));
  }
  return done(p);
}

// ───────────────────────────── cheese cart ─────────────────────────────
function cheese_cart() {
  const p = sprite();
  // heap of cheese
  const chunks = [[10, 28, 18, 12, 0], [22, 20, 18, 12, 1], [36, 24, 18, 10, 2], [30, 14, 16, 12, 1], [16, 18, 14, 10, 2], [43, 17, 12, 11, 0]];
  for (const [x, y, w, h, k] of chunks) {
    const base = k === 1 ? SWISS : CHED;
    p.poly([[x, y + h], [x + 2, y + 2], [x + w - 2, y], [x + w, y + h - 3], [x + w - 3, y + h]], base[2]);
    p.poly([[x, y + h], [x + 2, y + 2], [x + 7, y + 1], [x + 3, y + h]], base[3]);
    p.poly([[x + w - 3, y + h], [x + w, y + h - 3], [x + w - 2, y], [x + w - 5, y + 3]], base[1]);
    p.hline(x + 3, y + 1, w - 7, base[3]);
    p.set(x + 6, y + 5, I('#8a4a08')); p.set(x + 7, y + 5, I('#8a4a08')); p.set(x + w - 6, y + h - 4, I('#8a4a08'));
  }
  // bin
  p.poly([[5, 33], [59, 33], [55, 52], [9, 52]], IRON[1]);
  p.poly([[5, 33], [30, 33], [27, 52], [9, 52]], IRON[2]);
  p.poly([[44, 33], [59, 33], [55, 52], [41, 52]], IRON[0]);
  cylH(p, 3, 31, 58, 4, STEEL);
  p.hline(10, 44, 44, IRON[0]); p.hline(10, 45, 44, IRON[3]);
  for (const x of [12, 22, 32, 42, 51]) { p.set(x, 40, IRON[3]); p.set(x, 49, IRON[3]); }
  p.rect(9, 52, 46, 2, IRON[0]);
  // rails + wheels
  p.rect(4, 61, 56, 2, IRON[1]); p.hline(4, 61, 56, IRON[3]);
  for (const wx of [18, 46]) { ball(p, wx, 56, 5.5, 5.5, IRON); p.circle(wx, 56, 1.5, STEEL[3]); }
  return done(p);
}

// ───────────────────────────── caged kitten ─────────────────────────────
function cage_kitten(f) {
  const p = sprite();
  for (let y = 0; y < 13; y++) { const o = y & 1; p.set(31 + o, y, IRON[3]); p.set(32 + o, y, IRON[1]); }
  p.ring(32, 14, 3, 2, IRON[3]);
  // kitten (behind the bars)
  const T = rp('#f08a1c'), D = '#c25a0e';
  ball(p, 32, 47, 10, 7, T);
  ball(p, 32, 37, 10, 8.5, T);
  p.poly([[23, 34], [24, 24], [30, 30]], T[2]); p.poly([[41, 34], [40, 24], [34, 30]], T[1]);
  p.poly([[25, 31], [25, 27], [28, 30]], I('#f2a0a0')); p.poly([[39, 31], [39, 27], [36, 30]], I('#e08888'));
  p.vline(32, 29, 3, D); p.vline(29, 30, 2, D); p.vline(35, 30, 2, D);
  p.vline(24, 39, 3, D); p.vline(40, 39, 3, D); p.hline(23, 42, 2, D);
  if (!f) {
    for (const ex of [28, 36]) { p.ellipse(ex, 38, 2.5, 3, I('#fff6d0')); p.rect(ex - 1, 37, 2, 3, I('#2a2a1a')); p.set(ex - 1, 36, '#ffffff'); }
  } else {
    for (const ex of [28, 36]) { p.hline(ex - 2, 38, 5, I('#3a2418')); p.set(ex - 2, 37, I('#3a2418')); p.set(ex + 2, 37, I('#3a2418')); }
  }
  p.set(32, 42, I('#f08090')); p.set(31, 42, I('#f08090')); p.set(32, 43, I('#c05060'));
  p.hline(21, 42, 3, '#fde3b0'); p.hline(41, 42, 3, '#fde3b0');
  if (f) { ball(p, 49, 42, 3.5, 3, T); p.vline(48, 41, 2, D); p.vline(50, 41, 2, D); }
  // cage: roof cone, bars, base
  p.poly([[14, 22], [50, 22], [36, 14], [28, 14]], IRON[2]);
  p.poly([[14, 22], [28, 14], [32, 14], [24, 22]], IRON[3]);
  p.hline(13, 22, 38, IRON[3]); p.hline(13, 23, 38, IRON[1]);
  for (let i = 0; i < 8; i++) { const x = 15 + i * 4.6 | 0; p.vline(x, 24, 28, IRON[i < 3 ? 3 : i < 6 ? 2 : 1]); }
  p.hline(15, 36, 34, IRON[1]);
  p.ellipse(32, 53.5, 18, 4, IRON[1]); p.ellipse(32, 52.5, 18, 3.5, IRON[2]); p.hline(18, 51, 14, IRON[3]);
  p.ring(32, 53, 18, 4, IRON[0]);
  return done(p);
}

// ───────────────────────────── milk puddle ─────────────────────────────
function puddle_milk() {
  const p = sprite();
  const MK = rp('#e9f0f6', { gloss: 0.9, spark: 0.1 });
  const pts = [];
  for (let a = 0; a < 20; a++) { const t = (a / 20) * Math.PI * 2, r = 1 + (hash2(a, 4, 9) - 0.5) * 0.28; pts.push([32 + Math.cos(t) * 25 * r, 56.5 + Math.sin(t) * 5.2 * r]); }
  p.poly(pts, MK[1]);
  p.ellipse(28, 56, 18, 3.4, MK[2]);
  p.ellipse(25, 55, 8, 1.6, MK[3]);
  p.hline(18, 54, 5, '#ffffff');
  // tipped bottle, mouth in the puddle
  const G = rp('#b9d4e4', { gloss: 0.85, spark: 0.2 });
  p.poly([[36, 38], [58, 36], [58, 53], [36, 55]], G[1]);
  cylH(p, 36, 38, 22, 15, G);
  p.rect(38, 42, 18, 8, I('#f8fbfd', { gloss: 0.5 }));                          // milk inside
  p.rect(38, 42, 18, 1, I('#ffffff'));
  p.poly([[36, 40], [26, 44], [26, 50], [36, 53]], G[2]);                        // shoulder + neck
  p.rect(20, 44, 7, 6, RED[2]); p.rect(20, 44, 7, 1, RED[3]); p.rect(20, 49, 7, 1, RED[0]);
  p.hline(38, 39, 16, '#ffffff');
  p.vline(56, 37, 16, G[0]);
  p.rect(40, 54, 14, 2, I('#ffffff', { gloss: 0.9 }));
  return done(p);
}

// ───────────────────────────── crate ─────────────────────────────
function crate() {
  const p = sprite();
  const W = rp('#b07a3a', { gloss: 0.08 });
  p.poly([[8, 24], [16, 16], [58, 16], [50, 24]], W[3]);                        // top
  p.poly([[50, 24], [58, 16], [58, 54], [50, 62]], W[1]);                       // right side
  p.rect(8, 24, 42, 38, W[2]);                                                  // front
  for (const y of [32, 40, 48, 55]) { p.hline(8, y, 42, W[0]); p.hline(8, y + 1, 42, W[3]); }
  for (let y = 24; y < 62; y += 8) p.set(8, y, W[3]);
  for (const y of [28, 36, 44, 51, 58]) { p.hline(10 + hash2(y, 1, 4) * 30 | 0, y, 5, W[1]); }
  p.rect(8, 24, 42, 3, W[1]); p.rect(8, 24, 42, 1, W[3]);
  p.rect(8, 59, 42, 3, W[1]);
  for (const x of [8, 47]) { p.rect(x, 24, 3, 38, W[1]); p.vline(x, 24, 38, W[3]); }  // corner posts
  for (let y = 18; y < 55; y += 7) p.hline(51, y + 2, 7, W[0]);
  p.hline(50, 24, 8, W[0]);
  // rope handle
  p.ring(29, 36, 7, 3.2, I('#d8c08a'), 2);
  p.ring(29, 36, 7, 3.2, I('#8a7040'), 1);
  p.rect(20, 34, 4, 5, W[2]); p.rect(34, 34, 4, 5, W[2]);
  p.ellipse(29, 36, 5, 1.4, I('#2a1a10'));
  // stencilled paw, crossed out
  const SC = I('#2a1a10');
  p.ellipse(29, 53, 5, 4, SC);
  for (const [x, y] of [[21, 47], [26, 44], [32, 44], [37, 47]]) p.ellipse(x, y, 2, 2.5, SC);
  const X = I('#d02024');
  p.line(18, 41, 40, 60, X); p.line(40, 41, 18, 60, X);
  p.line(19, 41, 41, 60, X); p.line(41, 41, 19, 60, X);
  return done(p);
}

// ───────────────────────────── cauldron ─────────────────────────────
function cauldron(f) {
  const p = sprite();
  const IRON = rp('#2c2f3a', { gloss: 0.35 });
  for (const lx of [16, 44]) { p.poly([[lx, 52], [lx + 7, 52], [lx + 8, 62], [lx - 1, 62]], IRON[1]); p.vline(lx + 1, 52, 10, IRON[3]); }
  p.rect(6, 61, 52, 0, IRON[0]);
  // pot body
  const cx = 32, cy = 42, R = 23;
  for (let y = 26; y <= 58; y++) {
    const v = (y - cy) / 17, hw = Math.round(R * Math.sqrt(Math.max(0, 1 - v * v * 0.75)));
    for (let x = cx - hw; x < cx + hw; x++) {
      const u = (x + 0.5 - cx) / R, l = -0.7 * u - 0.55 * v + 0.35;
      p.set(x, y, IRON[l > 0.55 ? 3 : l > 0.1 ? 2 : l > -0.45 ? 1 : 0]);
    }
  }
  p.hline(18, 38, 3, IRON[3]);
  // handles (rings on the sides)
  p.ring(8, 36, 4, 4, IRON[2], 2); p.ring(56, 36, 4, 4, IRON[1], 2);
  // rim and molten cheese
  p.ellipse(32, 28.5, 24, 6, IRON[3]);
  p.ellipse(32, 29, 21.5, 4.6, IRON[0]);
  const M = (c, e = 1) => I(c, { emit: e });
  p.ellipse(32, 29, 20.5, 4, M('#ffb21a', 0.95));
  p.ellipse(31, 28.5, 15, 2.6, M('#ffcf3e', 1));
  p.ellipse(28, 28, 7, 1.4, M('#fff0a0', 1));
  // bubbles
  const bubs = f ? [[40, 29, 2], [24, 30, 1], [33, 27, 2]] : [[26, 28, 2], [38, 30, 1], [32, 29, 1]];
  for (const [bx, by, r] of bubs) { p.ellipse(bx, by, r + 1, r, M('#ffe16a', 1)); p.set(bx - 1, by - 1, M('#ffffff', 1)); }
  if (f) { p.rect(23, 25, 1, 3, M('#ffd040', 1)); p.set(22, 24, M('#fff0a0', 1)); }   // splash droplet
  else { p.rect(41, 25, 1, 3, M('#ffd040', 1)); p.set(42, 24, M('#fff0a0', 1)); }
  // drips down the front
  const drips = f ? [[22, 9], [38, 6], [46, 4]] : [[24, 5], [36, 10], [44, 5]];
  for (const [dx, dl] of drips) { p.rect(dx, 31, 3, dl, M('#ffb21a', 0.85)); p.ellipse(dx + 1.5, 31 + dl, 2, 1.5, M('#ffcf3e', 0.9)); p.set(dx, 33, M('#ffe27a', 0.95)); }
  return done(p);
}

// ───────────────────────────── scratching post ─────────────────────────────
function scratch_post() {
  const p = sprite();
  const SI = rp('#c9a468', { gloss: 0 }), CP = rp('#6b7468');
  p.poly([[8, 55], [18, 49], [46, 49], [56, 55]], CP[2]);                      // base platform top
  p.rect(8, 55, 48, 7, CP[1]); p.rect(8, 55, 48, 1, CP[3]); p.rect(8, 61, 48, 1, CP[0]);
  p.rect(8, 55, 8, 7, CP[2]);
  // post with rope wraps
  for (let y = 14; y < 52; y++) {
    const torn = y > 30 && y < 44;
    for (let i = 0; i < 12; i++) {
      const x = 26 + i, f = i / 12, k = f < 0.25 ? 3 : f < 0.55 ? 2 : f < 0.85 ? 1 : 0;
      let c = SI[Math.max(0, k - ((y + (i >> 2)) % 3 === 0 ? 1 : 0))];
      if (torn && hash2(i, y >> 1, 5) > 0.55) c = I('#5a4026');
      p.set(x, y, c);
    }
  }
  for (let y = 15; y < 51; y += 3) p.hline(26, y, 12, SI[0]);
  for (const [y, side, len] of [[18, -1, 5], [24, 1, 6], [33, -1, 7], [38, 1, 5], [45, -1, 4], [28, 1, 4], [41, -1, 6]]) {
    const x0 = side < 0 ? 26 : 37;
    for (let i = 1; i <= len; i++) p.set(x0 + side * i, y + Math.round(i * 0.5), SI[i < len ? 2 : 3]);
    p.set(x0 + side * len, y + Math.round(len * 0.5) + 1, SI[1]);
  }
  p.ellipse(32, 13.5, 15, 4.5, CP[2]); p.ellipse(32, 12.5, 15, 4, CP[3]); p.ring(32, 13, 15, 4.5, CP[1]);
  p.rect(18, 14, 28, 2, CP[1]);
  // red ribbon bow + gold plaque (a captured trophy)
  p.poly([[26, 47], [32, 50], [26, 54]], RED[2]); p.poly([[38, 47], [32, 50], [38, 54]], RED[1]);
  p.rect(31, 49, 3, 3, RED[3]);
  p.rect(26, 57, 12, 4, BRASS[2]); p.frame(26, 57, 12, 4, BRASS[3]); p.hline(28, 59, 8, BRASS[0]);
  return done(p);
}

// ───────────────────────────── bunk ─────────────────────────────
function bunk() {
  const p = sprite();
  const BL = rp('#6b7468'), PL = rp('#e6e0d0');
  cyl(p, 6, 8, 4, 54, WOOD); cyl(p, 54, 8, 4, 54, WOOD);
  const bed = (yb, helmet) => {
    p.rect(8, yb, 48, 3, WOOD[1]); p.rect(8, yb, 48, 1, WOOD[3]);
    // blanket lump
    for (let x = 10; x < 54; x++) {
      const t = (x - 10) / 44, top = yb - 9 + Math.round(Math.sin(t * Math.PI * 3) * 1.2) + (t < 0.18 ? 4 - Math.round(t * 22) : 0);
      for (let y = top; y < yb; y++) p.set(x, y, BL[y === top ? 3 : (y - top) < 3 ? 2 : (x % 11 < 2) ? 0 : 1]);
    }
    for (const fx of [26, 40]) p.vline(fx, yb - 7, 7, BL[0]);
    p.ellipse(15, yb - 6, 6, 3, PL[2]); p.ellipse(14, yb - 7, 4, 1.5, PL[3]); p.hline(10, yb - 3, 10, PL[1]);
    p.hline(10, yb - 9, 44, 0 ? BL[3] : BL[3]);
  };
  bed(54, false); bed(30, true);
  p.rect(8, 28, 48, 1, WOOD[0]);
  // crossbar / ladder
  p.rect(8, 41, 3, 2, WOOD[2]); p.rect(52, 41, 3, 2, WOOD[2]);
  // tiny helmet on the right post
  ball(p, 56, 5, 5.5, 4, rp('#474e47', { gloss: 0.3 }));
  p.hline(49, 8, 15, I('#2e342e', { gloss: 0.3 })); p.set(54, 3, I('#8a928a'));
  p.rect(6, 61, 4, 1, WOOD[0]);
  return done(p);
}

// ───────────────────────────── radio desk ─────────────────────────────
function radio_desk(f) {
  const p = sprite();
  const OL = rp('#5b6a4a', { gloss: 0.25 });
  // desk
  cylH(p, 4, 40, 56, 4, WOOD); p.rect(4, 40, 56, 1, WOOD[3]);
  p.rect(7, 44, 6, 18, WOOD[1]); p.rect(51, 44, 6, 18, WOOD[0]); p.vline(7, 44, 18, WOOD[3]);
  p.rect(13, 44, 38, 5, WOOD[1]); p.rect(14, 45, 36, 3, WOOD[2]); p.rect(29, 46, 6, 1, BRASS[3]);
  p.rect(7, 61, 50, 1, WOOD[0]);
  // radio set
  p.rect(6, 17, 36, 23, OL[2]); p.rect(6, 17, 36, 2, OL[3]); p.rect(38, 17, 4, 23, OL[1]); p.rect(6, 38, 36, 2, OL[0]);
  p.frame(6, 17, 36, 23, OL[0]);
  p.ellipse(20, 28, 8, 8, CREAM[3]); p.ring(20, 28, 8, 8, STEEL[2]);
  p.circle(20, 28, 5, CREAM[2]);
  p.line(20, 28, f ? 24 : 16, 22, I('#c21f24')); p.set(20, 28, I('#222'));
  for (let a = 0; a < 6; a++) p.set(20 + Math.round(Math.cos(a * 0.6 - 2.6) * 6.5), 28 + Math.round(Math.sin(a * 0.6 - 2.6) * 6.5), I('#444'));
  // knobs + grille + lamp
  ball(p, 33, 24, 3, 3, IRON); ball(p, 33, 33, 3, 3, IRON); p.set(32, 23, IRON[3]);
  for (let i = 0; i < 4; i++) p.hline(14, 20 + i * 2 - 0, 0, 0);
  const lamp = f ? I('#40ff70', { emit: 1 }) : I('#ff3030', { emit: 1 });
  p.rect(36, 20, 3, 3, lamp); p.set(36, 20, I('#ffffff', { emit: 1 }));
  // antenna
  p.line(12, 17, 6, 3, STEEL[3]); p.set(6, 2, STEEL[3]); p.set(6, 3, STEEL[3]);
  // headphones lying on the desk, right
  for (let y = 18; y <= 36; y++) { const v = (y - 36) / 18, hw = Math.round(7 * Math.sqrt(Math.max(0, 1 - v * v))); p.set(52 - hw, y, IRON[3]); p.set(53 - hw, y, IRON[2]); p.set(52 + hw, y, IRON[1]); p.set(51 + hw, y, IRON[2]); }
  p.hline(49, 18, 6, IRON[3]); p.hline(49, 19, 6, IRON[2]);
  ball(p, 45, 36, 3.5, 4, IRON); ball(p, 59, 36, 3.5, 4, IRON);
  p.rect(44, 36, 2, 2, I('#c21f24'));
  p.line(54, 36, 56, 40, I('#222')); p.line(56, 40, 53, 44, I('#222'));
  return done(p);
}

// ───────────────────────────── hanging cheese ─────────────────────────────
function hanging_cheese() {
  const p = sprite();
  cylH(p, 3, 0, 58, 4, IRON); p.hline(3, 0, 58, IRON[3]);
  for (const x of [8, 56]) p.rect(x, 0, 2, 5, IRON[0]);
  const hook = (x, y) => { p.vline(x, 4, y - 4, STEEL[2]); p.set(x + 1, y, STEEL[2]); p.set(x + 1, y + 1, STEEL[3]); p.set(x, y + 1, STEEL[2]); };
  // sausage links
  hook(12, 7);
  for (let i = 0; i < 3; i++) { const y = 10 + i * 10; ball(p, 12, y + 5, 4.5, 5.5, rp('#a8402a', { gloss: 0.35 })); p.set(11, y + 3, I('#ffb8a0')); p.vline(12, y + 10, 1, I('#d8b878')); }
  // wedge on a hook
  hook(28, 7);
  p.poly([[20, 40], [38, 40], [38, 19], [26, 14]], CHED[2]);
  p.poly([[20, 40], [26, 40], [26, 16], [24, 20]], CHED[3]);
  p.poly([[34, 40], [38, 40], [38, 19], [34, 17]], CHED[1]);
  p.rect(20, 40, 18, 1, RIND[2]); p.rect(38, 19, 1, 21, RIND[1]);
  p.set(31, 28, I('#8a4a08')); p.set(32, 28, I('#8a4a08')); p.set(29, 34, I('#8a4a08')); p.set(33, 36, I('#8a4a08'));
  p.vline(28, 9, 6, I('#d8c8a0'));
  // red wax edam ball on a string
  hook(46, 6);
  p.vline(46, 8, 9, I('#d8c8a0'));
  ball(p, 46, 26, 8, 8.5, rp('#c21f24', { gloss: 0.7, spark: 0.1 }));
  p.set(42, 21, '#ffd0d0'); p.set(43, 20, '#ffd0d0'); p.hline(40, 25, 12, RED[0]);
  p.rect(44, 17, 4, 2, I('#e8dcc4'));
  // salami at the right
  hook(58, 6);
  cyl(p, 56, 10, 5, 26, rp('#8a2a24', { gloss: 0.25 }));
  for (let y = 13; y < 36; y += 4) { p.set(58, y, I('#e8c8b0')); p.set(59, y + 1, I('#e8c8b0')); }
  p.rect(55, 36, 7, 2, I('#d8c8a0'));
  return done(p);
}

// ───────────────────────────── glowing cheese ─────────────────────────────
function glow_cheese(f) {
  const p = sprite();
  const e = f ? 1 : 0.75;
  const G = [I('#4aa81c', { emit: e * 0.7 }), I('#78d82a', { emit: e * 0.9 }), I('#a8f040', { emit: e }), I('#d8ff80', { emit: 1 })];
  p.ellipse(32, 60.5, 24, 2.5, I('#2f7a14', { emit: e * 0.5 }));           // glowing ooze pool
  p.poly([[13, 60], [51, 60], [51, 47], [14, 43]], G[1]);
  p.poly([[13, 60], [22, 60], [22, 45], [14, 43]], G[2]);
  p.poly([[14, 43], [51, 47], [51, 49], [14, 45]], G[3]);
  p.poly([[44, 60], [51, 60], [51, 47], [44, 46]], G[0]);
  p.rect(13, 58, 38, 2, G[0]); p.hline(13, 43, 3, G[3]);
  for (const [x, y, r] of [[28, 52, 3], [40, 54, 2.5], [22, 56, 1.8], [34, 47, 1.5]]) { p.ellipse(x, y, r, r, I('#1f5a0c', { emit: 0.15 })); p.set(x - 1, y + Math.ceil(r), G[3]); }
  // drips + spores
  p.rect(18, 61, 3, 1, G[3]);
  const sp = f ? [[22, 36], [44, 38], [32, 30], [50, 30]] : [[26, 38], [40, 34], [34, 28], [18, 32]];
  for (const [x, y] of sp) { p.set(x, y, I('#d8ff80', { emit: 1 })); p.set(x + 1, y, I('#78d82a', { emit: 0.8 })); p.set(x, y + 1, I('#78d82a', { emit: 0.8 })); }
  return done(p);
}

// ───────────────────────────── alarm light ─────────────────────────────
function alarm_light(f) {
  const p = sprite();
  p.rect(14, 0, 36, 4, IRON[2]); p.rect(14, 0, 36, 1, IRON[3]); p.rect(14, 3, 36, 1, IRON[0]);
  for (const x of [17, 45]) p.set(x, 2, STEEL[3]);
  p.rect(28, 4, 8, 6, IRON[1]); p.rect(28, 4, 3, 6, IRON[3]);
  p.poly([[26, 10], [38, 10], [40, 14], [24, 14]], IRON[2]); p.hline(26, 10, 12, IRON[3]);
  cylH(p, 22, 14, 20, 3, IRON);
  // beacon dome hanging below
  const R = [I('#6a0e12'), I('#a81820', { emit: 0.45 }), I('#e02a2a', { emit: 0.75 }), I('#ff5a4a', { emit: 1 })];
  for (let y = 17; y <= 40; y++) {
    const v = (y - 17) / 23, hw = Math.round(11 * Math.sqrt(Math.max(0, 1 - v * v * 0.9)) + 0.5 + (y < 20 ? 0 : 0));
    for (let x = 32 - hw; x < 32 + hw; x++) p.set(x, y, R[2]);
  }
  p.ellipse(32, 27, 6, 7, I('#ff7a5a', { emit: 1 }));
  const hx = f ? 36 : 28;
  p.ellipse(hx, 28, 3, 5, I('#ffe0a0', { emit: 1 })); p.set(hx, 26, I('#ffffff', { emit: 1 }));
  p.rect(f ? 32 : 24, 21, 8, 2, R[3]);
  p.vline(f ? 41 : 22, 23, 12, R[1]);
  // light rays
  const ray = I('#ff6a50', { emit: 1 });
  if (f) { p.line(46, 28, 54, 26, ray); p.line(46, 33, 55, 36, ray); p.line(44, 22, 50, 16, ray); p.line(20, 38, 17, 42, R[2]); }
  else { p.line(18, 28, 10, 26, ray); p.line(18, 33, 9, 36, ray); p.line(20, 22, 14, 16, ray); p.line(44, 38, 47, 42, R[2]); }
  p.rect(26, 40, 12, 1, R[0]);
  return done(p);
}

export function build() {
  return {
    'decor.barrel': barrel(),
    'decor.cheese_stack': cheese_stack(),
    'decor.table_cheese': table_cheese(),
    'decor.chandelier': chandelier(),
    'decor.floor_lamp': floor_lamp(),
    'decor.candelabra': [candelabra(0), candelabra(1)],
    'decor.rat_armor': rat_armor(),
    'decor.plant': plant(),
    'decor.pillar': pillar(),
    'decor.flag_stand': flag_stand(),
    'decor.fish_bones': fish_bones(),
    'decor.mousetrap': [mousetrap(false), mousetrap(true)],
    'decor.cheese_cart': cheese_cart(),
    'decor.cage_kitten': [cage_kitten(0), cage_kitten(1)],
    'decor.puddle_milk': puddle_milk(),
    'decor.crate': crate(),
    'decor.cauldron': [cauldron(0), cauldron(1)],
    'decor.scratch_post': scratch_post(),
    'decor.bunk': bunk(),
    'decor.radio_desk': [radio_desk(0), radio_desk(1)],
    'decor.hanging_cheese': hanging_cheese(),
    'decor.glow_cheese': [glow_cheese(0), glow_cheese(1)],
    'decor.alarm_light': [alarm_light(0), alarm_light(1)],
  };
}
