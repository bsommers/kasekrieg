// items — the sixteen floor pickups (sprites 64x64, subject bottom-centred, ~22-34 px tall).
// Owner: art-items. Exports build() -> { [name]: PixBuf }. Light from the upper-left; deterministic (hash2 only).
import { PixBuf, ink, shade, mix, ramp, hash2 } from './pixbuf.js';

const S = 64;
const OUT = '#1a1420';

// ---------- palettes (dark -> light) ----------
const GOLD = ['#5a3208', '#8c5a12', '#c08a1e', '#ffd23e', '#ffe98a', '#fffbe0'];
const SILV = ['#3a404c', '#646e7e', '#949fae', '#c4ccd8', '#e6ecf3', '#ffffff'];
const STEEL = ['#2c313b', '#454c58', '#5f6876', '#7a8494', '#8d98a8', '#b3bdcb', '#dfe6ee'];
const CHED = ['#9a5a0c', '#d08a14', '#f2a91e', '#f8c844', '#fff0a0'];
const BRIE = ['#b4a880', '#d6caa0', '#ece2bc', '#fbf4d4'];
const RED = ['#4a0a10', '#7e1419', '#c21f24', '#e2493a', '#f27a5a'];
const WOOD = ['#341c11', '#482818', '#5e3520', '#76452a', '#905a36'];
const FUZZ = ['#5a5460', '#7e7884', '#a29ca6', '#c8c2c8', '#e4e0e4'];
const PINK = ['#9a2a5a', '#d44a82', '#f27aa8', '#ffb0cc'];
const TEAL = ['#0e5a60', '#1a8a90', '#34c0c0', '#8ae8e0'];
const YELL = ['#a8780a', '#e0b020', '#f8dc4c', '#fff4a0'];
const GRN = ['#0e4a1a', '#1c7a2c', '#3cc050', '#9cff90'];

const M = { gold: { gloss: 0.6, spark: 0.8 }, silv: { gloss: 0.65, spark: 0.6 }, tin: { gloss: 0.7 },
  steel: { gloss: 0.55 }, wood: { gloss: 0.12 }, plate: { gloss: 0.6, spark: 0.2 }, wax: { gloss: 0.3 } };
const I = (arr, mat) => arr.map((c) => ink(c, mat));
const clampi = (v, a, b) => (v < a ? a : v > b ? b : v);
const lay = () => new PixBuf(S, S);

// ---------- shape helpers ----------
/** Shaded sphere/ellipse: ramp R (dark->light) lit from upper-left. */
function ball(p, cx, cy, rx, ry, R, hl = true) {
  const n = R.length;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry;
      if (u * u + v * v > 1) continue;
      const nz = Math.sqrt(Math.max(0, 1 - u * u - v * v));
      const l = clampi(0.5 + (-u * 0.55 - v * 0.65) * 0.5 + nz * 0.22 - 0.1, 0, 0.999);
      p.set(x, y, R[Math.floor(l * n)]);
    }
  if (hl && rx > 3) p.set(Math.round(cx - rx * 0.4), Math.round(cy - ry * 0.45), R[n - 1]);
}
/** Vertical cylinder body (x0..x1 inclusive, y0..y1) with horizontal shading, light from the left. */
function cyl(p, x0, x1, y0, y1, R, cut = 0) {
  const n = R.length, w = x1 - x0 + 1;
  for (let i = 0; i < w; i++) {
    const u = w === 1 ? 0.3 : i / (w - 1);
    const l = clampi(1 - Math.abs(u - 0.28) * 1.55, 0, 0.999);
    p.rect(x0 + i, y0, 1, y1 - y0 + 1 - cut * 0 , R[Math.floor(l * n)]);
  }
}
/** Horizontal cylinder (tube) x0..x1, y0..y1, shaded top->bottom. */
function tube(p, x0, x1, y0, y1, R) {
  const n = R.length, h = y1 - y0 + 1;
  for (let j = 0; j < h; j++) {
    const v = h === 1 ? 0.3 : j / (h - 1);
    const l = clampi(1 - Math.abs(v - 0.28) * 1.55, 0, 0.999);
    p.rect(x0, y0 + j, x1 - x0 + 1, 1, R[Math.floor(l * n)]);
  }
}
function fuzzBall(p, cx, cy, r, seed) {
  ball(p, cx, cy, r, r, I(FUZZ), false);
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    if (!p.has(x, y)) continue;
    const h = hash2(x, y, seed);
    if (h > 0.78) p.set(x, y, FUZZ[Math.min(4, 1 + Math.floor(h * 4))]);
    else if (h < 0.14) p.set(x, y, FUZZ[0]);
  }
  p.set(cx - 1, cy - 1, FUZZ[4]);
}
function sparkle(p, x, y, c = '#ffffff', big = true, mat = { emit: 0.9, spark: 1 }) {
  const k = ink(c, mat);
  p.set(x, y, k);
  if (big) { p.set(x - 1, y, k); p.set(x + 1, y, k); p.set(x, y - 1, k); p.set(x, y + 1, k); }
}

