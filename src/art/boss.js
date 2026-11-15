// boss — Der Große Käse, the generalissimo rat. 64x64 frames, drawn at 1.6x in game. Pure code art, deterministic.
import { PixBuf, ink, shade, mix, ramp, hash2 } from './pixbuf.js';

const OUT = '#1a1420';
const EDGE = '#2a2030';

const R = {
  white: ramp('#e9e4d8', 4, 0.38),
  cape: ramp('#c21f24', 4, 0.5),
  fur: ramp('#8f8a96', 4, 0.4),
  pink: ramp('#e9a2ac', 4, 0.35),
  steel: ramp('#8d98a8', 4, 0.5),
  boot: ramp('#33293a', 4, 0.6),
  cheese: ramp('#f6dc6a', 4, 0.4),
  gold: ramp('#ffd23e', 4, 0.42),
  cigar: ramp('#7a4a22', 3, 0.4),
};
const mk = (r, m) => r.map((c) => ink(c, m));
const GOLD = mk(R.gold, { gloss: 0.7, spark: 0.9 });
const STEEL = mk(R.steel, { gloss: 0.6, spark: 0.25 });
const BOOT = mk(R.boot, { gloss: 0.55 });
const CHEESE = mk(R.cheese, { gloss: 0.2, spark: 0.15 });
const CAPE = mk(R.cape, { gloss: 0.15 });
const WHITE = mk(R.white, { gloss: 0.12 });
const FUR = R.fur.map((c) => ink(c));
const PINK = R.pink.map((c) => ink(c));
const HOLE = ink('#b8841a');
const FLASH = [ink('#ff8a18', { emit: 0.9 }), ink('#ffd23e', { emit: 1 }), ink('#fff6c0', { emit: 1 })];

// ───────────── lit-shape helpers (light from upper-left) ─────────────
const lighting = (nx, ny) => nx * -0.5 + ny * -0.65 + Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)) * 0.57;
const stepOf = (d) => (d < -0.2 ? 0 : d < 0.22 ? 1 : d < 0.6 ? 2 : 3);

function paint(p, test, x0, y0, x1, y1, r, grain = 0, seed = 1) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2 || 1, ry = (y1 - y0) / 2 || 1;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (!test(x, y)) continue;
    const nx = Math.max(-1, Math.min(1, (x + 0.5 - cx) / rx)), ny = Math.max(-1, Math.min(1, (y + 0.5 - cy) / ry));
    let i = stepOf(lighting(nx * 0.95, ny * 0.95));
    if (grain && hash2(x >> 1, y >> 1, seed) < grain) i = Math.max(0, Math.min(3, i + (hash2(x, y, seed + 7) < 0.5 ? -1 : 1)));
    p.set(x, y, r[i]);
  }
}
function blob(p, cx, cy, rx, ry, r, o = {}) {
  const e = o.edge === undefined ? EDGE : o.edge;
  const inE = (a, b) => (x, y) => { const u = (x + 0.5 - cx) / a, v = (y + 0.5 - cy) / b; return u * u + v * v <= 1; };
  const x0 = Math.floor(cx - rx - 2), x1 = Math.ceil(cx + rx + 2), y0 = Math.floor(cy - ry - 2), y1 = Math.ceil(cy + ry + 2);
  if (e) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (inE(rx + 1, ry + 1)(x, y)) p.set(x, y, e);
  paint(p, inE(rx, ry), x0, y0, x1, y1, r, o.grain || 0, o.seed || 1);
}
function lpoly(p, pts, r, o = {}) {
  const m = new PixBuf(64, 64); m.poly(pts, '#fff');
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  const x0 = Math.floor(Math.min(...xs)) - 1, x1 = Math.ceil(Math.max(...xs)) + 1, y0 = Math.floor(Math.min(...ys)) - 1, y1 = Math.ceil(Math.max(...ys)) + 1;
  const e = o.edge === undefined ? EDGE : o.edge;
  if (e) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++)
    if (!m.has(x, y) && (m.has(x - 1, y) || m.has(x + 1, y) || m.has(x, y - 1) || m.has(x, y + 1))) p.set(x, y, e);
  paint(p, (x, y) => m.has(x, y), x0 + 1, y0 + 1, x1 - 1, y1 - 1, r, o.grain || 0, o.seed || 1);
}

