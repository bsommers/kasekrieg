// walls_fort — Schloss Gorgonzola fortress wall set, the four doors and the door jamb.
// Owner: art-walls-fort. Exports build() → { [name]: PixBuf | PixBuf[] } (see defs.artManifest()).
// All tiles are 64×64, opaque, and tile left↔right (base patterns are computed mod 64; set pieces sit inside).
// Light comes from the upper-left. Deterministic: only hash2() for variation.
import { PixBuf, ink, shade, mix, hash2 } from './pixbuf.js';

const S = 64;
const OUT = '#1a1420';
const wrap = (x) => ((x % S) + S) % S;

// ───────────── palettes (dark → light) ─────────────
const STONE = ['#22222b', '#3b3e4a', '#525764', '#6a707c', '#858b95', '#a3a8ae', '#c2c4c4'];
const MORTAR = '#1f1f27';
const WOOD = ['#22120c', '#341c11', '#482818', '#5e3520', '#76452a', '#905a36'];
const STEEL = ['#2c313b', '#454c58', '#5f6876', '#7a8494', '#8d98a8', '#b3bdcb', '#dfe6ee'];
const GOLD = ['#5a3208', '#8c5a12', '#c08a1e', '#ffd23e', '#ffe98a', '#fffbe0'];
const SILVER = ['#3a404c', '#646e7e', '#949fae', '#c4ccd8', '#e6ecf3', '#ffffff'];
const BRASS = ['#4a3010', '#7a5520', '#a87c30', '#d4a848', '#f2d27a'];
const RED = ['#4a0a10', '#7e1419', '#c21f24', '#e2493a', '#f27a5a'];
const CHEESE = ['#9a5a0c', '#d08a14', '#f2a91e', '#f6dc6a', '#fff2b0'];
const FUR = ['#3a3540', '#5a5460', '#7e7884', '#a29ca6', '#c8c2c8'];
const PINK = ['#9a4a5a', '#d47a88', '#f2a8b0'];

const M = {
  stone: { gloss: 0.04 },
  wood: { gloss: 0.22 },
  steel: { gloss: 0.5 },
  gold: { gloss: 0.6, spark: 0.7 },
  silver: { gloss: 0.65, spark: 0.6 },
  brass: { gloss: 0.55, spark: 0.25 },
};
const inks = (arr, mat) => arr.map((c) => ink(c, mat));

// ───────────── tiny helpers ─────────────
const layer = () => new PixBuf(S, S);
/** Outline a layer's subject in OUT and composite it onto dst. */
function stamp(dst, lay, outline = true) { if (outline) lay.outline(OUT); dst.blit(lay); return dst; }
function wset(p, x, y, c) { p.set(wrap(x), y, c); }
/** Clipped blit of a rectangle of src at the same coordinates. */
function clipBlit(dst, src, x, y, w, h) { dst.blit(src, x, y, { sx: x, sy: y, sw: w, sh: h }); }
/** 2×2 rivet with light top-left and a cast shadow. */
function rivet(p, x, y, r = STEEL, big = false) {
  p.set(x + 1, y + 2, OUT); p.set(x + 2, y + 1, OUT); p.set(x + 2, y + 2, OUT);
  p.set(x, y, ink(r[5], M.steel)); p.set(x + 1, y, ink(r[4], M.steel));
  p.set(x, y + 1, ink(r[4], M.steel)); p.set(x + 1, y + 1, ink(r[2], M.steel));
  if (big) { p.set(x - 1, y, ink(r[3], M.steel)); p.set(x, y - 1, ink(r[3], M.steel)); }
}
/** Bevelled rectangle: light top/left, dark bottom/right, flat face. b = bevel width. */
function bevel(p, x, y, w, h, face, light, dark, b = 1) {
  p.rect(x, y, w, h, face);
  for (let i = 0; i < b; i++) {
    p.hline(x + i, y + i, w - 2 * i, light); p.vline(x + i, y + i, h - 2 * i, light);
    p.hline(x + i, y + h - 1 - i, w - 2 * i, dark); p.vline(x + w - 1 - i, y + i, h - 2 * i, dark);
  }
}
/** Gilt/ornate frame band of thickness t around (x,y,w,h); r = 6-tone metal ramp. Light upper-left. */
function ornateFrame(p, x, y, w, h, t, r, mat) {
  const R = inks(r, mat);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const d = Math.min(i, j, w - 1 - i, h - 1 - j);
    if (d >= t) continue;
    const tl = (i === d || j === d) && !(w - 1 - i === d || h - 1 - j === d) ? true : (i === d || j === d) && (i < w / 2 && j < h / 2);
    const lit = Math.min(i, j) === d && (i <= j ? i < w - 1 - j : j < h - 1 - i);   // on top or left side of this ring
    let c;
    if (d === 0) c = OUT;
    else if (d === t - 1) c = lit ? R[0] : R[3];                    // inner lip: shadowed top-left
    else if (d === 1) c = lit ? R[4] : R[1];
    else {                                                         // beaded middle
      const along = (j === y + d - y || h - 1 - j === d) ? i : j;
      c = (along + d) % 3 === 0 ? R[lit ? 5 : 3] : R[lit ? 3 : 2];
    }
    void tl;
    p.set(x + i, y + j, c);
  }
  // corner rosettes
  for (const [cx, cy] of [[x + t / 2, y + t / 2], [x + w - t / 2, y + t / 2], [x + t / 2, y + h - t / 2], [x + w - t / 2, y + h - t / 2]]) {
    p.circle(cx, cy, t / 2 + 0.6, OUT); p.circle(cx, cy, t / 2 - 0.3, R[2]);
    p.set(cx - 1, cy - 1, R[5]); p.set(cx, cy - 1, R[4]); p.set(cx - 1, cy, R[4]); p.set(cx, cy, R[1]);
  }
}
/** Cylinder profile index (0 dark … 3 highlight) across thickness t, light from above. */
function cyl(k, t) {
  const u = (k + 0.5) / t;
  return u < 0.15 ? 1 : u < 0.38 ? 3 : u < 0.6 ? 2 : u < 0.85 ? 1 : 0;
}

// ───────────── emblem: white disc, black cheese wedge with holes ─────────────
function emblem(p, cx, cy, r, disc = '#f3eedf') {
  p.circle(cx, cy, r + 1, OUT);
  p.circle(cx, cy, r, disc);
  p.ring(cx, cy, r, r, shade(disc, 0.8));
  const s = r / 8;
  const W = '#141218';
  // wedge in 3/4 view: low tip on the left, tall rind on the right
  p.poly([[cx - 6 * s, cy + 3.5 * s], [cx + 3.5 * s, cy - 4.5 * s], [cx + 6 * s, cy - 3.5 * s], [cx + 6 * s, cy + 4 * s], [cx - 6 * s, cy + 4 * s]], W);
  if (r >= 5) {
    // top-face edge line + holes
    p.line(cx - 5 * s, cy + 2.6 * s, cx + 3.6 * s, cy - 3.6 * s, shade(disc, 0.35));
    p.circle(cx + 2.8 * s, cy + 1.2 * s, Math.max(0.9, 1.3 * s), disc);
    p.circle(cx - 0.6 * s, cy + 2.6 * s, Math.max(0.6, 0.8 * s), disc);
    p.circle(cx + 4.6 * s, cy - 1.6 * s, Math.max(0.6, 0.75 * s), disc);
  }
}

// ───────────── fort stone ─────────────
function stoneBlock(p, x0, y0, w, h, seed, pal = STONE) {
  const t = hash2(x0, y0, seed);
  const b = t < 0.3 ? 2 : t < 0.85 ? 3 : 4;
  const warm = hash2(x0, y0, seed + 9) < 0.25;
  const P = pal.map((c) => (warm ? mix(c, '#7a6a58', 0.12) : ink(c)));
  const crack = hash2(x0, y0, seed + 3) < 0.3;
  const cx = 3 + Math.floor(hash2(x0, y0, seed + 4) * (w - 8));
  for (let j = 0; j < h - 1; j++) for (let i = 0; i < w - 1; i++) {
    let k = b;
    if (j === 0) k = b + 2; else if (i === 0 || j === 1) k = b + 1;
    if (j === h - 2) k = b - 2; else if (i === w - 2 || j === h - 3) k = b - 1;
    const n = hash2(x0 + i, y0 + j, seed + 1);
    if (k === b && n > 0.93) k = b - 1; else if (k === b && n < 0.05) k = b + 1;
    // gentle top-left → bottom-right falloff across the block face
    if (k === b && i + j > (w + h) * 0.62 && n < 0.5) k = b - 1;
    p.set(wrap(x0 + i), y0 + j, P[Math.max(0, Math.min(pal.length - 1, k))]);
  }
  // chipped corners
  if (hash2(x0, y0, seed + 5) < 0.5) wset(p, x0, y0, MORTAR);
  if (hash2(x0, y0, seed + 6) < 0.4) wset(p, x0 + w - 2, y0 + h - 2, MORTAR);
  if (crack) {
    let x = x0 + cx, y = y0 + 2;
    for (let s = 0; s < 6; s++) { wset(p, x, y, P[b - 2]); wset(p, x + 1, y, P[b + 1]); y++; if (hash2(x, y, seed) < 0.5) x++; }
  }
}
function fortStone(seed = 11) {
  const p = new PixBuf(S, S).fill(MORTAR);
  const rows = [[24, 20, 20], [18, 26, 20], [22, 22, 20], [26, 18, 20]];
  const off = [0, 13, 5, 17];
  for (let r = 0; r < 4; r++) {
    let x = off[r];
    for (const w of rows[r]) { stoneBlock(p, x, r * 16, w, 16, seed + r * 31); x += w; }
  }
  p.setMat(M.stone);
  return p;
}

