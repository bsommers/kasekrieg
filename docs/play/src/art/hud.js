// hud — HUD art: Major Marmalade's portrait (23 frames), title logo, icons, menu cursor, Rat Reich emblem.
// Owner: art-hud. Exports build() -> { [name]: PixBuf | PixBuf[] } (kind 'image', sizes from defs.HUD_IMAGES).
// Light from the upper-left, 1px #1a1420 outline, deterministic (hash2 only), no DOM.
import { PixBuf, ink, shade, mix, hash2 } from './pixbuf.js';

const OUT = '#1a1420';
const OUTK = ink(OUT);
const CLEAR = [0, 0, 0, 0];

// ---------- palettes (dark -> light) ----------
const FUR = ['#7a300c', '#b0500e', '#d86e14', '#f08a1c', '#f8a440', '#ffc472'];   // marmalade orange
const STRIPE = ['#6a2608', '#8e3a0a', '#c25a0e'];                                // tabby stripes
const CREAM = ['#b88a64', '#dcb07c', '#f2cf98', '#fde3b0', '#fff6e0'];
const PINK = ['#9a3a4e', '#d0607a', '#f08c9c', '#ffc0c8'];
const IRIS = ['#3e6a18', '#6ea42a', '#a8d040', '#e0f490'];                        // green-gold cat eyes
const KHAKI = ['#3a3a22', '#55552e', '#74703e', '#948c54'];
const GOLD = ['#6a4008', '#a8701a', '#e0a82a', '#ffd23e', '#fff4b0'];
const SILV = ['#3a404c', '#6a7484', '#9aa6b6', '#cad2de', '#f4f8ff'];
const CHED = ['#6a3606', '#9a5a0c', '#d08a14', '#f2a91e', '#f8c844', '#ffe27a', '#fff4b8'];
const RED = ['#4a0a10', '#7e1419', '#c21f24', '#e2493a', '#f27a5a'];
const BRUISE = ['#2a1a3a', '#4a2c5e', '#6a4478'];
const BLOOD = '#b0141c';
const WHITE = ['#9aa0b0', '#d4d8e0', '#f4f4f0', '#ffffff'];

const clampi = (v, a, b) => (v < a ? a : v > b ? b : v);
const I = (arr, mat) => arr.map((c) => ink(c, mat));

// ---------- generic helpers ----------
/** Collect a boolean mask from a draw callback (draws into a scratch PixBuf). */
function maskOf(w, h, fn) {
  const p = new PixBuf(w, h); fn(p);
  const m = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) m[i] = p.rgba[i * 4 + 3] >= 128 ? 1 : 0;
  return m;
}
const mget = (m, w, h, x, y) => (x >= 0 && y >= 0 && x < w && y < h ? m[y * w + x] : 0);
/** Paint every set pixel of a mask with fn(x,y) → ink (or skip on null). */
function paintMask(p, m, fn) {
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (m[y * p.w + x]) { const c = fn(x, y); if (c) p.set(x, y, c); }
}
/** Draw pixels from an ASCII template. key: char → ink (undefined/'.' skipped). */
function tpl(p, x0, y0, rows, key, flip = false) {
  for (let j = 0; j < rows.length; j++) {
    const r = rows[j];
    for (let i = 0; i < r.length; i++) {
      const ch = r[flip ? r.length - 1 - i : i], c = key[ch];
      if (c) p.set(x0 + i, y0 + j, c);
    }
  }
}
/** Shaded ball lit from the upper-left using ramp R. */
function ball(p, cx, cy, rx, ry, R, bias = 0) {
  const n = R.length;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry;
      if (u * u + v * v > 1) continue;
      const nz = Math.sqrt(Math.max(0, 1 - u * u - v * v));
      const l = clampi(0.45 + (-u * 0.5 - v * 0.6) * 0.5 + nz * 0.25 + bias, 0, 0.999);
      p.set(x, y, R[Math.floor(l * n)]);
    }
}

// ═════════════════════════════ FACE ═════════════════════════════
// 32×32, transparent background (the HUD draws it over a dark medallion). Symmetric about column 15.
const FW = 32, FH = 32;
const MX = (x) => 30 - x;                 // pixel mirror
const MXc = (x) => 31 - x;                // continuous mirror (poly / ellipse centres)

const EAR_L = [[2.5, 0.5], [13, 6.5], [3.5, 13.5]];
const EAR_L_IN = [[4.2, 3.2], [10.5, 7.3], [5, 11.5]];

function headMask() {
  return maskOf(FW, FH, (p) => {
    p.ellipse(15.5, 16.5, 12.6, 10.6, '#fff');            // cranium
    p.ellipse(15.5, 21, 14.4, 6.6, '#fff');               // jowls
    p.poly(EAR_L, '#fff'); p.poly(EAR_L.map(([x, y]) => [MXc(x), y]), '#fff');
    // cheek tufts (jagged fur)
    for (const s of [0, 1]) {
      const f = (x) => (s ? MXc(x) : x);
      p.poly([[f(2.5), 17], [f(0.2), 20.5], [f(2), 21.5], [f(0), 24], [f(3), 24.5], [f(1.5), 26.8], [f(6), 26]], '#fff');
    }
  });
}
function collarMask() {
  return maskOf(FW, FH, (p) => { p.poly([[5, 32], [8.5, 26.5], [22.5, 26.5], [26, 32]], '#fff'); });
}

