// HUD — status plaques, view-model paws, crosshair, messages, damage arcs, flashes (ARCHITECTURE §12).
// Draws into the 480×270 2D `#hud` canvas. Browser-only at draw time; importing it touches no DOM.
//
// Layout (original): top-left score plaque + nine life pips; top-right level name + key slots;
// bottom-left cat portrait in a cheese-wheel medallion + health number + segmented "cheese" bar;
// bottom-right weapon silhouette/name + ammo + weapon slot pips; centre: paws view-model, crosshair,
// damage arcs around the crosshair, message ticker under the top plaques.
import { VIEW, WEAPONS, AMMO_MAX, LEVELS, START } from '../core/defs.js';
import { markExplored } from './automap.js';

// ── font: ui-font writes font.js concurrently; fall back to canvas text until/unless it exists ──
let font = null;
import('./font.js').then((m) => { if (m && typeof m.drawText === 'function') font = m; }).catch(() => {});

const FALLBACK_PX = 8;
export function text(ctx, s, x, y, o = {}) {
  s = String(s);
  const scale = o.scale || 1, color = o.color || '#fff', shadow = o.shadow === undefined ? '#000' : o.shadow;
  if (font) { font.drawText(ctx, s, x | 0, y | 0, { scale, color, shadow, align: o.align || 'left' }); return; }
  ctx.save();
  ctx.font = `bold ${FALLBACK_PX * scale}px monospace`;
  ctx.textBaseline = 'top';
  ctx.textAlign = o.align || 'left';
  if (shadow) { ctx.fillStyle = shadow; ctx.fillText(s, (x | 0) + scale, (y | 0) + scale); }
  ctx.fillStyle = color; ctx.fillText(s, x | 0, y | 0);
  ctx.restore();
}
export function textWidth(s, scale = 1) {
  s = String(s);
  if (font && font.measureText) return font.measureText(s, scale);
  return s.length * 6 * scale;
}

// ── palette ──
const C = {
  ink: '#1a1420', plum: 'rgba(26,20,32,0.72)', plumHi: 'rgba(60,44,64,0.72)',
  orange: '#f08a1c', stripe: '#c25a0e', cream: '#fde3b0', cheddar: '#f2a91e', swiss: '#f6dc6a',
  red: '#c21f24', hot: '#ff4a3a', gold: '#ffd23e', steel: '#8d98a8', green: '#7ad04a', nip: '#9cff6a', dim: '#6a5a6e',
};

// ── tiny deterministic UI PRNG (sim randomness must use game.rng; UI cosmetics stay out of it) ──
let seed = 0x2545f491;
const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

// ── PixBuf → canvas conversion with cache ──
function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}
function pixToCanvas(pb) {
  const c = makeCanvas(pb.w, pb.h);
  const g = c.getContext('2d');
  const id = g.createImageData(pb.w, pb.h);
  id.data.set(pb.rgba);
  g.putImageData(id, 0, 0);
  return c;
}

