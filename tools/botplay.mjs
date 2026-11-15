#!/usr/bin/env node
// Headless bot: walks each level from start to the exit switch (god mode, keys granted) via tools/shot.mjs.
// --fight: no god mode / no granted keys, skill 2 (--skill N), collects keys+pickups and shoots enemies; per level --runs 3 seeds
//   (--seed N base, --quality low|ultra). Prints {level,seed,reachedExit,deaths,healthAtExit,ammoAtExit,kills,total,seconds,...}
// node tools/botplay.mjs [--levels 1,2,3] [--max 120]   -> prints JSON lines {level, reachedExit, seconds, errors}
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const levels = (opt('levels', '1,2,3,4,5,6')).split(',').map(Number);
const MAX = Number(opt('max', 120));
const FIGHT = args.includes('--fight');
const RUNS = Number(opt('runs', FIGHT ? 3 : 1));
const SEED0 = Number(opt('seed', 11));
const QUALITY = opt('quality', '');
const SKILL = Number(opt('skill', 2));

const BOT = (max) => `(async()=>{
  const G = window.__game, t0 = performance.now();
  const out = (r, why) => ({ reachedExit: r, why, seconds: +((performance.now() - t0) / 1000).toFixed(1), errors: G.errors.slice(), state: G.state });
  let stuck = 0, lx = 0, ly = 0, lastUse = 0, frame = 0;
  const wait = () => new Promise(r => requestAnimationFrame(r));
  while ((performance.now() - t0) / 1000 < ${max}) {
    await wait(); frame++;
    const g = G.game; if (!g) continue;
    if (G.state === 'intermission' || G.state === 'victory' || g.world.exitTriggered) return out(true, 'exit');
    if (G.state !== 'playing') continue;
    const w = g.world, p = g.player;
    p.keys.gold = p.keys.silver = true; if (g.cheats) g.cheats.god = true;
    const W = w.w, H = w.h;
    // multi-source BFS from open cells next to exit switch(es); doors passable
    const f = new Int32Array(W * H).fill(-1), q = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (w.cells[y * W + x] === 3 || (w.exitCell && 0)) {}
    const EXIT = (window.__EXIT ??= (() => { const l = []; for (let i = 0; i < W * H; i++) if (w.cells[i] === ${'CELL_EXIT'}) l.push(i); return l; })());
    const pass = (x, y) => x >= 0 && y >= 0 && x < W && y < H && ((!w.isSolid(x, y) && !w.blocker[y * W + x]) || w.doorAt[y * W + x] >= 0);
    for (const i of EXIT) { const ex = i % W, ey = (i / W) | 0; for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const x = ex + dx, y = ey + dy; if (pass(x, y) && f[y * W + x] < 0) { f[y * W + x] = 0; q.push(y * W + x); } } }
    for (let h = 0; h < q.length; h++) { const i = q[h], cx = i % W, cy = (i / W) | 0; for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const x = cx + dx, y = cy + dy; if (pass(x, y) && f[y * W + x] < 0) { f[y * W + x] = f[i] + 1; q.push(y * W + x); } } }
    const cx = p.x | 0, cy = p.y | 0, cur = f[cy * W + cx];
    let tx, ty, use = false;
    if (cur === 0) { // beside exit: face the switch and use
      let ex = null; for (const i of EXIT) { const x = i % W, y = (i / W) | 0; if (Math.abs(x - cx) + Math.abs(y - cy) === 1) ex = [x + .5, y + .5]; }
      tx = ex[0]; ty = ex[1]; use = true;
    } else {
      let best = null, bv = cur < 0 ? 1e9 : cur;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const x = cx + dx, y = cy + dy; if (x>=0&&y>=0&&x<W&&y<H&&f[y*W+x] >= 0 && f[y*W+x] < bv) { bv = f[y*W+x]; best = [x, y]; } }
      if (!best) { if (frame % 120 === 0) {} ; tx = p.x; ty = p.y; }
      else { tx = best[0] + .5; ty = best[1] + .5; }
      // use whatever (door/pushwall) is ahead periodically
      if (frame - lastUse > 20) { use = true; }
    }
    let want = Math.atan2(ty - p.y, tx - p.x), d = want - p.angle;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const turn = Math.max(-0.12, Math.min(0.12, d));
    if (use) lastUse = frame;
    G.cmd({ turn, forward: Math.abs(d) < 0.5 ? 1 : 0, run: true, fire: false, use });
    if (frame % 90 === 0) { const m = Math.hypot(p.x - lx, p.y - ly); stuck = m < 0.3 ? stuck + 1 : 0; lx = p.x; ly = p.y; if (stuck > 6) return out(false, 'stuck at ' + p.x.toFixed(1) + ',' + p.y.toFixed(1) + ' f=' + cur + ' tgt=' + tx.toFixed(1) + ',' + ty.toFixed(1) + ' ang=' + p.angle.toFixed(2) + ' ents=' + JSON.stringify((g.enemies||[]).filter(e=>Math.hypot(e.x-p.x,e.y-p.y)<2).map(e=>[e.type,e.x.toFixed(1),e.y.toFixed(1),e.state]))); }
  }
  return out(false, 'timeout');
})()`;