/** Base head (fur, shading, stripes, ears, muzzle, collar) — no eyes/mouth yet. */
function drawHeadBase(p, o) {
  const { tier = 0, dx = 0, dead = false, nip = false } = o;
  const col = collarMask();
  // collar / tunic under the chin: khaki with gold rank pips
  paintMask(p, col, (x, y) => {
    const l = clampi(0.75 - (x - 5) / 28 + (y < 28 ? 0.1 : 0), 0, 0.999);
    return ink(KHAKI[Math.floor(l * KHAKI.length)], { gloss: 0.05 });
  });
  for (let y = 27; y < 32; y++) { p.set(15 + Math.floor((y - 27) * 0.0), y, KHAKI[0]); }   // tunic seam
  for (const x of [8, 22]) { p.set(x, 29, ink(GOLD[3], { spark: 0.9, gloss: 0.6 })); p.set(x + 1, 29, ink(GOLD[2], { spark: 0.6 })); p.set(x, 30, ink(GOLD[1])); p.set(x + 1, 30, ink(GOLD[2])); }
  // fur
  const head = headMask();
  const furR = dead ? FUR.map((c) => mix(c, '#8a8090', 0.45)) : FUR;
  paintMask(p, head, (x, y) => {
    const u = (x + 0.5 - 15.5) / 13, v = (y + 0.5 - 17) / 11;
    let l = 0.62 - u * 0.28 - v * 0.34;
    // rim darkening on the right/bottom edges
    if (!mget(head, FW, FH, x + 1, y) || !mget(head, FW, FH, x, y + 1)) l -= 0.22;
    if (!mget(head, FW, FH, x - 1, y) || !mget(head, FW, FH, x, y - 1)) l += 0.12;
    l += (hash2(x, y, 77) - 0.5) * 0.08;
    return furR[clampi(Math.floor(l * furR.length), 1, furR.length - 1)];
  });
  // inner ears
  const inner = maskOf(FW, FH, (q) => { q.poly(EAR_L_IN, '#fff'); q.poly(EAR_L_IN.map(([x, y]) => [MXc(x), y]), '#fff'); });
  paintMask(p, inner, (x, y) => {
    const edge = !mget(inner, FW, FH, x - 1, y) || !mget(inner, FW, FH, x, y - 1);
    return edge ? PINK[0] : y > 8 ? PINK[1] : PINK[2];
  });
  // ear fur tufts (cream wisps inside the ear)
  for (const [x, y] of [[6, 9], [7, 10], [6, 11]]) { p.set(x, y, CREAM[3]); p.set(MX(x), y, CREAM[2]); }
  // tabby stripes: forehead "M" and side streaks
  const st = dead ? STRIPE.map((c) => mix(c, '#5a5060', 0.4)) : STRIPE;
  const S1 = st[1], S2 = st[2];
  tpl(p, 11, 7, [
    '...a....a...',
    '...a.aa.a...',
    '..ba.ab.ab..',
    '..b..ab..b..',
    '.....bb.....',
  ], { a: S1, b: S2 });
  for (const s of [0, 1]) {
    const f = (x) => (s ? MX(x) : x), c = s ? st[0] : S1;
    p.hline(Math.min(f(3), f(6)), 12, 4, s ? st[0] : S2);
    p.set(f(3), 13, c); p.set(f(4), 13, c);
    p.hline(Math.min(f(2), f(5)), 15, 4, c);
    p.set(f(1), 19, c); p.set(f(2), 19, c); p.set(f(3), 19, c); p.set(f(4), 20, c);
    p.set(f(2), 22, c); p.set(f(3), 22, c);
  }
  // muzzle: two puffy whisker pads + chin, cream, light from upper-left
  const muz = maskOf(FW, FH, (q) => {
    q.ellipse(12.5 + dx, 22, 3.8, 2.8, '#fff'); q.ellipse(18.5 + dx, 22, 3.8, 2.8, '#fff');
    q.ellipse(15.5 + dx, 25.4, 3.2, 2.2, '#fff');
    q.ellipse(15.5 + dx, 19.6, 2.2, 1.6, '#fff');        // bridge of the nose
  });
  const cr = dead ? CREAM.map((c) => mix(c, '#a8a0b0', 0.4)) : CREAM;
  paintMask(p, muz, (x, y) => {
    const u = (x + 0.5 - 15.5 - dx) / 7, v = (y + 0.5 - 23) / 4;
    let l = 0.66 - u * 0.25 - v * 0.3;
    if (!mget(muz, FW, FH, x, y + 1)) l -= 0.22;
    return cr[clampi(Math.floor(l * cr.length), 1, cr.length - 1)];
  });
  // whisker dots
  for (const [x, y] of [[11, 22], [13, 23], [10, 23]]) { p.set(x + dx, y, cr[0]); p.set(MX(x) + dx, y, cr[0]); }
  // cheek blush on catnip
  if (nip) for (const [x, y] of [[6, 20], [7, 20], [6, 21], [7, 21]]) { p.set(x, y, PINK[2]); p.set(MX(x), y, PINK[2]); }
  return head;
}

/** Outline the full silhouette (head ∪ collar) with the dark outline colour. */
function outlineFace(p) {
  // only outline outside the frame contents; diagonal for a chunky, closed contour
  p.outline(OUT);
}

/** Nose (pink, glossy) + philtrum. */
function drawNose(p, dx) {
  const nk = { o: OUTK, a: ink(PINK[1], { gloss: 0.5 }), b: ink(PINK[2], { gloss: 0.5 }), c: ink(PINK[3], { gloss: 0.6 }) };
  tpl(p, 13 + dx, 19, [
    '.oooo.'.slice(0, 5),
    'ocbao'.slice(0, 5),
    '.oao.',
    '..o..',
  ], nk);
}