// ───────────── banner ─────────────
function fortBanner() {
  const p = fortStone(23);
  const L = layer();
  const R = inks(RED, { gloss: 0.05 });
  const x0 = 19, x1 = 45, top = 5, bot = 58;
  // cloth with vertical folds and a swallowtail
  for (let y = top; y <= bot; y++) for (let x = x0; x < x1; x++) {
    const notch = bot - 9 + Math.abs(x - (x0 + x1 - 1) / 2) * (9 / ((x1 - x0) / 2));
    if (y > notch) continue;
    const f = (x - x0) % 9;
    let k = f < 2 ? 3 : f < 5 ? 2 : f < 7 ? 1 : 2;
    if (y > top + 1 && y < top + 4) k = Math.max(0, k - 1);   // shadow under the rod
    L.set(x, y, R[k]);
  }
  // gold trim down both edges and along the tails
  const G = inks(GOLD, M.gold);
  for (let y = top; y <= bot; y++) { if (L.has(x0, y)) L.set(x0, y, G[3]); if (L.has(x1 - 1, y)) L.set(x1 - 1, y, G[2]); }
  for (let x = x0; x < x1; x++) for (let y = bot; y > top; y--) if (L.has(x, y)) { L.set(x, y, G[2]); L.set(x, y - 1, G[3]); break; }
  emblem(L, 32, 25, 9);
  // horizontal gold bars above and below the emblem
  L.hline(x0 + 2, 13, x1 - x0 - 4, G[3]); L.hline(x0 + 2, 37, x1 - x0 - 4, G[3]);
  L.hline(x0 + 2, 39, x1 - x0 - 4, G[2]);
  stamp(p, L);
  // brass rod with finials (drawn after so it sits on top)
  const B = inks(BRASS, M.brass);
  const rod = layer();
  rod.hline(15, 4, 34, B[3]); rod.hline(15, 5, 34, B[1]);
  for (const fx of [14, 49]) { rod.circle(fx, 4.5, 2.2, B[2]); rod.set(fx - 1, 3, B[4]); }
  // tassel cords
  rod.vline(17, 6, 7, G[2]); rod.vline(46, 6, 7, G[2]); rod.rect(16, 13, 3, 3, G[3]); rod.rect(45, 13, 3, 3, G[3]);
  rod.set(16, 13, G[4]); rod.set(45, 13, G[4]);
  stamp(p, rod);
  // soft shadow of the banner on the stone to the right
  for (let y = 8; y < bot - 6; y++) { const x = x1 + 1; const c = p.get(x, y); if (c && c.r > 40) p.set(x, y, shade(c, 0.6)); }
  return p;
}

// ───────────── wood panelling ─────────────
function grain(p, x, y, w, h, pal, seed, vertical = true, mat = M.wood) {
  const P = inks(pal, mat);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const a = vertical ? j : i, c = vertical ? i + x : j + y;   // along / across
    const n = Math.sin((c + Math.sin(a * 0.11 + seed) * 1.8 + Math.sin(a * 0.031 + seed * 2) * 3) * 1.15 + seed);
    let k = n > 0.72 ? 3 : n > -0.2 ? 2 : n > -0.8 ? 1 : 0;
    if (hash2(x + i, y + j, seed) > 0.96) k = Math.max(0, k - 1);
    p.set(wrap(x + i), y + j, P[Math.min(pal.length - 1, k)]);
  }
}
function woodPanel() {
  const p = new PixBuf(S, S);
  const Wd = inks(WOOD, M.wood);
  grain(p, 0, 0, S, S, WOOD.slice(1, 5), 3, true);
  // two raised panels per tile, framed by stiles (rails at top/bottom)
  for (const px of [0, 32]) {
    const x = px + 4, y = 12, w = 24, h = 38;
    p.rect(x - 1, y - 1, w + 2, h + 2, Wd[0]);                 // groove
    grain(p, x, y, w, h, WOOD.slice(2, 6), 7 + px, true);
    // bevelled field: light top-left, dark bottom-right
    for (let i = 0; i < 3; i++) {
      p.hline(x + i, y + i, w - 2 * i, i === 0 ? Wd[5] : Wd[4]); p.vline(x + i, y + i, h - 2 * i, Wd[4]);
      p.hline(x + i, y + h - 1 - i, w - 2 * i, i === 0 ? Wd[0] : Wd[1]); p.vline(x + w - 1 - i, y + i, h - 2 * i, Wd[1]);
    }
    p.set(x + 3, y + 3, Wd[5]);
  }
  // brass chair-rail at the top and a dark skirting at the bottom
  const B = inks(BRASS, M.brass);
  p.hline(0, 5, S, OUT); p.hline(0, 6, S, B[4]); p.hline(0, 7, S, B[3]); p.hline(0, 8, S, B[1]); p.hline(0, 9, S, OUT);
  for (let x = 0; x < S; x += 8) { p.set(x + 4, 7, B[4]); p.set(x + 5, 7, B[2]); }
  p.rect(0, 54, S, 10, Wd[1]);
  p.hline(0, 54, S, OUT); p.hline(0, 55, S, Wd[4]); p.hline(0, 56, S, Wd[3]); p.hline(0, 63, S, Wd[0]);
  for (let x = 2; x < S; x += 16) rivet(p, x, 58, BRASS.concat(BRASS[4], '#fff3c0'));
  return p;
}

// ───────────── portrait of Der Große Käse ─────────────
function woodPortrait() {
  const p = woodPanel();
  const fx = 15, fy = 4, fw = 34, fh = 50, t = 5;
  // drop shadow
  for (let y = fy + 2; y < fy + fh + 2; y++) for (let x = fx + 2; x < fx + fw + 2; x++) { const c = p.get(x, y); p.set(x, y, shade(c, 0.55)); }
  const cx0 = fx + t, cy0 = fy + t, cw = fw - 2 * t, ch = fh - 2 * t;
  const C = layer();
  // backdrop: dark olive with a lighter halo behind the head
  for (let y = cy0; y < cy0 + ch; y++) for (let x = cx0; x < cx0 + cw; x++) {
    const d = Math.hypot(x - 32, y - 24);
    C.set(x, y, d < 11 ? '#4a5a3a' : d < 15 ? '#3c4a30' : '#2c3626');
  }
  // body: white uniform, gold epaulettes, red sash, medals
  const U = ['#8890a0', '#c4c8d0', '#e8eaee', '#ffffff'];
  C.ellipse(32, 52, 15, 14, U[1]);
  C.ellipse(31, 50, 13, 12, U[2]);
  C.ellipse(29, 47, 7, 5, U[3]);
  C.ellipse(19.5, 41.5, 4.5, 2.5, GOLD[2]); C.ellipse(44.5, 41.5, 4.5, 2.5, GOLD[2]);
  C.hline(17, 41, 5, GOLD[4]); C.hline(42, 41, 5, GOLD[4]);
  for (let x = 16; x < 23; x += 2) C.vline(x, 43, 2, GOLD[3]);
  for (let x = 41; x < 48; x += 2) C.vline(x, 43, 2, GOLD[3]);
  C.line(22, 41, 40, 50, RED[2]); C.line(23, 41, 41, 50, RED[3]); C.line(22, 42, 40, 51, RED[1]);
  for (let y = 43; y < 50; y += 3) { C.set(32, y, GOLD[4]); C.set(33, y, GOLD[2]); }
  [[25, 45, RED[2]], [27, 45, '#3a6ac8'], [25, 47, GOLD[3]], [27, 47, '#3aa860']].forEach(([x, y, c]) => { C.set(x, y, c); C.set(x, y + 1, GOLD[3]); });
  // head: fat grey rat facing the viewer
  const F = FUR;
  C.circle(23, 21, 4.5, F[2]); C.circle(41, 21, 4.5, F[2]);
  C.circle(23.5, 21.5, 2.5, PINK[1]); C.circle(40.5, 21.5, 2.5, PINK[1]);
  C.ellipse(32, 30, 10, 9, F[2]);          // jowly head
  C.ellipse(31, 28, 8, 6, F[3]);
  C.ellipse(29, 26, 4, 3, F[4]);
  C.ellipse(32, 34.5, 5, 3.5, F[3]);       // muzzle
  C.ellipse(32, 35, 4, 2.5, F[4]);
  C.rect(31, 32, 2, 2, PINK[1]); C.set(31, 32, PINK[2]);
  C.hline(30, 37, 4, F[0]);                // mouth
  C.set(33, 38, '#f6f0e0');                // buck tooth
  // stern eyes and brows
  C.rect(27, 28, 2, 2, '#120c14'); C.rect(35, 28, 2, 2, '#120c14');
  C.set(27, 28, '#ff5a40'); C.set(35, 28, '#ff5a40');
  C.line(25, 25, 29, 27, F[0]); C.line(39, 25, 35, 27, F[0]);
  // whiskers
  C.line(26, 35, 21, 34, F[4]); C.line(26, 36, 21, 37, F[4]); C.line(38, 35, 43, 34, F[4]); C.line(38, 36, 43, 37, F[4]);
  // cigar with a glowing tip
  C.line(35, 37, 41, 39, '#6a3a1c'); C.line(35, 38, 40, 40, '#4a2412');
  C.set(42, 39, ink('#ff6a1a', { emit: 1 })); C.set(41, 40, ink('#ffb21a', { emit: 0.8 }));
  // cheese-wheel crown
  const Ch = CHEESE;
  C.rect(25, 15, 15, 6, Ch[2]); C.hline(25, 20, 15, Ch[0]); C.vline(39, 15, 6, Ch[1]);
  C.ellipse(32, 15, 7.5, 2, Ch[3]); C.hline(28, 14, 6, Ch[4]);
  C.circle(28, 18, 1, Ch[1]); C.set(34, 17, Ch[1]); C.set(37, 19, Ch[1]);
  for (const x of [26, 32, 38]) { C.set(x, 11, GOLD[4]); C.vline(x, 12, 2, GOLD[3]); }
  // tidy outline inside the canvas only, then clip
  const bg = new PixBuf(S, S);
  for (let y = cy0; y < cy0 + ch; y++) for (let x = cx0; x < cx0 + cw; x++) bg.set(x, y, C.get(x, y));
  p.rect(cx0, cy0, cw, ch, '#2c3626');
  clipBlit(p, bg, cx0, cy0, cw, ch);
  // painterly varnish: gloss on the canvas
  p.setMat({ gloss: 0.18, emit: 0 }, cx0, cy0, cw, ch);
  p.set(42, 39, ink('#ff6a1a', { emit: 1 })); p.set(41, 40, ink('#ffb21a', { emit: 0.8 }));
  ornateFrame(p, fx, fy, fw, fh, t, GOLD, M.gold);
  // nameplate on the bottom rail
  p.rect(26, fy + fh - 4, 12, 3, GOLD[4]); p.hline(26, fy + fh - 2, 12, GOLD[1]);
  p.hline(28, fy + fh - 3, 8, GOLD[1]);
  p.setMat(M.gold, 26, fy + fh - 4, 12, 3);
  return p;
}

