// enemies_beasts — Kanalratte (sewer) and Panzerratte (panzer) sprites. Pure code art, deterministic.
import { PixBuf, ink, shade, mix, ramp, hash2 } from './pixbuf.js';

const OUT = '#1a1420';
const EDGE = '#241a2a';

// ───────────── lit-shape helpers (light from upper-left, 4-step ramps dark → light) ─────────────
function lighting(nx, ny) {
  const z = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  return nx * -0.5 + ny * -0.65 + z * 0.57;
}
const step = (d) => (d < -0.2 ? 0 : d < 0.22 ? 1 : d < 0.6 ? 2 : 3);

function paint(p, test, bx0, by0, bx1, by1, r, o) {
  const cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2, rx = (bx1 - bx0) / 2 || 1, ry = (by1 - by0) / 2 || 1;
  const grain = o.grain || 0, seed = o.seed || 1;
  for (let y = by0; y < by1; y++)
    for (let x = bx0; x < bx1; x++) {
      if (!test(x, y)) continue;
      const nx = Math.max(-1, Math.min(1, (x + 0.5 - cx) / rx)), ny = Math.max(-1, Math.min(1, (y + 0.5 - cy) / ry));
      let i = step(lighting(nx * 0.95, ny * 0.95));
      if (grain && hash2(x >> 1, y >> 1, seed) < grain) i = Math.max(0, Math.min(3, i + (hash2(x, y, seed + 7) < 0.5 ? -1 : 1)));
      let rr = r;
      if (o.alt && hash2(Math.floor(x / 3), Math.floor(y / 3), o.alt.seed || 5) < o.alt.p) rr = o.alt.ramp;
      p.set(x, y, rr[i]);
    }
}
/** Lit ellipse with a dark rim. */
function blob(p, cx, cy, rx, ry, r, o = {}) {
  const e = o.edge === undefined ? EDGE : o.edge;
  const inE = (rx_, ry_) => (x, y) => { const u = (x + 0.5 - cx) / rx_, v = (y + 0.5 - cy) / ry_; return u * u + v * v <= 1; };
  const x0 = Math.floor(cx - rx - 2), x1 = Math.ceil(cx + rx + 2), y0 = Math.floor(cy - ry - 2), y1 = Math.ceil(cy + ry + 2);
  if (e) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (inE(rx + 1, ry + 1)(x, y)) p.set(x, y, e);
  paint(p, inE(rx, ry), x0, y0, x1, y1, r, o);
}
/** Lit polygon with a dark rim. */
function lpoly(p, pts, r, o = {}) {
  const m = new PixBuf(64, 64); m.poly(pts, '#fff');
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  const x0 = Math.floor(Math.min(...xs)) - 1, x1 = Math.ceil(Math.max(...xs)) + 1, y0 = Math.floor(Math.min(...ys)) - 1, y1 = Math.ceil(Math.max(...ys)) + 1;
  const e = o.edge === undefined ? EDGE : o.edge;
  if (e) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++)
    if (!m.has(x, y) && (m.has(x - 1, y) || m.has(x + 1, y) || m.has(x, y - 1) || m.has(x, y + 1))) p.set(x, y, e);
  paint(p, (x, y) => m.has(x, y), x0 + 1, y0 + 1, x1 - 1, y1 - 1, r, o);
}
/** Chamfered rectangle polygon. */
const rrect = (x, y, w, h, c = 2) => [[x + c, y], [x + w - c, y], [x + w, y + c], [x + w, y + h - c], [x + w - c, y + h], [x + c, y + h], [x, y + h - c], [x, y + c]];
const dot = (p, x, y, c) => p.set(x, y, c);

/** Rotate/scale a finished (un-outlined) sprite about its feet, then re-ground it on the bottom row, centred. */
function transform(src, ang, sx = 1, sy = 1, px = 32, py = 40) {
  const dst = new PixBuf(64, 64), co = Math.cos(-ang), si = Math.sin(-ang);
  const tmp = new PixBuf(64, 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const u = (x + 0.5 - px) / sx, v = (y + 0.5 - py) / sy;
    const ox = u * co - v * si + px, oy = u * si + v * co + py;
    const s = src.get(Math.floor(ox), Math.floor(oy));
    if (s && s.a > 0) tmp.set(x, y, s);
  }
  let minX = 64, maxX = -1, maxY = -1;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (tmp.has(x, y)) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  if (maxX < 0) return tmp;
  const offx = Math.round(32 - (minX + maxX + 1) / 2), offy = 62 - maxY;
  dst.blit(tmp, offx, offy);
  return dst;
}
const finish = (p) => { p.outline(OUT); return p; };