const EYE_SHAPE = [   // 6 wide × 5 tall; 'k' outline, 'i' iris
  '.kkkk.',
  'kiiiik',
  'kiiiik',
  'kiiiik',
  '.kkkk.',
];
/** One eye. ex = left x of the 6-wide box, ey = top. side: 0 = viewer-left, 1 = viewer-right. */
function drawEye(p, ex, ey, side, o) {
  const { look = 0, droop = 0, kind = 'open', bruise = 0 } = o;
  const ir = I(IRIS, { emit: 0.12 });
  if (bruise) {   // black eye: a purple ring around the socket
    const bk = I(BRUISE);
    for (let j = -1; j <= 5; j++) for (let i = -1; i <= 6; i++) {
      const u = (i - 2.5) / 3.9, v = (j - 2) / 3.4;
      if (u * u + v * v <= 1) p.set(ex + i, ey + j, bk[(i + j) & 1 ? 1 : 0]);
    }
  }
  if (kind === 'shut') {          // squeezed: > <
    const rows = side ? ['....kk', '..kk..', 'kk....', '..kk..', '....kk'].map((r) => [...r].reverse().join('')) : ['kk....', '..kk..', '....kk', '..kk..', 'kk....'];
    tpl(p, ex, ey, side ? ['kk....', '..kk..', '....kk', '..kk..', 'kk....'].map((r) => [...r].reverse().join('')) : rows, { k: OUTK });
    return;
  }
  if (kind === 'swollen') {       // puffy shut eye: a curved line under a bruise bulge
    tpl(p, ex, ey, ['......', '.bbbb.', 'kbbbbk', '.kkkk.', '......'], { k: OUTK, b: BRUISE[2] });
    return;
  }
  if (kind === 'x') {
    tpl(p, ex, ey, ['k....k', '.k..k.', '..kk..', '.k..k.', 'k....k'], { k: OUTK });
    tpl(p, ex + 1, ey, ['....', '....', '....', '....', '....'], {});
    return;
  }
  if (kind === 'happy') {        // ^ ^ closed happy arcs
    tpl(p, ex, ey + 1, ['..kk..', '.k..k.', 'k....k'], { k: OUTK });
    return;
  }
  // open eye: sclera-less cat eye, iris lit from the top-left
  for (let j = 0; j < 5; j++) for (let i = 0; i < 6; i++) {
    const ch = EYE_SHAPE[j][i];
    if (ch === 'k') p.set(ex + i, ey + j, OUTK);
    else if (ch === 'i') p.set(ex + i, ey + j, ir[j === 1 ? 3 : j === 2 ? 2 : (i < 3 ? 2 : 1)]);
  }
  if (kind === 'nip') {          // huge round dilated pupils
    tpl(p, ex + 1, ey + 1, ['kkkk', 'kkkk', 'kkkk'], { k: ink('#0e0a14') });
    p.set(ex + 1, ey + 1, ink('#ffffff', { emit: 0.6 })); p.set(ex + 2, ey + 1, ink(IRIS[3], { emit: 0.5 }));
    p.set(ex + 4, ey + 3, ink(IRIS[2], { emit: 0.3 }));
    return;
  }
  // slit pupil (2×3), shifted with the gaze
  const px = ex + 2 + look;
  p.rect(px, ey + 1, 2, 3, ink('#0e0a14'));
  p.set(px, ey + 1, ink('#ffffff', { emit: 0.5 }));           // catch-light, upper-left
  // heavy brow / eyelid: determined squint, inner corner lower (angled toward the nose)
  const inner = side === 0 ? 5 : 0, outer = side === 0 ? 0 : 5;
  p.set(ex + inner, ey, OUTK);
  p.set(ex + inner, ey + 1, OUTK);
  // eyelid droop (tiredness) — fur-coloured lid covering the top rows
  for (let d = 0; d < droop; d++) {
    for (let i = 1; i < 5; i++) p.set(ex + i, ey + 1 + d, d === droop - 1 ? OUTK : FUR[2]);
  }
  void outer;
}

/** Brows: angled dark stripes above the eyes (expression). mood: 'stern' | 'up' | 'worried'. */
function drawBrows(p, mood) {
  for (const s of [0, 1]) {
    const f = (x) => (s ? MX(x) : x);
    if (mood === 'stern') { p.set(f(8), 12, STRIPE[0]); p.set(f(9), 12, STRIPE[0]); p.set(f(10), 12, STRIPE[0]); p.set(f(11), 13, STRIPE[0]); p.set(f(12), 13, STRIPE[0]); }
    else if (mood === 'up') { p.set(f(8), 12, STRIPE[0]); p.set(f(9), 11, STRIPE[0]); p.set(f(10), 11, STRIPE[0]); p.set(f(11), 11, STRIPE[0]); }
    else if (mood === 'worried') { p.set(f(8), 13, STRIPE[0]); p.set(f(9), 12, STRIPE[0]); p.set(f(10), 12, STRIPE[0]); p.set(f(11), 11, STRIPE[0]); p.set(f(12), 11, STRIPE[0]); }
  }
}

/** Mouth variants, centred on column 15 (+dx). */
function drawMouth(p, kind, dx) {
  const k = { o: OUTK, w: ink(WHITE[3], { gloss: 0.3 }), v: ink(WHITE[1]), m: ink('#3a0e18'), t: ink(PINK[2], { gloss: 0.35 }), T: ink(PINK[1], { gloss: 0.3 }), r: ink(PINK[0]) };
  const x0 = 10 + dx;
  const M = {
    // confident smirk: cat "w" with the viewer-right corner hitched up
    smirk: [
      '...........',
      '.....o.....',
      '..oo...o..o',
      '.o.......o.',
    ],
    // tired flat-ish w
    flat: [
      '...........',
      '.....o.....',
      '...oo.oo...',
      '..o.....o..',
    ],
    // gritted teeth grimace
    grimace: [
      '...........',
      '.....o.....',
      '..ooooooo..',
      '..owvwvwo..',
      '..ooooooo..',
    ],
    // ouch: open yowl with fangs
    open: [
      '...........',
      '.....o.....',
      '...ooooo...',
      '..owmmmwo..',
      '..ommmmmo..',
      '...omttmo..',
      '....oooo...',
    ],
    // toothy grin (pickup)
    grin: [
      '...........',
      '.....o.....',
      'o.ooooooo.o',
      '.owwwwwwwo.',
      '.omvwvwvmo.',
      '..ommtmmo..',
      '...ooooo...',
    ],
    // manic catnip grin with lolling tongue
    manic: [
      '...........',
      '.....o.....',
      'oooooooooo.',
      'owwwwwwwwwo',
      '.ommmmmmmo.',
      '..omtttmo..',
      '...otTto...',
      '....ooo....',
    ],
    // dead: w-mouth with tongue out to the side
    tongue: [
      '...........',
      '.....o.....',
      '..oo.o.oo..',
      '.o..otto.o.',
      '....otTo...',
      '....otto...',
      '.....oo....',
    ],
  };
  tpl(p, x0, 20, M[kind], k);
}