const TRACE = args.includes('--trace');
const FIGHT_BOT = (max) => `(async()=>{
  const G = window.__game, t0 = performance.now();
  const wait = () => new Promise(r => requestAnimationFrame(r));
  const DIRS = [[1,0],[-1,0],[0,1],[0,-1]];
  const ign = new Map(); let frame = 0, lastUse = 0, lx = 0, ly = 0, stuck = 0, wiggle = 0, wdir = 1, strafeDir = 1, strafeT = 0;
  let deaths = 0, lastP = null, startLives = null, engaged = 0, engTarget = null, maxHurt = 0, log = [];
  let pbus = null; const TRACE = ${TRACE}, trace = []; const p0 = g => g.player.x.toFixed(1)+','+g.player.y.toFixed(1)+' hp'+Math.round(g.player.health)+' L'+g.player.lives;
  const snap = (g, r, why) => ({ reachedExit: r, why, deaths, healthAtExit: Math.round(g.player.health), ammoAtExit: { ...g.player.ammo },
    kills: g.stats.kills, total: g.stats.killsTotal, secrets: g.stats.secrets, seconds: +g.stats.time.toFixed(1), wall: +((performance.now() - t0) / 1000).toFixed(1), errors: G.errors.slice(), notes: log.slice(0, 6), trace });
  let g0 = null;
  while ((performance.now() - t0) / 1000 < ${max}) {
    await wait(); frame++;
    const g = G.game; if (!g) continue;
    if (g !== pbus) { pbus = g; g0 = g; startLives = g.player.lives; g.bus.on('playerDied', () => { deaths++; }); }
    if (TRACE && frame % 120 === 0) trace.push([frame, G.state, g.time.toFixed(0), p0(g)]);
    if (G.state === 'gameOver') return snap(g, false, 'game over');
    if (G.state === 'intermission' || G.state === 'victory' || g.world.exitTriggered || g.status === 'complete' || g.status === 'victory') return snap(g, true, 'exit');
    if (G.state !== 'playing') continue;
    const w = g.world, p = g.player, W = w.w, H = w.h;
    const keys = p.keys;
    const doorOk = (x, y) => { const d = w.doors[w.doorAt[y * W + x]]; return !d.lock || keys[d.lock]; };
    const pass = (x, y) => x >= 0 && y >= 0 && x < W && y < H && (w.doorAt[y * W + x] >= 0 ? doorOk(x, y) : (!w.isSolid(x, y) && !w.blocker[y * W + x]));
    // BFS from player
    const cx = p.x | 0, cy = p.y | 0, dist = new Int32Array(W * H).fill(-1), par = new Int32Array(W * H).fill(-1), q = [cy * W + cx];
    dist[cy * W + cx] = 0;
    for (let h = 0; h < q.length; h++) { const i = q[h], x0 = i % W, y0 = (i / W) | 0; for (const [dx, dy] of DIRS) { const x = x0 + dx, y = y0 + dy; if (pass(x, y) && dist[y * W + x] < 0) { dist[y * W + x] = dist[i] + 1; par[y * W + x] = i; q.push(y * W + x); } } }
    // enemies
    const now = g.time;
    const foes = [];
    for (const e of g.enemies) {
      if (e.state === 'die' || e.state === 'dead' || e.hp <= 0) continue;
      if ((ign.get(e) ?? 0) > now) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < 16 && w.hasLOS(p.x, p.y, e.x, e.y)) foes.push([d, e]);
    }
    foes.sort((a, b) => a[0] - b[0]);
    const ranged = (p.ammo.cell >= 8 && p.owned[4]) || (p.ammo.hair >= 1 && (p.owned[1] || p.owned[2])) || (p.ammo.yarn >= 1 && p.owned[3]);
    let foe = null;
    for (const [d, e] of foes) { if (ranged || d < 3) { foe = [d, e]; break; } }
    let cmd = { turn: 0, forward: 0, strafe: 0, run: true, fire: false, use: false, weapon: -1 };
    if (foe) {
      const [d, e] = foe;
      if (engTarget !== e) { engTarget = e; engaged = 0; } engaged++;
      if (engaged > 60 * 25) { ign.set(e, now + 12); engaged = 0; log.push('gave up on ' + e.type); }
      const tough = e.def.hp >= 60 || e.type === 'boss';
      let want = 1;
      if (e.type === 'boss' && p.owned[3] && p.ammo.yarn >= 1 && d > 3.5) want = 3;
      else if (p.owned[4] && p.ammo.cell >= 8 && (tough || !p.ammo.hair)) want = 4;
      else if (p.owned[2] && p.ammo.hair >= 8 && tough) want = 2;
      else if (p.ammo.hair >= 1) want = (p.owned[2] && p.ammo.hair >= 30 && tough) ? 2 : 1;
      else if (p.owned[4] && p.ammo.cell >= 8) want = 4;
      else if (p.owned[3] && p.ammo.yarn >= 1 && d > 3.5) want = 3;
      else want = 0;
      if (want === 1 && !p.owned[1]) want = p.owned[2] ? 2 : 0;
      if (p.weapon !== want) cmd.weapon = want;
      let a = Math.atan2(e.y - p.y, e.x - p.x) - p.angle; a = Math.atan2(Math.sin(a), Math.cos(a));
      cmd.turn = Math.max(-0.2, Math.min(0.2, a));
      if (Math.abs(a) < 0.07 + 0.25 / Math.max(d, 1) && p.weapon === want) cmd.fire = (want === 1 || want === 3 || want === 0) ? (frame % 2 === 0) : true;
      strafeT--; if (strafeT <= 0) { strafeDir = -strafeDir; strafeT = 40 + (frame % 30); }
      if (want === 0) { cmd.forward = Math.abs(a) < 0.6 ? 1 : 0; }
      else { cmd.strafe = d > 2 ? strafeDir * 0.6 : 0; cmd.forward = d > 11 ? 0.7 : (d < 2.5 && want !== 3 ? -0.3 : 0); }
      if (TRACE && frame % 30 === 0) trace.push(['foe', e.type, d.toFixed(1), e.state, Math.round(e.hp), 'w' + p.weapon + '>' + want, JSON.stringify(p.ammo), p.wstate.phase, a.toFixed(2), cmd.fire]);
      G.cmd(cmd); lastP = null; stuck = 0; continue;
    } else { engaged = 0; engTarget = null; if (p.weapon === 0 && ranged) { cmd.weapon = p.ammo.hair >= 1 && p.owned[1] ? 1 : (p.owned[4] && p.ammo.cell >= 8 ? 4 : -1); } }
    // goal selection
    const EXIT = (window.__EXIT ??= (() => { const l = []; for (let i = 0; i < W * H; i++) if (w.cells[i] === 4) l.push(i); return l; })());
    let goal = -1, goalKind = '';
    let exitCell = -1, exitNb = -1, bd = 1e9;
    for (const i of EXIT) { const ex = i % W, ey = (i / W) | 0; for (const [dx, dy] of DIRS) { const n = (ey + dy) * W + ex + dx; if (ex + dx >= 0 && ey + dy >= 0 && ex + dx < W && ey + dy < H && dist[n] >= 0 && dist[n] < bd) { bd = dist[n]; exitNb = n; exitCell = i; } } }
    // useful pickups
    const hpn = p.health;
    let best = null, bs = 1e9;
    for (const it of g.pickups) {
      const ix = it.x | 0, iy = it.y | 0, dd = dist[iy * W + ix]; if (dd < 0) continue;
      const d = it.def; let lim = -1;
      if (d.key) lim = keys[d.key] ? -1 : (exitNb < 0 ? 999 : 12);
      else if (d.heal) lim = hpn < (d.max || 100) - 12 ? (hpn < 50 ? 45 : 14) : -1;
      else if (d.weapon !== undefined) lim = (!p.owned[d.weapon] ? 40 : (p.ammo[d.ammo[0]] < 40 ? 20 : -1));
      else if (d.ammo) lim = (p.ammo[d.ammo[0]] < (d.ammo[0] === 'hair' ? 70 : d.ammo[0] === 'yarn' ? 12 : 120)) ? (p.ammo[d.ammo[0]] < 20 ? 40 : 14) : -1;
      else if (d.life) lim = 30;
      else if (d.treasure) lim = 6;
      if (lim < 0 || dd > lim) continue;
      const sc = dd - (d.key ? 100 : 0);
      if (sc < bs) { bs = sc; best = it; }
    }
    let tcell = -1, useNow = false;
    if (best) { tcell = (best.y | 0) * W + (best.x | 0); goalKind = 'pickup:' + best.id; }
    else if (exitNb >= 0) { tcell = exitNb; goalKind = 'exit'; }
    else { // look for a pushwall to try
      let pb = 1e9; for (let i = 0; i < W * H; i++) if (w.cells[i] === 3) for (const [dx, dy] of DIRS) { const n = ((i / W | 0) + dy) * W + (i % W) + dx; if (n >= 0 && n < W * H && dist[n] >= 0 && dist[n] < pb) { pb = dist[n]; tcell = n; goalKind = 'push'; } }
    }
    let tx = p.x, ty = p.y;
    if (tcell >= 0) {
      if (dist[tcell] === 0) {
        if (goalKind === 'exit') { const ex = exitCell % W, ey = (exitCell / W) | 0; tx = ex + .5; ty = ey + .5; useNow = true; }
        else if (best) { tx = best.x; ty = best.y; }
        else { tx = p.x; ty = p.y; useNow = true; }
      } else {
        let c = tcell; while (par[c] !== (cy * W + cx) && par[c] >= 0) c = par[c];
        tx = (c % W) + .5; ty = ((c / W) | 0) + .5;
        if (w.doorAt[c] >= 0 && frame - lastUse > 15) useNow = true;
        // cut corner toward next-next cell when clear
        if (!useNow && Math.hypot(tx - p.x, ty - p.y) < 0.9 && par[c] === undefined) {}
      }
    } else if (dist[cy * W + cx] >= 0) { log.length < 6 && !log.includes('no goal') && log.push('no goal at ' + p.x.toFixed(1) + ',' + p.y.toFixed(1)); }
    let d = Math.atan2(ty - p.y, tx - p.x) - p.angle; d = Math.atan2(Math.sin(d), Math.cos(d));
    cmd.turn = Math.max(-0.14, Math.min(0.14, d));
    cmd.forward = (tcell >= 0 && !(dist[tcell] === 0 && goalKind === 'exit')) && Math.abs(d) < 0.5 ? 1 : 0;
    if (wiggle > 0) { wiggle--; cmd.strafe = wdir; cmd.forward = 1; cmd.use = frame % 10 === 0; }
    if (useNow && frame - lastUse > 12) { cmd.use = true; lastUse = frame; }
    G.cmd(cmd);
    if (frame % 90 === 0) {
      const m = Math.hypot(p.x - lx, p.y - ly); lx = p.x; ly = p.y;
      if (m < 0.3 && !(goalKind === 'exit' && dist[tcell] === 0)) { stuck++; wiggle = 40; wdir = -wdir; } else stuck = 0;
      if (stuck > 8) { return snap(g, false, 'stuck at ' + p.x.toFixed(1) + ',' + p.y.toFixed(1) + ' goal=' + goalKind + ' d=' + (tcell >= 0 ? dist[tcell] : -1)); }
    }
  }
  const g = G.game; return snap(g, false, 'timeout');
})()`;