// ───────────── parts ─────────────
function gatling(p, x, y, flash, side) {
  // ammo drum behind/outside, steel housing, rotary barrel cluster facing the viewer
  blob(p, x + side * 4, y - 3, 3, 3.5, STEEL, { seed: 31 });
  blob(p, x, y, 6.2, 6, STEEL, { seed: 32 });
  p.ring(x, y, 4.6, 4.4, GOLD[2], 1);
  p.circle(x, y, 3.2, '#16121c');
  for (let i = 0; i < 6; i++) {
    const a = i * 1.0472 + 0.3;
    p.set(x + Math.cos(a) * 2.4, y + Math.sin(a) * 2.4, STEEL[3]);
  }
  p.set(x, y, '#3a3444');
  p.set(x - 4, y - 4, ink('#e8eef8', { gloss: 1, spark: 0.6 }));
  if (flash) {
    p.circle(x, y, 5, FLASH[0]);
    p.circle(x, y, 3.3, FLASH[1]);
    p.circle(x, y, 1.7, FLASH[2]);
    for (const [dx, dy] of [[-8, 0], [8, 0], [0, -8], [0, 7], [-6, -6], [6, -6], [-6, 5], [6, 5]]) p.line(x, y, x + dx, y + dy, FLASH[1]);
    for (const [dx, dy] of [[-8, 0], [8, 0], [0, -8], [-6, -6], [6, -6]]) p.set(x + dx, y + dy, FLASH[0]);
  }
}

function crown(p, cx, y, tilt = 0) {
  // cheese-wheel crown: golden band + wedge points with holes
  const pts = [[cx - 8, y + 6], [cx - 8 + tilt, y + 1], [cx - 5, y + 4], [cx - 3 + tilt, y - 2], [cx, y + 3], [cx + 3 + tilt, y - 2], [cx + 5, y + 4], [cx + 8 + tilt, y + 1], [cx + 8, y + 6]];
  lpoly(p, pts, CHEESE);
  p.rect(cx - 7, y + 4, 15, 2, GOLD[2]);
  p.hline(cx - 7, y + 4, 15, GOLD[3]);
  p.set(cx - 4, y + 2, HOLE); p.set(cx + 4, y + 2, HOLE); p.set(cx + 1, y + 1, HOLE);
  for (const [dx, dy] of [[-8 + tilt, 0], [-3 + tilt, -3], [3 + tilt, -3], [8 + tilt, 0]]) p.set(cx + dx, y + dy + 0, GOLD[3]);
  p.set(cx, y + 5, ink('#e83a3a', { emit: 0.35, gloss: 0.8, spark: 1 }));   // ruby
}