// ───────────── steel ─────────────
function steelBase(p, seed = 5, pal = STEEL, plateH = [0, 26, 52]) {
  const P = inks(pal, M.steel);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const streak = hash2(0, y, seed) * 0.6 + hash2((x >> 3), y, seed + 1) * 0.4;
    let k = streak > 0.62 ? 4 : streak > 0.25 ? 3 : 2;
    if (hash2(x, y, seed + 2) > 0.985) k = 5;
    p.set(x, y, P[k]);
  }
  // plate seams: horizontal at given rows, vertical staggered every 32
  for (let r = 0; r < plateH.length; r++) {
    const y = plateH[r];
    if (y > 0) { p.hline(0, y - 1, S, P[0]); p.hline(0, y, S, P[5]); }
    const yEnd = r + 1 < plateH.length ? plateH[r + 1] - 1 : S;
    const vx = r % 2 ? 16 : 0;
    for (const sx of [vx, vx + 32]) { p.vline(wrap(sx), y, yEnd - y, P[0]); p.vline(wrap(sx + 1), y, yEnd - y, P[5]); }
    // top-left plate highlight
    for (const sx of [vx, vx + 32]) p.hline(wrap(sx + 2), y + 1, 12, P[5]);
    // rivets along the seams
    for (let x = vx + 4; x < vx + 64; x += 7) if ((x - vx) % 32 > 2 && (x - vx) % 32 < 30) { rivet(p, wrap(x), y + 2, pal); if (yEnd - 4 > y + 6) rivet(p, wrap(x), yEnd - 4, pal); }
    for (const sx of [vx, vx + 32]) for (let yy = y + 6; yy < yEnd - 6; yy += 7) rivet(p, wrap(sx + 3), yy, pal);
  }
}
function hazard(p, y0, h) {
  const Y = ink('#f2c21e', { gloss: 0.3 }), K = ink('#1c1a20', { gloss: 0.3 });
  p.hline(0, y0, S, OUT);
  for (let y = y0 + 1; y < y0 + h - 1; y++) for (let x = 0; x < S; x++) p.set(x, y, ((x + y) & 15) < 8 ? Y : K);
  p.hline(0, y0 + 1, S, ink('#f8e27a', { gloss: 0.3 }));
  for (let x = 0; x < S; x++) if (((x + y0 + 1) & 15) >= 8) p.set(x, y0 + 1, ink('#3a3640', { gloss: 0.3 }));
  p.hline(0, y0 + h - 1, S, OUT);
}
function steelPlate() {
  const p = new PixBuf(S, S);
  steelBase(p, 5, STEEL, [0, 24]);
  hazard(p, 50, 12);
  p.hline(0, 62, S, ink(STEEL[1], M.steel)); p.hline(0, 63, S, ink(STEEL[0], M.steel));
  // grime streaks under rivets
  for (let x = 0; x < S; x++) if (hash2(x, 0, 77) > 0.86) for (let y = 30; y < 30 + 8 * hash2(x, 1, 77); y++) p.set(x, y, shade(p.get(x, y), 0.85));
  return p;
}

// ───────────── pipes ─────────────
function hPipe(p, y, t, pal, mat, flanges = []) {
  const P = inks(pal, mat);
  p.hline(0, y - 1, S, OUT); p.hline(0, y + t, S, OUT);
  for (let k = 0; k < t; k++) p.hline(0, y + k, S, P[cyl(k, t)]);
  // shadow cast on the wall below
  for (let x = 0; x < S; x++) { const c = p.get(x, y + t + 1); p.set(x, y + t + 1, shade(c, 0.55)); }
  for (const fx of flanges) {
    for (let k = -2; k < t + 2; k++) { const c = P[Math.min(3, cyl(Math.max(0, Math.min(t - 1, k)), t) + 1)]; p.hline(wrap(fx), y + k, 3, c); }
    p.vline(wrap(fx - 1), y - 2, t + 4, OUT); p.vline(wrap(fx + 3), y - 2, t + 4, OUT);
    p.hline(wrap(fx), y - 3, 3, OUT); p.hline(wrap(fx), y + t + 2, 3, OUT);
    p.set(wrap(fx + 1), y - 1, ink(pal[3], mat)); p.set(wrap(fx + 1), y + t, ink(pal[0], mat));
  }
}
function vPipe(p, x, y0, y1, t, pal, mat) {
  const P = inks(pal, mat);
  p.vline(x - 1, y0, y1 - y0, OUT); p.vline(x + t, y0, y1 - y0, OUT);
  for (let k = 0; k < t; k++) p.vline(x + k, y0, y1 - y0, P[cyl(k, t)]);
  for (let y = y0; y < y1; y++) { const c = p.get(x + t + 1, y); if (c.r > 30) p.set(x + t + 1, y, shade(c, 0.6)); }
}
function lamp(p, x, y, col, on = 1) {
  p.rect(x - 1, y - 1, 4, 4, OUT);
  p.rect(x, y, 2, 2, ink(col, { emit: on }));
  p.set(x, y, ink(shade(col, 1.6), { emit: on }));
}
function pipes() {
  const p = new PixBuf(S, S);
  steelBase(p, 9, STEEL.map((c) => hexShade(c, 0.72)), [0, 32]);
  const COP = ['#5a2a14', '#9a4a22', '#d27a3e', '#f4b27a'];
  const PST = ['#3a404a', '#626c7a', '#9aa6b6', '#d8e0ea'];
  vPipe(p, 44, 0, S, 6, COP, { gloss: 0.55, spark: 0.1 });
  hPipe(p, 7, 8, PST, M.steel, [10, 30, 54]);
  hPipe(p, 46, 6, COP, { gloss: 0.55, spark: 0.1 }, [6, 24]);
  // T-joint collars where the vertical pipe crosses
  for (const yy of [5, 17, 44, 54]) { p.rect(43, yy, 8, 2, ink(COP[3], { gloss: 0.6 })); p.hline(43, yy + 2, 8, OUT); p.hline(43, yy - 1, 8, OUT); }
  // red valve wheel on the vertical pipe
  const V = layer();
  V.ring(47, 30, 6.5, 6.5, '#c21f24', 2);
  V.line(41, 30, 53, 30, '#a01a20'); V.line(47, 24, 47, 36, '#a01a20');
  V.circle(47, 30, 1.6, '#e2493a');
  V.set(43, 26, '#f27a5a'); V.set(44, 25, '#f27a5a'); V.set(42, 27, '#f27a5a');
  V.setMat({ gloss: 0.45 });
  stamp(p, V);
  // pressure gauge on a stub pipe
  const G = layer();
  G.rect(18, 15, 3, 9, PST[2]); G.vline(18, 15, 9, PST[3]); G.vline(20, 15, 9, PST[1]);
  G.circle(19.5, 29.5, 7.5, BRASS[1]);
  G.circle(19.5, 29.5, 6.2, BRASS[3]);
  G.circle(19.5, 29.5, 5.2, '#efe8d6');
  G.setMat({ gloss: 0.55, spark: 0.15 });
  for (let a = 0; a < 7; a++) { const an = Math.PI * (0.8 + a * 0.233); G.set(19.5 + Math.cos(an) * 4.2, 29.5 + Math.sin(an) * 4.2, a > 4 ? '#c21f24' : '#3a3640'); }
  G.line(19, 30, 22, 26, '#c21f24'); G.set(19, 30, '#1a1420');
  G.set(16, 26, '#ffffff'); G.set(17, 26, '#ffffff');
  stamp(p, G);
  // indicator lamp strip
  p.rect(4, 36, 12, 6, OUT); p.rect(5, 37, 10, 4, ink('#24262e', M.steel));
  lamp(p, 6, 38, '#3aff5a'); lamp(p, 9, 38, '#ffb21a', 0.9); lamp(p, 12, 38, '#ff3a2a', 0.7);
  lamp(p, 27, 56, '#3aff5a', 0.9); lamp(p, 31, 56, '#3aff5a', 0.9);
  // drip stain from a flange
  for (let y = 18; y < 28; y++) { const c = p.get(31, y); p.set(31, y, shade(c, 0.7 + (y - 18) * 0.02)); }
  return p;
}
function hexShade(c, f) { const k = shade(c, f); return '#' + [k.r, k.g, k.b].map((v) => v.toString(16).padStart(2, '0')).join(''); }