function drawWhiskers(p, tier, dx, droopy = false) {
  const wk = ink('#fff6e8', { gloss: 0.2 }), wk2 = ink('#d8ccc0');
  const sets = [
    [[9, 22], [4, 21], [0, 20]],
    [[9, 23], [4, 23], [0, 23]],
    [[9, 24], [5, 25], [1, 26]],
  ];
  for (let s = 0; s < 2; s++) {
    sets.forEach((w, i) => {
      // tier 4: missing whiskers on the viewer-left; tier 3: one bent
      if (tier >= 4 && s === 0 && i !== 1) return;
      if (tier >= 2 && s === 1 && i === 0) {      // a broken stub
        const a = w[0], b = w[1];
        p.line(MX(a[0]) + dx, a[1], MX(b[0]) + dx, b[1] + 1, wk2);
        return;
      }
      for (let k = 0; k < 2; k++) {
        const a = w[k], b = w[k + 1];
        const yb = droopy ? b[1] + k + 1 : b[1];
        if (s === 0) p.line(a[0] + dx, a[1], b[0] + dx, yb, k ? wk2 : wk);
        else p.line(MX(a[0]) + dx, a[1], MX(b[0]) + dx, yb, k ? wk2 : wk);
      }
    });
  }
}

/** Battle damage, cumulative per tier. Drawn after the outline so cuts can bite into it. */
function drawDamage(p, tier, variant) {
  const red = ink(RED[2]), dred = ink(RED[1]), lred = ink(RED[3]);
  if (tier >= 1) {
    // three claw scratches across the viewer-right cheek
    for (let k = 0; k < 3; k++) { p.set(23 + k, 17 + k, dred); p.set(24 + k, 18 + k, red); p.set(25 + k, 19 + k, lred); }
    // ruffled fur tuft on top of the head
    p.set(14, 5, OUTK); p.set(15, 5, FUR[3]); p.set(16, 4, OUTK); p.set(15, 4, OUTK); p.set(16, 5, FUR[4]);
  }
  if (tier >= 2) {
    // ear notch (viewer-right ear tip bitten out)
    for (const [x, y] of [[26, 2], [27, 2], [26, 3], [27, 1], [28, 1]]) p.erase(x, y);
    p.set(25, 2, OUTK); p.set(26, 4, OUTK); p.set(27, 3, OUTK); p.set(28, 2, OUTK);
    // sticking plaster on the viewer-left forehead
    const pl = { a: ink('#e8c48a', { gloss: 0.15 }), b: ink('#c89a62'), d: ink('#a87848') };
    tpl(p, 4, 7, [
      '....ab',
      '..aaab',
      'aadaab',
      'aaab..',
      'ab....',
    ], pl);
    // scratch on the nose bridge
    p.set(17, 18, red);
  }
  if (tier >= 3) {
    // bloody nose drip
    p.set(17, 21, ink(BLOOD, { gloss: 0.5 })); p.set(17, 22, ink(BLOOD, { gloss: 0.5 }));
    // forehead cuts
    p.set(18, 9, red); p.set(19, 10, red); p.set(20, 10, dred);
    // torn cheek fur
    p.set(1, 21, OUTK); p.erase(0, 21);
  }
  if (tier >= 4) {
    // head bandage wrapped over the viewer-right ear, with a blood spot
    const bk = { a: ink(WHITE[3], { gloss: 0.1 }), b: ink(WHITE[2]), c: ink(WHITE[1]), r: ink(BLOOD), o: OUTK };
    tpl(p, 17, 2, [
      '......oooo...',
      '....ooaaabo..',
      '..ooaaarrbbo.',
      '.oaaaabrbbbco',
      'oaaabbbbbcco.',
      '.obbbbccoo...',
      '..oooooo.....',
    ], bk);
    // soot smudges
    for (const [x, y] of [[5, 16], [6, 17], [24, 24], [25, 24], [21, 13]]) p.set(x, y, ink('#5a4a40'));
    // sweat drop
    if (variant !== 3) { p.set(4, 10, ink('#9ad8ff', { gloss: 0.8 })); p.set(4, 11, ink('#5aa0e0', { gloss: 0.8 })); p.set(3, 11, OUTK); p.set(5, 11, OUTK); p.set(4, 12, OUTK); }
  }
}

/** Halo for the dead frame (one of nine lives spent). */
function drawHalo(p) {
  const g = ink(GOLD[3], { emit: 0.8, spark: 0.6 }), g2 = ink(GOLD[4], { emit: 1 });
  p.ring(15.5, 2.5, 7, 2.2, g);
  p.set(11, 1, g2); p.set(12, 0, g2);
}

/** Catnip sparkles. */
function drawSparkles(p) {
  const s = ink('#b8ff8a', { emit: 1, spark: 1 }), s2 = ink('#5ae05a', { emit: 0.8 });
  for (const [x, y] of [[2, 3], [29, 6], [1, 15]]) { p.set(x, y, s); p.set(x - 1, y, s2); p.set(x + 1, y, s2); p.set(x, y - 1, s2); p.set(x, y + 1, s2); }
}

/** Compose one face frame. */
function face({ tier = 0, variant = 0, special = null }) {
  const p = new PixBuf(FW, FH);
  const dead = special === 'dead', nip = special === 'nip', grin = special === 'grin';
  const look = special ? 0 : variant === 1 ? -1 : variant === 2 ? 1 : 0;
  const dx = look;   // whole muzzle turns 1px with the gaze
  drawHeadBase(p, { tier, dx, dead, nip });
  outlineFace(p);
  const ouch = variant === 3 && !special;
  // eyes
  const droop = special ? 0 : [0, 0, 1, 1, 2][tier];
  let kindL = 'open', kindR = 'open';
  if (ouch) kindL = kindR = 'shut';
  if (dead) kindL = kindR = 'x';
  if (nip) kindL = kindR = 'nip';
  if (!special && !ouch && tier >= 4) kindL = 'swollen';
  const bruiseL = !special && tier >= 3;
  drawEye(p, 7, 14, 0, { look, droop: kindL === 'open' && bruiseL ? Math.max(droop, 2) : droop, kind: kindL, bruise: bruiseL });
  drawEye(p, 18, 14, 1, { look, droop, kind: kindR });
  drawBrows(p, ouch ? 'worried' : grin || nip ? 'up' : dead ? null : tier >= 3 ? 'worried' : 'stern');
  drawNose(p, dx);
  const mouth = dead ? 'tongue' : nip ? 'manic' : grin ? 'grin' : ouch ? 'open' : tier >= 3 ? 'grimace' : tier >= 2 ? 'flat' : 'smirk';
  drawMouth(p, mouth, dx);
  drawWhiskers(p, special ? (dead ? 0 : 0) : tier, dx, dead || (!special && tier >= 3));
  if (!special) drawDamage(p, tier, variant);
  if (dead) drawHalo(p);
  if (nip) drawSparkles(p);
  return p;
}