// ───────────── SEWER RAT ─────────────
const FUR = ramp('#2c2636', 4, 0.42);
const FURL = ramp('#463c50', 4, 0.4);
const SKIN = ramp('#d98d93', 4, 0.4).map((c) => ({ ...c, gloss: 0.15 }));
const TEETH = ramp('#f6dc6a', 4, 0.45);
const STEEL = ramp(ink('#8d98a8', { gloss: 0.5, spark: 0.1 }), 4, 0.5);
const GOLD = ramp(ink('#ffd23e', { gloss: 0.4, spark: 0.9 }), 4, 0.4);
const MANGE = { ramp: ramp('#8a6f7a', 4, 0.4), p: 0.06, seed: 11 };
const EYE_RED = ink('#ff2a2a', { emit: 0.9 });
const EYE_HOT = ink('#ffd0a0', { emit: 1 });

function sewerPose(o = {}) {
  const { dy = 0, hx = 0, hy = 0, hs = 1, mouth = 0, eyes = 'open', pl = 0, pr = 0, lean = 0, tail = 0, ps = 1, tongue = 0 } = o;
  const p = new PixBuf(64, 64);
  const fo = { grain: 0.18, seed: 3, alt: MANGE };
  // tail (bare, pink, curled up on the right)
  const T = [[47 + lean, 52 + dy], [57, 53], [60, 46 - tail], [57, 38 - tail]];
  for (let t = 0; t <= 1; t += 0.04) {
    const u = 1 - t, x = u * u * u * T[0][0] + 3 * u * u * t * T[1][0] + 3 * u * t * t * T[2][0] + t * t * t * T[3][0];
    const y = u * u * u * T[0][1] + 3 * u * u * t * T[1][1] + 3 * u * t * t * T[2][1] + t * t * t * T[3][1];
    p.rect(Math.round(x) - 1, Math.round(y) - 1, 3, 3, EDGE); 
  }
  for (let t = 0; t <= 1; t += 0.04) {
    const u = 1 - t, x = u * u * u * T[0][0] + 3 * u * u * t * T[1][0] + 3 * u * t * t * T[2][0] + t * t * t * T[3][0];
    const y = u * u * u * T[0][1] + 3 * u * u * t * T[1][1] + 3 * u * t * t * T[2][1] + t * t * t * T[3][1];
    p.rect(Math.round(x), Math.round(y), 2, 2, SKIN[(Math.round(t * 20) & 1) ? 1 : 2]);
  }
  // haunches + body
  blob(p, 14 + lean, 50 + dy, 9, 9, FUR, fo);
  blob(p, 50 + lean, 50 + dy, 9, 9, FUR, fo);
  blob(p, 12 + lean, 58, 4.5, 3, SKIN);
  blob(p, 52 + lean, 58, 4.5, 3, SKIN);
  blob(p, 32 + lean, 47 + dy, 19, 11, FUR, fo);
  // front legs and paws (lifted paws are higher and smaller)
  const paw = (cx, lift) => {
    blob(p, cx + lean * 0.5, 52 + dy - lift * 0.5, 5.5, 8, FUR, fo);
    const s = (1 - lift * 0.04) * ps;
    blob(p, cx + lean * 0.5, 58 - lift, 6.5 * s, 4 * s, SKIN);
    for (const k of [-3, 0, 3]) { dot(p, Math.round(cx + lean * 0.5 + k * s), Math.round(61.5 - lift + 0.5), TEETH[3]); dot(p, Math.round(cx + lean * 0.5 + k * s), Math.round(60.5 - lift), TEETH[2]); }
  };
  paw(19, pl); paw(45, pr);
  // spiked collar with cheese tag
  const cy = 45 + dy + hy * 0.4, cxx = 32 + hx * 0.5 + lean * 0.5;
  blob(p, cxx, cy + 1, 12, 2.6, STEEL, { edge: EDGE });
  for (const k of [-10, -5, 0, 5, 10]) {
    p.poly([[cxx + k - 1.5, cy + 3], [cxx + k + 1.5, cy + 3], [cxx + k, cy + 7 - Math.abs(k) * 0.12]], STEEL[3]);
    dot(p, cxx + k, cy - 2, STEEL[3]);
  }
  p.poly([[cxx - 3, cy + 6], [cxx + 3, cy + 6], [cxx, cy + 12]], EDGE);
  p.poly([[cxx - 2, cy + 6], [cxx + 2, cy + 6], [cxx, cy + 10]], GOLD[2]);
  dot(p, cxx - 1, cy + 7, GOLD[3]); dot(p, cxx, cy + 8, EDGE);
  // head
  const hX = 32 + hx + lean * 0.5, hY = 35 + hy + dy;
  blob(p, hX - 12 * hs, hY - 8 * hs, 5.5 * hs, 6 * hs, FUR, fo);
  blob(p, hX + 12 * hs, hY - 8 * hs, 5.5 * hs, 6 * hs, FUR, fo);
  blob(p, hX - 12 * hs, hY - 7.5 * hs, 3 * hs, 3.6 * hs, SKIN, { edge: null });
  blob(p, hX + 12 * hs, hY - 7.5 * hs, 3 * hs, 3.6 * hs, SKIN, { edge: null });
  blob(p, hX, hY, 14.5 * hs, 9.5 * hs, FUR, fo);
  // muzzle
  const mY = hY + 4.5 * hs;
  blob(p, hX, mY, 7.5 * hs, 6 * hs, FURL, { grain: 0.15, seed: 5 });
  blob(p, hX, mY - 3 * hs, 3 * hs, 2.2 * hs, SKIN, { edge: EDGE });
  dot(p, hX - 1, mY - 4 * hs, '#ffd6d9'); 
  // mouth + teeth
  const mw = 5 * hs;
  if (mouth > 0) {
    const mh = 2 + mouth * 2.2 * hs;
    blob(p, hX, mY + 3 * hs + mh * 0.4, mw + 3, mh, [ '#3a0a14', '#5a1020', '#7a1a2a', '#8f2434' ], { edge: EDGE });
    if (tongue || mouth > 1) blob(p, hX, mY + 3 * hs + mh * 0.9, 3 * hs, 1.8 * hs, SKIN, { edge: null });
    // upper fangs + lower fangs
    for (const s of [-1, 1]) {
      const fx = hX + s * 3.2 * hs;
      p.poly([[fx - 1.6, mY + 3 * hs], [fx + 1.6, mY + 3 * hs], [fx + (s * 0.3), mY + 3 * hs + 5 + mouth * 2]], EDGE);
      p.poly([[fx - 1, mY + 3 * hs], [fx + 1, mY + 3 * hs], [fx + (s * 0.3), mY + 3 * hs + 4 + mouth * 2]], TEETH[2]);
      dot(p, fx - 1, mY + 3 * hs + 1, TEETH[3]);
      const lx = hX + s * 5.2 * hs, ly = mY + 3 * hs + mh * 1.5 + 1;
      p.poly([[lx - 1.4, ly], [lx + 1.4, ly], [lx, ly - 4 - mouth]], EDGE);
      p.poly([[lx - 0.8, ly], [lx + 0.8, ly], [lx, ly - 3 - mouth]], TEETH[3]);
    }
    p.rect(Math.round(hX - 1), Math.round(mY + 3 * hs), 2, 3, TEETH[3]);
  } else {
    p.hline(Math.round(hX - mw), Math.round(mY + 3 * hs), Math.round(mw * 2), EDGE);
    for (const s of [-1, 1]) { p.rect(Math.round(hX + (s < 0 ? -3 : 0) * hs), Math.round(mY + 3 * hs), 3, 6, EDGE); p.rect(Math.round(hX + (s < 0 ? -3 : 0) * hs) + 1, Math.round(mY + 3 * hs), 2, 5, TEETH[2]); p.set(Math.round(hX + (s < 0 ? -3 : 0) * hs) + 1, Math.round(mY + 3 * hs), TEETH[3]); }
  }
  // eyes + angry brows
  const ex = 7 * hs, ey = hY - 2.5 * hs;
  for (const s of [-1, 1]) {
    const x = Math.round(hX + s * ex);
    if (eyes === 'open') {
      p.rect(x - 2, Math.round(ey) - 1, 4, 3, EDGE);
      p.rect(x - 1, Math.round(ey), 3, 2, EYE_RED);
      dot(p, x - (s < 0 ? 0 : 1), Math.round(ey), EYE_HOT);
      p.line(x - s * 4, Math.round(ey) - 3 - (s < 0 ? 0 : 0), x + s * 2, Math.round(ey) - 1 - 0, EDGE);
      p.line(x - s * 4, Math.round(ey) - 4, x + s * 2, Math.round(ey) - 2, EDGE);
    } else if (eyes === 'shut') {
      p.hline(x - 2, Math.round(ey) + 1, 5, EDGE); dot(p, x - s * 2, Math.round(ey), EDGE);
    } else if (eyes === 'x') {
      p.line(x - 2, Math.round(ey) - 1, x + 2, Math.round(ey) + 2, EDGE); p.line(x + 2, Math.round(ey) - 1, x - 2, Math.round(ey) + 2, EDGE);
    }
  }
  // whiskers
  const W = shade('#e8d9c8', 1.0);
  for (const s of [-1, 1]) {
    p.line(hX + s * 7 * hs, mY - 1, hX + s * 17 * hs, mY - 4, W);
    p.line(hX + s * 7 * hs, mY + 1, hX + s * 18 * hs, mY + 2, W);
  }
  // bristle tufts on the head top
  for (const k of [-5, -1, 3, 6]) { p.rect(Math.round(hX + k * hs), Math.round(hY - 11 * hs) - 1, 1, 2, FUR[1]); }
  // torn ear notch + scar across the left eye (rat-like, not plush)
  p.poly([[hX - 15 * hs, hY - 13 * hs], [hX - 12 * hs, hY - 13 * hs], [hX - 13.5 * hs, hY - 10 * hs]], '#1a1420');
  p.line(hX - 9 * hs, hY - 7 * hs, hX - 5 * hs, hY + 1 * hs, '#d9a0a0');
  // ragged fur spikes along the silhouette (top and sides of head/body, never feet/tail)
  const mk = new PixBuf(64, 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (p.has(x, y)) mk.set(x, y, '#fff');
  const spk = (x, y, c) => { if (!mk.has(x, y)) p.set(x, y, c); };
  for (let y = 4; y < 54; y++) for (let x = 3; x < 58; x++) {
    if (!mk.has(x, y)) continue;
    const h = hash2(x, y, 41);
    if (!mk.has(x, y - 1) && h < 0.4) { spk(x, y - 1, FUR[2]); if (h < 0.18) spk(x, y - 2, FUR[1]); }
    if (!mk.has(x - 1, y) && hash2(x, y, 43) < 0.35) { spk(x - 1, y, FUR[2]); if (hash2(x, y, 44) < 0.4) spk(x - 2, y - 1, FUR[1]); }
    if (!mk.has(x + 1, y) && x < 52 && hash2(x, y, 45) < 0.35) { spk(x + 1, y, FUR[2]); if (hash2(x, y, 46) < 0.4) spk(x + 2, y - 1, FUR[1]); }
  }
  return p;
}

const SEWER = {
  idle: { dy: 0, pl: 0, pr: 0, mouth: 0 },
  walk: [
    { dy: 0, pl: 0, pr: 4, hx: -1, lean: -1, hy: 0 },
    { dy: -2, pl: 2, pr: 2, hy: -1, tail: 3 },
    { dy: 0, pl: 4, pr: 0, hx: 1, lean: 1, hy: 0 },
    { dy: -2, pl: 2, pr: 2, hy: -1, tail: 3 },
  ],
  attack: [
    { dy: -4, hs: 1.12, hy: 1, mouth: 1, pl: 6, pr: 6, ps: 1.1, tail: 4, tongue: 1 },
    { dy: 1, hs: 1.3, hy: 4, mouth: 2, pl: 0, pr: 0, ps: 1.2, tail: 6 },
  ],
  pain: { dy: 1, hx: -2, hy: -2, hs: 0.97, mouth: 1, eyes: 'shut', lean: 2, pl: 0, pr: 0 },
};

function buildSewer() {
  const out = {};
  out['sewer.idle'] = [finish(sewerPose(SEWER.idle))];
  out['sewer.walk'] = SEWER.walk.map((o) => finish(sewerPose(o)));
  out['sewer.attack'] = SEWER.attack.map((o) => finish(sewerPose(o)));
  out['sewer.pain'] = [finish(sewerPose(SEWER.pain))];
  const base = (extra) => sewerPose({ ...SEWER.pain, eyes: 'x', ...extra });
  const BLOOD = ['#5a1020', '#7a1a2a', '#a82a3a'];
  const splat = (p, n, seed) => { // flecks of jam-red around the body (not a blobby silhouette)
    const m = new PixBuf(64, 64); m.blit(p, 0, 0);
    for (let i = 0; i < n; i++) {
      const x = 6 + Math.floor(hash2(i, 1, seed) * 52), y = 30 + Math.floor(hash2(i, 2, seed) * 32);
      if (!m.has(x, y) && (m.has(x + 1, y) || m.has(x - 1, y) || m.has(x, y + 1) || m.has(x, y - 1) || m.has(x + 2, y) || m.has(x - 2, y))) p.set(x, y, BLOOD[i % 3]);
    }
    return p;
  };
  out['sewer.die'] = [
    finish(splat(transform(base({ mouth: 1 }), 0.38, 1, 1), 10, 51)),
    finish(splat(transform(base({ mouth: 1, tongue: 1 }), 1.0, 0.95, 0.95), 18, 52)),
    finish(splat(transform(base({ mouth: 1, tongue: 1 }), 1.5, 0.95, 0.8), 26, 53)),
  ];
  out['sewer.dead'] = [finish(splat(transform(base({ mouth: 1, tongue: 1, pl: 2, pr: 0 }), 1.62, 0.95, 0.72), 30, 54))];
  return out;
}

// ───────────── PANZER RAT ─────────────
const GUN = ramp(ink('#4a5262', { gloss: 0.5 }), 4, 0.5);
const PFUR = ramp('#80706a', 4, 0.45);
const COAT = ramp('#6b7468', 4, 0.45);
const COATD = ramp('#474e47', 4, 0.4);
const BOOT = ramp('#34303c', 4, 0.5).map((c) => ({ ...c, gloss: 0.2 }));
const PSTEEL = ramp(ink('#6f7a8c', { gloss: 0.55, spark: 0.12 }), 4, 0.5);
const BRASS = ramp(ink('#c9a13a', { gloss: 0.5, spark: 0.3 }), 4, 0.45);
const GLOVE = ramp('#3d3540', 4, 0.5);
const RED = ramp('#c21f24', 4, 0.4);
const FOND = [ink('#e07a10', { emit: 0.8 }), ink('#ffb21a', { emit: 1 }), ink('#ffd84a', { emit: 1 }), ink('#fff0a0', { emit: 1 })];

function pcannon(p, c) {
  // barrel from the shoulder (sx,sy) out to the muzzle (mx,my); muzzle ring radius mr
  const { sx, sy, mx, my, mr, glow, recoil = 0 } = c;
  const ang = Math.atan2(my - sy, mx - sx), nx = -Math.sin(ang), ny = Math.cos(ang), w = mr * 0.8 + 1.5;
  const bsx = sx - Math.cos(ang) * recoil, bsy = sy - Math.sin(ang) * recoil;
  lpoly(p, [[bsx + nx * w, bsy + ny * w], [mx + nx * w, my + ny * w], [mx - nx * w, my - ny * w], [bsx - nx * w, bsy - ny * w]], GUN);
  // brass bands
  for (const t of [0.35, 0.7]) {
    const bx = bsx + (mx - bsx) * t, by = bsy + (my - bsy) * t;
    p.line(bx + nx * w, by + ny * w, bx - nx * w, by - ny * w, BRASS[2]);
  }
  // muzzle ring
  blob(p, mx, my, mr + 1, mr + 1, PSTEEL);
  blob(p, mx, my, mr - 1, mr - 1, glow ? [FOND[0], FOND[1], FOND[2], FOND[2]] : ['#241018', '#33141c', '#4a2020', '#5a2a1c'], { edge: EDGE });
  if (glow) blob(p, mx - 0.5, my - 0.5, Math.max(1, mr - 3), Math.max(1, mr - 3), [FOND[2], FOND[3], FOND[3], FOND[3]], { edge: null });
}

function pmuzzleDrips(p, mx, my, mr, n = 3) {
  for (let i = 0; i < n; i++) {
    const x = Math.round(mx - mr + 1 + i * (mr * 2 - 2) / Math.max(1, n - 1)), len = 3 + ((i * 5) % 4);
    for (let k = 0; k < len; k++) p.set(x, Math.round(my + mr + k - 0), FOND[k > len - 2 ? 2 : 1]);
    p.set(x, Math.round(my + mr + len), FOND[3]);
  }
}

function panzerPose(o = {}) {
  const { dy = 0, ll = 0, rl = 0, swing = 0, cannon = 'carry', hx = 0, hy = 0, eyes = 'open', mouth = 0, lean = 0, blast = 0, smoke = 0, wob = 0 } = o;
  const p = new PixBuf(64, 64);
  const fo = { grain: 0.2, seed: 21 };
  // legs + boots
  const leg = (cx, lift) => {
    lpoly(p, rrect(cx - 5, 41 + dy, 10, 15 - lift, 2), COATD, { grain: 0.15, seed: 4 });
    const by = 55 - lift;
    lpoly(p, rrect(cx - 6, by, 12, 9 - 0 + (lift ? 0 : 0) - (by + 9 > 63 ? by + 9 - 63 : 0), 2), BOOT);
    p.hline(cx - 5, by + 1, 6, BOOT[3]);
    p.hline(cx - 5, by + 4, 10, BRASS[1]);   // buckle strap
  };
  leg(24 + lean * 0.5, ll); leg(40 + lean * 0.5, rl);
  // torso
  const tx = lean;
  lpoly(p, rrect(14 + tx, 24 + dy, 36, 24, 5), COAT, fo);
  // belt
  p.rect(16 + tx, 43 + dy, 32, 4, EDGE); p.rect(17 + tx, 44 + dy, 30, 2, GLOVE[2]);
  p.rect(29 + tx, 43 + dy, 6, 5, EDGE); p.rect(30 + tx, 44 + dy, 4, 3, BRASS[2]); dot(p, 31 + tx, 45 + dy, BRASS[3]);
  // riveted steel breastplate
  lpoly(p, [[19 + tx, 24 + dy], [45 + tx, 24 + dy], [47 + tx, 32 + dy], [43 + tx, 42 + dy], [21 + tx, 42 + dy], [17 + tx, 32 + dy]], PSTEEL);
  p.vline(32 + tx, 26 + dy, 15, PSTEEL[1]); p.vline(31 + tx, 26 + dy, 15, PSTEEL[3]);
  for (const [rx, ry] of [[21, 27], [43, 27], [19, 33], [45, 33], [23, 39], [41, 39]]) { dot(p, rx + tx, ry + dy, PSTEEL[3]); dot(p, rx + tx + 1, ry + dy + 1, EDGE); }
  // cheese-wedge stamp on the plate
  p.poly([[26 + tx, 35 + dy], [38 + tx, 35 + dy], [38 + tx, 28 + dy]], EDGE);
  p.poly([[27 + tx, 34 + dy], [37 + tx, 34 + dy], [37 + tx, 29 + dy]], FOND[1]);
  dot(p, 34 + tx, 32 + dy, EDGE); dot(p, 36 + tx, 33 + dy, EDGE); dot(p, 31 + tx, 33 + dy, EDGE);
  // right arm (screen right): hangs, red armband, glove
  const sw = swing;
  lpoly(p, rrect(46 + tx, 26 + dy, 9, 17 + sw, 3), COAT, fo);
  p.rect(46 + tx, 32 + dy, 9, 4, EDGE); p.rect(47 + tx, 33 + dy, 7, 2, RED[2]);
  dot(p, 50 + tx, 33 + dy, '#f2f0e8'); dot(p, 51 + tx, 34 + dy, '#f2f0e8');
  blob(p, 50.5 + tx, 46 + dy + sw, 4.5, 4, GLOVE);
  // shoulder pauldrons
  blob(p, 49 + tx, 25 + dy, 7, 5, PSTEEL);
  // head
  const hX = 32 + hx + lean * 0.5, hY = 13 + hy + dy;
  blob(p, hX - 11, hY - 3, 4.5, 5, PFUR, fo); blob(p, hX + 11, hY - 3, 4.5, 5, PFUR, fo);
  blob(p, hX - 11, hY - 2.5, 2.5, 3.2, SKIN, { edge: null }); blob(p, hX + 11, hY - 2.5, 2.5, 3.2, SKIN, { edge: null });
  blob(p, hX, hY, 11, 10, PFUR, fo);
  blob(p, hX, hY + 6, 6.5, 5, ramp('#9a8880', 4, 0.4), { grain: 0.1, seed: 2 });
  blob(p, hX, hY + 3.5, 2.8, 2, SKIN);
  dot(p, hX - 1, hY + 2, '#ffd6d9');
  // teeth / mouth
  if (mouth) {
    p.rect(Math.round(hX - 4), Math.round(hY + 8), 8, 3, '#3a0a14');
    p.rect(Math.round(hX - 3), Math.round(hY + 8), 2, 3, TEETH[3]); p.rect(Math.round(hX + 1), Math.round(hY + 8), 2, 3, TEETH[3]);
  } else {
    p.hline(Math.round(hX - 4), Math.round(hY + 9), 8, EDGE);
    p.rect(Math.round(hX - 2), Math.round(hY + 9), 2, 3, EDGE); p.rect(Math.round(hX), Math.round(hY + 9), 2, 3, EDGE);
    p.rect(Math.round(hX - 2), Math.round(hY + 9), 2, 2, TEETH[3]); p.rect(Math.round(hX), Math.round(hY + 9), 2, 2, TEETH[3]);
  }
  // whiskers
  const W = '#e8d9c8';
  for (const s of [-1, 1]) { p.line(hX + s * 5, hY + 6, hX + s * 13, hY + 4, W); p.line(hX + s * 5, hY + 8, hX + s * 13, hY + 9, W); }
  // steel helmet with strap and welding goggles
  lpoly(p, [[hX - 11, hY - 1], [hX - 10, hY - 7], [hX - 6, hY - 10], [hX + 6, hY - 10], [hX + 10, hY - 7], [hX + 11, hY - 1], [hX + 8, hY - 3], [hX - 8, hY - 3]], PSTEEL);
  p.hline(Math.round(hX - 11), Math.round(hY - 1), 22, EDGE);
  dot(p, hX - 6, hY - 6, PSTEEL[3]); dot(p, hX + 6, hY - 6, PSTEEL[2]); dot(p, hX, hY - 9, PSTEEL[3]);
  // cheese wedge emblem on helmet
  p.poly([[hX - 2, hY - 3], [hX + 3, hY - 3], [hX + 3, hY - 7]], EDGE);
  p.poly([[hX - 1, hY - 4], [hX + 2, hY - 4], [hX + 2, hY - 6]], FOND[1]);
  for (const s of [-1, 1]) {
    const gx = Math.round(hX + s * 4.5), gy = Math.round(hY + 0.5);
    blob(p, gx, gy, 4, 3.5, BRASS);
    if (eyes === 'open') {
      blob(p, gx, gy, 2.6, 2.3, ['#0f2a1a', '#1d4a2a', '#2f7a3c', '#52b060'], { edge: EDGE });
      dot(p, gx - 1, gy - 1, '#d8ffd8');
      dot(p, gx + (s < 0 ? 1 : 0), gy, ink('#ff3030', { emit: 0.8 }));
    } else {
      blob(p, gx, gy, 2.6, 2.3, ['#0a1a10', '#12281a', '#1d4a2a', '#2f7a3c'], { edge: EDGE });
      p.line(gx - 2, gy - 1, gx + 2, gy + 1, EDGE); p.line(gx + 2, gy - 1, gx - 2, gy + 1, EDGE);
    }
  }
  p.hline(Math.round(hX - 11), Math.round(hY + 0), 3, GLOVE[1]); p.hline(Math.round(hX + 8), Math.round(hY + 0), 3, GLOVE[1]);
  p.hline(Math.round(hX - 1), Math.round(hY + 0), 2, BRASS[1]);
  // left shoulder pauldron + cannon (screen left)
  const cn = {
    carry: { sx: 24, sy: 33, mx: 7, my: 15, mr: 4.5, glow: 0 },
    aim:   { sx: 21, sy: 29, mx: 10, my: 21, mr: 6, glow: 1 },
    fire:  { sx: 21, sy: 29, mx: 10, my: 21, mr: 6, glow: 1, recoil: 3 },
    recoil:{ sx: 22, sy: 30, mx: 11, my: 19, mr: 5, glow: 1, recoil: 2 },
  }[cannon];
  const csh = { sx: cn.sx + tx, sy: cn.sy + dy, mx: cn.mx + tx, my: cn.my + dy };
  blob(p, 15 + tx, 28 + dy, 7, 5.5, PSTEEL);
  pcannon(p, { ...cn, ...csh });
  blob(p, 19 + tx, 35 + dy, 4.5, 4, GLOVE);
  if (cannon === 'carry') pmuzzleDrips(p, csh.mx, csh.my, 4.5, 2);
  if (cannon === 'aim') pmuzzleDrips(p, csh.mx, csh.my, 6, 3);
  if (smoke) {
    for (const [x, y, r, t] of [[csh.mx - 1, csh.my - 3, 4, 0], [csh.mx - 4, csh.my - 7, 3, 1], [csh.mx + 3, csh.my - 8, 3, 2]]) {
      blob(p, x, y, r, r, ['#46464f', '#62626d', '#80808c', '#a6a6b2'], { edge: null, grain: 0.3, seed: 40 + t });
    }
  }
  if (blast) {
    const bx = csh.mx - 1, by = csh.my;
    const rays = 12;
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2 + 0.2, L = (i % 2 ? 10 : 15);
      for (let r = 4; r < L; r++) p.set(Math.round(bx + Math.cos(a) * r), Math.round(by + Math.sin(a) * r), r < L * 0.55 ? FOND[3] : r < L * 0.8 ? FOND[2] : FOND[1]);
    }
    blob(p, bx, by, 7, 7, [FOND[0], FOND[1], FOND[2], FOND[3]], { edge: null });
    blob(p, bx - 1, by - 1, 4, 4, [FOND[3], FOND[3], FOND[3], FOND[3]], { edge: null });
  }
  return p;
}