// ───────────── bookshelf ─────────────
function bookshelf() {
  const p = new PixBuf(S, S);
  const Wd = inks(WOOD, M.wood);
  p.fill(ink('#120a08'));
  const shelves = [0, 21, 42, 61];     // board tops (3px boards, last one 3px at the bottom)
  const BOOK = [['#6e1a1e', '#a02a2a', '#c8484a'], ['#1e4a2c', '#2e6e40', '#4a9058'], ['#1c2c5a', '#2e4a8a', '#4a6ab4'],
    ['#4a2c14', '#6e4420', '#946232'], ['#6a5418', '#9a7e28', '#c4a440'], ['#3a2a3a', '#5a405a', '#7a5a7a']];
  for (let s = 0; s < 3; s++) {
    const yb = shelves[s + 1] - 1;          // floor of this compartment (last book row)
    const top = shelves[s] + 3;
    let x = 1 + s * 3;
    let i = 0;
    while (x < S + 1) {
      const seed = s * 97 + i;
      // the cheese-wheel bookend lives on the middle shelf
      if (s === 1 && i === 7) {
        const cw = 14;
        const C = layer();
        C.circle(x + 7, yb - 6.5, 7, CHEESE[2]);
        C.circle(x + 6.5, yb - 7, 5.5, CHEESE[3]);
        C.ring(x + 7, yb - 6.5, 7, 7, CHEESE[0]);
        C.poly([[x + 7, yb - 6.5], [x + 15, yb - 13], [x + 15, yb - 5]], '#120a08');   // a slice cut out
        C.line(x + 7, yb - 6.5, x + 13, yb - 11, CHEESE[4]);
        C.circle(x + 4, yb - 9, 1.2, CHEESE[1]); C.set(x + 8, yb - 3, CHEESE[1]); C.set(x + 3, yb - 4, CHEESE[1]);
        C.setMat({ gloss: 0.2 });
        stamp(p, C);
        x += cw; i++; continue;
      }
      const w = 3 + Math.floor(hash2(seed, 1, 5) * 3);
      const tall = hash2(seed, 2, 5);
      const h = Math.min(yb - top + 1, 11 + Math.floor(tall * 8));
      const pal = BOOK[Math.floor(hash2(seed, 3, 5) * BOOK.length)].map((c) => ink(c, { gloss: 0.12 }));
      const lean = hash2(seed, 4, 5) < 0.08 && w <= 4;
      for (let j = 0; j < h; j++) for (let k = 0; k < w; k++) {
        const xx = x + k + (lean ? Math.floor((h - j) / 6) : 0), yy = yb - j;
        const c = k === 0 ? pal[2] : k === w - 1 ? pal[0] : pal[1];
        wset(p, xx, yy, c);
      }
      // spine bands and labels (ledgers get a white label)
      const G = ink(GOLD[3], M.gold);
      if (w >= 3) {
        for (const by of [yb - h + 3, yb - 2]) for (let k = 0; k < w - 1; k++) wset(p, x + k, by, G);
        if (hash2(seed, 6, 5) < 0.45) for (let k = 1; k < w - 1; k++) { wset(p, x + k, yb - Math.floor(h / 2), '#e8dcc0'); wset(p, x + k, yb - Math.floor(h / 2) + 1, '#e8dcc0'); }
      }
      for (let j = 0; j < h; j++) wset(p, x + w, yb - j, OUT);   // gap shadow between books
      wset(p, x - 1 + w, yb - h, pal[2]);
      x += w + 1; i++;
    }
  }
  // shelf boards with a lit front edge
  for (const y of shelves) {
    const hh = y === 61 ? 3 : 3;
    p.rect(0, y, S, hh, Wd[3]); p.hline(0, y, S, Wd[5]); p.hline(0, y + hh - 1, S, Wd[1]);
    if (y + hh < S) p.hline(0, y + hh, S, ink('#0a0606'));
  }
  // uprights at the tile seam (wrap) so shelves read as bays
  for (let y = 0; y < S; y++) { p.set(62, y, Wd[2]); p.set(63, y, Wd[1]); p.set(0, y, Wd[4]); p.set(1, y, Wd[3]); p.set(2, y, OUT); p.set(61, y, OUT); }
  return p;
}

// ───────────── mouse hole ─────────────
function mouseHole() {
  const p = fortStone(41);
  const cx = 32, base = 63, hw = 9, top = 43;
  const inside = (x, y) => { if (y > base || y < top) return false; const ay = top + hw; if (y >= ay) return Math.abs(x + 0.5 - cx) <= hw; return Math.hypot(x + 0.5 - cx, y + 0.5 - ay) <= hw; };
  // rim: dark ring + lit bottom-right lip, shadowed top-left
  for (let y = top - 3; y <= base; y++) for (let x = cx - hw - 3; x <= cx + hw + 3; x++) {
    if (inside(x, y)) continue;
    let near = false;
    for (let d = 1; d <= 2 && !near; d++) near = inside(x - d, y) || inside(x + d, y) || inside(x, y + d) || inside(x, y - d);
    if (!near) continue;
    const lit = x > cx;
    p.set(x, y, inside(x - 1, y) || inside(x, y + 1) || inside(x + 1, y) || inside(x, y - 1) ? (lit ? STONE[5] : STONE[1]) : (lit ? STONE[4] : STONE[2]));
  }
  for (let y = top; y <= base; y++) for (let x = cx - hw; x <= cx + hw; x++) if (inside(x, y)) {
    const d = Math.hypot(x - cx, (y - base) * 0.6);
    p.set(x, y, ink(d < 5 ? '#050408' : d < 8 ? '#0a0810' : '#120f18'));
  }
  // inner left wall catches a sliver of light
  for (let y = top + 6; y <= base; y++) p.set(cx + hw, y, '#2a2632');
  // the eyes
  const E = ink('#d8ff5a', { emit: 1 }), Pp = ink('#1a2a06', { emit: 0.2 });
  for (const ex of [28, 35]) { p.rect(ex, 52, 2, 2, E); p.set(ex + 1, 53, Pp); }
  p.set(28, 52, ink('#ffffff', { emit: 1 })); p.set(35, 52, ink('#ffffff', { emit: 1 }));
  // crumbs at the doorstep
  const Ch = inks(CHEESE, {});
  [[22, 62], [20, 63], [44, 63], [42, 62], [46, 62]].forEach(([x, y], i) => p.set(x, y, Ch[2 + (i % 2)]));
  p.set(43, 63, Ch[1]);
  return p;
}