function buildFaces() {
  const out = [];
  for (let t = 0; t < 5; t++) for (let v = 0; v < 4; v++) out.push(face({ tier: t, variant: v }));
  out.push(face({ special: 'grin' }), face({ special: 'dead' }), face({ special: 'nip' }));
  return out;
}

// ═════════════════════════════ FONTS ═════════════════════════════
// Big chunky logo glyphs: 6×7 cells, 2-cell strokes.
const BIG = {
  K: ['XX..XX', 'XX.XX.', 'XXXX..', 'XXX...', 'XXXX..', 'XX.XX.', 'XX..XX'],
  A: ['.XXXX.', 'XX..XX', 'XX..XX', 'XXXXXX', 'XX..XX', 'XX..XX', 'XX..XX'],
  S: ['.XXXXX', 'XX....', 'XX....', '.XXXX.', '....XX', '....XX', 'XXXXX.'],
  E: ['XXXXXX', 'XX....', 'XX....', 'XXXXX.', 'XX....', 'XX....', 'XXXXXX'],
  R: ['XXXXX.', 'XX..XX', 'XX..XX', 'XXXXX.', 'XX.XX.', 'XX..XX', 'XX..XX'],
  I: ['XXXXXX', '..XX..', '..XX..', '..XX..', '..XX..', '..XX..', 'XXXXXX'],
  G: ['.XXXXX', 'XX....', 'XX....', 'XX.XXX', 'XX..XX', 'XX..XX', '.XXXXX'],
};
// Small 5×7 font for the subtitle.
const SMALL = {
  C: ['.XXX.', 'X...X', 'X....', 'X....', 'X....', 'X...X', '.XXX.'],
  L: ['X....', 'X....', 'X....', 'X....', 'X....', 'X....', 'XXXXX'],
  A: ['.XXX.', 'X...X', 'X...X', 'XXXXX', 'X...X', 'X...X', 'X...X'],
  W: ['X...X', 'X...X', 'X...X', 'X.X.X', 'X.X.X', 'XX.XX', 'X...X'],
  S: ['.XXXX', 'X....', 'X....', '.XXX.', '....X', '....X', 'XXXX.'],
  O: ['.XXX.', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.XXX.'],
  F: ['XXXXX', 'X....', 'X....', 'XXXX.', 'X....', 'X....', 'X....'],
  M: ['X...X', 'XX.XX', 'X.X.X', 'X.X.X', 'X...X', 'X...X', 'X...X'],
  R: ['XXXX.', 'X...X', 'X...X', 'XXXX.', 'X.X..', 'X..X.', 'X...X'],
  D: ['XXXX.', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', 'XXXX.'],
  E: ['XXXXX', 'X....', 'X....', 'XXXX.', 'X....', 'X....', 'XXXXX'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
};

// ═════════════════════════════ LOGO ═════════════════════════════
const LW = 240, LH = 80;

function buildLogo() {
  const p = new PixBuf(LW, LH);
  const word = 'KÄSEKRIEG';
  const cell = 4, gw = 6 * cell, gap = 2;
  const total = word.length * gw + (word.length - 1) * gap;
  const x0 = Math.floor((LW - total) / 2), ytop = 10;
  const bounce = [0, -1, 1, 0, -1, 1, 0, -1, 0];
  // letter mask (+ umlaut dots)
  const letters = new Uint8Array(LW * LH);
  const setL = (x, y) => { if (x >= 0 && y >= 0 && x < LW && y < LH) letters[y * LW + x] = 1; };
  [...word].forEach((ch, i) => {
    const g = BIG[ch === 'Ä' ? 'A' : ch], lx = x0 + i * (gw + gap), ly = ytop + bounce[i];
    for (let j = 0; j < 7; j++) for (let k = 0; k < 6; k++) if (g[j][k] === 'X') for (let yy = 0; yy < cell; yy++) for (let xx = 0; xx < cell; xx++) setL(lx + k * cell + xx, ly + j * cell + yy);
    if (ch === 'Ä') for (const ox of [4, 14]) for (let yy = 0; yy < 5; yy++) for (let xx = 0; xx < 6; xx++) if (!((yy === 0 || yy === 4) && (xx === 0 || xx === 5))) setL(lx + ox + xx, ly - 8 + yy);
  });
  // drips hanging from bottom edges of strokes
  const drips = [];
  for (let x = 2; x < LW - 2; x++) {
    let bottom = -1;
    for (let y = LH - 1; y >= 0; y--) if (letters[y * LW + x]) { bottom = y; break; }
    if (bottom < 0 || letters[(bottom - 3) * LW + x] === 0) continue;
    if (hash2(x, 3, 91) < 0.05 && !drips.some((d) => Math.abs(d.x - x) < 8)) drips.push({ x, y: bottom + 1, len: 3 + Math.floor(hash2(x, 5, 93) * 9) });
  }
  for (const d of drips) {
    for (let j = 0; j < d.len; j++) for (let i = 0; i < 3; i++) setL(d.x + i - (j > d.len - 3 ? 0 : 0), d.y + j);
    // round blob at the tip
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 3; i++) if (!((j === -1 || j === 1) && (i === -1 || i === 3))) setL(d.x + i, d.y + d.len + j);
    // fillets where the drip meets the letter
    setL(d.x - 1, d.y); setL(d.x + 3, d.y);
  }
  const L = (x, y) => (x >= 0 && y >= 0 && x < LW && y < LH ? letters[y * LW + x] : 0);
  // extrusion (rind) down-right, then outline, then cheese face
  const ext = I(['#5a2c06', '#7a4208'], { gloss: 0.15 });
  for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
    if (L(x, y)) continue;
    for (let d = 1; d <= 3; d++) if (L(x - d, y - d)) { p.set(x, y, ext[d === 1 ? 1 : 0]); break; }
  }
  const ched = I(CHED, { gloss: 0.25, spark: 0.05 });
  for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
    if (!L(x, y)) continue;
    // vertical band shading + bevel edges
    const yy = y - ytop;
    let l = yy < 5 ? 5 : yy < 12 ? 4 : yy < 22 ? 3 : 2;
    if (y > ytop + 28) l = 3;                        // drips are bright and wet
    if (!L(x - 1, y) || !L(x, y - 1)) l = 6;          // top-left bevel highlight
    else if (!L(x + 1, y) || !L(x, y + 1)) l = 1;     // bottom-right shade
    else if (!L(x - 2, y) || !L(x, y - 2)) l = Math.min(6, l + 1);
    p.set(x, y, ched[l]);
  }
  // swiss holes inside the strokes
  const holes = [];
  for (let n = 0; n < 400 && holes.length < 34; n++) {
    const cx = Math.floor(hash2(n, 1, 41) * LW), cy = ytop + 2 + Math.floor(hash2(n, 2, 41) * 26);
    const r = hash2(n, 3, 41) < 0.35 ? 2 : 1;
    let ok = true;
    for (let j = -r - 1; j <= r + 1 && ok; j++) for (let i = -r - 1; i <= r + 1; i++) if (!L(cx + i, cy + j)) { ok = false; break; }
    if (!ok || holes.some((h) => Math.abs(h.x - cx) + Math.abs(h.y - cy) < r + h.r + 4)) continue;
    holes.push({ x: cx, y: cy, r });
  }
  for (const h of holes) {
    const rr = h.r + 0.6;
    for (let j = -h.r - 1; j <= h.r + 1; j++) for (let i = -h.r - 1; i <= h.r + 1; i++) {
      const d = Math.hypot(i, j);
      if (d > rr) continue;
      // inside the hole: shadowed at the top-left, lit lip at the bottom-right
      const c = d > rr - 1 && i + j > 0 ? CHED[5] : (i + j < 0 ? CHED[1] : CHED[2]);
      p.set(h.x + i, h.y + j, ink(c, { gloss: 0.1 }));
    }
  }
  // drip highlights
  for (const d of drips) { for (let j = 1; j < d.len; j++) p.set(d.x, d.y + j, ched[5]); p.set(d.x, d.y + d.len, ched[6]); }
  // claw slash: three gouges from upper-right to lower-left through the right half of the word
  const slash = (sx, sy, ex, ey, wmax) => {
    const n = Math.ceil(Math.hypot(ex - sx, ey - sy));
    for (let s = 0; s <= n; s++) {
      const t = s / n, w = Math.max(0.6, Math.sin(t * Math.PI) * wmax);
      const cx = sx + (ex - sx) * t, cy = sy + (ey - sy) * t;
      // Thin scored cuts (1–2 px dark + a 1 px lit lip) so the letters underneath stay readable; `w` only
      // decides where the cut doubles up. Nothing is drawn between letters.
      const x = Math.round(cx), y = Math.round(cy);
      if (L(x, y)) p.set(x, y, ink('#2a1406'));
      if (w > 1.2 && L(x - 1, y)) p.set(x - 1, y, ink('#2a1406'));
      if (L(x + 1, y)) p.set(x + 1, y, ink(CHED[6], { emit: 0.2 }));
    }
  };
  slash(200, 2, 166, 50, 1.5);
  slash(208, 4, 174, 52, 1.7);
  slash(216, 6, 182, 54, 1.4);
  // outline everything drawn so far
  p.outline(OUT, { diagonal: true });
  // a few sparkle glints on the cheese
  for (const [x, y] of [[x0 + 3, ytop + 1], [x0 + 3 * (gw + gap) + 2, ytop + 1], [x0 + 6 * (gw + gap) + 3, ytop + 2]]) p.set(x, y, ink('#ffffff', { emit: 0.7, spark: 1 }));

  // subtitle "CLAWS OF MARMALADE" (5×7 font, ×2)
  const sub = 'CLAWS OF MARMALADE', sc = 2, sw = 5 * sc, sg = 2;
  const stotal = sub.length * sw + (sub.length - 1) * sg;
  const sx0 = Math.floor((LW - stotal) / 2), sy0 = 60;
  const sm = new Uint8Array(LW * LH);
  [...sub].forEach((ch, i) => {
    const g = SMALL[ch]; const lx = sx0 + i * (sw + sg);
    for (let j = 0; j < 7; j++) for (let k = 0; k < 5; k++) if (g[j][k] === 'X') for (let yy = 0; yy < sc; yy++) for (let xx = 0; xx < sc; xx++) sm[(sy0 + j * sc + yy) * LW + lx + k * sc + xx] = 1;
  });
  const S = (x, y) => (x >= 0 && y >= 0 && x < LW && y < LH ? sm[y * LW + x] : 0);
  const sub2 = new PixBuf(LW, LH);
  for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
    if (S(x, y)) {
      const top = y - sy0 < 6;
      sub2.set(x, y, ink(!S(x, y - 1) ? CREAM[4] : top ? CREAM[3] : CREAM[2], { gloss: 0.1 }));
    } else if (S(x - 1, y - 1) || S(x, y - 1) && S(x - 1, y)) sub2.set(x, y, ink(FUR[1]));
  }
  sub2.outline(OUT, { diagonal: true });
  // rule lines either side of the subtitle are omitted (no room); a small claw-mark divider sits above it
  p.blit(sub2, 0, 0);
  return p;
}

