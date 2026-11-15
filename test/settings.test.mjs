import test from 'node:test';
import assert from 'node:assert/strict';
import { createInput } from '../src/core/input.js';
import {
  loadSettings, saveSettings, loadProgress, saveProgress, defaultSettings, SETTINGS_KEY, PROGRESS_KEY,
} from '../src/core/settings.js';

// ───── fakes ─────
function makeEnv() {
  const win = new EventTarget();
  const doc = new EventTarget();
  const canvas = new EventTarget();
  doc.pointerLockElement = null; doc.hidden = false;
  canvas.requestPointerLock = () => { doc.pointerLockElement = canvas; doc.dispatchEvent(new Event('pointerlockchange')); };
  const input = createInput(canvas, { window: win, document: doc, navigator: { getGamepads: () => [] } });
  const fire = (target, type, props = {}) => { const e = new Event(type, { cancelable: true }); Object.assign(e, props); target.dispatchEvent(e); return e; };
  const down = (code, extra) => fire(win, 'keydown', { code, repeat: false, ...extra });
  const up = code => fire(win, 'keyup', { code });
  const lock = () => { doc.pointerLockElement = canvas; fire(doc, 'pointerlockchange'); };
  const unlock = () => { doc.pointerLockElement = null; fire(doc, 'pointerlockchange'); };
  return { win, doc, canvas, input, fire, down, up, lock, unlock };
}

test('held movement keys are levels', () => {
  const { input, down, up } = makeEnv();
  down('KeyW'); down('KeyD'); down('ShiftLeft');
  let c = input.poll();
  assert.equal(c.forward, 1); assert.equal(c.strafe, 1); assert.equal(c.run, true);
  c = input.poll();
  assert.equal(c.forward, 1);
  up('KeyW'); up('KeyD'); up('ShiftLeft');
  c = input.poll();
  assert.equal(c.forward, 0); assert.equal(c.strafe, 0); assert.equal(c.run, false);
});

test('opposing keys cancel; arrows turn', () => {
  const { input, down } = makeEnv();
  down('KeyW'); down('KeyS');
  assert.equal(input.poll().forward, 0);
  down('ArrowRight');
  assert.ok(input.poll().turn > 0);
  down('ArrowLeft');
  assert.equal(input.poll().turn, 0);
});

test('edge fields fire exactly once per press', () => {
  const { input, down, up } = makeEnv();
  down('Space'); down('KeyM'); down('Digit3'); down('KeyQ');
  let c = input.poll();
  assert.equal(c.use, true); assert.equal(c.meow, true); assert.equal(c.weapon, 2); assert.equal(c.next, 1);
  c = input.poll();
  assert.equal(c.use, false); assert.equal(c.meow, false); assert.equal(c.weapon, -1); assert.equal(c.next, 0);
  // auto-repeat while held does not re-fire
  down('Space', { repeat: true }); down('Space', { repeat: true });
  assert.equal(input.poll().use, false);
  up('Space'); down('Space');
  assert.equal(input.poll().use, true);
});

test('a press and release between polls is not lost; double press collapses to one edge', () => {
  const { input, down, up } = makeEnv();
  down('KeyE'); up('KeyE'); down('KeyE'); up('KeyE');
  assert.equal(input.poll().use, true);
  assert.equal(input.poll().use, false);
});

test('weapon slots 1-5 map to 0..4', () => {
  const { input, down, up } = makeEnv();
  for (let i = 1; i <= 5; i++) {
    down(`Digit${i}`); assert.equal(input.poll().weapon, i - 1); up(`Digit${i}`);
  }
});

test('wheel edges', () => {
  const { input, win, fire } = makeEnv();
  fire(win, 'wheel', { deltaY: 100 });
  assert.equal(input.poll().next, 1);
  assert.equal(input.poll().next, 0);
  fire(win, 'wheel', { deltaY: -100 });
  assert.equal(input.poll().next, -1);
});