/** Draw the whole generalissimo (un-outlined) from a pose. */
function drawBoss(pose = {}) {
  const P = {
    bx: 0, by: 0,              // body offset
    lf: 0, rf: 0,              // foot lift (px up)
    lfx: 0, rfx: 0,            // foot x shift
    lg: [0, 0], rg: [0, 0],    // gun offsets (dx, dy)
    flashL: false, flashR: false,
    mouth: 0, puff: 0, crown: true, crownTilt: 0, eyes: 1, squint: false, ...pose,
  };
  const p = new PixBuf(64, 64);
  const bx = P.bx, by = P.by;

  // cape (behind): broad red trapezoid flaring to the ground, gold hem
  lpoly(p, [[14 + bx, 24 + by], [50 + bx, 24 + by], [57 + bx, 60], [7 + bx, 60]], CAPE, { grain: 0.1, seed: 3 });
  for (let x = 8; x < 57; x += 2) p.set(x + (x > 32 ? 0 : 1), 59, GOLD[1]);
  p.hline(7, 59, 50, GOLD[0]);

  // boots
  const boot = (cx, lift, dx) => {
    blob(p, cx + dx, 58 - lift, 6.5, 4.5, BOOT, { seed: 11 });
    p.hline(cx + dx - 5, 60 - lift, 11, BOOT[0]);
    p.set(cx + dx - 3, 56 - lift, ink('#c8c0d8', { gloss: 1, spark: 0.4 }));
  };
  boot(23, P.lf, P.lfx);
  boot(41, P.rf, P.rfx);
  // legs (white trousers w/ gold stripe)
  p.rect(18 + P.lfx, 50 - 0, 9, 7 - P.lf, WHITE[1]);
  p.rect(37 + P.rfx, 50, 9, 7 - P.rf, WHITE[1]);
  p.vline(19 + P.lfx, 50, 5, GOLD[2]); p.vline(45 + P.rfx, 50, 5, GOLD[2]);

  // great belly / torso
  blob(p, 32 + bx, 39 + by, 17, 16, WHITE, { grain: 0.1, seed: 5 });
  // gold belt + buckle (cheese wedge)
  for (let x = 17; x <= 47; x++) {
    const dy = Math.round(Math.sin(((x - 32) / 15) * 1.2) * 1.0);
    const yy = 47 + by + Math.abs(dy);
    if (!p.has(x + bx, yy)) continue;
    p.set(x + bx, yy, GOLD[2]); p.set(x + bx, yy + 1, GOLD[1]);
  }
  p.rect(29 + bx, 46 + by, 6, 5, OUT);
  p.rect(30 + bx, 47 + by, 4, 3, GOLD[3]);
  p.poly([[31 + bx, 48 + by], [34 + bx, 49 + by], [31 + bx, 50 + by]], ink('#f2a91e'));
  // gold buttons down the front
  for (let i = 0; i < 3; i++) { p.set(32 + bx, 33 + by + i * 4 - (i > 1 ? 0 : 0), GOLD[3]); p.set(32 + bx, 34 + by + i * 4, GOLD[1]); }
  p.vline(32 + bx, 28 + by, 3, GOLD[1]);
  // gold braid sash / aiguillette (diagonal)
  p.line(21 + bx, 28 + by, 40 + bx, 46 + by, GOLD[2]); p.line(22 + bx, 28 + by, 41 + bx, 46 + by, GOLD[1]);
  // medals on the lit chest side
  const medal = (x, y, c, ribbon) => { p.vline(x, y - 2, 2, ribbon); blob(p, x, y + 1, 1.8, 1.8, [c, c, c, c], { edge: GOLD[0] }); p.set(x - 1, y, '#fff'); };
  medal(24 + bx, 33 + by, ink('#ffd23e', { gloss: 1, spark: 1 }), '#c21f24');
  medal(28 + bx, 34 + by, ink('#8d98a8', { gloss: 1, spark: 1 }), '#5a78b8');
  medal(24 + bx, 38 + by, ink('#e83a3a', { gloss: 0.8, spark: 0.9 }), '#ffd23e');
  // wedge-cheese emblem armband not needed on chest; shoulder epaulettes
  const epau = (x, y) => { p.rect(x - 4, y, 8, 3, GOLD[2]); p.hline(x - 4, y, 8, GOLD[3]); for (let i = 0; i < 4; i++) p.set(x - 4 + i * 2 + 1, y + 3, GOLD[1]); };
  epau(17 + bx, 26 + by); epau(47 + bx, 26 + by);

  // arms + guns
  const arm = (sx, gx, gy) => {
    const x0 = sx + bx, y0 = 29 + by, x1 = gx, y1 = gy - 3;
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = -dy / l * 3.6, ny = dx / l * 3.6;
    lpoly(p, [[x0 + nx, y0 + ny], [x1 + nx * 0.85, y1 + ny * 0.85], [x1 - nx * 0.85, y1 - ny * 0.85], [x0 - nx, y0 - ny]], WHITE);
    blob(p, x0, y0, 4.2, 4.2, WHITE, { edge: null });
    p.circle(x1, y1, 2.4, GOLD[1]); p.hline(x1 - 2, y1 - 1, 4, GOLD[3]);   // gold cuff
  };
  const lgX = 11 + P.lg[0] + bx, lgY = 44 + P.lg[1] + by, rgX = 53 + P.rg[0] + bx, rgY = 44 + P.rg[1] + by;
  arm(15, lgX, lgY); arm(49, rgX, rgY);
  gatling(p, lgX, lgY, P.flashL, -1);
  gatling(p, rgX, rgY, P.flashR, 1);
  // hands over the housing
  p.rect(lgX - 3, lgY + 5, 6, 2, FUR[2]); p.rect(rgX - 3, rgY + 5, 6, 2, FUR[2]);

  // head: fat rat, snout toward the viewer
  const hx = 32 + bx, hy = 17 + by;
  // ears (round, big)
  blob(p, hx - 12, hy - 3, 5, 5.5, FUR, { seed: 21 });
  blob(p, hx + 12, hy - 3, 5, 5.5, FUR, { seed: 22 });
  blob(p, hx - 12, hy - 3, 3, 3.5, PINK, { edge: null });
  blob(p, hx + 12, hy - 3, 3, 3.5, PINK, { edge: null });
  // fat jowly head
  blob(p, hx, hy, 11.5, 9.5, FUR, { grain: 0.12, seed: 9 });
  // muzzle
  blob(p, hx, hy + 5, 6.5, 5, PINK, { seed: 4 });
  p.set(hx - 1, hy + 2, PINK[3]);
  blob(p, hx, hy + 2, 2.4, 1.8, [ink('#a63a52'), ink('#c25670'), ink('#e0788e'), ink('#ffb0be', { gloss: 0.8 })], { edge: OUT });   // nose
  // whiskers
  for (const s of [-1, 1]) { p.line(hx + s * 5, hy + 5, hx + s * 12, hy + 3, '#d8d0e0'); p.line(hx + s * 5, hy + 6, hx + s * 12, hy + 7, '#d8d0e0'); }
  // eyes: beady, heavy-lidded, with brows
  for (const s of [-1, 1]) {
    const ex = hx + s * 5, ey = hy - 1;
    p.rect(ex - 2, ey - 1, 4, 3, '#f4efe8');
    p.rect(ex - 1 + (s < 0 ? 1 : 0), ey, 2, 2, ink('#c21f24', { emit: 0.55 * P.eyes }));
    p.set(ex - 1 + (s < 0 ? 1 : 0), ey, ink('#ff6a50', { emit: 0.9 * P.eyes }));
    p.hline(ex - 3, ey - 2, 6, FUR[0]);                              // heavy brow
    p.line(ex - 2 * s, ey - 3, ex + 3 * s, ey - 2 + (P.squint ? 0 : 1), FUR[0]);
  }
  // monocle (gold ring) on the lit side
  p.ring(hx - 5 + 0.5, hy - 1 + 0.5, 3.5, 3.5, GOLD[3], 1);
  p.set(hx - 8, hy + 2, GOLD[1]); p.set(hx - 9, hy + 4, GOLD[1]); p.set(hx - 9, hy + 6, GOLD[1]);
  // grin / mouth under muzzle + buck teeth
  if (P.mouth) { p.rect(hx - 4, hy + 8, 8, 3, '#40121a'); p.rect(hx - 1, hy + 8, 2, 2, '#f4efe8'); }
  else { p.hline(hx - 4, hy + 9, 8, '#40121a'); p.rect(hx - 1, hy + 9, 2, 2, '#f4efe8'); p.set(hx, hy + 11, '#c8c0b8'); }
  // cigar at the corner of the mouth, glowing tip
  p.line(hx + 3, hy + 9, hx + 11, hy + 6, R.cigar[1]); p.line(hx + 3, hy + 10, hx + 11, hy + 7, R.cigar[0]);
  p.set(hx + 4, hy + 9, GOLD[2]);
  p.set(hx + 12, hy + 6, ink('#ff7a18', { emit: 1 })); p.set(hx + 12, hy + 7, ink('#ffd23e', { emit: 1 }));
  // smoke puff
  if (P.puff) {
    const s = P.puff;
    const sm = (x, y, r, a) => p.circle(x, y, r, ink('#d8d4de', { a }));
    sm(hx + 14, hy + 3 - s, 1.6 + s * 0.4, 210);
    sm(hx + 16 + s, hy - 1 - s * 2, 2 + s * 0.4, 170);
    if (s > 1) sm(hx + 18, hy - 5 - s * 2, 2.6, 130);
  }
  // crown
  if (P.crown) crown(p, hx + 0, hy - 14 + (P.crownDy || 0), P.crownTilt);
  return p;
}