// ═════════════════════════════ ICONS ═════════════════════════════
function keyIcon(kind) {
  const p = new PixBuf(12, 12);
  const R = I(kind === 'gold' ? GOLD : SILV, { gloss: 0.6, spark: 0.7 });
  if (kind === 'gold') {
    // bow = cat bell: round bell with slot, ring on top
    ball(p, 3.5, 4, 3, 3, R.slice(1));
    p.set(2, 5, R[0]); p.set(3, 5, R[0]); p.set(4, 5, R[0]); p.set(3, 6, R[0]);
    p.set(3, 0, R[2]);
  } else {
    // bow = little fish (body + tail)
    p.ellipse(3.5, 3.5, 3, 2, R[3]); p.hline(1, 4, 5, R[2]); p.set(2, 2, R[4]);
    p.set(0, 1, R[2]); p.set(0, 5, R[2]); p.set(1, 2, R[2]); p.set(1, 4, R[2]);
    p.set(5, 3, ink(OUT));
  }
  // shaft diagonal down-right with two teeth
  for (let i = 0; i < 5; i++) { p.set(5 + i, 5 + i, R[3]); p.set(6 + i, 5 + i, R[2]); }
  p.set(8, 10, R[2]); p.set(7, 10, R[1]); p.set(10, 8, R[2]); p.set(10, 7, R[1]);
  p.set(9, 10, R[1]);
  p.outline(OUT);
  return p;
}