/** Remove `n` plain rows starting at y0 and shift everything above down (shortens tall objects). */
function squash(p, y0, n) {
  const q = lay();
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const src = y < y0 + n ? y - n : y; if (src < 0) continue;
    const c = p.get(x, src); if (c && c.a) q.set(x, y, c);
  }
  return q;
}
function done(p) { return (p.outline(OUT), p); }
// ---------- builders (each returns a PixBuf) ----------
const B = {};

B.fish_treat = () => {
  const p = lay(), P = I(['#5a6a90', '#8aa0c8', '#c8d8f0', '#f4f8ff'], M.plate);
  p.ellipse(32, 58.5, 19, 4.8, P[1]); p.ellipse(32, 57.8, 18, 4.1, P[2]);
  p.ellipse(32, 57.8, 12.5, 2.7, P[3]); p.ellipse(32, 58.2, 10, 1.7, P[2]);
  const T = I(['#7a4a1a', '#b07a30', '#d8a850', '#f0cc80']);
  p.poly([[40, 46], [50, 34], [49, 46], [50, 56], [40, 52]], T[1]);
  p.poly([[41, 46], [48, 38], [47, 46], [48, 53]], T[2]);
  p.line(49, 37, 49, 54, T[0]);
  ball(p, 30, 47, 12.5, 8.5, T, false);
  p.hline(22, 41, 10, T[3]); p.hline(20, 42, 4, T[3]);
  for (let i = 0; i < 4; i++) p.line(34 + i * 2, 42 + (i % 2), 33 + i * 2, 53, T[1]);
  for (let i = 0; i < 3; i++) p.set(26 + i * 3, 49 + (i & 1) * 2, T[1]);
  p.line(27, 41, 27, 54, T[0]);
  p.rect(21, 44, 3, 3, '#1a1420'); p.set(21, 44, '#ffffff');
  p.set(18, 49, T[0]); p.set(19, 50, T[0]); p.hline(19, 49, 4, T[1]);     // mouth
  return done(p);
};

B.tuna = () => {
  const p = lay(), T = I(['#3a5a7a', '#5a86b0', '#9ac0e0', '#e0f0ff'], M.tin);
  const FISH = I(['#7a5a6a', '#c88a92', '#f0b0b0', '#ffd8d0']);
  // fish peeking out of the opened lid
  const BL = I(['#2a3a5a', '#4a6a8e', '#7a9cb8', '#b8d4e0']);
  p.poly([[39, 45], [48, 34], [46, 42], [50, 47], [40, 49]], BL[1]);                      // tail fin up-right
  p.poly([[41, 45], [47, 37], [45, 44], [47, 47]], BL[2]);
  ball(p, 31, 44, 10, 5.5, BL, false);
  p.hline(24, 46, 14, FISH[2]); p.hline(26, 47, 11, FISH[3]);                              // pale belly
  p.line(36, 40, 36, 46, BL[0]); p.line(33, 40, 33, 46, BL[0]);                            // gill/stripes
  p.rect(24, 42, 3, 3, '#1a1420'); p.set(24, 42, '#ffffff');
  p.poly([[28, 39], [30, 36], [33, 39]], BL[1]);                                           // dorsal fin
  // can body
  const tin = I(['#7a808c', '#a4acba', '#cdd4de', '#f4f8fc'], M.tin);
  cyl(p, 18, 45, 46, 62, tin);
  p.ellipse(32, 62, 14, 2.4, tin[0]);
  // label band
  for (let x = 18; x <= 45; x++) { const l = clampi(1 - Math.abs((x - 18) / 27 - 0.28) * 1.55, 0, 0.999); p.rect(x, 51, 1, 8, T[Math.floor(l * 4)]); }
  p.rect(23, 53, 18, 1, '#f8dc4c'); p.rect(23, 56, 18, 1, '#f8dc4c');
  p.ellipse(32, 55, 4, 1.7, '#e2493a');                                                          // fish emblem dot
  p.poly([[36, 55], [39, 53], [39, 57]], '#e2493a');
  // rim (open top)
  p.ellipse(32, 46.5, 14, 3.2, ink(tin[3], M.tin)); p.ellipse(32, 47, 12, 2.2, '#3a2a30');
  p.ellipse(32, 47, 11, 1.7, FISH[1]);
  // curled lid
  p.poly([[44, 45], [48, 38], [51, 40], [47, 47]], tin[2]); p.line(47, 38, 50, 40, tin[3]);
  return done(p);
};