test('mouse deltas accumulate between polls only while locked, scaled by sensitivity', () => {
  const { input, win, fire, lock } = makeEnv();
  fire(win, 'mousemove', { movementX: 50 });          // not locked: ignored
  assert.equal(input.poll().turn, 0);
  lock();
  fire(win, 'mousemove', { movementX: 10 });
  fire(win, 'mousemove', { movementX: 15 });
  fire(win, 'mousemove', { movementX: -5 });
  const c = input.poll();
  assert.ok(Math.abs(c.turn - 20 * 0.0022) < 1e-9);
  assert.equal(input.poll().turn, 0);                  // consumed
  input.sensitivity = 2;
  fire(win, 'mousemove', { movementX: 10 });
  assert.ok(Math.abs(input.poll().turn - 10 * 0.0022 * 2) < 1e-9);
  fire(win, 'mousemove', { movementX: 100000 });        // glitch spike ignored
  assert.equal(input.poll().turn, 0);
});

test('first click requests lock without firing; later clicks fire', () => {
  const { input, canvas, win, fire } = makeEnv();
  fire(canvas, 'mousedown', { button: 0 });
  assert.equal(input.locked, true);
  assert.equal(input.poll().fire, false);
  fire(canvas, 'mousedown', { button: 0 });
  assert.equal(input.poll().fire, true);
  assert.equal(input.poll().fire, true);
  fire(win, 'mouseup', { button: 0 });
  assert.equal(input.poll().fire, false);
});

test('ctrl fires while held', () => {
  const { input, down, up } = makeEnv();
  down('ControlLeft'); assert.equal(input.poll().fire, true);
  up('ControlLeft'); assert.equal(input.poll().fire, false);
});

test('releasing pointer lock clears held keys, fire and pending mouse motion', () => {
  const { input, win, canvas, down, fire, lock, unlock } = makeEnv();
  lock(); fire(canvas, 'mousedown', { button: 0 });
  down('KeyW'); down('ControlLeft'); fire(win, 'mousemove', { movementX: 40 });
  unlock();
  const c = input.poll();
  assert.equal(c.forward, 0); assert.equal(c.fire, false); assert.equal(c.turn, 0);
  assert.equal(input.menu().pause, true);               // losing lock acts as a pause request
});

test('window blur clears held keys', () => {
  const { input, win, down, fire } = makeEnv();
  down('KeyW'); down('ShiftLeft'); down('ArrowLeft');
  fire(win, 'blur');
  const c = input.poll();
  assert.equal(c.forward, 0); assert.equal(c.run, false); assert.equal(c.turn, 0);
});

test('page hidden clears held keys', () => {
  const { input, doc, down, fire } = makeEnv();
  down('KeyD'); doc.hidden = true; fire(doc, 'visibilitychange');
  assert.equal(input.poll().strafe, 0);
});

test('menu edges fire once; pause on Esc and P; gameplay edges do not leak', () => {
  const { input, down, up } = makeEnv();
  down('ArrowDown'); down('Enter'); down('Escape'); down('Tab');
  let m = input.menu();
  assert.equal(m.down, true); assert.equal(m.accept, true); assert.equal(m.back, true); assert.equal(m.pause, true); assert.equal(m.map, true);
  m = input.menu();
  assert.deepEqual(Object.values(m).filter(Boolean), []);
  up('Escape'); down('KeyP');
  assert.equal(input.menu().pause, true);
  // a gameplay press (use) then menu(): use latch cleared, menu accept from Space still seen once
  down('Space');
  assert.equal(input.menu().accept, true);
  assert.equal(input.menu().accept, false);
});

test('poll() and menu() both see the same press (main calls both while playing)', () => {
  const { input, down } = makeEnv();
  down('Space');
  assert.equal(input.poll().use, true);
  assert.equal(input.menu().accept, true);
});

test('stale unconsumed edges expire', async () => {
  let t = 0;
  const win = new EventTarget(), doc = new EventTarget(), canvas = new EventTarget();
  const input = createInput(canvas, { window: win, document: doc, now: () => t });
  const e = new Event('keydown'); Object.assign(e, { code: 'Space', repeat: false }); win.dispatchEvent(e);
  t = 1000;
  assert.equal(input.poll().use, false);
  assert.equal(input.menu().accept, false);
});

test('menu direction keys auto-repeat; accept does not', () => {
  const { input, down } = makeEnv();
  down('ArrowRight'); input.menu();
  down('ArrowRight', { repeat: true });
  assert.equal(input.menu().right, true);
  down('Enter'); input.menu();
  down('Enter', { repeat: true });
  assert.equal(input.menu().accept, false);
});