function lifeIcon(lost) {
  const p = new PixBuf(9, 9);
  const shape = [
    'a.....a..',
    'aa...aa..',
    'aaaaaaa..',
    'aaaaaaa..',
    'aaaaaaa..',
    '.aaaaa...',
  ];
  if (!lost) {
    tpl(p, 1, 1, shape, { a: ink(FUR[3]) });
    p.set(2, 2, ink(PINK[2])); p.set(6, 2, ink(PINK[2]));
    p.set(1, 1, ink(FUR[4])); p.set(2, 3, ink(FUR[4])); p.set(3, 3, ink(STRIPE[2])); p.set(4, 3, ink(STRIPE[2])); p.set(5, 3, ink(STRIPE[2]));
    p.set(7, 5, ink(FUR[2])); p.set(6, 6, ink(FUR[2]));
    p.set(3, 4, ink(OUT)); p.set(5, 4, ink(OUT));
    p.set(4, 5, ink(PINK[1])); p.set(3, 6, ink(CREAM[3])); p.set(4, 6, ink(CREAM[3])); p.set(5, 6, ink(CREAM[3]));
    p.outline(OUT);
  } else {
    // grey ghost outline only (hollow)
    const m = maskOf(9, 9, (q) => tpl(q, 1, 1, shape, { a: ink('#fff') }));
    const g = ink('#6a6478'), g2 = ink('#4a4458');
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
      if (!mget(m, 9, 9, x, y)) continue;
      const edge = !mget(m, 9, 9, x - 1, y) || !mget(m, 9, 9, x + 1, y) || !mget(m, 9, 9, x, y - 1) || !mget(m, 9, 9, x, y + 1);
      if (edge) p.set(x, y, y < 4 ? g : g2);
    }
    p.set(3, 4, g2); p.set(5, 4, g2);
  }
  return p;
}

function ammoIcon(i) {
  const p = new PixBuf(12, 12);
  if (i === 0) {        // hairball: fuzzy tan-brown ball with stray hairs
    const H = I(['#5a3e2a', '#7e5a3e', '#a07850', '#c8a070', '#e8c898']);
    ball(p, 6, 6.5, 4.5, 4.2, H);
    for (const [x, y, c] of [[3, 5, 1], [6, 3, 4], [8, 7, 1], [5, 8, 2], [7, 5, 3], [4, 7, 1]]) p.set(x, y, H[c]);
    p.set(1, 3, H[2]); p.set(10, 4, H[1]); p.set(9, 10, H[1]); p.set(2, 9, H[2]); p.set(6, 1, H[3]);
  } else if (i === 1) { // yarn ball: pink with wrap lines and a loose thread
    const Y = I(['#8a2050', '#c43a78', '#f06aa8', '#ffa8cc'], { gloss: 0.1 });
    ball(p, 5.5, 5.5, 4.5, 4.5, Y);
    for (let k = 0; k < 4; k++) { p.set(3 + k, 2 + k, Y[0]); p.set(2 + k, 4 + k, Y[0]); }
    p.set(7, 2, Y[1]); p.set(8, 3, Y[1]); p.set(8, 6, Y[1]); p.set(7, 7, Y[1]);
    p.set(9, 9, Y[2]); p.set(10, 10, Y[2]); p.set(11, 10, Y[2]);
  } else {              // battery: red cell, brass cap, glowing charge stripe
    const B = I(RED, { gloss: 0.45 });
    for (let x = 3; x <= 8; x++) p.rect(x, 2, 1, 9, B[x < 5 ? 3 : x < 7 ? 2 : 1]);
    p.rect(5, 1, 2, 1, ink(GOLD[3], { gloss: 0.7, spark: 0.4 }));
    p.rect(3, 10, 6, 1, ink(SILV[1], { gloss: 0.6 }));
    const e = ink('#ffe060', { emit: 1 });
    p.rect(4, 5, 4, 2, e); p.set(5, 4, ink('#fff8c0', { emit: 1 })); p.set(6, 7, ink('#fff8c0', { emit: 1 }));
    p.set(4, 3, ink(RED[4]));
  }
  p.outline(OUT);
  return p;
}