// ───────────── propaganda poster ─────────────
function glyphs(p, x, y, n, col, seed) {
  for (let g = 0; g < n; g++) for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) {
    const on = j === 0 || i === 0 || hash2(g, j * 3 + i, seed) < 0.45;
    if (on) p.set(x + g * 4 + i, y + j, col);
  }
}
function poster() {
  const p = fortStone(57);
  const x0 = 13, y0 = 5, w = 38, h = 53;
  const L = layer();
  const paper = ['#b8a882', '#d8caa2', '#ece0bc'];
  L.rect(x0, y0, w, h, paper[1]);
  // sunburst of bold red stripes behind the rat
  const cx = 30, cy = 30;
  for (let y = y0 + 9; y < y0 + 40; y++) for (let x = x0 + 1; x < x0 + w - 1; x++) {
    const a = Math.atan2(y - cy, x - cx);
    if (Math.floor((a + Math.PI) / (Math.PI / 8)) % 2 === 0) L.set(x, y, RED[2]);
  }
  // header: red band with white block letters
  L.rect(x0, y0, w, 9, RED[1]); L.hline(x0, y0 + 8, w, OUT);
  glyphs(L, x0 + 3, y0 + 2, 8, '#f3eedf', 3);
  // the stern rat, in profile, pointing right
  const R = layer();
  R.ellipse(30, 47, 13, 7, '#6b7468');                 // field-grey tunic shoulders
  R.ellipse(28, 45, 9, 4, '#7f887b');
  R.poly([[26, 41], [30, 41], [28, 47]], RED[2]);     // collar tab
  R.rect(17, 42, 4, 3, RED[2]); R.rect(18, 43, 2, 1, '#f3eedf');   // armband
  R.poly([[32, 42], [44, 33], [46, 35], [35, 45]], '#6b7468');   // arm
  R.line(33, 42, 44, 34, '#7f887b');
  R.rect(44, 32, 4, 4, FUR[3]); R.hline(47, 33, 4, FUR[3]); R.set(50, 33, FUR[4]);   // fist + finger
  R.circle(27, 31, 6.5, FUR[2]);                      // skull
  R.poly([[29, 27], [41, 32], [41, 34], [29, 37]], FUR[2]);   // long snout
  R.line(30, 28, 40, 32, FUR[3]);
  R.rect(40, 31, 3, 3, PINK[1]); R.set(41, 31, PINK[2]);   // nose
  R.circle(22, 26, 4, FUR[2]); R.circle(22, 26, 2.2, PINK[1]);   // ear
  R.rect(30, 29, 2, 2, '#120c14');                    // eye
  R.line(28, 27, 33, 28, '#120c14');                  // scowl
  R.line(33, 36, 38, 35, FUR[0]);                     // mouth
  // peaked cap
  R.poly([[19, 25], [33, 21], [36, 25], [21, 28]], '#3a4038');
  R.hline(22, 25, 12, RED[2]);
  R.poly([[30, 25], [39, 25], [37, 27], [30, 27]], '#141218');
  R.circle(27, 23.5, 1.5, '#f3eedf');
  for (const [xx, yy] of [[37, 33], [38, 36]]) { R.line(xx, yy, xx + 6, yy - 1 + (yy > 34 ? 2 : 0), FUR[4]); }
  R.outline(OUT);
  // clip the rat to the paper
  for (let y = y0 + 9; y < y0 + 42; y++) for (let x = x0; x < x0 + w; x++) { const c = R.get(x, y); if (c.a) L.set(x, y, c); }
  // footer: black band, emblem on red, slogan bars
  L.rect(x0, y0 + 41, w, h - 41, '#1c1a20'); L.hline(x0, y0 + 41, w, OUT);
  L.rect(x0 + 2, y0 + 43, 10, 9, RED[2]);
  emblem(L, x0 + 7, y0 + 47.5, 3.5);
  glyphs(L, x0 + 14, y0 + 43, 5, '#f2a91e', 9);
  L.hline(x0 + 14, y0 + 50, 19, '#f3eedf');
  // paper edge shading and wear
  for (let y = y0; y < y0 + h; y++) { L.set(x0, y, mix(L.get(x0, y), '#ffffff', 0.3)); L.set(x0 + w - 1, y, shade(L.get(x0 + w - 1, y), 0.7)); }
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (hash2(x, y, 61) > 0.97) L.set(x, y, mix(L.get(x, y), paper[0], 0.6));
  // torn bottom-right corner
  for (let j = 0; j < 7; j++) for (let i = 0; i < 7 - j; i++) L.erase(x0 + w - 1 - i, y0 + h - 1 - j + 0);
  L.line(x0 + w - 8, y0 + h - 1, x0 + w - 1, y0 + h - 8, paper[2]);
  stamp(p, L);
  // drop shadow on stone to the right/bottom
  for (let y = y0 + 2; y < y0 + h + 1; y++) { const c = p.get(x0 + w + 1, y); if (c) p.set(x0 + w + 1, y, shade(c, 0.6)); }
  // nails at the top corners
  for (const nx of [x0 + 1, x0 + w - 3]) { p.rect(nx, y0 + 1, 2, 2, '#8d98a8'); p.set(nx, y0 + 1, '#dfe6ee'); p.set(nx + 1, y0 + 2, '#454c58'); }
  p.setMat({ gloss: 0.06 }, x0, y0, w, h);
  return p;
}

// ───────────── mirror ─────────────
function mirror() {
  const p = woodPanel();
  const fx = 6, fy = 2, fw = 52, fh = 60, t = 6;
  // mirror glass: dark, cold, perfectly reflective, with faint diagonal sheen
  const mx = fx + t, my = fy + t, mw = fw - 2 * t, mh = fh - 2 * t;
  for (let y = my; y < my + mh; y++) for (let x = mx; x < mx + mw; x++) {
    const d = x - mx + (y - my) * 0.6;
    let c = '#1a1f2c';
    if ((d > 8 && d < 11) || (d > 14 && d < 15.5)) c = '#2a3346';
    if (d < 2) c = '#232a3a';
    p.set(x, y, ink(c, { gloss: 1, spark: 0 }));
  }
  ornateFrame(p, fx, fy, fw, fh, t, GOLD, M.gold);
  // crest at the top centre: a gold cheese wedge in a cartouche
  const C = layer();
  C.ellipse(32, 4, 7, 4, GOLD[2]); C.ellipse(31.5, 3.5, 6, 3, GOLD[3]);
  C.poly([[27, 6], [35, 1.5], [37, 2], [37, 6]], CHEESE[3]);
  C.set(33, 4, CHEESE[1]); C.set(35, 5, CHEESE[1]);
  C.hline(28, 6, 9, GOLD[1]);
  // scrolls at the side midpoints
  for (const sx of [fx + 1, fx + fw - 4]) { C.rect(sx, 28, 3, 8, GOLD[3]); C.vline(sx, 28, 8, GOLD[4]); C.set(sx + 1, 31, GOLD[1]); C.set(sx + 1, 32, GOLD[1]); }
  C.setMat(M.gold);
  stamp(p, C);
  return p;
}

// ───────────── prison cell ─────────────
function cellBars() {
  const p = new PixBuf(S, S);
  // darkness with the faintest back wall
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const v = ((y >> 3) + ((x + ((y >> 3) & 1) * 6) >> 4)) & 1;
    p.set(x, y, v ? '#0d0c12' : '#100f16');
  }
  // the kitten: barely-there silhouette, big sad shining eyes (in the gap between bars)
  const K = layer();
  K.circle(31.5, 34, 7, '#24202c');
  K.poly([[25, 31], [26, 23], [30, 28]], '#24202c'); K.poly([[38, 31], [37, 23], [33, 28]], '#24202c');
  K.ellipse(31.5, 46, 6, 6, '#1e1a26');
  stamp(p, K, false);
  const EY = ink('#7af0d8', { emit: 0.85 }), EYD = ink('#2a8a8a', { emit: 0.55 }), HI = ink('#ffffff', { emit: 1 });
  for (const ex of [27, 34]) {
    p.rect(ex, 32, 3, 3, EY); p.hline(ex, 34, 3, EYD); p.set(ex + 1, 33, ink('#0a1014', { emit: 0.1 }));
    p.set(ex, 32, HI);
    p.line(ex - 1, 30 + (ex < 30 ? 1 : 0), ex + 2, 30 + (ex < 30 ? 0 : 1), '#3a3442');   // sad tilted brows
  }
  p.set(28, 36, ink('#8af8ff', { emit: 0.7 })); p.set(28, 37, ink('#4ac8e0', { emit: 0.5 }));   // a tear
  p.set(31, 37, '#5a3a48'); p.set(32, 37, '#5a3a48');                                            // nose
  // stone lintel and sill
  const sp = fortStone(71);
  clipBlit(p, sp, 0, 0, S, 6); clipBlit(p, sp, 0, 58, S, 6);
  p.hline(0, 6, S, OUT); p.hline(0, 7, S, '#08070a'); p.hline(0, 57, S, OUT);
  // iron bars: period 16 → tiles; crossbars
  const I = inks(['#1e2028', '#3a3e48', '#5e6470', '#8a92a0'], { gloss: 0.45 });
  for (const bx of [5, 21, 37, 53]) {
    for (let y = 6; y < 58; y++) { p.set(bx - 1, y, OUT); p.set(bx, y, I[3]); p.set(bx + 1, y, I[2]); p.set(bx + 2, y, I[1]); p.set(bx + 3, y, OUT); }
    p.rect(bx - 1, 4, 5, 3, I[1]); p.rect(bx - 1, 56, 5, 3, I[1]); p.hline(bx - 1, 4, 5, I[3]); p.hline(bx - 1, 56, 5, I[2]);
  }
  for (const cy of [16, 44]) {
    p.hline(0, cy - 1, S, OUT); p.hline(0, cy, S, I[3]); p.hline(0, cy + 1, S, I[2]); p.hline(0, cy + 2, S, I[1]); p.hline(0, cy + 3, S, OUT);
    for (const bx of [5, 21, 37, 53]) { p.rect(bx - 1, cy - 1, 5, 5, I[2]); p.set(bx - 1, cy - 1, I[3]); p.set(bx, cy, I[3]); p.set(bx + 3, cy + 3, I[0]); }
  }
  // two little paws gripping the lower crossbar
  for (const px of [26, 35]) { p.rect(px, 43, 3, 2, '#f08a1c'); p.set(px, 43, '#fde3b0'); p.set(px + 1, 44, '#c25a0e'); p.hline(px, 42, 3, OUT); }
  return p;
}