let allOk = true;
for (const lv of levels) for (let run = 0; run < RUNS; run++) {
  const seed = SEED0 + run * 7919 + lv;
  const url = FIGHT ? `index.html?autostart=1&level=${lv}&mute=1&skill=${SKILL}&seed=${seed}${QUALITY ? '&quality=' + QUALITY : ''}` : `index.html?autostart=1&level=${lv}&mute=1&god=1`;
  const src = (FIGHT ? FIGHT_BOT(MAX) : BOT(MAX).replace('CELL_EXIT', '4'));
  const r = spawnSync('node', [path.join(ROOT, 'tools/shot.mjs'), '--url', url, '--out', path.join(ROOT, FIGHT ? 'out/shots/final-qa/bot.png' : 'out/shots/integ-lead/bot.png'), '--wait', '500', '--timeout', String((MAX + 30) * 1000), '--eval', src], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
  let res;
  try { const j = JSON.parse(r.stdout); res = { level: lv, seed, ...(j.eval ?? { reachedExit: false, why: 'no eval result' }), consoleErrors: (j.errors ?? []).length }; }
  catch { res = { level: lv, seed, reachedExit: false, why: 'shot failed: ' + (r.stderr || r.stdout || '').slice(0, 200) }; }
  if (!res.reachedExit && !FIGHT) allOk = false;
  console.log(JSON.stringify(res));
}
process.exit(allOk ? 0 : 1);
