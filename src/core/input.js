// KÄSEKRIEG input (ARCHITECTURE §11): keyboard, mouse (pointer lock), wheel, gamepad -> cmd (§8.2) and menu edges.
// Pure event-driven; `opts.window` / `opts.document` / `opts.navigator` can be injected so it runs under Node tests.
//
// Semantics:
//  - Held fields (forward, strafe, run, fire) are levels; turn accumulates mouse deltas between polls.
//  - Edge fields (use, weapon, next, meow) and menu() fields fire exactly once per press: latched on keydown
//    (auto-repeat ignored; menu directions may repeat), consumed by the next poll()/menu().
//  - Losing pointer lock, window blur or page hide clears every held key/button and pending mouse motion.

const TURN_RATE = 2.4;        // rad/s for keyboard / stick turning
const MOUSE_RAD = 0.0022;     // rad per pixel at sensitivity 1
const MAX_MOUSE_STEP = 600;   // ignore absurd single-event jumps (known Chromium pointer-lock glitch)
const DEADZONE = 0.22;
const TICK = 1 / 60;
const EDGE_TTL = 250;

const CODE_MAP = {
  forward: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'],
  strafeL: ['KeyA'], strafeR: ['KeyD'],
  turnL: ['ArrowLeft'], turnR: ['ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'], fire: ['ControlLeft', 'ControlRight'],
  use: ['Space', 'KeyE'], meow: ['KeyM'], nextW: ['KeyQ'],
};
const WEAPON_CODES = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3, Numpad5: 4 };
const MENU_CODES = {
  up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'], left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'],
  accept: ['Enter', 'NumpadEnter', 'Space'], back: ['Escape', 'Backspace'], pause: ['Escape', 'KeyP'], map: ['Tab'],
};
const REPEATABLE_MENU = new Set(['up', 'down', 'left', 'right']);

const codeToAction = new Map();
for (const [a, codes] of Object.entries(CODE_MAP)) for (const c of codes) codeToAction.set(c, a);
const codeToMenu = new Map();
for (const [a, codes] of Object.entries(MENU_CODES)) for (const c of codes) {
  if (!codeToMenu.has(c)) codeToMenu.set(c, []);
  codeToMenu.get(c).push(a);
}
const HANDLED = new Set([...codeToAction.keys(), ...codeToMenu.keys(), ...Object.keys(WEAPON_CODES)]);

const MENU_KEYS = ['up', 'down', 'left', 'right', 'accept', 'back', 'pause', 'map'];