const PANZER = {
  idle: { cannon: 'carry' },
  walk: [
    { dy: 0, ll: 0, rl: 4, swing: 1, lean: 0, cannon: 'carry' },
    { dy: -1, ll: 0, rl: 0, swing: 0, cannon: 'carry' },
    { dy: 0, ll: 4, rl: 0, swing: -1, lean: 0, cannon: 'carry' },
    { dy: -1, ll: 0, rl: 0, swing: 0, cannon: 'carry' },
  ],
  attack: [
    { cannon: 'aim', hy: 0, lean: -1 },
    { cannon: 'fire', blast: 1, lean: 1, hy: 1 },
    { cannon: 'recoil', smoke: 1, lean: 1, hy: 0 },
  ],
  pain: { cannon: 'carry', hx: 2, hy: -2, eyes: 'shut', mouth: 1, lean: 2, dy: 1 },
};

function buildPanzer() {
  const out = {};
  out['panzer.idle'] = [finish(panzerPose(PANZER.idle))];
  out['panzer.walk'] = PANZER.walk.map((o) => finish(panzerPose(o)));
  out['panzer.attack'] = PANZER.attack.map((o) => finish(panzerPose(o)));
  out['panzer.pain'] = [finish(panzerPose(PANZER.pain))];
  const base = (e) => panzerPose({ ...PANZER.pain, eyes: 'shut', mouth: 1, ...e });
  out['panzer.die'] = [
    finish(transform(base({ cannon: 'recoil' }), 0.14, 1, 1)),
    finish(transform(base({ cannon: 'carry', lean: 3 }), 0.5, 0.95, 0.95)),
    finish(transform(base({ cannon: 'carry', lean: 3 }), 1.05, 0.9, 0.85)),
    finish(transform(base({ cannon: 'carry', lean: 3 }), 1.5, 0.85, 0.7)),
  ];
  const dead = transform(base({ cannon: 'carry', lean: 3 }), 1.57, 0.85, 0.65);
  // spilled molten cheese pooling under the fallen rat
  const pool = new PixBuf(64, 64);
  pool.ellipse(30, 61, 22, 2.5, EDGE); pool.ellipse(30, 61, 21, 1.6, FOND[0]); pool.ellipse(26, 61, 14, 1.0, FOND[1]); pool.ellipse(22, 60.6, 6, 0.6, FOND[2]);
  const comp = new PixBuf(64, 64).blit(pool).blit(dead);
  out['panzer.dead'] = [finish(comp)];
  return out;
}

export function build() {
  return { ...buildSewer(), ...buildPanzer() };
}