B.catnip = () => {
  const p = lay(), C = I(['#1c4a28', '#2f7a3c', '#4aa458', '#7cd080'], { gloss: 0.12 });
  // pouch body
  p.poly([[24, 63], [20, 52], [24, 44], [29, 41], [35, 41], [40, 44], [44, 52], [40, 63]], C[1]);
  ball(p, 31, 53, 11, 9, C, false);
  p.poly([[24, 63], [40, 63], [41, 59], [23, 59]], C[0]);
  // gathered neck + frill
  p.poly([[26, 42], [38, 42], [41, 36], [36, 38], [32, 34], [28, 38], [23, 36]], C[2]);
  p.hline(27, 42, 11, '#c8a040'); p.hline(27, 43, 11, '#8a6a20');                                // tie
  p.set(39, 43, '#c8a040'); p.set(40, 45, '#8a6a20'); p.set(40, 44, '#c8a040');
  // glowing leaf on the front
  const L = ink('#9cff90', { emit: 1, spark: 1 }), L2 = ink('#5ae070', { emit: 0.8, spark: 0.8 });
  p.poly([[32, 47], [38, 52], [36, 58], [32, 60], [28, 58], [26, 52]], L2);
  p.poly([[32, 49], [36, 53], [34, 57], [32, 58], [30, 57], [29, 53]], L);
  p.line(32, 48, 32, 60, ink('#e8ffd8', { emit: 1, spark: 1 }));
  // sparkles
  sparkle(p, 17, 44, '#d8ffc8'); sparkle(p, 46, 40, '#d8ffc8'); sparkle(p, 44, 58, '#b8ff98', false); sparkle(p, 20, 58, '#b8ff98', false);
  return done(p);
};

B.extra_life = () => {
  const p = lay(), G = I(GOLD, M.gold);
  // pedestal
  p.rect(20, 59, 24, 4, ink(GOLD[1], M.gold)); p.hline(20, 59, 24, G[3]); p.hline(21, 62, 22, G[0]);
  // body
  ball(p, 32, 53, 10, 9, G, false);
  p.rect(29, 53, 6, 7, G[4]); p.hline(29, 53, 6, G[5]);                                           // belly
  // arms: left holds coin, right paw waves
  ball(p, 22, 52, 3.5, 5, G, false);
  p.poly([[40, 54], [43, 40], [47, 40], [46, 54]], G[2]);                                         // raised arm
  ball(p, 45, 38, 4, 4.5, G, false);
  p.set(44, 37, G[1]); p.set(46, 37, G[1]); p.set(45, 39, G[1]);                                  // paw pads
  // head
  ball(p, 32, 40, 10, 8, G, false);
  p.poly([[22, 36], [23, 27], [29, 33]], G[3]); p.poly([[42, 36], [41, 27], [35, 33]], G[2]);        // ears
  p.poly([[24, 34], [24, 30], [27, 33]], '#ff8aa0'); p.poly([[40, 34], [40, 30], [37, 33]], '#ff8aa0');
  // face
  p.hline(26, 39, 3, '#1a1420'); p.hline(35, 39, 3, '#1a1420');                                    // happy eyes
  p.set(26, 40, '#1a1420'); p.set(37, 40, '#1a1420');
  p.set(31, 42, '#e0405a'); p.set(32, 42, '#e0405a'); p.hline(30, 44, 4, '#7a2a14');               // nose, smile
  p.set(29, 43, '#7a2a14'); p.set(34, 43, '#7a2a14');
  p.line(21, 42, 26, 43, G[0]); p.line(43, 42, 38, 43, G[0]);                                      // whiskers
  // collar and bell
  p.hline(24, 47, 16, '#c21f24'); p.hline(24, 48, 16, '#7e1419');
  p.circle(32, 50, 2.5, ink('#fff2a0', { ...M.gold, emit: 0.4 })); p.set(32, 51, '#1a1420');
  // coin
  p.ellipse(22, 57, 3, 3, ink('#fffbe0', { emit: 0.5, spark: 1, gloss: 0.6 })); p.set(22, 57, GOLD[1]);
  sparkle(p, 14, 36, '#fff6c0'); sparkle(p, 51, 46, '#fff6c0'); sparkle(p, 36, 28, '#ffffff', false);
  p.setMat({ spark: 1 }, 24, 28, 18, 14);
  return done(p);
};

B.ammo_clip = () => {
  const p = lay();
  // hairballs heaped on top
  fuzzBall(p, 27, 49, 5, 3); fuzzBall(p, 36, 48, 5, 7); fuzzBall(p, 31, 44, 5, 11);
  // tin
  const tin = I(['#6a7078', '#9aa2b0', '#c8d0da', '#f0f4f8'], M.tin);
  cyl(p, 21, 42, 50, 62, tin);
  p.ellipse(31.5, 62, 10.5, 2, tin[0]);
  p.ellipse(31.5, 50.5, 10.5, 2.6, tin[3]);
  p.ellipse(31.5, 50.5, 8.5, 1.6, '#3a3038');
  fuzzBall(p, 31, 49, 4, 5);
  // label: red band with paw
  for (let x = 21; x <= 42; x++) { const l = clampi(1 - Math.abs((x - 21) / 21 - 0.28) * 1.55, 0, 0.999); p.rect(x, 54, 1, 6, RED[1 + Math.floor(l * 3)]); }
  p.set(30, 57, '#fde3b0'); p.set(33, 57, '#fde3b0'); p.rect(31, 57, 2, 2, '#fde3b0');
  p.set(29, 56, '#fde3b0'); p.set(34, 56, '#fde3b0');
  return done(p);
};