/** Re-ground a finished sprite: outline, keep bottom row. */
function finish(p) {
  p.outline(OUT);
  return p;
}

// ───────────── animation sets ─────────────
function idle() {
  return [
    finish(drawBoss({ by: 0, puff: 0 })),
    finish(drawBoss({ by: 1, puff: 2, mouth: 1, lg: [0, 1], rg: [0, 1] })),
  ];
}
function walk() {
  // waddle: body sways side to side, feet alternate
  const f = [
    { bx: -2, by: 0, lf: 4, rf: 0, lfx: -1, rfx: 0, lg: [-1, 0], rg: [0, 2] },
    { bx: 0, by: 1, lf: 0, rf: 0, lg: [0, 1], rg: [0, 1] },
    { bx: 2, by: 0, lf: 0, rf: 4, rfx: 1, lg: [0, 2], rg: [1, 0] },
    { bx: 0, by: 1, lf: 0, rf: 0, lg: [0, 1], rg: [0, 1] },
  ];
  return f.map((o, i) => finish(drawBoss({ ...o, puff: i === 3 ? 1 : 0 })));
}
function attack() {
  return [
    finish(drawBoss({ by: 0, lg: [3, -10], rg: [-3, -10], mouth: 0, squint: true, eyes: 1.4 })),                                        // aim: guns up and in
    finish(drawBoss({ by: 0, lg: [2, -10], rg: [-2, -10], flashL: true, flashR: true, mouth: 1, squint: true, eyes: 1.6, bx: 0 })),      // FIRE
    finish(drawBoss({ by: 1, lg: [-1, -5], rg: [1, -5], mouth: 1, eyes: 1.2, puff: 2 })),                                                // recover
  ];
}
function pain() {
  return [finish(drawBoss({ bx: -2, by: 1, lg: [-1, 2], rg: [1, -2], mouth: 1, squint: true, eyes: 0.6, crownTilt: -2, lf: 1 }))];
}