// ───────────── war map ─────────────
function warMap() {
  const p = woodPanel();
  const x0 = 3, y0 = 3, w = 58, h = 50;
  const Wd = inks(WOOD, M.wood);
  bevel(p, x0 - 2, y0 - 2, w + 4, h + 4, Wd[3], Wd[5], Wd[1], 2);
  p.frame(x0 - 3, y0 - 3, w + 6, h + 6, OUT);
  // sea + land
  const SEA = ['#2a4a6a', '#3d6a8a', '#5a8aaa'], LAND = ['#9a8a5a', '#cdb98a', '#e4d4a6'];
  const land = (x, y) => {
    const a = Math.hypot((x - 22) / 18, (y - 22) / 14) < 1, b = Math.hypot((x - 46) / 12, (y - 40) / 10) < 1, c = Math.hypot((x - 50) / 8, (y - 14) / 7) < 1;
    const wob = hash2(x >> 2, y >> 2, 5) < 0.2;
    return (a || b || c) !== wob ? true : false;
  };
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const L = land(x, y);
    let c = L ? LAND[1] : SEA[1];
    if (!L && (x + y * 3) % 11 === 0 && y % 4 === 0) c = SEA[2];
    if (L && !land(x - 1, y - 1)) c = LAND[2];
    if (L && !land(x + 1, y + 1)) c = LAND[0];
    if (!L && (land(x + 1, y) || land(x - 1, y) || land(x, y + 1) || land(x, y - 1))) c = SEA[0];
    p.set(x, y, ink(c, { gloss: 0.08 }));
  }
  // faint grid
  for (let x = x0 + 8; x < x0 + w; x += 10) for (let y = y0; y < y0 + h; y += 2) p.set(x, y, mix(p.get(x, y), '#1a1420', 0.25));
  for (let y = y0 + 8; y < y0 + h; y += 10) for (let x = x0; x < x0 + w; x += 2) p.set(x, y, mix(p.get(x, y), '#1a1420', 0.25));
  // cheese-shaped territories (the Rat Reich's conquests)
  const T = layer();
  const wedge = (x, y, s) => { T.poly([[x, y + 4 * s], [x + 9 * s, y - 2 * s], [x + 10 * s, y + 4 * s]], CHEESE[2]); T.line(x + 1, y + 4 * s - 1, x + 9 * s, y - 2 * s + 1, CHEESE[3]); T.set(x + 6 * s, y + 2 * s, CHEESE[0]); T.set(x + 8 * s, y + 1, CHEESE[0]); };
  wedge(12, 18, 1.2); wedge(40, 37, 1); wedge(46, 11, 0.8);
  stamp(p, T);
  // strings between pins
  const pins = [[18, 16, '#e23a3a'], [30, 28, '#e23a3a'], [46, 36, '#3a6ae2'], [50, 12, '#e23a3a'], [12, 38, '#3ac860'], [36, 46, '#e2c23a']];
  const S1 = ink('#c21f24'), S2 = ink('#2a4ac8');
  p.line(18, 16, 30, 28, S1); p.line(30, 28, 50, 12, S1); p.line(30, 28, 46, 36, S2); p.line(12, 38, 30, 28, S1); p.line(46, 36, 36, 46, S2);
  // arrows of advance
  p.line(30, 30, 24, 44, ink('#1a1420')); p.poly([[22, 42], [27, 42], [24, 47]], '#1a1420');
  for (const [x, y, c] of pins) {
    p.set(x + 1, y + 2, shade(p.get(x + 1, y + 2), 0.5));
    p.rect(x - 1, y - 1, 2, 2, ink(c, { gloss: 0.6 })); p.set(x - 1, y - 1, ink(shade(c, 1.6), { gloss: 0.6 }));
    p.set(x, y, ink(shade(c, 0.55), { gloss: 0.6 }));
  }
  // compass rose
  const cr = [55, 46];
  p.line(cr[0], cr[1] - 4, cr[0], cr[1] + 4, '#3a2a1a'); p.line(cr[0] - 4, cr[1], cr[0] + 4, cr[1], '#3a2a1a');
  p.set(cr[0], cr[1] - 5, RED[2]); p.set(cr[0], cr[1] - 4, RED[2]);
  // a pinned note
  p.rect(6, 44, 9, 7, '#ece0bc'); p.hline(7, 46, 7, '#7a6a4a'); p.hline(7, 48, 5, '#7a6a4a'); p.frame(6, 44, 9, 7, '#9a8a6a');
  p.set(10, 44, ink('#e23a3a', { gloss: 0.6 }));
  return p;
}

// ───────────── trophy case ─────────────
function fishSkeleton(p, x, y, len, col) {
  // spine, ribs, skull and tail fan — facing left
  p.hline(x + 5, y, len - 9, col);
  for (let i = x + 7; i < x + len - 6; i += 2) { const r = 3 - Math.abs(i - (x + len / 2)) / (len / 5); p.vline(i, y - Math.round(r), Math.round(r), col); p.vline(i, y + 1, Math.round(r), col); }
  p.poly([[x, y], [x + 6, y - 3], [x + 6, y + 4]], col);
  p.set(x + 3, y - 1, '#1a1420');
  p.poly([[x + len - 5, y], [x + len, y - 4], [x + len - 2, y], [x + len, y + 5]], col);
}
function trophy() {
  const p = woodPanel();
  const Wd = inks(WOOD, M.wood);
  const x0 = 5, y0 = 3, w = 54, h = 56;
  bevel(p, x0, y0, w, h, Wd[3], Wd[5], Wd[1], 3);
  p.frame(x0 - 1, y0 - 1, w + 2, h + 2, OUT);
  const ix = x0 + 3, iy = y0 + 3, iw = w - 6, ih = h - 6;
  // velvet back
  for (let y = iy; y < iy + ih; y++) for (let x = ix; x < ix + iw; x++) p.set(x, y, (x + y) % 5 === 0 ? '#3a0e18' : '#4a1420');
  // shadow at the top of the case interior
  p.hline(ix, iy, iw, '#200810'); p.hline(ix, iy + 1, iw, '#2e0c16');
  // shelves
  for (const sy of [iy + 17, iy + 34]) { p.rect(ix, sy, iw, 3, Wd[3]); p.hline(ix, sy, iw, Wd[5]); p.hline(ix, sy + 3, iw, '#200810'); }
  // top shelf: three medals on ribbons
  const L = layer();
  const rib = [['#c21f24', '#f3eedf'], ['#2e4a8a', '#f2c21e'], ['#2e6e40', '#f3eedf']];
  rib.forEach(([a, b], i) => {
    const mx = ix + 9 + i * 15;
    L.rect(mx - 2, iy + 3, 5, 6, a); L.vline(mx, iy + 3, 6, b);
    L.circle(mx + 0.5, iy + 12, 3.5, GOLD[2]); L.circle(mx, iy + 11.5, 2.4, GOLD[3]); L.set(mx - 1, iy + 10, GOLD[5]);
    if (i === 1) { L.set(mx, iy + 12, CHEESE[1]); L.set(mx + 1, iy + 12, CHEESE[1]); }
  });
  L.setMat(M.gold);
  // middle shelf: mounted fish skeleton on an oval plaque
  L.ellipse(32, iy + 26, 17, 6, Wd[2]); L.ellipse(31.5, iy + 25.5, 15.5, 4.8, Wd[4]);
  fishSkeleton(L, 19, iy + 26, 26, '#f0ead8');
  // bottom shelf: a gold cup between two tiny bells
  const cx = 32, by = iy + ih - 1;
  L.rect(cx - 5, by - 3, 11, 3, Wd[1]); L.hline(cx - 5, by - 3, 11, Wd[4]);
  L.rect(cx - 1, by - 7, 3, 4, GOLD[2]);
  L.poly([[cx - 6, by - 16], [cx + 7, by - 16], [cx + 4, by - 8], [cx - 3, by - 8]], GOLD[3]);
  L.vline(cx - 4, by - 15, 5, GOLD[5]); L.vline(cx + 4, by - 15, 6, GOLD[1]);
  L.ring(cx - 7, by - 13, 2.5, 2.5, GOLD[2]); L.ring(cx + 8, by - 13, 2.5, 2.5, GOLD[1]);
  for (const bx of [ix + 6, ix + iw - 7]) { L.circle(bx, by - 4, 3, GOLD[3]); L.hline(bx - 3, by - 3, 7, GOLD[1]); L.set(bx - 1, by - 5, GOLD[5]); }
  L.setMat(M.gold, 0, by - 17, S, 18);
  L.setMat({ gloss: 0.15, spark: 0 }, 13, iy + 19, 40, 14);
  stamp(p, L);
  // glass: slight cool tint, glossy, with two glare streaks
  for (let y = iy; y < iy + ih; y++) for (let x = ix; x < ix + iw; x++) {
    const c = p.get(x, y), d = (x - ix) + (iy + ih - y) * 0.5;
    let k = mix(c, '#9ad0e8', 0.1);
    if ((d > 30 && d < 33) || (d > 36 && d < 37.5)) k = mix(c, '#e8f6ff', 0.45);
    const mat = p.mat, o = (y * S + x) * 4;
    p.set(x, y, ink([k.r, k.g, k.b], { gloss: 0.7, emit: c.emit, spark: Math.max(c.spark, 0.05) }));
    void mat; void o;
  }
  // brass hinge and lock
  for (const yy of [iy + 6, iy + ih - 9]) { p.rect(x0 + 1, yy, 2, 4, ink(BRASS[3], M.brass)); p.set(x0 + 1, yy, ink(BRASS[4], M.brass)); }
  p.rect(x0 + w - 3, 30, 2, 3, ink(BRASS[3], M.brass));
  return p;
}