// ── procedural placeholders used when the atlas lacks an image (or only has the registry's checker) ──
function ph(w, h, fn) { const c = makeCanvas(w, h); const g = c.getContext('2d'); fn(g, w, h); return c; }
const disc = (g, x, y, r, col) => { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
function placeholder(name, frame) {
  if (name === 'hud.face') return ph(32, 32, (g) => {
    const tier = frame < 20 ? (frame / 4) | 0 : 0, v = frame < 20 ? frame % 4 : -1;
    g.fillStyle = C.orange; g.beginPath(); g.moveTo(5, 13); g.lineTo(7, 2); g.lineTo(14, 8); g.lineTo(18, 8); g.lineTo(25, 2); g.lineTo(27, 13); g.fill();
    disc(g, 16, 18, 12, C.orange);
    g.fillStyle = C.stripe; g.fillRect(14, 6, 4, 4); g.fillRect(6, 15, 4, 2); g.fillRect(22, 15, 4, 2);
    disc(g, 16, 24, 6, C.cream);
    const ex = v === 1 ? -2 : v === 2 ? 2 : 0;
    if (frame === 21) { g.fillStyle = C.ink; g.fillRect(9, 14, 5, 1); g.fillRect(18, 14, 5, 1); g.fillStyle = '#e86a8a'; g.fillRect(15, 26, 3, 3); }
    else if (v === 3) { g.fillStyle = C.ink; g.fillRect(9, 15, 5, 1); g.fillRect(18, 15, 5, 1); g.fillRect(13, 24, 6, 4); }
    else {
      const big = frame === 22 ? 4 : 3;
      g.fillStyle = frame === 22 ? C.nip : '#bfe05a'; g.fillRect(9, 13, 5, 4); g.fillRect(18, 13, 5, 4);
      g.fillStyle = C.ink; g.fillRect(11 + ex - (big > 3 ? 1 : 0), 13, big - 1, 4); g.fillRect(20 + ex - (big > 3 ? 1 : 0), 13, big - 1, 4);
      g.fillStyle = C.ink; g.fillRect(12, 25, 8, 1); if (frame === 20 || frame === 22) { g.fillRect(12, 25, 8, 3); g.fillStyle = '#fff'; g.fillRect(13, 25, 6, 1); }
    }
    g.fillStyle = '#e86a8a'; g.fillRect(15, 21, 2, 2);
    if (tier >= 2) { g.fillStyle = '#fff'; g.fillRect(22, 4, 6, 3); }                // bandage
    if (tier >= 3) { g.fillStyle = '#4a2a5a'; g.fillRect(8, 12, 7, 6); }             // black eye
    if (tier >= 1) { g.fillStyle = C.red; for (let i = 0; i < tier; i++) g.fillRect(6 + i * 2, 20 + i, 3, 1); }
  });
  if (name === 'hud.icon.life') return ph(9, 9, (g) => {
    const col = frame ? '#5a5060' : C.orange;
    g.fillStyle = col; g.fillRect(1, 0, 2, 3); g.fillRect(6, 0, 2, 3); g.fillRect(1, 2, 7, 6); g.fillRect(0, 3, 9, 4);
    if (!frame) { g.fillStyle = C.ink; g.fillRect(2, 4, 1, 1); g.fillRect(6, 4, 1, 1); g.fillStyle = C.cream; g.fillRect(3, 6, 3, 1); }
  });
  if (name === 'hud.icon.key_gold' || name === 'hud.icon.key_silver') return ph(12, 12, (g) => {
    const col = name.endsWith('gold') ? C.gold : '#d8e0ec';
    disc(g, 3.5, 3.5, 3, col); g.fillStyle = C.ink; g.fillRect(3, 3, 1, 1);
    g.fillStyle = col; g.fillRect(5, 5, 2, 2); g.fillRect(6, 6, 2, 2); g.fillRect(7, 7, 2, 2); g.fillRect(8, 8, 3, 2); g.fillRect(9, 10, 1, 2);
  });
  if (name === 'hud.icon.ammo') return ph(12, 12, (g) => {
    if (frame === 0) { disc(g, 6, 6, 4.5, '#b88a5a'); g.fillStyle = '#8a6040'; g.fillRect(3, 5, 6, 1); g.fillRect(5, 3, 1, 6); }
    else if (frame === 1) { disc(g, 6, 6, 4.5, '#ff6aa8'); g.fillStyle = '#c23a78'; g.fillRect(2, 5, 8, 1); g.fillRect(3, 8, 6, 1); }
    else { g.fillStyle = C.red; g.fillRect(3, 2, 6, 9); g.fillStyle = '#ddd'; g.fillRect(5, 1, 2, 1); g.fillStyle = C.gold; g.fillRect(4, 5, 4, 2); }
  });
  if (name === 'hud.icon.weapon') return ph(28, 14, (g) => {
    g.fillStyle = C.cream;
    if (frame === 0) { for (let i = 0; i < 3; i++) { g.fillRect(6 + i * 6, 2, 2, 10); g.fillRect(8 + i * 6, 1, 1, 3); } }
    else if (frame === 1) { g.fillRect(4, 4, 16, 4); g.fillRect(6, 8, 4, 5); disc(g, 22, 6, 3, '#b88a5a'); }
    else if (frame === 2) { g.fillRect(2, 3, 20, 2); g.fillRect(2, 6, 20, 2); g.fillRect(2, 9, 20, 2); g.fillRect(20, 2, 6, 10); }
    else if (frame === 3) { g.fillRect(3, 3, 18, 8); disc(g, 22, 7, 4, '#ff6aa8'); }
    else { g.fillRect(3, 6, 20, 3); g.fillStyle = C.hot; g.fillRect(23, 6, 3, 3); }
  });
  if (name.startsWith('wpn.')) return ph(128, 128, (g) => {
    const id = name.split('.')[1], firing = name.endsWith('.fire');
    const paw = (x, y) => { disc(g, x, y, 15, C.orange); g.fillStyle = C.stripe; g.fillRect(x - 10, y + 2, 20, 3); disc(g, x, y - 12, 6, C.cream); };
    if (id === 'claws') {
      paw(34, 112); paw(94 - (firing ? 20 : 0), 108 - (firing ? 18 : 0));
      g.fillStyle = '#fff'; for (let i = 0; i < 3; i++) { g.fillRect(28 + i * 5, 92, 2, 6); g.fillRect(88 + i * 5 - (firing ? 20 : 0), 86 - (firing ? 18 : 0), 2, 6); }
      if (firing && frame === 1) { g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2; g.beginPath(); g.arc(64, 120, 60, -2.4, -0.8); g.stroke(); }
    } else {
      const col = id === 'laser' ? '#c8d0dc' : id === 'yarn' ? '#7a5a3a' : '#6b7468';
      const len = id === 'gatling' ? 70 : id === 'yarn' ? 60 : 50, wid = id === 'gatling' || id === 'yarn' ? 26 : 16;
      g.fillStyle = C.ink; g.fillRect(64 - wid / 2 - 1, 128 - len - 1, wid + 2, len + 1);
      g.fillStyle = col; g.fillRect(64 - wid / 2, 128 - len, wid, len);
      g.fillStyle = '#ffffff40'; g.fillRect(64 - wid / 2 + 2, 128 - len, 3, len);
      if (id === 'yarn') disc(g, 64, 128 - len + 4, 10, '#ff6aa8');
      if (id === 'pistol') disc(g, 64, 128 - len + 6, 6, '#b88a5a');
      if (firing && frame === 0) {
        const fc = id === 'laser' ? C.hot : C.swiss;
        g.fillStyle = fc; g.beginPath();
        for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, r = i & 1 ? 8 : 20; g.lineTo(64 + Math.cos(a) * r, 128 - len - 8 + Math.sin(a) * r); }
        g.fill(); disc(g, 64, 128 - len - 8, 6, '#fff');
      }
      paw(64 - wid / 2 - 8, 116); if (id === 'gatling' || id === 'yarn') paw(64 + wid / 2 + 8, 118);
    }
  });
  return null;
}