B.ammo_box = () => {
  const p = lay(), W = I(WOOD, M.wood);
  // heaped hairballs
  fuzzBall(p, 21, 41, 5, 2); fuzzBall(p, 29, 38, 5, 4); fuzzBall(p, 38, 39, 5, 6); fuzzBall(p, 45, 43, 4, 8);
  fuzzBall(p, 25, 45, 5, 9); fuzzBall(p, 34, 44, 5, 13); fuzzBall(p, 41, 46, 4, 17);
  // crate
  p.rect(12, 46, 40, 17, W[2]);
  for (let y = 46; y < 63; y += 4) { p.hline(12, y, 40, W[3]); p.hline(12, y + 3, 40, W[1]); }
  p.map((x, y, c) => (c.a > 0 && y >= 46 && hash2(x >> 2, y >> 1, 5) > 0.82 ? shade(c, 0.88) : undefined));
  // rim + corner planks
  p.rect(12, 46, 40, 2, W[4]); p.hline(12, 48, 40, W[0]);
  p.rect(12, 46, 3, 17, W[3]); p.rect(49, 46, 3, 17, W[1]); p.vline(14, 48, 15, W[4]);
  // metal straps
  const st = I(STEEL, M.steel);
  p.rect(16, 48, 2, 15, st[3]); p.rect(46, 48, 2, 15, st[1]); p.vline(16, 48, 15, st[5]);
  // paw stencil
  const pw = ink('#fde3b0', {}), py = 52;
  p.ellipse(32, py + 5.5, 4.5, 3.2, pw);
  p.ellipse(25.5, py + 1.5, 1.8, 2.3, pw); p.ellipse(30, py - 0.5 + 0, 1.8, 2.4, pw);
  p.ellipse(34.5, py - 0.5, 1.8, 2.4, pw); p.ellipse(39, py + 1.5, 1.8, 2.3, pw);
  return done(p);
};

B.yarn_ammo = () => {
  const p = lay(), W = I(['#4a2a14', '#7a4a24', '#a8723a', '#d09a58'], M.wood);
  function yarn(cx, cy, r, R, seed) {
    ball(p, cx, cy, r, r, R, false);
    for (let k = -2; k <= 2; k++) { // wound threads
      const o = k * 2.2;
      for (let t = -r; t <= r; t++) {
        const x = Math.round(cx + t), y = Math.round(cy + o + t * 0.55);
        if (p.has(x, y)) p.set(x, y, R[Math.max(0, 1 + (k & 1))]);
      }
    }
    p.set(cx - Math.round(r * 0.4), cy - Math.round(r * 0.5), R[3]);
    p.set(cx - Math.round(r * 0.4) + 1, cy - Math.round(r * 0.5), R[3]);
  }
  yarn(24, 45, 7, I(TEAL), 1); yarn(40, 44, 7, I(YELL), 2); yarn(32, 39, 8, I(PINK), 3);
  p.line(36, 46, 44, 52, '#f27aa8'); p.line(44, 52, 49, 50, '#f27aa8');                           // loose thread
  // basket
  p.poly([[17, 47], [47, 47], [44, 63], [20, 63]], W[2]);
  p.map((x, y, c) => {
    if (c.a === 0 || y < 47 || y > 62) return undefined;
    const weave = ((x >> 1) + (y >> 1)) & 1;
    return c.r === W[2].r && c.g === W[2].g && c.b === W[2].b ? (weave ? W[2] : W[1]) : undefined;
  });
  p.hline(16, 47, 32, W[3]); p.hline(16, 48, 32, W[3]); p.hline(17, 49, 30, W[0]);
  p.vline(18, 50, 13, W[3]); p.vline(19, 50, 13, W[3]);
  p.hline(20, 62, 24, W[0]);
  return done(p);
};

B.battery = () => {
  const p = lay(), R = I(['#5a0a14', '#8e1420', '#c21f24', '#ee4a3a', '#ff8a6a'], { gloss: 0.55 });
  // terminal cap
  const st = I(STEEL, M.steel);
  cyl(p, 28, 35, 30, 35, st);
  // body
  cyl(p, 19, 44, 35, 62, R);
  p.rect(19, 35, 26, 2, ink('#2c313b', M.steel)); p.hline(19, 35, 26, st[4]);                    // crimp ring
  p.rect(19, 60, 26, 3, ink('#2c313b', M.steel)); p.hline(19, 60, 26, st[3]);
  // emissive charge stripe + bolt
  const E = ink('#fff070', { emit: 1, spark: 0.7 }), E2 = ink('#ffffff', { emit: 1, spark: 0.9 });
  p.rect(21, 43, 22, 10, ink('#2a0a10', {}));
  for (let i = 0; i < 4; i++) p.rect(22 + i * 5, 44, 4, 8, ink(i < 3 ? '#ffd23e' : '#8a5a10', { emit: i < 3 ? 1 : 0.2, spark: 0.5 }));
  p.poly([[34, 40], [28, 49], [32, 49], [30, 58], [38, 47], [34, 47], [36, 40]], E);
  p.line(34, 41, 29, 49, E2);
  p.vline(21, 38, 5, R[4]); p.vline(22, 38, 4, R[4]);
  return done(p);
};