export function createInput(canvas, opts = {}) {
  const win = opts.window ?? globalThis.window ?? globalThis;
  const doc = opts.document ?? globalThis.document ?? null;
  const nav = opts.navigator ?? globalThis.navigator ?? null;
  const tickDt = opts.tickDt ?? TICK;

  const held = new Set();             // currently-down key codes
  let mouseFire = false;
  let mouseDX = 0;
  let wasLocked = false;
  let pad = null;                     // last gamepad snapshot (for edge detection)

  // latched edges, one set per consumer
  let ge = { use: false, weapon: -1, next: 0, meow: false };
  let me = Object.fromEntries(MENU_KEYS.map(k => [k, false]));

  const api = {
    sensitivity: opts.sensitivity ?? 1,
    get locked() { return !!doc && !!canvas && doc.pointerLockElement === canvas; },
    requestLock() {
      try {
        const r = canvas?.requestPointerLock?.();
        if (r && typeof r.catch === 'function') r.catch(() => {});
      } catch { /* not allowed right now (no gesture / headless) */ }
    },
    poll, menu, dispose, clear,
  };

  // Edges not consumed within EDGE_TTL ms are stale (e.g. Space pressed to accept a menu item must not also
  // 'use' on the first gameplay tick): drop them. Callers poll() and menu() every frame while playing.
  let geStamp = 0, meStamp = 0;
  const nowMs = opts.now ?? (() => (globalThis.performance?.now?.() ?? Date.now()));
  function expire() {
    const t = nowMs();
    if (t - geStamp > EDGE_TTL) ge = { use: false, weapon: -1, next: 0, meow: false };
    if (t - meStamp > EDGE_TTL) me = Object.fromEntries(MENU_KEYS.map(k => [k, false]));
  }
  function clear() {
    held.clear(); mouseFire = false; mouseDX = 0;
  }
  const isHeld = action => {
    for (const c of CODE_MAP[action]) if (held.has(c)) return true;
    return false;
  };

  // ───── events ─────
  function onKeyDown(e) {
    const code = e.code;
    if (!code) return;
    if (HANDLED.has(code) && !e.metaKey && !e.altKey && typeof e.preventDefault === 'function') e.preventDefault();
    const first = !e.repeat && !held.has(code);
    held.add(code);
    expire();
    geStamp = meStamp = nowMs();
    const menus = codeToMenu.get(code);
    if (menus) for (const m of menus) if (first || (e.repeat && REPEATABLE_MENU.has(m))) me[m] = true;
    if (!first) return;
    const act = codeToAction.get(code);
    if (act === 'use') ge.use = true;
    else if (act === 'meow') ge.meow = true;
    else if (act === 'nextW') ge.next = 1;
    if (code in WEAPON_CODES) ge.weapon = WEAPON_CODES[code];
  }
  function onKeyUp(e) { if (e.code) held.delete(e.code); }

  function onMouseMove(e) {
    if (!api.locked) return;
    const dx = Number(e.movementX) || 0;
    if (Math.abs(dx) > MAX_MOUSE_STEP) return;
    mouseDX += dx;
  }
  function onMouseDown(e) {
    if (e.button !== 0) return;
    if (!api.locked) { api.requestLock(); return; }   // first click grabs the mouse; it does not shoot
    mouseFire = true;
    if (typeof e.preventDefault === 'function') e.preventDefault();
  }
  function onMouseUp(e) { if (e.button === 0) mouseFire = false; }
  function onWheel(e) {
    const dy = Number(e.deltaY) || 0;
    if (dy === 0) return;
    expire(); geStamp = nowMs();
    ge.next = dy > 0 ? 1 : -1;
    if (api.locked && typeof e.preventDefault === 'function') e.preventDefault();
  }
  function onLockChange() {
    const now = api.locked;
    if (wasLocked && !now) {            // lock lost (Esc is swallowed by the browser): behave like a pause press
      clear();
      expire(); meStamp = nowMs();
      me.pause = true;
    }
    if (now !== wasLocked) { mouseDX = 0; }
    wasLocked = now;
  }
  function onBlur() { clear(); }
  function onVisibility() { if (doc && doc.hidden) clear(); }
  function onContext(e) { if (api.locked && typeof e.preventDefault === 'function') e.preventDefault(); }

  const listeners = [
    [win, 'keydown', onKeyDown], [win, 'keyup', onKeyUp], [win, 'blur', onBlur],
    [win, 'mouseup', onMouseUp], [win, 'mousemove', onMouseMove], [win, 'wheel', onWheel, { passive: false }],
    [doc, 'pointerlockchange', onLockChange], [doc, 'visibilitychange', onVisibility],
    [canvas, 'mousedown', onMouseDown], [canvas, 'contextmenu', onContext],
  ];
  for (const [t, n, f, o] of listeners) t?.addEventListener?.(n, f, o);

  // ───── gamepad (standard mapping) ─────
  function readPad() {
    let gp = null;
    try {
      const pads = nav?.getGamepads?.();
      if (pads) for (const p of pads) if (p && p.connected !== false) { gp = p; break; }
    } catch { /* ignore */ }
    if (!gp) { pad = null; return null; }
    const ax = i => { const v = gp.axes?.[i] ?? 0; return Math.abs(v) < DEADZONE ? 0 : v; };
    const b = i => !!(gp.buttons?.[i]?.pressed || (gp.buttons?.[i]?.value ?? 0) > 0.5);
    const cur = {
      lx: ax(0), ly: ax(1), rx: ax(2),
      fire: b(7), run: b(6),
      a: b(0), bb: b(1), x: b(2), y: b(3), lb: b(4), rb: b(5), sel: b(8), start: b(9),
      up: b(12), down: b(13), left: b(14), right: b(15),
    };
    const prev = pad;
    pad = cur;
    const edge = k => cur[k] && !(prev && prev[k]);
    return { cur, edge, ly: cur.ly };
  }

  // ───── consumers ─────
  function poll() {
    expire();
    const g = readPad();

    let forward = (isHeld('forward') ? 1 : 0) - (isHeld('back') ? 1 : 0);
    let strafe = (isHeld('strafeR') ? 1 : 0) - (isHeld('strafeL') ? 1 : 0);
    let turn = ((isHeld('turnR') ? 1 : 0) - (isHeld('turnL') ? 1 : 0)) * TURN_RATE * tickDt;
    turn += mouseDX * MOUSE_RAD * api.sensitivity;
    mouseDX = 0;
    let run = isHeld('run');
    let fire = isHeld('fire') || mouseFire;

    const cmd = { forward: 0, strafe: 0, turn: 0, run: false, fire: false, use: ge.use, weapon: ge.weapon, next: ge.next, meow: ge.meow };
    if (g) {
      forward -= g.cur.ly; strafe += g.cur.lx;
      if (g.cur.up) forward += 1;
      if (g.cur.down) forward -= 1;
      turn += g.cur.rx * TURN_RATE * 1.4 * tickDt * api.sensitivity;
      if (g.cur.left) turn -= TURN_RATE * tickDt;
      if (g.cur.right) turn += TURN_RATE * tickDt;
      run = run || g.cur.run;
      fire = fire || g.cur.fire;
      if (g.edge('a') || g.edge('x')) cmd.use = true;
      if (g.edge('y')) cmd.meow = true;
      if (g.edge('lb')) cmd.next = -1;
      if (g.edge('rb')) cmd.next = 1;
    }
    cmd.forward = Math.max(-1, Math.min(1, forward));
    cmd.strafe = Math.max(-1, Math.min(1, strafe));
    cmd.turn = turn;
    cmd.run = !!run;
    cmd.fire = !!fire;
    ge = { use: false, weapon: -1, next: 0, meow: false };
    return cmd;
  }

  function menu() {
    expire();
    const out = me;
    me = Object.fromEntries(MENU_KEYS.map(k => [k, false]));
    const g = readPad();
    if (g) {
      if (g.edge('up')) out.up = true;
      if (g.edge('down')) out.down = true;
      if (g.edge('left')) out.left = true;
      if (g.edge('right')) out.right = true;
      if (g.edge('a')) out.accept = true;
      if (g.edge('bb')) out.back = true;
      if (g.edge('start')) out.pause = true;
      if (g.edge('sel')) out.map = true;
    }
    return out;
  }

  function dispose() {
    for (const [t, n, f, o] of listeners) t?.removeEventListener?.(n, f, o);
    clear();
  }

  return api;
}