/** Image lookup over the atlas, cached as canvases. Falls back to procedural placeholders. */
export function createImageCache(atlas) {
  const cache = new Map();
  const missing = new Set(atlas && atlas.missing ? atlas.missing : []);
  return function get(name, frame = 0) {
    const key = name + '#' + frame;
    let c = cache.get(key);
    if (c !== undefined) return c;
    c = null;
    try {
      const frames = !missing.has(name) && atlas && atlas.images && atlas.images.get && atlas.images.get(name);
      const pb = frames && frames.length ? frames[Math.min(frames.length - 1, Math.max(0, frame | 0))] : null;
      if (pb && pb.rgba) c = pixToCanvas(pb);
    } catch { c = null; }
    if (!c) { try { c = placeholder(name, frame | 0); } catch { c = null; } }
    cache.set(key, c);
    return c;
  };
}
function frameCount(atlas, name, fallback) {
  try {
    if (atlas && atlas.missing && atlas.missing.includes(name)) return fallback;
    const f = atlas && atlas.images && atlas.images.get && atlas.images.get(name);
    if (f && f.length) return f.length;
  } catch { /* ignore */ }
  return fallback;
}

// ── drawing helpers ──
/** Plaque: translucent plum panel, 1px ink outline, warm top highlight, chamfered corners. */
function plaque(ctx, x, y, w, h, accent = C.stripe) {
  x |= 0; y |= 0; w |= 0; h |= 0;
  ctx.fillStyle = C.plum;
  ctx.fillRect(x + 2, y, w - 4, h); ctx.fillRect(x, y + 2, w, h - 4); ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = C.ink;
  ctx.fillRect(x + 2, y - 1, w - 4, 1); ctx.fillRect(x + 2, y + h, w - 4, 1);
  ctx.fillRect(x - 1, y + 2, 1, h - 4); ctx.fillRect(x + w, y + 2, 1, h - 4);
  ctx.fillRect(x, y + 1, 1, 1); ctx.fillRect(x + w - 1, y + 1, 1, 1); ctx.fillRect(x, y + h - 2, 1, 1); ctx.fillRect(x + w - 1, y + h - 2, 1, 1);
  ctx.fillStyle = accent; ctx.fillRect(x + 2, y, w - 4, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + 2, y + h - 1, w - 4, 1);
}
function dots(ctx, cx, cy, r, a0, a1, size, col) {
  ctx.fillStyle = col;
  const n = Math.max(3, Math.ceil(Math.abs(a1 - a0) * r / (size * 0.8)));
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * (i / n);
    ctx.fillRect(Math.round(cx + Math.cos(a) * r - size / 2), Math.round(cy + Math.sin(a) * r - size / 2), size, size);
  }
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ease = (t) => 1 - (1 - t) * (1 - t);