// ───────────── fish shape (lever, lock plate) ─────────────
/** Fish with its head at (px,py), body along angle `ang`, total length len. pal: 5-tone ramp. */
function fish(L, px, py, ang, len, pal, mat = {}) {
  const P = inks(pal, mat);
  const ux = Math.cos(ang), uy = Math.sin(ang), vx = -uy, vy = ux;
  const lx = -0.7071, ly = -0.7071;   // light from upper-left
  const R = len + 4;
  const bodyC = len * 0.4, bodyA = len * 0.42, bodyB = len * 0.22;
  for (let y = Math.floor(py - R); y <= py + R; y++) for (let x = Math.floor(px - R); x <= px + R; x++) {
    const dx = x + 0.5 - px, dy = y + 0.5 - py;
    const a = dx * ux + dy * uy, b = dx * vx + dy * vy;
    const eb = ((a - bodyC) / bodyA) ** 2 + (b / bodyB) ** 2;
    const tA = a - len * 0.78;
    const tail = tA >= 0 && a <= len && Math.abs(b) <= 1 + tA * 1.1 && !(a > len - 2.5 && Math.abs(b) < (a - (len - 2.5)) * 1.4);
    if (eb > 1 && !tail) continue;
    let k;
    if (eb <= 1) {
      const nb = b / bodyB, l = (nb * (vx * lx + vy * ly));
      k = l > 0.45 ? 4 : l > 0.05 ? 3 : l > -0.45 ? 2 : 1;
      if (eb > 0.75) k = Math.max(0, k - 1);
    } else k = 1;
    L.set(x, y, P[k]);
  }
  // eye, gill line, fin
  const ex = px + ux * len * 0.14 + vx * len * 0.06, ey = py + uy * len * 0.14 + vy * len * 0.06;
  L.set(ex, ey, '#141218'); L.set(ex - lx * 0 - 0.5, ey - 0.5, P[4]);
  for (let s = -2; s <= 2; s++) L.set(px + ux * len * 0.27 + vx * s, py + uy * len * 0.27 + vy * s, P[1]);
}

// ───────────── exit switch ─────────────
function exitSwitch(on) {
  const p = new PixBuf(S, S);
  steelBase(p, 13, STEEL, [0, 40]);
  hazard(p, 56, 8);
  const St = inks(STEEL, M.steel);
  // inset control plate
  bevel(p, 16, 3, 32, 50, St[1], St[0], St[5], 2);
  p.frame(15, 2, 34, 52, OUT);
  for (let y = 5; y < 51; y++) for (let x = 18; x < 46; x++) if (hash2(x, y, 3) > 0.9) p.set(x, y, St[2]);
  for (const [x, y] of [[18, 5], [44, 5], [18, 48], [44, 48]]) rivet(p, x, y);
  // lamp in a caged housing
  const col = on ? '#3aff5a' : '#ff3a2a';
  p.circle(32, 11, 6, OUT); p.circle(32, 11, 5, St[0]);
  p.circle(32, 11, 4, ink(col, { emit: 1 })); p.circle(31, 10, 2, ink(shade(col, 1.5), { emit: 1 }));
  p.set(30, 9, ink('#ffffff', { emit: 1 }));
  p.vline(32, 6, 11, St[2]); p.hline(27, 11, 11, St[2]);
  // the dead lamp of the other colour, small, beside: shows state at a glance
  const off = on ? '#5a1410' : '#103a18';
  p.rect(20, 9, 3, 3, OUT); p.set(21, 10, off); p.rect(41, 9, 3, 3, OUT); p.set(42, 10, off);
  // slot with markings: red at top, green at bottom
  p.rect(29, 20, 7, 32, OUT); p.rect(30, 21, 5, 30, '#0a0a0e');
  p.rect(37, 21, 4, 3, ink(RED[2], { emit: on ? 0 : 0.35 })); p.rect(37, 48, 4, 3, ink('#2ea84a', { emit: on ? 0.35 : 0 }));
  p.rect(23, 21, 4, 3, ink(RED[2], { emit: on ? 0 : 0.35 })); p.rect(23, 48, 4, 3, ink('#2ea84a', { emit: on ? 0.35 : 0 }));
  // the fish lever: head at the pivot, tail out along the slot
  const L = layer();
  const ang = on ? Math.PI / 2 + 0.25 : -Math.PI / 2 - 0.25;
  fish(L, 32.5, 36, ang, 21, ['#7a3a08', '#c25a0e', '#f08a1c', '#f6b24a', '#fde3b0'], { gloss: 0.5, spark: 0.15 });
  L.circle(32.5, 36, 3.2, St[3]); L.circle(32, 35.5, 1.6, St[5]); L.set(33, 37, St[0]);
  stamp(p, L);
  return p;
}

