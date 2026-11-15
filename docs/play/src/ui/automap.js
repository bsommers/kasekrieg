// Automap — explored cells only (ARCHITECTURE §12). Draws into the 480×270 2D HUD canvas.
// Exploration is tracked per world in a WeakMap; `markExplored(game)` is called every frame by hud.js,
// and is also safe to call from anywhere else. Pure canvas 2D; importing touches no DOM.
import { CELL } from '../core/defs.js';

const explored = new WeakMap();          // world → Uint8Array(w*h)
const REVEAL_R = 6;                      // cells: radius within which visible cells are revealed

const C = {
  bg: 'rgba(16,10,22,1)', floor: '#3a3042', floorSeen: '#2a2234', wall: '#c9a24a', wallHi: '#f2c85a', wallLo: '#7a5a22',
  door: '#8a5a2a', steel: '#8d98a8', gold: '#ffd23e', silver: '#d8e0ec', exit: '#5be07a', push: '#c9a24a',
  me: '#f08a1c', meHi: '#fde3b0', ink: '#1a1420', text: '#fde3b0',
};

export function getExplored(world) {
  if (!world || !world.w) return null;
  let e = explored.get(world);
  if (!e || e.length !== world.w * world.h) { e = new Uint8Array(world.w * world.h); explored.set(world, e); }
  return e;
}

/** Reveal cells around the player that have line of sight (walls adjacent to revealed floor are revealed too). */
export function markExplored(game) {
  const world = game && game.world, p = game && game.player;
  if (!world || !p || !world.w || typeof p.x !== 'number') return;
  const e = getExplored(world);
  const pcx = Math.floor(p.x), pcy = Math.floor(p.y);
  const set = (cx, cy) => { if (cx >= 0 && cy >= 0 && cx < world.w && cy < world.h) e[cy * world.w + cx] = 1; };
  set(pcx, pcy);
  const los = typeof world.hasLOS === 'function' ? world.hasLOS : null;
  for (let cy = pcy - REVEAL_R; cy <= pcy + REVEAL_R; cy++) {
    for (let cx = pcx - REVEAL_R; cx <= pcx + REVEAL_R; cx++) {
      if (cx < 0 || cy < 0 || cx >= world.w || cy >= world.h) continue;
      if (e[cy * world.w + cx]) continue;
      const dx = cx - pcx, dy = cy - pcy;
      if (dx * dx + dy * dy > REVEAL_R * REVEAL_R) continue;
      let seen = false;
      try {
        if (!los) seen = Math.abs(dx) <= 1 && Math.abs(dy) <= 1;
        else if (world.blocksSight && world.blocksSight(cx, cy)) {
          // solid cell: seen if any adjacent non-blocking cell centre is visible (we are looking at its face)
          seen = [[0, -1], [1, 0], [0, 1], [-1, 0]].some(([ax, ay]) => {
            const nx = cx + ax, ny = cy + ay;
            return nx >= 0 && ny >= 0 && nx < world.w && ny < world.h && !world.blocksSight(nx, ny) && los.call(world, p.x, p.y, nx + 0.5, ny + 0.5);
          });
        } else seen = los.call(world, p.x, p.y, cx + 0.5, cy + 0.5);
      } catch { seen = false; }
      if (seen) e[cy * world.w + cx] = 1;
    }
  }
}

/** Mark every cell explored (cheat / debugging). */
export function revealAll(game) { const e = game && getExplored(game.world); if (e) e.fill(1); }
export function resetExplored(world) { explored.delete(world); }