const MSG_COL = { info: '#ffffff', pickup: C.swiss, secret: C.gold, warn: C.hot };

/** createHud(atlas) → { draw(ctx, game, dt), onEvent(type, payload) } */
export function createHud(atlas) {
  const img = createImageCache(atlas);
  const fireFrames = WEAPONS.map((w) => frameCount(atlas, `wpn.${w.id}.fire`, w.fireFrames));
  const tintCanvas = { c: null, g: null };

  const st = {
    time: 0,
    msgs: [],                     // { text, kind, t }
    arcs: [],                     // { angle, t, amount }
    edge: null,                   // { r,g,b, a, t, life }
    ouchT: 0, grinT: 0, lookT: 0.8, look: 0,
    shownScore: null, lastHealth: null, healthFlashT: 0,
    weaponFlashT: 0,
    bobPhase: 0, bobAmp: 0, lastX: null, lastY: null,
    secretT: 0,
  };

  function pushMsg(textStr, kind = 'info') {
    if (!textStr) return;
    const prev = st.msgs[st.msgs.length - 1];
    if (prev && prev.text === textStr && prev.t < 1.5) { prev.t = 0; prev.count = (prev.count || 1) + 1; return; }
    st.msgs.push({ text: String(textStr), kind, t: 0, count: 1 });
    while (st.msgs.length > 4) st.msgs.shift();
  }
  function edgeFlash(r, g, b, a, life) { st.edge = { r, g, b, a, t: 0, life }; }

  function onEvent(type, p = {}) {
    p = p || {};
    switch (type) {
      case 'msg': pushMsg(p.text, p.kind || 'info'); if (p.kind === 'secret') st.secretT = 1.2; break;
      case 'hurt':
        st.ouchT = 0.45;
        if (typeof p.angle === 'number' && isFinite(p.angle)) st.arcs.push({ angle: p.angle, t: 0, amount: p.amount || 10 });
        while (st.arcs.length > 6) st.arcs.shift();
        edgeFlash(255, 40, 30, clamp(0.25 + (p.amount || 10) / 60, 0.25, 0.7), 0.35);
        break;
      case 'pickup': st.grinT = 1.0; edgeFlash(255, 210, 62, 0.35, 0.3); break;
      case 'flash': edgeFlash(clamp((p.r ?? 1) * 255, 0, 255), clamp((p.g ?? 1) * 255, 0, 255), clamp((p.b ?? 1) * 255, 0, 255), clamp(p.a ?? 0.4, 0, 1), 0.3); break;
      case 'weapon': st.weaponFlashT = 0.6; break;
      case 'secret': st.secretT = 1.2; break;
      case 'playerDied': st.arcs.length = 0; break;
      default: break;
    }
  }

  function faceFrame(player) {
    const hp = player.health ?? 100;
    if (player.dead || hp <= 0) return 21;
    if (st.ouchT > 0) return tierOf(hp) * 4 + 3;
    if (st.grinT > 0) return 20;
    if (hp > 100) return 22;
    return tierOf(hp) * 4 + st.look;
  }
  const tierOf = (hp) => (hp >= 80 ? 0 : hp >= 60 ? 1 : hp >= 40 ? 2 : hp >= 20 ? 3 : 4);

  // ── sections ──
  function drawTopLeft(ctx, game, player) {
    const score = player.score | 0;
    if (st.shownScore === null || st.shownScore > score) st.shownScore = score;
    const diff = score - st.shownScore;
    if (diff > 0) st.shownScore = Math.min(score, st.shownScore + Math.max(1, Math.ceil(diff * 0.12)));
    const lives = clamp(player.lives ?? START.lives, 0, 99);
    plaque(ctx, 6, 6, 100, 30);
    text(ctx, 'SCORE', 11, 9, { color: C.cheddar });
    text(ctx, String(st.shownScore).padStart(7, '0'), 101, 9, { color: diff > 0 ? C.gold : C.cream, align: 'right' });
    // nine life pips; extra lives beyond nine shown as "+n"
    for (let i = 0; i < 9; i++) {
      const pip = img('hud.icon.life', i < lives ? 0 : 1);
      if (pip) ctx.drawImage(pip, 11 + i * 10, 22);
    }
    if (lives > 9) text(ctx, '+' + (lives - 9), 104, 23, { color: C.orange, align: 'right' });
  }

  function drawTopRight(ctx, game, player, W) {
    const name = levelName(game);
    const w = Math.max(84, textWidth(name) + 14);
    plaque(ctx, W - 6 - w, 6, w, 30);
    text(ctx, name, W - 11, 9, { color: C.cream, align: 'right' });
    const keys = player.keys || {};
    const slots = [['gold', 'hud.icon.key_gold'], ['silver', 'hud.icon.key_silver']];
    slots.forEach(([k, n], i) => {
      const x = W - 11 - 12 - i * 16, y = 21;
      if (keys[k]) {
        const im = img(n); if (im) ctx.drawImage(im, x, y);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x + 1, y + 1, 10, 10);
        ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(x + 2, y + 2, 8, 8);
      }
    });
    const stats = game.stats;
    if (stats && st.secretT > 0) text(ctx, 'SECRET!', W - 47, 23, { color: (st.time * 8 | 0) & 1 ? C.gold : C.swiss, align: 'right' });
  }

  function levelName(game) {
    const d = game.world && game.world.def;
    if (d && d.name) return d.name;
    const L = LEVELS[game.levelIndex | 0];
    return L ? L[1] : '';
  }

  function drawBottomLeft(ctx, game, player, H) {
    const hp = Math.round(player.health ?? 0);
    const x = 6, y = H - 42;
    plaque(ctx, x + 22, y + 6, 112, 30, C.stripe);
    // cheese-wheel medallion behind the portrait
    const mx = x + 20, my = y + 21;
    disc(ctx, mx, my, 20, C.ink);
    disc(ctx, mx, my, 19, C.stripe);
    disc(ctx, mx, my, 17, C.cheddar);
    disc(ctx, mx, my, 16, '#3a2a30');
    ctx.fillStyle = C.swiss;
    for (const [hx, hy] of [[-13, -7], [12, 9], [-6, 14], [14, -6]]) { ctx.fillRect(mx + hx - 1, my + hy - 1, 2, 2); }
    const face = img('hud.face', faceFrame(player));
    if (face) {
      if (st.ouchT > 0) ctx.drawImage(face, mx - 16 + (((st.time * 40) | 0) & 1 ? 1 : -1), my - 16);
      else ctx.drawImage(face, mx - 16, my - 16);
    }
    // number
    const low = hp < 25 && hp > 0;
    const blink = low && ((st.time * 4) | 0) & 1;
    const nip = hp > 100;
    const col = hp <= 0 ? C.dim : blink ? C.hot : nip ? C.nip : st.healthFlashT > 0 ? '#fff' : C.cream;
    text(ctx, 'HEALTH', x + 46, y + 10, { color: C.cheddar });
    text(ctx, String(Math.max(0, hp)), x + 129, y + 9, { scale: 2, color: col, align: 'right' });
    // cheese bar: 10 segments of 10 hp (catnip overflow glows green over them)
    const bx = x + 46, by = y + 26;
    for (let i = 0; i < 10; i++) {
      const v = clamp((hp - i * 10) / 10, 0, 1), sx = bx + i * 7;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(sx, by, 6, 5);
      if (v > 0) {
        const segCol = hp >= 60 ? C.cheddar : hp >= 25 ? '#e0761a' : C.red;
        const wv = Math.max(1, Math.round(6 * v));
        ctx.fillStyle = segCol; ctx.fillRect(sx, by, wv, 5);
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(sx, by, wv, 1);
        if (wv >= 4 && (i & 1)) { ctx.fillStyle = 'rgba(80,40,0,0.45)'; ctx.fillRect(sx + 2, by + 2, 2, 2); }   // swiss hole
      }
      const extra = clamp((hp - 100 - i * 5) / 5, 0, 1);
      if (extra > 0) { ctx.fillStyle = `rgba(156,255,106,${0.5 + 0.3 * Math.sin(st.time * 6 + i)})`; ctx.fillRect(sx, by, Math.round(6 * extra), 5); }
    }
  }

  function drawBottomRight(ctx, game, player, W, H) {
    const wi = clamp(player.weapon ?? START.weapon, 0, WEAPONS.length - 1);
    const wdef = WEAPONS[wi];
    const x = W - 6 - 138, y = H - 42 + 6, w = 138, h = 30;
    plaque(ctx, x, y, w, h, st.weaponFlashT > 0 && ((st.time * 10) | 0) & 1 ? C.gold : C.stripe);
    // weapon silhouette + name
    const wic = img('hud.icon.weapon', wi);
    if (wic) ctx.drawImage(wic, x + 5, y + 3);
    text(ctx, wdef.name.toUpperCase(), x + 38, y + 4, { color: st.weaponFlashT > 0 ? C.gold : C.cheddar });
    // slot pips 1..5
    const owned = player.owned || START.owned;
    for (let i = 0; i < WEAPONS.length; i++) {
      const px = x + 6 + i * 6, py = y + 21;
      ctx.fillStyle = i === wi ? C.gold : owned[i] ? C.cream : 'rgba(255,255,255,0.15)';
      ctx.fillRect(px, py, 4, 4);
      if (i === wi) { ctx.fillStyle = C.ink; ctx.fillRect(px + 1, py + 1, 2, 2); ctx.fillStyle = C.orange; ctx.fillRect(px + 1, py + 1, 2, 2); }
    }
    // ammo
    if (wdef.ammo) {
      const a = Math.round((player.ammo && player.ammo[wdef.ammo]) ?? 0);
      const max = AMMO_MAX[wdef.ammo] || 99;
      const low = a <= Math.max(3, max * 0.08);
      const col = a <= 0 ? C.hot : low && ((st.time * 4) | 0) & 1 ? C.hot : C.cream;
      const ai = img('hud.icon.ammo', wdef.ammo === 'hair' ? 0 : wdef.ammo === 'yarn' ? 1 : 2);
      text(ctx, String(a), x + w - 20, y + 15, { scale: 2, color: col, align: 'right' });
      if (ai) ctx.drawImage(ai, x + w - 16, y + 16);
      // ammo gauge
      const gx = x + 40, gy = y + 26, gw = 36;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(gx, gy, gw, 2);
      ctx.fillStyle = low ? C.hot : C.swiss; ctx.fillRect(gx, gy, Math.round(gw * clamp(a / max, 0, 1)), 2);
    } else {
      text(ctx, 'INF', x + w - 6, y + 17, { color: C.cream, align: 'right' });
    }
  }

  function drawViewModel(ctx, game, player, dt, W, H) {
    if (player.dead) return;
    const wi = clamp(player.weapon ?? START.weapon, 0, WEAPONS.length - 1);
    const w = WEAPONS[wi], ws = player.wstate || {};
    // bob amplitude from actual movement speed (robust to whatever `player.bob` means)
    if (st.lastX !== null && dt > 0) {
      const sp = Math.hypot((player.x ?? 0) - st.lastX, (player.y ?? 0) - st.lastY) / dt;
      st.bobAmp += (clamp(sp / 4, 0, 1) - st.bobAmp) * clamp(dt * 8, 0, 1);
      st.bobPhase += dt * (5 + sp * 1.2);
    }
    st.lastX = player.x ?? 0; st.lastY = player.y ?? 0;
    const phase = typeof player.bob === 'number' && player.bob !== 0 ? player.bob * Math.PI * 2 : st.bobPhase;
    let ox = Math.cos(phase) * 7 * st.bobAmp, oy = Math.abs(Math.sin(phase)) * 6 * st.bobAmp;
    // raise / lower slide (phase durations unknown to the HUD; assume ~0.2 s)
    const t = ws.t || 0;
    if (ws.phase === 'lower') oy += ease(clamp(t / 0.2, 0, 1)) * 100;
    else if (ws.phase === 'raise') oy += (1 - ease(clamp(t / 0.2, 0, 1))) * 100;
    let name = `wpn.${w.id}.idle`, frame = 0;
    if (ws.anim === 'fire' || ws.phase === 'fire') { name = `wpn.${w.id}.fire`; frame = clamp(ws.frame | 0, 0, fireFrames[wi] - 1); oy += frame === 0 ? 3 : 0; }
    const im = img(name, frame);
    if (!im) return;
    // tint by scene.viewLight (linear HDR → multiply factor, with a floor so paws never go black)
    const vl = (game.scene && game.scene.viewLight) || game.viewLight || null;
    const S = 1.5;                                   // 128 px art drawn at 192 px for a bold first-person read
    const dw = Math.round(im.width * S), dh = Math.round(im.height * S);
    const dx = Math.round(W / 2 - dw / 2 + ox + 10), dy = Math.round(H - dh + oy + 2);
    const fireGlow = name.endsWith('.fire') && frame === 0;
    if (vl && !fireGlow) {
      const f = (v) => clamp(Math.round(255 * (0.3 + 0.7 * clamp(v, 0, 1.4) / 1.4 * 1.4)), 60, 255);
      const tr = f(vl[0]), tg = f(vl[1]), tb = f(vl[2]);
      if (tr < 250 || tg < 250 || tb < 250) {
        if (!tintCanvas.c || tintCanvas.c.width !== im.width) { tintCanvas.c = makeCanvas(im.width, im.height); tintCanvas.g = tintCanvas.c.getContext('2d'); }
        const g = tintCanvas.g;
        g.globalCompositeOperation = 'copy'; g.drawImage(im, 0, 0);
        g.globalCompositeOperation = 'multiply'; g.fillStyle = `rgb(${tr},${tg},${tb})`; g.fillRect(0, 0, im.width, im.height);
        g.globalCompositeOperation = 'destination-in'; g.drawImage(im, 0, 0);
        g.globalCompositeOperation = 'source-over';
        ctx.drawImage(tintCanvas.c, dx, dy, dw, dh);
        return;
      }
    }
    ctx.drawImage(im, dx, dy, dw, dh);
  }

  function drawCrosshair(ctx, W, H, player) {
    const cx = W >> 1, cy = H >> 1;
    ctx.fillStyle = 'rgba(26,20,32,0.7)';
    for (const [x, y] of [[-4, 0], [3, 0], [0, -4], [0, 3]]) ctx.fillRect(cx + x - 1, cy + y - 1, 3, 3);
    ctx.fillStyle = (player.health ?? 100) > 100 ? C.nip : C.cream;
    for (const [x, y] of [[-4, 0], [3, 0], [0, -4], [0, 3]]) ctx.fillRect(cx + x, cy + y, 1, 1);
    ctx.fillStyle = C.orange; ctx.fillRect(cx, cy, 1, 1);
  }

  function drawArcs(ctx, player, W, H) {
    const cx = W / 2, cy = H / 2;
    for (const a of st.arcs) {
      const life = 1 - a.t / 1.1;
      if (life <= 0) continue;
      // world angle → screen: relative 0 = straight ahead = up; +π/2 = to the right
      const rel = a.angle - (player.angle ?? 0);
      const sa = rel - Math.PI / 2;
      const span = 0.28 + clamp(a.amount / 80, 0, 0.3);
      const r = 40 + (1 - life) * 6;
      dots(ctx, cx, cy, r + 1, sa - span, sa + span, 3, `rgba(26,20,32,${0.6 * life})`);
      dots(ctx, cx, cy, r, sa - span, sa + span, 2, `rgba(255,${60 + 80 * life | 0},40,${life})`);
      dots(ctx, cx, cy, r + 3, sa - span * 0.5, sa + span * 0.5, 2, `rgba(255,74,58,${0.7 * life})`);
    }
  }

  function drawMessages(ctx, W) {
    let y = 44;
    for (const m of st.msgs) {
      const fadeIn = clamp(m.t / 0.12, 0, 1), fadeOut = clamp((3.2 - m.t) / 0.6, 0, 1);
      const a = Math.min(fadeIn, fadeOut);
      if (a <= 0) continue;
      ctx.save();
      ctx.globalAlpha = a;
      const s = m.count > 1 ? `${m.text} x${m.count}` : m.text;
      const scale = m.kind === 'secret' ? 2 : 1;
      const tw = textWidth(s, scale);
      ctx.fillStyle = 'rgba(26,20,32,0.55)';
      ctx.fillRect(((W - tw) >> 1) - 5, y - 2, tw + 10, 7 * scale + 5);
      let col = MSG_COL[m.kind] || '#fff';
      if (m.kind === 'secret' && ((m.t * 8) | 0) & 1) col = C.swiss;
      text(ctx, s, W >> 1, y + (fadeIn < 1 ? Math.round((1 - fadeIn) * -4) : 0), { scale, color: col, align: 'center' });
      ctx.restore();
      y += 7 * scale + 7;
    }
  }

  function drawEdge(ctx, W, H) {
    const e = st.edge;
    if (!e) return;
    const k = 1 - e.t / e.life;
    if (k <= 0) { st.edge = null; return; }
    const a = e.a * k;
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = `rgba(${e.r | 0},${e.g | 0},${e.b | 0},${a * (1 - i / 6) * 0.6})`;
      ctx.fillRect(i * 2, i * 2, W - i * 4, 2); ctx.fillRect(i * 2, H - 2 - i * 2, W - i * 4, 2);
      ctx.fillRect(i * 2, i * 2 + 2, 2, H - i * 4 - 4); ctx.fillRect(W - 2 - i * 2, i * 2 + 2, 2, H - i * 4 - 4);
    }
  }

  function draw(ctx, game, dt = 1 / 60) {
    if (!ctx || !game) return;
    const W = (ctx.canvas && ctx.canvas.width) || VIEW.W, H = (ctx.canvas && ctx.canvas.height) || VIEW.H;
    dt = clamp(+dt || 0, 0, 0.25);
    st.time += dt;
    const player = game.player || {};
    try { markExplored(game); } catch { /* world may be half-built */ }

    // timers
    st.ouchT = Math.max(0, st.ouchT - dt); st.grinT = Math.max(0, st.grinT - dt);
    st.weaponFlashT = Math.max(0, st.weaponFlashT - dt); st.secretT = Math.max(0, st.secretT - dt);
    st.healthFlashT = Math.max(0, st.healthFlashT - dt);
    if (st.lastHealth !== null && (player.health ?? 0) > st.lastHealth) st.healthFlashT = 0.3;
    st.lastHealth = player.health ?? 0;
    st.lookT -= dt;
    if (st.lookT <= 0) { const r = rnd(); st.look = r < 0.55 ? 0 : r < 0.78 ? 1 : 2; st.lookT = st.look ? 0.4 + rnd() * 0.5 : 0.9 + rnd() * 1.6; }
    for (const m of st.msgs) m.t += dt;
    st.msgs = st.msgs.filter((m) => m.t < 3.2);
    for (const a of st.arcs) a.t += dt;
    st.arcs = st.arcs.filter((a) => a.t < 1.1);
    if (st.edge) st.edge.t += dt;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    drawViewModel(ctx, game, player, dt, W, H);
    if (game.status === 'playing' || game.status === undefined) drawCrosshair(ctx, W, H, player);
    drawArcs(ctx, player, W, H);
    drawTopLeft(ctx, game, player);
    drawTopRight(ctx, game, player, W);
    drawBottomLeft(ctx, game, player, H);
    drawBottomRight(ctx, game, player, W, H);
    drawMessages(ctx, W);
    drawEdge(ctx, W, H);
    ctx.restore();
  }

  return { draw, onEvent, state: st };
}

export default createHud;
