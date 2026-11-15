// KÄSEKRIEG full-screen cards — levelIntro, intermission, death, gameOver, victory.
// Contract: ARCHITECTURE §12. createScreens({ atlas, audio }) → { show(name, data), update(dt, menuInput) → 'done'|null, draw(ctx, t), active }.
// Data shapes (see src/main.js):
//   levelIntro   { index, id, name, intro, par, skill }
//   intermission { index, id, name, stats:{kills,killsTotal,treasure,treasureTotal,secrets,secretsTotal,time,par}, score, last }
//   death        { livesLeft, score }
//   gameOver     { score, stats }
//   victory      { stats, score }
// Draws over a transparent background (scrim only) so the live scene shows through.

import { SKILLS, LEVELS } from '../core/defs.js';
import {
  W, H, PAL, clamp, ease, hash, text, measure, outlined, wrap, image, blit, sfx, scrim, panel, paw, face, lifePip,
} from './menus.js';

const fmtTime = (s) => { s = Math.max(0, Math.floor(Number(s) || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const pct = (a, b) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 100);
const num = (v) => (Number.isFinite(+v) ? +v : 0);
const pad = (n, w) => String(Math.round(n)).padStart(w, '0');

const GAMEOVER_QUIPS = ['The rats are having a cheese party.', 'Nine lives. All spent. Zero cheese saved.', 'Even Schrödinger would be embarrassed.', 'The cheese is gone. The rats are smug.'];
const DEATH_QUIPS = ['Curses! A life lost.', 'That one stung.', 'Land on your feet next time.', 'Eight... no, fewer lives left.', 'The rats pretend they are not laughing.'];
const VICTORY_LINES = [
  'THE BIG CHEESE IS BROKEN.',
  'SCHLOSS GORGONZOLA FALLS SILENT.',
  'THE STOLEN CHEESE FLOWS HOME TO EVERY MOUSEHOLE,',
  'FONDUE POT, AND PIZZA PARLOUR IN THE LAND.',
  'MAJOR MARMALADE CURLS UP ON THE THRONE,',
  'PURRING LOUD ENOUGH TO RATTLE THE CASTLE.',
  'THE END. (THEY SAY HE STILL HAS LIVES LEFT.)',
];
const RANKS = [[100, 'CHEESE GOD'], [85, 'GRAND FROMAGER'], [60, 'MOUSER FIRST CLASS'], [30, 'ALLEY APPRENTICE'], [0, 'LITTER BOX CADET']];
const rankFor = (p) => RANKS.find(([m]) => p >= m)[1];

export function createScreens({ atlas = null, audio = null } = {}) {
  let name = null, data = {}, t = 0, finished = false, tally = null, lastTick = -1;

  // ───────── intermission tally model ─────────
  function makeTally(d) {
    const s = d.stats || {};
    const rows = [
      { label: 'KILLS', a: num(s.kills), b: num(s.killsTotal), kind: 'pct' },
      { label: 'TREASURE', a: num(s.treasure), b: num(s.treasureTotal), kind: 'pct' },
      { label: 'SECRETS', a: num(s.secrets), b: num(s.secretsTotal), kind: 'pct' },
      { label: 'TIME', a: num(s.time), b: num(s.par), kind: 'time' },
    ];
    // each row counts for `dur` seconds, starting `start`
    let at = 0.9;
    for (const r of rows) {
      r.start = at;
      r.dur = r.kind === 'time' ? 0.9 : clamp(0.35 + Math.min(r.a, 40) * 0.025, 0.4, 1.3);
      r.end = r.start + r.dur;
      r.full = r.kind === 'pct' ? r.b > 0 && r.a >= r.b : r.b > 0 && r.a <= r.b;
      at = r.end + 0.35;
    }
    const perfect = rows.slice(0, 3).every((r) => r.b === 0 || r.a >= r.b);
    const avg = Math.round(rows.slice(0, 3).reduce((q, r) => q + pct(r.a, r.b), 0) / 3);
    return { rows, endAt: at, perfect, avg, rank: rankFor(avg) };
  }

  const api = {
    get active() { return name !== null; },
    get current() { return name; },
    show(n, d) {
      name = n || null; data = d || {}; t = 0; finished = false; lastTick = -1;
      tally = name === 'intermission' ? makeTally(data) : null;
      if (name === 'intermission') sfx(audio, 'level_complete');
      else if (name === 'gameOver') sfx(audio, 'game_over');
      else if (name === 'death') sfx(audio, 'player_die');
      else if (name === 'victory') sfx(audio, 'extra_life');
    },
    hide() { name = null; },
    update(dt, inp) {
      if (!name || finished) return null;
      dt = Number.isFinite(dt) ? clamp(dt, 0, 0.25) : 0;
      t += dt;
      const m = inp || {};
      const press = !!(m.accept || m.back || m.pause);
      const end = () => { finished = true; name = null; sfx(audio, 'menu_select'); return 'done'; };
      switch (name) {
        case 'levelIntro':
          if (t > 0.35 && press) return end();
          if (t > 4.2) return end();
          return null;
        case 'death':
          if (t > 0.9 && press) return end();
          if (t > 4) return end();
          return null;
        case 'intermission': {
          // tick sounds while counting
          for (const r of tally.rows) {
            if (t >= r.start && t < r.end) {
              const k = Math.floor((t - r.start) * 18);
              if (k !== lastTick) { lastTick = k; sfx(audio, 'tally_tick'); }
            }
          }
          if (press && t > 0.3) {
            if (t < tally.endAt) { t = tally.endAt; return null; } // skip the count-up
            return end();
          }
          return null;
        }
        case 'gameOver':
          if (t > 1.5 && press) return end();
          return null;
        case 'victory':
          if (t > 3 && press) return end();
          return null;
        default:
          return press ? end() : null;
      }
    },
    draw(ctx, tt) {
      if (!name || !ctx) return;
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      try { DRAW[name]?.(ctx, t, tt ?? t); } finally { ctx.restore(); }
    },
  };

  const hint = (ctx, s, a = 1) => {
    const on = (t % 1.2) < 0.85;
    if (!on) return;
    ctx.globalAlpha = a;
    text(ctx, s, W / 2, H - 16, { color: PAL.swiss, align: 'center', shadow: PAL.outline });
    ctx.globalAlpha = 1;
  };

  const DRAW = {
    levelIntro(ctx, t) {
      const fadeOut = clamp((4.2 - t) * 2.5, 0, 1);
      scrim(ctx, 1.0 * fadeOut + 0.1);
      ctx.globalAlpha = Math.min(1, fadeOut + 0.2);
      const idx = Math.max(0, num(data.index));
      // chapter number plate
      const a = ease(t * 2.5);
      const y0 = 62 - Math.round((1 - a) * 18);
      ctx.globalAlpha = a * fadeOut;
      outlined(ctx, `LEVEL ${idx + 1}`, W / 2, y0, { scale: 2, color: PAL.dim, align: 'center' });
      // swinging cheese divider
      const dw = Math.round(160 * ease(t * 1.5));
      ctx.fillStyle = PAL.outline; ctx.fillRect(W / 2 - dw / 2 - 1, y0 + 21, dw + 2, 4);
      ctx.fillStyle = PAL.cheddar; ctx.fillRect(W / 2 - dw / 2, y0 + 22, dw, 2);
      for (let i = 0; i < dw; i += 12) { ctx.fillStyle = PAL.stripe; ctx.fillRect(W / 2 - dw / 2 + i + 4, y0 + 22, 3, 2); }
      // level name, letter by letter
      const nm = String(data.name || LEVELS[idx]?.[1] || 'Unknown Cellar').toUpperCase();
      const shown = Math.min(nm.length, Math.floor(Math.max(0, t - 0.4) * 28));
      const sc = measure(nm, 3) > W - 40 ? 2 : 3;
      ctx.globalAlpha = fadeOut;
      outlined(ctx, nm.slice(0, shown), W / 2 - (measure(nm, sc) - measure(nm.slice(0, shown), sc)) / 2 * 0, y0 + 34, { scale: sc, color: PAL.cheddar, align: 'center' });
      // tagline
      const intro = data.intro ? wrap('"' + data.intro + '"', 360, 1) : [];
      const ia = ease((t - 1.1) * 2);
      ctx.globalAlpha = ia * fadeOut;
      intro.forEach((l, i) => text(ctx, l, W / 2, y0 + 34 + 7 * sc + 18 + i * 11, { color: PAL.cream, align: 'center', shadow: PAL.outline }));
      // par + skill
      const sk = SKILLS[clamp(num(data.skill), 0, SKILLS.length - 1)];
      ctx.globalAlpha = ease((t - 1.6) * 2) * fadeOut;
      const info = `PAR ${fmtTime(data.par)}    SKILL: ${sk.name.toUpperCase()}`;
      text(ctx, info, W / 2, 196, { color: PAL.dim, align: 'center', shadow: PAL.outline });
      // little cat peeking
      face(ctx, atlas, W / 2 - 16, 212, Math.floor(t * 1.5) % 3 === 1 ? 1 : Math.floor(t * 1.5) % 3 === 2 ? 2 : 0, 1);
      ctx.globalAlpha = 1;
      if (t > 0.35) hint(ctx, 'PRESS ENTER', 0.8 * fadeOut);
    },

    intermission(ctx, t) {
      scrim(ctx, 0.92, '10,6,16');
      const a = ease(t * 3);
      ctx.globalAlpha = a;
      const nm = String(data.name || LEVELS[num(data.index)]?.[1] || '').toUpperCase();
      outlined(ctx, 'LEVEL COMPLETE', W / 2, 14 - Math.round((1 - a) * 12), { scale: 3, color: PAL.cheddar, align: 'center' });
      text(ctx, nm, W / 2, 42, { color: PAL.cream, align: 'center', shadow: PAL.outline });
      ctx.globalAlpha = 1;
      // tally panel
      const px = 70, py = 60, pw = W - 140, ph = 114;
      panel(ctx, px, py, pw, ph, { alpha: ease(t * 3 - 0.2) });
      tally.rows.forEach((r, i) => {
        const ry = py + 12 + i * 24;
        const k = clamp((t - r.start) / r.dur, 0, 1);
        const vis = t >= r.start - 0.2;
        if (!vis) return;
        ctx.globalAlpha = ease((t - r.start + 0.2) * 5);
        text(ctx, r.label, px + 16, ry + 2, { scale: 2, color: PAL.cheddar, shadow: PAL.outline });
        let main, sub;
        if (r.kind === 'pct') {
          const cur = Math.round(r.a * k);
          main = `${pct(cur, r.b)}%`;
          sub = `${cur}/${r.b}`;
        } else {
          main = fmtTime(r.a * k);
          sub = `PAR ${fmtTime(r.b)}`;
        }
        // bar
        const bx = px + 126, bw = 72;
        ctx.fillStyle = PAL.outline; ctx.fillRect(bx - 1, ry + 1, bw + 2, 12);
        ctx.fillStyle = '#3a2f40'; ctx.fillRect(bx, ry + 2, bw, 10);
        const fillW = r.kind === 'pct' ? Math.round(bw * pct(Math.round(r.a * k), r.b) / 100) : Math.round(bw * clamp(k * (r.b > 0 ? Math.min(1, r.a / r.b) : 1), 0, 1));
        ctx.fillStyle = r.kind === 'time' && r.b > 0 && r.a > r.b ? PAL.red : PAL.cheddar; ctx.fillRect(bx, ry + 2, fillW, 10);
        ctx.fillStyle = PAL.swiss; ctx.fillRect(bx, ry + 2, fillW, 2);
        for (let h = 0; h < fillW - 6; h += 17) { ctx.fillStyle = PAL.stripe; ctx.fillRect(bx + 5 + h, ry + 6, 3, 3); }
        text(ctx, main, px + pw - 84, ry + 2, { scale: 2, color: k >= 1 && r.full ? (Math.floor(t * 6) & 1 ? PAL.gold : PAL.swiss) : PAL.cream, align: 'right', shadow: PAL.outline });
        text(ctx, sub, px + pw - 16, ry + 5, { color: PAL.dim, align: 'right', shadow: PAL.outline });
        ctx.globalAlpha = 1;
      });
      // score + rank after tally
      const done = t - tally.endAt;
      if (done > 0) {
        ctx.globalAlpha = ease(done * 3);
        text(ctx, `SCORE ${pad(num(data.score), 6)}`, W / 2, 186, { scale: 2, color: PAL.swiss, align: 'center', shadow: PAL.outline });
        const rk = tally.perfect ? 'PERFECT PAW-FORMANCE!' : `RANK: ${tally.rank}`;
        const pulse = tally.perfect ? (Math.floor(t * 6) & 1 ? PAL.gold : PAL.swiss) : PAL.cream;
        text(ctx, rk, W / 2, 208, { color: pulse, align: 'center', shadow: PAL.outline });
        const nx = data.last ? 'THE FINAL CONFRONTATION LIES AHEAD...' : 'THE NEXT LEVEL AWAITS...';
        text(ctx, nx, W / 2, 224, { color: PAL.dim, align: 'center', shadow: PAL.outline });
        ctx.globalAlpha = 1;
        hint(ctx, 'PRESS ENTER');
      } else if (t > 0.5) {
        text(ctx, 'ENTER: SKIP', W - 10, H - 12, { color: PAL.grey, align: 'right', shadow: PAL.outline });
      }
      // twinkles around title
      for (let i = 0; i < 4; i++) {
        const ph = ((t * 1.3) + i * 0.27) % 1, r = Math.round(Math.sin(ph * Math.PI) * 3);
        if (r <= 0) continue;
        const sx = 120 + hash(Math.floor(t * 1.3 + i * 0.27), i) * 240, sy = 12 + hash(Math.floor(t * 1.3 + i * 0.27), i + 5) * 28;
        ctx.fillStyle = '#fffbe0'; ctx.fillRect(sx - r, sy, 2 * r + 1, 1); ctx.fillRect(sx, sy - r, 1, 2 * r + 1);
      }
    },

    death(ctx, t) {
      const a = ease(t * 2.5);
      scrim(ctx, 0.7, '40,2,4');
      // red wash pulsing in
      ctx.fillStyle = `rgba(150,10,14,${0.42 * a * (1 - clamp((t - 1.5) / 2.5, 0, 0.5))})`;
      ctx.fillRect(0, 0, W, H);
      const shake = t < 0.5 ? Math.round(Math.sin(t * 60) * (3 - t * 6)) : 0;
      ctx.translate(shake, 0);
      ctx.globalAlpha = a;
      outlined(ctx, 'OUCH!', W / 2, 52, { scale: 5, color: PAL.red, align: 'center', outline: '#2a0608' });
      face(ctx, atlas, W / 2 - 32, 100 + Math.round(Math.sin(t * 3) * 1.5), 21, 2);
      const left = Math.max(0, num(data.livesLeft));
      const lost = left < 9 ? left : 8;
      // nine life pips, the one just lost cracks and fades
      const px0 = W / 2 - (9 * 14) / 2;
      for (let i = 0; i < 9; i++) {
        const alive = i < left;
        const jolt = i === left ? Math.round(Math.sin(t * 40) * clamp(1.5 - t, 0, 1.5) * 2) : 0;
        lifePip(ctx, atlas, px0 + i * 14 + jolt, 176, alive);
      }
      const word = left === 1 ? 'LIFE' : 'LIVES';
      text(ctx, left > 0 ? `${left} ${word} LEFT` : 'NO LIVES LEFT', W / 2, 192, { scale: 2, color: left <= 2 ? PAL.red : PAL.cream, align: 'center', shadow: PAL.outline });
      const q = DEATH_QUIPS[Math.abs(left * 7 + num(data.score)) % DEATH_QUIPS.length];
      text(ctx, q, W / 2, 214, { color: PAL.dim, align: 'center', shadow: PAL.outline });
      ctx.globalAlpha = 1;
      void lost;
      if (t > 0.9) hint(ctx, 'PRESS ENTER TO TRY AGAIN');
    },

    gameOver(ctx, t) {
      const a = ease(t * 1.2);
      scrim(ctx, 1.0, '4,2,8');
      ctx.fillStyle = `rgba(4,2,8,${0.6 * a})`; ctx.fillRect(0, 0, W, H);
      // slow falling cheese crumbs
      for (let i = 0; i < 26; i++) {
        const sp = 8 + hash(i, 1) * 14, x = hash(i, 2) * W, y = ((hash(i, 3) * H) + t * sp) % H;
        ctx.fillStyle = i % 3 ? 'rgba(242,169,30,0.5)' : 'rgba(246,220,106,0.45)';
        ctx.fillRect(Math.round(x + Math.sin(t + i) * 3), Math.round(y), 2, 2);
      }
      ctx.globalAlpha = a;
      const dy = Math.round((1 - ease(t * 1.2)) * -30);
      outlined(ctx, 'GAME OVER', W / 2, 40 + dy, { scale: 6, color: PAL.red, align: 'center', outline: '#2a0608' });
      const fy = 106 + Math.round(Math.sin(t * 1.2) * 2);
      face(ctx, atlas, W / 2 - 32, fy, 21, 2);
      // rat emblem flag tauntingly waving
      const em = image(atlas, 'hud.emblem');
      if (em) for (let i = 0; i < 32; i++) ctx.drawImage(em, i, 0, 1, 32, W / 2 + 54 + i, fy + 6 + Math.round(Math.sin(t * 4 + i * 0.3) * 2), 1, 32);
      const q = GAMEOVER_QUIPS[(Math.abs(num(data.score)) >> 3) % GAMEOVER_QUIPS.length];
      text(ctx, q, W / 2, 176, { color: PAL.cream, align: 'center', shadow: PAL.outline });
      text(ctx, `FINAL SCORE ${pad(num(data.score), 6)}`, W / 2, 194, { scale: 2, color: PAL.swiss, align: 'center', shadow: PAL.outline });
      const s = data.stats;
      if (s) text(ctx, `KILLS ${num(s.kills)}   TREASURE ${num(s.treasure)}   SECRETS ${num(s.secrets)}`, W / 2, 216, { color: PAL.dim, align: 'center', shadow: PAL.outline });
      ctx.globalAlpha = 1;
      if (t > 1.5) hint(ctx, 'PRESS ENTER FOR THE TITLE');
    },

    victory(ctx, t) {
      scrim(ctx, 0.6, '14,8,2');
      // golden rays
      ctx.save();
      ctx.globalAlpha = 0.16 * ease(t * 0.8);
      for (let i = 0; i < 14; i++) {
        const ang = t * 0.15 + i * (Math.PI * 2 / 14);
        ctx.fillStyle = i & 1 ? PAL.swiss : PAL.cheddar;
        ctx.beginPath();
        ctx.moveTo(W / 2, 70);
        ctx.lineTo(W / 2 + Math.cos(ang - 0.08) * 420, 70 + Math.sin(ang - 0.08) * 420);
        ctx.lineTo(W / 2 + Math.cos(ang + 0.08) * 420, 70 + Math.sin(ang + 0.08) * 420);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      // falling cheese-cube confetti
      for (let i = 0; i < 48; i++) {
        const sp = 24 + hash(i, 1) * 40, x = hash(i, 2) * W + Math.sin(t * 1.5 + i) * 8, y = ((hash(i, 3) * H) + t * sp) % (H + 10) - 5;
        const c = [PAL.cheddar, PAL.swiss, PAL.cream, PAL.orange, PAL.gold][i % 5], sz = 2 + (i % 3);
        ctx.fillStyle = PAL.outline; ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, sz + 2, sz + 2);
        ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), sz, sz);
        if (i % 4 === 0) { ctx.fillStyle = PAL.outline; ctx.fillRect(Math.round(x) + 1, Math.round(y) + 1, 1, 1); }
      }
      // firework bursts
      for (let b = 0; b < 3; b++) {
        const cyc = 2.4, tt = (t - 0.6 - b * 0.8) % cyc;
        if (t < 0.6 + b * 0.8 || tt < 0 || tt > 1.4) continue;
        const k = Math.floor((t - 0.6 - b * 0.8) / cyc);
        const cx = 70 + hash(k, b + 10) * 340, cy = 34 + hash(k, b + 20) * 70, r = ease(tt / 1.4) * 34;
        for (let i = 0; i < 18; i++) {
          const ang = i / 18 * Math.PI * 2, gx = cx + Math.cos(ang) * r, gy = cy + Math.sin(ang) * r + tt * tt * 14;
          ctx.globalAlpha = 1 - tt / 1.4;
          ctx.fillStyle = [PAL.gold, PAL.swiss, PAL.orange][(i + b) % 3];
          ctx.fillRect(Math.round(gx), Math.round(gy), 2, 2);
        }
        ctx.globalAlpha = 1;
      }
      const a = ease(t * 1.5);
      ctx.globalAlpha = a;
      const bounce = Math.round(Math.abs(Math.sin(t * 3)) * 3);
      outlined(ctx, 'VICTORY!', W / 2, 22 - bounce, { scale: 6, color: PAL.gold, align: 'center' });
      text(ctx, 'THE CHEESE IS SAVED', W / 2, 74, { scale: 2, color: PAL.cream, align: 'center', shadow: PAL.outline });
      ctx.globalAlpha = 1;
      // hero cat
      face(ctx, atlas, 14, 100 + Math.round(Math.sin(t * 4) * 2), 20, 2);
      face(ctx, atlas, W - 78, 100 + Math.round(Math.sin(t * 4 + 1.5) * 2), 20, 2);
      // story lines revealed one by one
      const lines = VICTORY_LINES;
      lines.forEach((l, i) => {
        const la = ease((t - 1.2 - i * 0.9) * 2);
        if (la <= 0) return;
        ctx.globalAlpha = la;
        const last = i === lines.length - 1;
        text(ctx, l, W / 2, 106 + i * 10 + (last ? 4 : 0), { color: last ? PAL.swiss : PAL.cream, align: 'center', shadow: PAL.outline });
      });
      ctx.globalAlpha = 1;
      const st = data.stats;
      const fa = ease((t - 1.2 - lines.length * 0.9) * 1.5);
      if (fa > 0) {
        ctx.globalAlpha = fa;
        text(ctx, `FINAL SCORE ${pad(num(data.score), 6)}`, W / 2, 202, { scale: 2, color: PAL.swiss, align: 'center', shadow: PAL.outline });
        if (st) text(ctx, `KILLS ${num(st.kills)}/${num(st.killsTotal)}   TREASURE ${num(st.treasure)}/${num(st.treasureTotal)}   SECRETS ${num(st.secrets)}/${num(st.secretsTotal)}`, W / 2, 224, { color: PAL.dim, align: 'center', shadow: PAL.outline });
        ctx.globalAlpha = 1;
      }
      if (t > 3) hint(ctx, 'PRESS ENTER');
    },
  };

  void paw;
  return api;
}

export default createScreens;