test('gamepad: stick moves, A uses once', () => {
  const win = new EventTarget(), doc = new EventTarget(), canvas = new EventTarget();
  let pad = { connected: true, axes: [0.8, -1, 0.5, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })) };
  const input = createInput(canvas, { window: win, document: doc, navigator: { getGamepads: () => [pad] } });
  let c = input.poll();
  assert.equal(c.forward, 1); assert.equal(c.strafe, 0.8); assert.ok(c.turn > 0);
  pad.buttons[0] = { pressed: true, value: 1 };
  assert.equal(input.poll().use, true);
  assert.equal(input.poll().use, false);
});

test('dispose removes listeners', () => {
  const { input, down } = makeEnv();
  down('KeyW'); input.dispose();
  down('KeyS');
  assert.equal(input.poll().forward, 0);
});

test('preventDefault called for handled keys only', () => {
  const { down } = makeEnv();
  assert.equal(down('Tab').defaultPrevented, true);
  assert.equal(down('F5').defaultPrevented, false);
});

// ───── settings ─────
const memStore = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };

test('settings defaults when storage empty / missing', () => {
  assert.deepEqual(loadSettings(memStore()), defaultSettings());
  assert.deepEqual(loadSettings(null), defaultSettings());
  assert.deepEqual(loadSettings(), defaultSettings());     // no localStorage in Node
  assert.equal(loadSettings().volume.master, 0.8);
});

test('settings round-trip and returned objects are independent copies', () => {
  const st = memStore();
  const s = loadSettings(st);
  s.quality = 'high'; s.volume.music = 0.1; s.crt = true; s.skill = 3; s.sensitivity = 1.7;
  assert.equal(saveSettings(s, st), true);
  const r = loadSettings(st);
  assert.deepEqual(r, s);
  r.volume.master = 0;
  assert.equal(defaultSettings().volume.master, 0.8);
  assert.equal(loadSettings(st).volume.master, 0.8);
});

test('corrupt / hostile stored settings are sanitised', () => {
  const st = memStore();
  st.setItem(SETTINGS_KEY, '{not json');
  assert.deepEqual(loadSettings(st), defaultSettings());
  st.setItem(SETTINGS_KEY, JSON.stringify({ quality: 'ultra-mega', sensitivity: 9999, volume: { master: -4, sfx: 'x' }, fov: null, crt: 'yes', skill: 42, __proto__: { x: 1 } }));
  const r = loadSettings(st);
  assert.equal(r.quality, 'auto'); assert.equal(r.sensitivity, 5); assert.equal(r.volume.master, 0);
  assert.equal(r.volume.sfx, 0.9); assert.equal(r.fov, 1.5); assert.equal(r.crt, false); assert.equal(r.skill, 3);
  st.setItem(SETTINGS_KEY, 'null'); assert.deepEqual(loadSettings(st), defaultSettings());
  st.setItem(SETTINGS_KEY, '[1,2]'); assert.deepEqual(loadSettings(st), defaultSettings());
});

test('throwing localStorage never throws out', () => {
  const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
  assert.deepEqual(loadSettings(bad), defaultSettings());
  assert.equal(saveSettings(defaultSettings(), bad), false);
  assert.deepEqual(loadProgress(bad), { unlocked: 1, skill: 1, best: {} });
  assert.equal(saveProgress({ unlocked: 3 }, bad), false);
  // throwing global accessor
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
  try {
    assert.deepEqual(loadSettings(), defaultSettings());
    assert.equal(saveSettings(defaultSettings()), false);
    assert.equal(loadProgress().unlocked, 1);
  } finally { delete globalThis.localStorage; }
});

test('progress round-trip, clamping and junk rejection', () => {
  const st = memStore();
  assert.equal(saveProgress({ unlocked: 4, skill: 2, best: { e1m1: { time: 80, kills: 9, evil: 'x' }, 'bad id!': { time: 1 }, e1m2: 5 } }, st), true);
  const p = loadProgress(st);
  assert.equal(p.unlocked, 4); assert.equal(p.skill, 2);
  assert.deepEqual(p.best, { e1m1: { time: 80, kills: 9 } });
  st.setItem(PROGRESS_KEY, JSON.stringify({ unlocked: -5, skill: 'x' }));
  assert.deepEqual(loadProgress(st), { unlocked: 1, skill: 1, best: {} });
});