function weaponIcon(i) {
  const p = new PixBuf(28, 14);
  const S = I(['#3a4250', '#5f6876', '#8d98a8', '#c4ccd8', '#eef2f8'], { gloss: 0.5 });
  const C = I(CREAM);
  if (i === 0) {        // claws: three hooked claws on a paw edge
    for (let k = 0; k < 3; k++) {
      const bx = 6 + k * 7;
      tpl(p, bx, 1, [
        '...aa',
        '..abb',
        '..ab.',
        '.abb.',
        '.ab..',
        'abb..',
        'ab...',
        'ab...',
      ], { a: C[4], b: C[2] });
    }
    p.rect(4, 9, 22, 4, ink(FUR[3])); p.hline(4, 9, 22, ink(FUR[4])); p.hline(4, 12, 22, ink(FUR[1]));
    for (const x of [8, 15, 22]) p.set(x, 10, ink(STRIPE[1]));
  } else if (i === 1) { // pistol (chunky toy) with hairball in the breech
    p.rect(4, 3, 18, 4, S[2]); p.hline(4, 3, 18, S[3]); p.hline(4, 6, 18, S[1]);
    p.rect(21, 2, 3, 6, S[1]); p.set(21, 2, S[2]);
    p.poly([[6, 7], [11, 7], [10, 13], [5, 13]], ink('#6a3a1e', { gloss: 0.2 }));
    p.set(6, 8, ink('#8a5230')); p.set(6, 9, ink('#8a5230'));
    p.rect(11, 7, 1, 3, S[1]); p.hline(11, 9, 4, S[1]);
    ball(p, 15.5, 4.5, 2, 2, I(['#7e5a3e', '#a07850', '#c8a070']));
  } else if (i === 2) { // gatling: six-barrel cluster, drum body, fish-bone crank
    for (const [y, c] of [[3, 3], [5, 2], [7, 2], [9, 1]]) p.hline(3, y, 16, S[c]);
    for (const y of [4, 6, 8]) p.hline(3, y, 16, S[0]);
    p.rect(2, 2, 2, 9, S[3]); p.rect(9, 2, 2, 9, S[3]);
    p.rect(18, 2, 6, 9, S[1]); p.rect(18, 2, 6, 2, S[2]); p.set(18, 2, S[3]);
    // fish-bone crank
    p.vline(25, 3, 6, C[3]); p.set(24, 4, C[2]); p.set(26, 4, C[2]); p.set(24, 6, C[2]); p.set(26, 6, C[2]); p.set(25, 9, C[4]); p.set(24, 10, C[3]); p.set(26, 10, C[3]);
  } else if (i === 3) { // yarn bomber: fat barrel + pink yarn ball in the muzzle
    const G = I(['#2e3a2a', '#465a3e', '#6a8058', '#90a878'], { gloss: 0.3 });
    p.rect(5, 2, 15, 8, G[2]); p.hline(5, 2, 15, G[3]); p.hline(5, 9, 15, G[0]); p.hline(5, 8, 15, G[1]);
    p.rect(18, 1, 3, 10, G[1]); p.vline(18, 1, 10, G[2]);
    p.rect(2, 4, 3, 4, G[1]);
    p.poly([[9, 10], [13, 10], [12, 13], [8, 13]], ink('#6a3a1e'));
    ball(p, 22.5, 5.5, 3.6, 3.6, I(['#8a2050', '#c43a78', '#f06aa8', '#ffa8cc']));
    p.set(21, 4, ink('#8a2050')); p.set(22, 6, ink('#8a2050'));
  } else {              // laser pointer: slim chrome tube, button, glowing red lens
    p.rect(3, 5, 19, 4, S[2]); p.hline(3, 5, 19, S[4]); p.hline(3, 6, 19, S[3]); p.hline(3, 8, 19, S[0]);
    for (const x of [6, 12]) p.vline(x, 5, 4, S[1]);
    p.rect(9, 4, 2, 1, ink(RED[2])); p.set(9, 4, ink(RED[3]));
    p.rect(22, 4, 2, 6, S[1]); p.vline(22, 4, 6, S[3]);
    p.rect(24, 5, 2, 4, ink(RED[3], { emit: 1 })); p.set(24, 5, ink('#ffd0c0', { emit: 1 })); p.set(25, 6, ink('#ff5a4a', { emit: 1 }));
    p.set(26, 6, ink('#ff3a3a', { emit: 1 })); p.set(26, 7, ink('#ff3a3a', { emit: 1 }));
  }
  p.outline(OUT);
  return p;
}

function cursorIcon(pressed) {
  const p = new PixBuf(12, 12);
  const o = pressed ? 1 : 0;
  const F = pressed ? I([FUR[1], FUR[2], FUR[3]]) : I([FUR[2], FUR[3], FUR[5]]);
  const pad = pressed ? I([PINK[0], PINK[1], PINK[2]]) : I([PINK[1], PINK[2], PINK[3]]);
  // four toe beans + main pad
  const toes = [[2.5, 4.5], [4.5, 2.2], [7.5, 2.2], [9.5, 4.5]];
  for (const [x, y] of toes) ball(p, x, y + o, 1.5, 1.7, pad);
  ball(p, 6, 8.2 + o, 3.3, 2.6, pad);
  p.outline(OUT);
  void F;
  return p;
}

function emblem() {
  const p = new PixBuf(32, 32);
  const R = I(RED, { gloss: 0.15 });
  // red square field with bevelled border
  p.rect(0, 0, 32, 32, R[2]);
  p.hline(1, 1, 30, R[3]); p.vline(1, 1, 30, R[3]);
  p.hline(1, 30, 30, R[1]); p.vline(30, 1, 30, R[1]);
  p.frame(0, 0, 32, 32, ink(OUT));
  // gold corner studs
  for (const [x, y] of [[3, 3], [28, 3], [3, 28], [28, 28]]) { p.set(x, y, ink(GOLD[3], { spark: 0.8, gloss: 0.6 })); }
  // white disc
  p.circle(15.5, 15.5, 12.4, ink(OUT));
  p.circle(15.5, 15.5, 11.5, ink('#f4f0e8', { gloss: 0.1 }));
  p.ring(15.5, 15.5, 11.5, 11.5, ink('#c8c4c0'), 1);
  for (let y = 4; y < 28; y++) for (let x = 4; x < 28; x++) {   // soft lower-right shade on the disc ring
    const d = Math.hypot(x + 0.5 - 15.5, y + 0.5 - 15.5);
    if (d < 11.5 && d > 10.2 && x + y < 31) p.set(x, y, ink('#ffffff'));
  }
  // black cheese wedge (point to the left, rind on the right) with holes showing the disc
  const W = ink('#16121c', { gloss: 0.3 });
  p.poly([[6.5, 21.5], [24.5, 10.5], [24.5, 21.5]], W);
  p.rect(7, 21, 18, 2, W);                   // wedge thickness (side face)
  p.hline(8, 22, 17, ink('#2e2836'));
  p.vline(24, 11, 12, ink('#2e2836'));
  const hole = ink('#f4f0e8');
  p.circle(19.5, 15.5, 1.6, hole); p.circle(14.5, 19, 1.2, hole); p.set(22, 19, hole); p.set(22, 20, hole); p.set(17, 21, hole);
  return p;
}

// ═════════════════════════════ BUILD ═════════════════════════════
export function build() {
  return {
    'hud.face': buildFaces(),
    'hud.logo': buildLogo(),
    'hud.icon.key_gold': keyIcon('gold'),
    'hud.icon.key_silver': keyIcon('silver'),
    'hud.icon.life': [lifeIcon(false), lifeIcon(true)],
    'hud.icon.ammo': [ammoIcon(0), ammoIcon(1), ammoIcon(2)],
    'hud.icon.weapon': [0, 1, 2, 3, 4].map(weaponIcon),
    'hud.cursor': [cursorIcon(false), cursorIcon(true)],
    'hud.emblem': emblem(),
  };
}

export default build;
void shade; void CLEAR;