B.gatling = () => {
  const p = lay(), st = I(STEEL, M.steel), br = I(['#4a3010', '#7a5520', '#a87c30', '#d4a848', '#f2d27a'], { gloss: 0.55, spark: 0.2 });
  const bd = I(['#3a3036', '#5a4a4c', '#7e6a68', '#a8908a'], M.wood);
  // barrel cluster: three stacked tubes with clamp rings and muzzle plate
  tube(p, 8, 38, 40, 44, st); tube(p, 8, 38, 45, 49, st); tube(p, 8, 38, 50, 54, st);
  p.hline(8, 44, 31, '#1a1420'); p.hline(8, 49, 31, '#1a1420');
  p.rect(5, 39, 4, 17, st[3]); p.vline(5, 39, 17, st[5]); p.vline(8, 39, 17, st[1]);
  for (const y of [42, 47, 52]) { p.set(6, y, '#0c0c14'); p.set(7, y, '#0c0c14'); }
  p.rect(18, 38, 3, 19, st[2]); p.vline(18, 38, 19, st[5]); p.rect(30, 38, 3, 19, st[2]); p.vline(30, 38, 19, st[5]);
  // receiver
  p.rect(38, 36, 14, 24, bd[2]); p.rect(38, 36, 14, 2, bd[3]); p.rect(38, 36, 2, 24, bd[3]); p.rect(50, 38, 2, 22, bd[1]); p.hline(38, 59, 14, bd[0]);
  p.rect(41, 55, 8, 2, br[3]); p.hline(41, 55, 8, br[4]);
  // brass drum on top
  ball(p, 45, 35, 6, 3.5, br, false); p.rect(40, 33, 10, 3, br[3]); p.hline(40, 33, 10, br[4]);
  // grip + trigger
  p.poly([[42, 60], [50, 60], [52, 63], [43, 63]], bd[1]); p.hline(43, 62, 8, bd[0]);
  // crank arm + fish-bone handle (rear)
  p.rect(52, 44, 5, 3, st[3]); p.hline(52, 44, 5, st[5]);
  p.rect(56, 34, 3, 13, st[3]); p.vline(56, 34, 13, st[5]);
  const bone = ink('#f4ecd8', { gloss: 0.2 }), bs = ink('#b8a888', {});
  p.rect(53, 30, 10, 3, bone); p.hline(53, 32, 10, bs);
  p.poly([[63, 31], [60, 27], [60, 36]], bone);   // placeholder to be trimmed
  p.rect(60, 27, 4, 10, [0, 0, 0, 0]);
  p.poly([[62, 31], [64, 27], [64, 36]], bone); p.hline(62, 31, 2, bs);                              // fishtail
  p.set(51, 29, bone); p.set(51, 33, bone); p.rect(50, 30, 3, 3, bone); p.set(50, 31, '#1a1420');      // fish head
  for (const x of [54, 56, 58, 60]) { p.set(x, 29, bone); p.set(x, 33, bone); }                        // ribs
  return done(p);
};

B.yarn_launcher = () => {
  const p = lay(), O = I(['#2e3a24', '#46563a', '#627850', '#86a070'], { gloss: 0.25 }), st = I(STEEL, M.steel);
  // fat barrel
  tube(p, 8, 40, 43, 56, O);
  p.rect(6, 41, 5, 18, st[3]); p.rect(6, 41, 1, 18, st[5]); p.rect(10, 41, 1, 18, st[1]);        // muzzle collar
  p.rect(7, 44, 3, 12, '#2a1a24');
  // pink yarn ball loaded in the muzzle
  const PK = I(PINK);
  ball(p, 9, 50, 7, 7, PK, false);
  for (let k = -2; k <= 2; k++) for (let t = -6; t <= 6; t++) { const x = Math.round(9 + t), y = Math.round(50 + k * 2.4 + t * 0.5); if (p.has(x, y) && Math.hypot(x - 9, y - 50) < 6.6) p.set(x, y, PK[1 + (k & 1)]); }
  p.set(6, 46, PK[3]); p.set(7, 46, PK[3]);
  p.line(13, 56, 19, 61, '#f27aa8');
  // bands, breech, grip
  p.rect(20, 41, 3, 18, st[2]); p.rect(20, 41, 1, 18, st[4]); p.rect(33, 41, 3, 18, st[2]); p.rect(33, 41, 1, 18, st[4]);
  p.rect(40, 41, 12, 17, O[1]); p.rect(40, 41, 12, 2, O[3]); p.rect(40, 41, 2, 17, O[2]); p.rect(50, 43, 2, 15, O[0]);
  p.rect(43, 38, 6, 3, st[2]); p.hline(43, 38, 6, st[5]);                                          // sight
  p.poly([[42, 57], [50, 57], [50, 63], [42, 63]], '#5e3520'); p.rect(42, 57, 2, 6, '#905a36'); p.rect(47, 58, 3, 5, '#341c11');
  p.rect(36, 59, 5, 1, st[3]); p.vline(38, 58, 3, st[3]);                                          // trigger guard
  return done(p);
};