// ───────────── doors ─────────────
function doorWood() {
  const p = new PixBuf(S, S);
  // eight vertical planks
  for (let k = 0; k < 8; k++) {
    grain(p, k * 8, 0, 8, S, WOOD.slice(2, 6), 11 + k * 1.7, true);
    p.vline(k * 8, 0, S, OUT); p.vline(k * 8 + 1, 0, S, ink(WOOD[5], M.wood));
    p.vline(k * 8 + 7, 0, S, ink(WOOD[1], M.wood));
    // a knot here and there
    if (hash2(k, 0, 3) < 0.5) { const ky = 18 + Math.floor(hash2(k, 1, 3) * 30); p.ellipse(k * 8 + 4, ky, 1.5, 2.5, ink(WOOD[1], M.wood)); p.set(k * 8 + 4, ky, ink(WOOD[0], M.wood)); }
  }
  p.hline(0, 0, S, OUT); p.hline(0, 63, S, OUT);
  // iron bands with nail heads
  const I = inks(['#1e2028', '#3a3e48', '#5a606c', '#828a98', '#aab2c0'], { gloss: 0.4 });
  for (const by of [8, 50]) {
    p.hline(0, by - 1, S, OUT); p.rect(0, by, S, 6, I[2]); p.hline(0, by, S, I[3]); p.hline(0, by + 5, S, I[1]); p.hline(0, by + 6, S, OUT);
    for (let x = 4; x < S; x += 8) { p.set(x, by + 2, I[4]); p.set(x + 1, by + 2, I[3]); p.set(x, by + 3, I[3]); p.set(x + 1, by + 3, I[0]); }
    // band strap ends curl into a fleur on the hinge side
    p.rect(0, by - 2, 4, 10, I[2]); p.vline(0, by - 2, 10, I[3]); p.frame(-1, by - 3, 6, 12, OUT);
  }
  // ring handle on a round back plate
  const L = layer();
  L.circle(46, 31, 4, I[2]); L.circle(45.5, 30.5, 2.6, I[3]); L.set(45, 30, I[4]);
  L.ring(46, 38.5, 5, 5, I[2], 2); L.set(42, 36, I[4]); L.set(43, 35, I[4]);
  L.rect(45, 33, 2, 2, I[1]);
  stamp(p, L);
  // keyhole
  p.circle(46, 46, 1.2, '#0a0808'); p.vline(46, 46, 3, '#0a0808');
  return p;
}
function doorSteel() {
  const p = new PixBuf(S, S);
  steelBase(p, 17, STEEL, [0]);
  const St = inks(STEEL, M.steel);
  // heavy frame
  bevel(p, 0, 0, S, S, St[3], St[5], St[1], 3);
  bevel(p, 4, 4, 56, 56, St[3], St[1], St[5], 1);
  for (let y = 5; y < 59; y++) for (let x = 5; x < 59; x++) { const s = hash2(0, y, 17) * 0.7 + hash2(x >> 3, y, 18) * 0.3; p.set(x, y, St[s > 0.6 ? 5 : s > 0.25 ? 4 : 3]); }
  // porthole: bolt ring, thick rim, dark blue glass with glare
  const L = layer();
  L.circle(32, 21, 11, St[2]);
  L.ring(32, 21, 11, 11, St[1]);
  L.circle(32, 21, 8, St[5]); L.circle(32.5, 21.5, 7.5, St[1]);
  L.circle(32, 21, 6.5, ink('#16243a', { gloss: 0.85 }));
  L.circle(32, 21, 6.5, ink('#1c3048', { gloss: 0.85 }));
  for (let y = 15; y < 28; y++) for (let x = 26; x < 39; x++) if (Math.hypot(x + 0.5 - 32, y + 0.5 - 21) < 6.5) {
    const d = (x - 26) + (y - 15);
    if (d > 3 && d < 6) L.set(x, y, ink('#6a90b8', { gloss: 0.85 })); else if (d > 7 && d < 8.5) L.set(x, y, ink('#3e5e84', { gloss: 0.85 })); else if (y > 23) L.set(x, y, ink('#101a2c', { gloss: 0.85 }));
  }
  for (let a = 0; a < 8; a++) { const an = a * Math.PI / 4 + Math.PI / 8; const bx = Math.round(32 + Math.cos(an) * 9.5 - 0.5), by = Math.round(21 + Math.sin(an) * 9.5 - 0.5); L.set(bx, by, St[6]); L.set(bx + 1, by + 1, St[0]); L.set(bx + 1, by, St[3]); L.set(bx, by + 1, St[3]); }
  stamp(p, L);
  // recessed grip slot on the leading edge
  p.rect(52, 26, 4, 14, OUT); p.rect(53, 27, 2, 12, St[0]); p.vline(55, 27, 12, St[5]);
  // warning chevrons pointing up
  p.hline(5, 41, 54, OUT); p.hline(5, 54, 54, OUT);
  for (let y = 42; y < 54; y++) for (let x = 5; x < 59; x++) {
    const s = Math.floor((y + Math.abs(x + 0.5 - 32)) / 4) & 1;
    p.set(x, y, s ? ink('#f2c21e', { gloss: 0.35 }) : ink('#1c1a20', { gloss: 0.35 }));
  }
  p.hline(5, 42, 54, ink('#f8e27a', { gloss: 0.35 }));
  for (let x = 5; x < 59; x++) if (!(Math.floor((42 + Math.abs(x + 0.5 - 32)) / 4) & 1)) p.set(x, 42, ink('#3a3640', { gloss: 0.35 }));
  // stencilled number plate
  p.rect(10, 30, 9, 6, St[1]); p.frame(10, 30, 9, 6, OUT); glyphs(p, 11, 30, 2, '#f2c21e', 4);
  for (const [x, y] of [[7, 7], [55, 7], [7, 56], [55, 56]]) rivet(p, x, y, STEEL, true);
  return p;
}
function ornateDoor(base, trim, mat, plate) {
  const p = new PixBuf(S, S);
  const B = inks(base, { gloss: 0.3 }), T = inks(trim, mat);
  // lacquered wood boards
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = Math.sin((x + Math.sin(y * 0.09 + 2) * 1.5) * 0.9);
    p.set(x, y, B[n > 0.75 ? 3 : n > -0.4 ? 2 : 1]);
  }
  ornateFrame(p, 0, 0, S, S, 4, trim, mat);
  // two raised panels with trim mouldings
  for (const [x, y, w, h] of [[8, 7, 48, 18], [8, 41, 48, 16]]) {
    p.frame(x - 1, y - 1, w + 2, h + 2, OUT);
    p.frame(x, y, w, h, T[3]); p.hline(x, y + h - 1, w, T[1]); p.vline(x + w - 1, y, h, T[1]);
    bevel(p, x + 2, y + 2, w - 4, h - 4, B[2], B[3], B[0], 2);
    p.frame(x + 1, y + 1, w - 2, h - 2, OUT);
    // diamond inlay
    const cx = x + w / 2, cy = y + h / 2;
    p.poly([[cx - 6, cy], [cx, cy - 4], [cx + 6, cy], [cx, cy + 4]], T[2]);
    p.poly([[cx - 4, cy], [cx, cy - 2.5], [cx + 4, cy], [cx, cy + 2.5]], B[1]);
    p.set(cx - 1, cy - 3, T[5]);
  }
  // escutcheon band across the middle
  p.rect(4, 28, 56, 10, T[2]); p.hline(4, 28, 56, T[4]); p.hline(4, 37, 56, T[1]); p.hline(4, 27, 56, OUT); p.hline(4, 38, 56, OUT);
  for (let x = 6; x < 58; x += 4) p.set(x, 32, T[(x >> 2) % 2 ? 4 : 1]);
  plate(p);
  return p;
}
function doorGold() {
  return ornateDoor(['#2a0c10', '#4a141a', '#6a1e24', '#8a2c30'], GOLD, M.gold, (p) => {
    const L = layer();
    const G = GOLD;
    // red collar ribbon behind the bell
    L.rect(14, 29, 36, 4, RED[2]); L.hline(14, 29, 36, RED[3]); L.hline(14, 32, 36, RED[1]);
    // the cat bell
    L.circle(32, 34, 10, G[2]);
    L.circle(31, 33, 8.5, G[3]);
    L.circle(29, 30, 4, G[4]);
    L.circle(28, 29, 1.6, G[5]);
    L.hline(23, 32, 18, G[1]); L.hline(23, 33, 18, G[4]);   // equator bands
    L.hline(23, 35, 18, G[1]);
    L.circle(32, 39, 2, '#1a0e06'); L.rect(31, 39, 2, 5, '#1a0e06');   // sound hole + slit (= keyhole)
    L.ring(32, 23, 3, 2.4, G[2], 1.4); L.set(31, 22, G[5]);            // hanging loop
    L.setMat(M.gold);
    L.setMat({ gloss: 0.35, spark: 0 }, 14, 29, 36, 4);
    L.setMat({ spark: 1 }, 26, 27, 6, 6);
    stamp(p, L);
  });
}
function doorSilver() {
  return ornateDoor(['#0c1424', '#16223a', '#22324e', '#304466'], SILVER, M.silver, (p) => {
    const L = layer();
    // oval silver plate with the fish across it
    L.ellipse(32, 33, 15, 8, SILVER[1]);
    L.ellipse(31.5, 32.5, 13.5, 6.6, SILVER[2]);
    L.setMat(M.silver);
    fish(L, 19, 33, 0, 26, ['#3a404c', '#7a8494', '#b4bec9', '#dfe6ee', '#ffffff'], M.silver);
    L.circle(37, 32, 1.3, '#0a0c12'); L.rect(36.5, 32, 1, 3, '#0a0c12'); L.set(37, 34, '#0a0c12');   // keyhole in the fish
    L.setMat({ spark: 1 }, 20, 29, 10, 4);
    stamp(p, L);
  });
}
function doorJamb() {
  const p = new PixBuf(S, S);
  const J = inks(['#14161c', '#22262e', '#30353f', '#454c58', '#5f6876', '#8a94a4'], { gloss: 0.35 });
  // vertical profile across the face: plate | groove | rail | channel | rail | groove | plate
  const prof = (x) => {
    if (x < 2 || x > 61) return 2;
    if (x < 14) return x === 2 ? 4 : x === 13 ? 1 : 3;
    if (x < 17) return 0;                       // groove
    if (x < 22) return x === 17 ? 5 : x === 21 ? 1 : 4;   // rail
    if (x < 42) return x === 22 ? 0 : x < 26 ? 1 : 0;      // deep channel, lit only on its far wall
    if (x < 47) return x === 42 ? 5 : x === 46 ? 1 : 4;
    if (x < 50) return 0;
    return x === 50 ? 4 : x === 61 ? 1 : 3;
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let k = prof(x);
    if (k >= 3 && hash2(0, y, 21 + (x >> 4)) > 0.82) k = Math.min(5, k + 1);
    p.set(x, y, J[k]);
  }
  // channel back wall: faint guide lines + grease
  for (let y = 0; y < S; y++) { p.set(39, y, J[2]); p.set(40, y, J[1]); if (hash2(31, y, 5) > 0.8) p.set(31, y, J[2]); }
  // bolts on the side plates every 16px (tiles vertically too)
  for (let y = 4; y < S; y += 16) for (const x of [6, 54]) rivet(p, x, y, STEEL, true);
  // cross ties over the channel
  for (const y of [0, 32]) { p.rect(22, y, 20, 3, J[3]); p.hline(22, y, 20, J[5]); p.hline(22, y + 3, 20, OUT); }
  return p;
}

export function build() {
  return {
    'wall.fort_stone': fortStone(),
    'wall.fort_banner': fortBanner(),
    'wall.wood_panel': woodPanel(),
    'wall.wood_portrait': woodPortrait(),
    'wall.steel_plate': steelPlate(),
    'wall.pipes': pipes(),
    'wall.bookshelf': bookshelf(),
    'wall.mouse_hole': mouseHole(),
    'wall.poster': poster(),
    'wall.mirror': mirror(),
    'wall.cell_bars': cellBars(),
    'wall.war_map': warMap(),
    'wall.trophy': trophy(),
    'wall.exit_switch': [exitSwitch(false), exitSwitch(true)],
    'door.wood': doorWood(),
    'door.steel': doorSteel(),
    'door.gold': doorGold(),
    'door.silver': doorSilver(),
    'door.jamb': doorJamb(),
  };
}