/** Shear/squash a finished (un-outlined) sprite about its feet. */
function warp(src, lean, sy = 1, sx = 1) {
  const dst = new PixBuf(64, 64);
  for (let y = 0; y < 64; y++) {
    const oy = 63 - (63 - y) / sy;
    if (oy < 0 || oy > 63) continue;
    const shear = lean * ((63 - y) / 63);
    for (let x = 0; x < 64; x++) {
      const ox = (x - 32 - shear) / sx + 32;
      const s = src.get(Math.floor(ox), Math.floor(oy));
      if (s && s.a > 0) dst.set(x, y, s);
    }
  }
  return dst;
}
function cheeseBurst(p, cx, cy, n, spread, seed) {
  for (let i = 0; i < n; i++) {
    const a = hash2(i, seed, 1) * Math.PI * 2, d = hash2(i, seed, 2) * spread;
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.7;
    const w = 2 + Math.floor(hash2(i, seed, 3) * 3);
    p.rect(x, y, w, w - 1, CHEESE[1 + Math.floor(hash2(i, seed, 4) * 3)]);
    p.set(x, y, CHEESE[3]);
    if (hash2(i, seed, 5) < 0.4) p.set(x + 1, y, HOLE);
  }
}
/** Shift a sprite down (sinking into the floor), clipping at the bottom row. */
function sink(src, dy, dx = 0) {
  const d = new PixBuf(64, 64);
  d.blit(src, dx, dy);
  return d;
}
/** Lumpy mound of cheese chunks along the floor, drawn in front. */
function heap(p, cx, h, w, seed) {
  for (let i = 0; i < 26; i++) {
    const t = hash2(i, seed, 1) * 2 - 1;
    const x = cx + t * w * 0.5, top = 63 - h * (1 - t * t) * (0.55 + 0.45 * hash2(i, seed, 2));
    const r = 3 + Math.floor(hash2(i, seed, 3) * 3);
    blob(p, x, top + r * 0.6, r + 1, r, CHEESE, { edge: '#8a5a12', seed: i });
    if (hash2(i, seed, 4) < 0.7) p.circle(x + 1, top + r * 0.5, 1, HOLE);
  }
  p.rect(cx - w / 2, 61, w, 3, CHEESE[1]);
}
function die() {
  const base = (o) => drawBoss({ crown: false, ...o });
  const out = [];
  // 0: staggers back, crown pops up
  { const s = warp(base({ bx: -1, by: 1, mouth: 1, squint: true, eyes: 0.5, lg: [-2, 3], rg: [3, -4] }), -3);
    crown(s, 29, 1, -2); out.push(s); }
  // 1: crown flies off, leaning back, guns drop, first cheese sparks
  { const s = warp(base({ bx: -1, by: 2, mouth: 1, eyes: 0.2, lg: [-3, 6], rg: [2, 5], lf: 2 }), -5, 0.98);
    crown(s, 50, 4, 3); cheeseBurst(s, 40, 22, 5, 9, 1); out.push(s); }
  // 2: knees buckle, sinking into a spreading heap
  { const s = sink(warp(base({ bx: 0, by: 2, mouth: 1, eyes: 0.1, lg: [-3, 8], rg: [3, 8] }), -3), 10);
    heap(s, 32, 9, 46, 2); crown(s, 56, 30, 4); cheeseBurst(s, 32, 36, 10, 22, 2); out.push(s); }
  // 3: toppling into the burst
  { const s = sink(warp(base({ by: 3, mouth: 1, eyes: 0, lg: [-3, 8], rg: [3, 8] }), -2), 24);
    heap(s, 32, 17, 56, 3); crown(s, 14, 24, -3); cheeseBurst(s, 32, 34, 14, 26, 3); out.push(s); }
  // 4: collapsed, head sunk in cheese
  { const s = sink(warp(base({ by: 3, mouth: 1, eyes: 0, lg: [-3, 8], rg: [3, 8] }), 0), 38);
    heap(s, 32, 22, 60, 4); crown(s, 38, 36, -2); out.push(s); }
  return out.map(finish);
}
function dead() {
  const s = sink(drawBoss({ crown: false, mouth: 1, eyes: 0, lg: [-3, 8], rg: [3, 8] }), 46);
  heap(s, 32, 24, 62, 5);
  crown(s, 22, 42, -2);
  for (const [x, y] of [[14, 52], [50, 50], [36, 44]]) s.set(x, y, ink('#ffd23e', { gloss: 0.8, spark: 1 }));
  return [finish(s)];
}

export function build() {
  return {
    'boss.idle': idle(),
    'boss.walk': walk(),
    'boss.attack': attack(),
    'boss.pain': pain(),
    'boss.die': die(),
    'boss.dead': dead(),
  };
}
export default build;