B.laser = () => {
  const p = lay(), c = I(SILV, M.silv);
  // base cushion
  p.ellipse(32, 60, 11, 3, ink('#6a2a3a', {})); p.ellipse(32, 59, 10, 2.3, ink('#a84a5a', {})); p.hline(26, 58, 6, '#d47a88');
  // pen body: chrome with a vertical highlight
  cyl(p, 28, 36, 36, 59, c);
  p.vline(29, 37, 21, c[5]); p.vline(35, 37, 21, c[1]);
  p.hline(28, 44, 9, c[1]); p.hline(28, 45, 9, c[5]); p.hline(28, 52, 9, c[1]); p.hline(28, 53, 9, c[5]);
  // clip
  p.rect(37, 38, 2, 12, c[3]); p.vline(37, 38, 12, c[5]); p.set(37, 50, c[2]);
  // button
  p.rect(30, 40, 5, 2, ink('#c21f24', { emit: 0.4, gloss: 0.6 }));
  // head ring and lens
  cyl(p, 27, 37, 31, 35, c); p.hline(27, 31, 11, c[5]);
  const lens = ink('#ff3030', { emit: 1, spark: 1, gloss: 0.8 });
  p.ellipse(32, 29.5, 4, 3, lens); p.ellipse(32, 29.5, 2, 1.5, ink('#ffd0c0', { emit: 1, spark: 1 }));
  p.set(30, 28, '#ffffff');
  // red glow rays
  const g = ink('#ff5050', { emit: 1, spark: 1 });
  for (const [x, y] of [[32, 24], [32, 23], [24, 29], [23, 29], [40, 29], [41, 29], [26, 24], [38, 24]]) p.set(x, y, g);
  p.set(32, 25, g);
  return done(squash(p, 46, 6));
};

function key(kind) {
  const p = lay(), gold = kind === 'gold';
  const R = I(gold ? GOLD : SILV, gold ? M.gold : M.silv);
  const cx = 32;
  // shaft
  p.rect(cx - 2, 36, 5, 24, R[3]); p.vline(cx - 2, 36, 24, R[5]); p.vline(cx + 2, 36, 24, R[1]); p.vline(cx - 1, 36, 24, R[4]);
  // teeth (bit)
  p.rect(cx + 3, 52, 8, 3, R[2]); p.rect(cx + 3, 52, 8, 1, R[4]); p.rect(cx + 3, 58, 6, 3, R[2]); p.rect(cx + 3, 58, 6, 1, R[4]);
  p.rect(cx - 2, 60, 5, 3, R[1]); p.rect(cx - 2, 62, 5, 1, R[0]);
  p.rect(cx + 8, 52, 3, 5, R[1]);
  // collar
  p.rect(cx - 4, 39, 9, 3, R[2]); p.hline(cx - 4, 39, 9, R[5]); p.hline(cx - 4, 41, 9, R[0]);
  if (gold) {
    // cat bell bow
    ball(p, cx, 29, 8, 8, R, false);
    const bk = '#1a1420';
    p.hline(cx - 8, 31, 17, R[1]); p.hline(cx - 8, 32, 17, R[0]);
    p.set(cx - 1, 33, bk); p.set(cx, 33, bk); p.set(cx + 1, 33, bk); p.rect(cx - 1, 34, 3, 1, bk);       // bell slit hole
    p.rect(cx - 1, 31, 3, 2, bk);
    p.ring(cx, 21, 3.5, 3, R[4], 1);                                                                   // suspension loop
    p.set(cx - 5, 25, '#ffffff'); p.set(cx - 4, 24, '#ffffff'); p.set(cx - 5, 26, R[5]);
    p.setMat({ spark: 1 }, cx - 8, 21, 17, 17);
    sparkle(p, 20, 20, '#fff6c0'); sparkle(p, 46, 42, '#fff6c0', false); sparkle(p, 44, 24, '#ffffff', false);
  } else {
    // fish bow
    const F = R;
    p.poly([[cx + 6, 29], [cx + 15, 21], [cx + 14, 29], [cx + 15, 37]], F[2]);                         // tail
    ball(p, cx - 1, 29, 12, 7.5, F, false);
    p.ellipse(cx - 1, 29, 7, 3.6, [0, 0, 0, 0]);                                                      // erased hole cut below
    // cut a hole through the fish body
    for (let y = 26; y <= 32; y++) for (let x = cx - 9; x <= cx + 4; x++) { const u = (x - (cx - 3)) / 6, v = (y - 29) / 3.2; if (u * u + v * v <= 1) p.erase(x, y); }
    p.rect(cx - 10, 26, 2, 2, '#1a1420'); p.set(cx - 10, 26, '#ffffff');                              // eye
    p.line(cx - 7, 24, cx - 7, 35, R[1]); p.line(cx + 6, 29, cx + 11, 29, R[1]);
    p.setMat({ spark: 1 }, cx - 13, 21, 28, 17);
    sparkle(p, 18, 22, '#e8f4ff'); sparkle(p, 46, 44, '#e8f4ff', false); sparkle(p, 22, 40, '#ffffff', false);
  }
  p.setMat({ spark: 0.8, gloss: 0.7 }, cx - 2, 36, 5, 26);
  // shorten the shaft: drop 9 plain rows (y 43..51) and shift the bow down
  return done(squash(p, 43, 9));
}
B.key_gold = () => key('gold');
B.key_silver = () => key('silver');