/** drawAutomap(ctx, game) — dimmed backdrop, explored cells, doors/keys/exit, player arrow, stats footer. */
export function drawAutomap(ctx, game) {
  const world = game && game.world, p = game && game.player;
  if (!ctx || !world || !p) return;
  const W = (ctx.canvas && ctx.canvas.width) || 480, H = (ctx.canvas && ctx.canvas.height) || 270;
  const e = getExplored(world);
  markExplored(game);

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#1e1630'; for (let gy = 0; gy < H; gy += 16) ctx.fillRect(0, gy, W, 1); for (let gx = 0; gx < W; gx += 16) ctx.fillRect(gx, 0, 1, H);
  ctx.fillStyle = C.wallLo; ctx.fillRect(2, 2, W - 4, 1); ctx.fillRect(2, H - 3, W - 4, 1); ctx.fillRect(2, 2, 1, H - 4); ctx.fillRect(W - 3, 2, 1, H - 4);

  // scale: biggest integer cell size that fits the map in the area between the header and footer
  const areaW = W - 16, areaH = H - 44;
  const cs = Math.max(2, Math.min(12, Math.floor(Math.min(areaW / world.w, areaH / world.h))));
  const ox = Math.round((W - world.w * cs) / 2), oy = Math.round(18 + (areaH - world.h * cs) / 2);
  const cell = (cx, cy) => (world.cells ? world.cells[cy * world.w + cx] : CELL.OPEN);

  for (let cy = 0; cy < world.h; cy++) {
    for (let cx = 0; cx < world.w; cx++) {
      const i = cy * world.w + cx;
      if (!e[i]) continue;
      const x = ox + cx * cs, y = oy + cy * cs, k = cell(cx, cy);
      if (k === CELL.WALL || k === CELL.PUSH) {
        ctx.fillStyle = C.wall; ctx.fillRect(x, y, cs, cs);
        if (cs >= 4) { ctx.fillStyle = C.wallHi; ctx.fillRect(x, y, cs, 1); ctx.fillStyle = C.wallLo; ctx.fillRect(x, y + cs - 1, cs, 1); }
      } else if (k === CELL.EXIT) {
        ctx.fillStyle = C.exit; ctx.fillRect(x, y, cs, cs);
        ctx.fillStyle = C.ink; ctx.fillRect(x + (cs >> 2), y + (cs >> 2), Math.max(1, cs >> 1), Math.max(1, cs >> 1));
      } else if (k === CELL.DOOR) {
        const di = world.doorAt ? world.doorAt[i] : -1, d = di >= 0 && world.doors ? world.doors[di] : null;
        ctx.fillStyle = C.floorSeen; ctx.fillRect(x, y, cs, cs);
        ctx.fillStyle = d && d.lock === 'gold' ? C.gold : d && d.lock === 'silver' ? C.silver : d && d.tex && /steel/.test(d.tex) ? C.steel : C.door;
        const t = Math.max(1, cs >> 2), open = d ? d.open || 0 : 0;
        if (d && d.vertical) ctx.fillRect(x + ((cs - t) >> 1), y, t, Math.round(cs * (1 - open * 0.8)));
        else ctx.fillRect(x, y + ((cs - t) >> 1), Math.round(cs * (1 - open * 0.8)), t);
      } else {
        ctx.fillStyle = (cx + cy) & 1 ? C.floor : C.floorSeen; ctx.fillRect(x, y, cs, cs);
      }
    }
  }

  // pickups of keys that have been seen would leak info; keep to the player only
  const px = ox + p.x * cs, py = oy + p.y * cs, a = p.angle || 0, r = Math.max(3, cs * 0.5);
  ctx.fillStyle = C.ink;
  ctx.beginPath(); ctx.moveTo(px + Math.cos(a) * (r + 1.5), py + Math.sin(a) * (r + 1.5));
  ctx.lineTo(px + Math.cos(a + 2.5) * (r + 1), py + Math.sin(a + 2.5) * (r + 1)); ctx.lineTo(px + Math.cos(a - 2.5) * (r + 1), py + Math.sin(a - 2.5) * (r + 1)); ctx.fill();
  ctx.fillStyle = C.me;
  ctx.beginPath(); ctx.moveTo(px + Math.cos(a) * r, py + Math.sin(a) * r);
  ctx.lineTo(px + Math.cos(a + 2.5) * r, py + Math.sin(a + 2.5) * r); ctx.lineTo(px + Math.cos(a - 2.5) * r, py + Math.sin(a - 2.5) * r); ctx.fill();
  ctx.fillStyle = C.meHi; ctx.fillRect(Math.round(px), Math.round(py), 1, 1);

  // header + footer
  const def = world.def || {}, st = game.stats || {};
  label(ctx, 'AUTOMAP', 8, 6, C.wallHi, 'left');
  label(ctx, String(def.name || ''), W - 8, 6, C.text, 'right');
  const parts = [];
  if (st.killsTotal != null) parts.push(`KILLS ${st.kills | 0}/${st.killsTotal}`);
  if (st.treasureTotal != null) parts.push(`TREASURE ${st.treasure | 0}/${st.treasureTotal}`);
  if (st.secretsTotal != null) parts.push(`SECRETS ${st.secrets | 0}/${st.secretsTotal}`);
  label(ctx, parts.join('   '), W >> 1, H - 14, C.text, 'center');
  ctx.restore();
}

// font.js is written concurrently; use it when present, canvas text otherwise
let font = null;
import('./font.js').then((m) => { if (m && typeof m.drawText === 'function') font = m; }).catch(() => {});
function label(ctx, s, x, y, color, align) {
  if (font) { font.drawText(ctx, s, x, y, { color, align, shadow: '#000' }); return; }
  ctx.save(); ctx.font = 'bold 8px monospace'; ctx.textBaseline = 'top'; ctx.textAlign = align;
  ctx.fillStyle = '#000'; ctx.fillText(s, x + 1, y + 1); ctx.fillStyle = color; ctx.fillText(s, x, y); ctx.restore();
}

export default drawAutomap;