B.cheddar_wedge = () => {
  const p = lay();
  const D = I(['#a8a09a', '#d8d0c8', '#fbf6ee']);
  p.ellipse(32, 58.5, 22, 5, D[1]); p.ellipse(32, 58, 20.5, 4.2, D[2]);
  for (let a = 0; a < 24; a++) { const t = (a / 24) * Math.PI * 2; p.set(32 + Math.cos(t) * 21.5, 58.3 + Math.sin(t) * 4.8, D[0]); }
  p.ellipse(32, 58, 15, 2.6, D[1]); p.ellipse(32, 58, 13, 2, D[2]);
  const C = I(CHED);
  const front = [[13, 36], [13, 59], [47, 59]];
  p.poly([[13, 36], [20, 32], [54, 55], [47, 59]], C[3]);                    // sloped top (lit)
  p.poly([[47, 59], [54, 55], [54, 56], [48, 60]], C[0]);
  p.poly(front, C[2]);                                                       // cut face
  p.poly([[13, 36], [13, 59], [16, 59], [16, 38]], C[3]);                    // lit left strip
  p.line(13, 36, 47, 59, C[4]); p.line(20, 32, 54, 55, C[4]);
  p.hline(13, 59, 35, C[0]);
  // rind shading along the lower edge
  for (let x = 14; x < 46; x++) p.set(x, 58, C[1]);
  const H = ink('#8a4e08', {}), H2 = ink('#c07a10', {});
  for (const [x, y, r] of [[18, 44, 2.4], [20, 52, 2], [26, 50, 1.6], [24, 41, 1.2], [32, 55, 1.6], [35, 50, 1.2], [29, 46, 1.2]]) {
    if (p.has(x, y)) { p.circle(x, y, r, H); p.set(Math.round(x - r + 1), Math.round(y - r + 1), H2); }
  }
  for (const [x, y] of [[26, 36], [34, 41], [42, 47], [30, 38]]) p.set(x, y, H2);
  p.setMat({ gloss: 0.2, spark: 0.25 }, 13, 32, 42, 28);
  return done(p);
};

B.brie_wheel = () => {
  const p = lay(), P = I(SILV, M.plate), W = I(BRIE, M.wax);
  p.ellipse(32, 58.5, 24, 5.5, P[1]); p.ellipse(32, 57.8, 23, 4.8, P[3]); p.ellipse(32, 58, 17, 3.4, P[2]); p.ellipse(32, 58.4, 15, 2.8, P[4]);
  for (let a = 0; a < 26; a++) { const t = (a / 26) * Math.PI * 2; p.set(32 + Math.cos(t) * 23, 57.8 + Math.sin(t) * 4.8, P[5]); }
  const cy = 41.5, bot = 56;
  // drum
  p.rect(14, cy, 36, bot - cy, W[1]); p.ellipse(32, bot, 18, 4.5, W[1]);
  for (let x = 14; x < 50; x++) {
    const l = clampi(1 - Math.abs((x - 14) / 36 - 0.3) * 1.5, 0, 0.999), c = W[Math.floor(l * 4)];
    const yb = bot + Math.sqrt(Math.max(0, 1 - ((x + 0.5 - 32) / 18) ** 2)) * 4.5;
    p.rect(x, cy, 1, Math.round(yb - cy), c);
  }
  p.ellipse(32, cy, 18, 5.5, W[3]); p.ellipse(32, cy, 16.5, 4.6, W[2]); p.ellipse(30.5, cy - 0.5, 13, 3.6, W[3]);
  p.hline(14, cy + 3, 36, W[1]);                                              // rind band edge
  // slice cut out of the front-right: sector from the centre, removed through the whole drum
  const H = bot - cy + 1, rx = 18, ry = 5.5, th = (d) => (d * Math.PI) / 180;
  const arc = (d, dy = 0) => [32 + Math.cos(th(d)) * rx, cy + Math.sin(th(d)) * ry + dy];
  const poly = [[32, cy]];
  for (let d = 0; d <= 62; d += 4) poly.push(arc(d));
  for (let d = 62; d >= 0; d -= 4) poly.push(arc(d, H));
  poly.push([32, cy + H]);
  const hole = lay(); hole.poly(poly, '#000000');
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (hole.has(x, y)) {
    const u = (x + 0.5 - 32) / 24, v = (y + 0.5 - 58) / 5;
    if (u * u + v * v <= 1) p.set(x, y, v < -0.2 ? P[1] : u * u + v * v > 0.8 ? P[2] : P[3]); else p.erase(x, y);
  }
  const Y1 = ink('#f4d870', M.wax), Y2 = ink('#d8b848', M.wax), Y3 = ink('#a07c20', {});
  const [ax, ay] = arc(0);
  p.poly([[32, cy], [ax, ay], [ax, ay + H - 1], [32, cy + H - 1]], Y1);                 // exposed cut face (lit)
  p.poly([[32, cy], [ax, ay], [ax - 1, ay + 1], [32, cy + 1]], W[3]);
  p.vline(32, cy, H - 1, Y3); p.vline(ax - 1, ay, H - 1, Y2);
  p.hline(32, cy + H - 1, ax - 32, Y2);
  for (let y = cy + 8; y < cy + H - 1; y++) for (let x = 33; x < ax - 1; x++) if ((x + y) % 2 === 0 && y > cy + 10) p.set(x, y, Y2);
  p.vline(ax, ay, H - 1, W[2]); p.vline(ax + 1, ay + 1, H - 3, W[1]);
  p.set(37, cy + 5, Y3); p.set(41, cy + 8, Y2); p.set(44, cy + 4, Y3); p.set(38, cy + 10, Y2); p.set(36, cy + 7, Y2);
  p.line(32, cy + 1, ax - 1, ay + 1, W[3]);
  p.setMat({ gloss: 0.3, spark: 0.1 }, 14, cy - 5, 36, 20);
  return done(p);
};

B.cheese_crown = () => {
  const p = lay(), G = I(GOLD, M.gold);
  // cheese-wheel band (cylinder) with holes
  cyl(p, 17, 46, 46, 59, G);
  p.ellipse(31.5, 59.5, 14.5, 3, G[0]);
  for (let x = 17; x <= 46; x++) { const l = clampi(1 - Math.abs((x - 17) / 29 - 0.3) * 1.5, 0, 0.999); p.set(x, 59, G[Math.floor(l * 5)]); p.set(x, 60, G[Math.floor(l * 3)]); p.set(x, 61, G[Math.floor(l * 2)]); }
  // cheese holes (cut into the gold)
  for (const [x, y, r] of [[22, 52, 2.2], [31, 55, 2.6], [39, 51, 2], [27, 50, 1.4], [43, 56, 1.6], [35, 49.5, 1.2]]) {
    p.circle(x, y, r, ink('#5a3208', {})); p.set(Math.round(x + 0.5), Math.round(y + 0.5), G[3]);
  }
  // crown points
  const pts = [[17, 46, 15, 30], [25, 46, 25, 33], [32, 46, 32, 28], [39, 46, 39, 33], [46, 46, 48, 30]];
  for (const [x, y, tx, ty] of pts) {
    p.poly([[x - 4, y], [tx, ty], [x + 4, y]], G[3]);
    p.poly([[x - 4, y], [tx, ty], [x, y]], G[4]);
  }
  p.rect(17, 44, 30, 3, G[2]); p.hline(17, 44, 30, G[5]); p.hline(17, 46, 30, G[1]);
  // jewels on the points
  const gem = (x, y, c, hi) => { p.rect(x - 1, y - 1, 3, 3, ink(c, { emit: 0.8, gloss: 0.9, spark: 1 })); p.set(x - 1, y - 1, hi); };
  gem(15, 31, '#e0304a', '#ffb0b8'); gem(48, 31, '#3a78e8', '#b8d0ff'); gem(32, 29, '#34d070', '#c0ffd0');
  gem(25, 34, '#ffe040', '#ffffff'); gem(39, 34, '#c050e0', '#f0c0ff');
  // central cheese wedge emblem
  p.poly([[28, 40], [36, 40], [32, 33]], ink('#f2a91e', { emit: 0.3, spark: 1 })); p.set(31, 38, '#8a4e08');
  // sparkles
  sparkle(p, 9, 30, '#fffbe0'); sparkle(p, 55, 28, '#fffbe0'); sparkle(p, 32, 25, '#ffffff'); sparkle(p, 50, 52, '#fff6c0', false); sparkle(p, 12, 50, '#fff6c0', false);
  p.setMat({ spark: 1 }, 14, 28, 36, 20);
  return done(p);
};

export function build() {
  const o = {};
  for (const id of ['fish_treat', 'tuna', 'catnip', 'extra_life', 'ammo_clip', 'ammo_box', 'yarn_ammo', 'battery', 'gatling',
    'yarn_launcher', 'laser', 'key_gold', 'key_silver', 'cheddar_wedge', 'brie_wheel', 'cheese_crown']) o[`item.${id}`] = B[id]();
  return o;
}
