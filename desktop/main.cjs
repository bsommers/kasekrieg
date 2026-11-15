// KÄSEKRIEG desktop shell (Electron main process). ARCHITECTURE §14.
// - Serves the game from a privileged app:// protocol (app://game/index.html).
// - No menu bar; F11 toggles fullscreen.
// - Smoke mode: `<binary> --smoke=<dir>` boots the demo, waits for __game.ready + 5 s, writes smoke.json + smoke.png.
'use strict';
const { app, BrowserWindow, Menu, protocol, ipcMain, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const HOST = 'game';
const ORIGIN = `app://${HOST}`;
const PLACEHOLDER = '__placeholder.html';
const SMOKE_QUERY = '?autostart=1&level=1&demo=1&mute=1&quality=low';
const DEFINE_TIMEOUT_MS = 15000;   // __game must exist by then, else fall back to placeholder.html
const READY_TIMEOUT_MS = 60000;    // __game.ready must become true by then
const SETTLE_MS = 5000;            // extra wait after ready
const HARD_TIMEOUT_MS = 120000;    // whole smoke run

// ── argument parsing ────────────────────────────────────────────────
function argValue(name) {
  const pre = `--${name}=`;
  for (let i = 0; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a.startsWith(pre)) return a.slice(pre.length);
    if (a === `--${name}` && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  }
  return null;
}
const smokeArg = argValue('smoke');
const SMOKE_DIR = smokeArg ? path.resolve(smokeArg) : null;
const QUERY_OVERRIDE = argValue('query'); // optional: e.g. --query="?level=3&god=1" for manual testing

// ── game root ───────────────────────────────────────────────────────
// Packaged: build.mjs stages index.html, style.css, src/ into <app>/game/.
// Dev (`electron .` inside desktop/): fall back to the repository root.
function findGameRoot() {
  const env = process.env.KAESEKRIEG_GAME_DIR;
  const candidates = [env, path.join(__dirname, 'game'), path.join(__dirname, '..')].filter(Boolean);
  for (const c of candidates) {
    try { if (fs.existsSync(path.join(c, 'index.html')) || fs.existsSync(path.join(c, 'src'))) return path.resolve(c); } catch { /* next */ }
  }
  return path.join(__dirname, 'game');
}
const GAME_ROOT = findGameRoot();

// ── GPU switches (must be set before ready) ─────────────────────────
if (SMOKE_DIR || process.env.KAESEKRIEG_SOFTWARE_GL) {
  app.commandLine.appendSwitch('enable-unsafe-swiftshader');
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
}
if (SMOKE_DIR) {
  // Keep the page running at full speed even if the window is occluded / unfocused.
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
  // Smoke runs must not collide with a user's running instance profile.
  try { app.setPath('userData', path.join(SMOKE_DIR, '.userdata')); } catch { /* ignore */ }
}

protocol.registerSchemesAsPrivileged([{
  scheme: 'app',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true },
}]);

// ── app:// protocol ─────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg',
  '.glsl': 'text/plain; charset=utf-8', '.frag': 'text/plain; charset=utf-8', '.vert': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.wasm': 'application/wasm', '.woff2': 'font/woff2',
};

function resolveRequest(urlStr) {
  let u;
  try { u = new URL(urlStr); } catch { return null; }
  if (u.host !== HOST) return null;
  let rel;
  try { rel = decodeURIComponent(u.pathname); } catch { return null; }
  if (rel === '/' || rel === '') rel = '/index.html';
  if (rel === '/' + PLACEHOLDER) return path.join(__dirname, 'placeholder.html');
  const abs = path.resolve(GAME_ROOT, '.' + rel);
  const rootWithSep = GAME_ROOT.endsWith(path.sep) ? GAME_ROOT : GAME_ROOT + path.sep;
  if (abs !== GAME_ROOT && !abs.startsWith(rootWithSep)) return null; // path traversal guard
  return abs;
}

function registerProtocol() {
  protocol.handle('app', async (request) => {
    const file = resolveRequest(request.url);
    if (!file) return new Response('Forbidden', { status: 403, headers: { 'content-type': 'text/plain' } });
    try {
      const data = await fs.promises.readFile(file);
      const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
      return new Response(data, { status: 200, headers: { 'content-type': type, 'cache-control': 'no-cache' } });
    } catch {
      return new Response('Not found: ' + new URL(request.url).pathname, { status: 404, headers: { 'content-type': 'text/plain' } });
    }
  });
}

// ── window ─────────────────────────────────────────────────────────
function iconPath() {
  const p = path.join(__dirname, 'icon', 'icon.png');
  return fs.existsSync(p) ? p : undefined;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 720, minWidth: 640, minHeight: 360,
    backgroundColor: '#000000',
    title: 'KÄSEKRIEG: Claws of Marmalade',
    icon: iconPath(),
    autoHideMenuBar: true,
    show: !!SMOKE_DIR, // smoke: show at once (capturePage needs a painted window); else wait for ready-to-show
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: !SMOKE_DIR,
      spellcheck: false,
    },
  });
  win.setMenuBarVisibility(false);
  if (!SMOKE_DIR) win.once('ready-to-show', () => win.show());

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.key === 'Enter' && input.alt)) {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    } else if (input.key === 'F12' && input.control && input.shift) {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });
  // Keep navigation inside the app; never open external windows.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(ORIGIN + '/')) e.preventDefault(); });
  return win;
}

ipcMain.handle('desktop:toggle-fullscreen', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win) win.setFullScreen(!win.isFullScreen());
  return win ? win.isFullScreen() : false;
});
ipcMain.handle('desktop:quit', () => { app.quit(); });

// ── smoke mode ──────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function evalSafe(wc, js, fallback = null) {
  try { return await wc.executeJavaScript(js, true); } catch { return fallback; }
}

async function waitFor(wc, js, timeoutMs, stepMs = 250) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (wc.isDestroyed()) return false;
    if (await evalSafe(wc, js, false)) return true;
    await sleep(stepMs);
  }
  return false;
}

const GL_PROBE = `(() => {
  try {
    const g = window.__game;
    const fromGame = g && g.renderer && g.renderer.stats && g.renderer.stats.renderer;
    if (fromGame) return String(fromGame);
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) return null;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const r = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
    return String(r);
  } catch (e) { return null; }
})()`;

const STATE_PROBE = `(() => {
  const g = window.__game || {};
  let errors = [];
  try { errors = (g.errors || []).map((e) => typeof e === 'string' ? e : (e && (e.stack || e.message)) || JSON.stringify(e)); } catch (e) { errors = ['errors unreadable: ' + e]; }
  return { ready: !!g.ready, state: g.state ?? null, fps: typeof g.fps === 'number' ? g.fps : null, errors, placeholder: !!g.placeholder };
})()`;

async function runSmoke() {
  fs.mkdirSync(SMOKE_DIR, { recursive: true });
  const t0 = Date.now();
  const result = {
    ok: false, gl: null, fps: null, errors: [], platform: process.platform, arch: process.arch,
    page: null, url: null, state: null, consoleErrors: [], electron: process.versions.electron,
    chrome: process.versions.chrome, gameRoot: GAME_ROOT, elapsedMs: 0,
  };
  let finished = false;
  const finish = async (win, extraError) => {
    if (finished) return;
    finished = true;
    if (extraError) result.errors.push(extraError);
    if (win && !win.isDestroyed()) {
      try {
        const img = await win.webContents.capturePage();
        fs.writeFileSync(path.join(SMOKE_DIR, 'smoke.png'), img.toPNG());
        result.screenshot = { width: img.getSize().width, height: img.getSize().height, empty: img.isEmpty() };
      } catch (e) { result.errors.push('capturePage failed: ' + e.message); }
    }
    result.elapsedMs = Date.now() - t0;
    result.ok = !!result.ready && !!result.gl && result.errors.length === 0;
    delete result.ready;
    fs.writeFileSync(path.join(SMOKE_DIR, 'smoke.json'), JSON.stringify(result, null, 2) + '\n');
    console.log('[smoke] ' + JSON.stringify({ ok: result.ok, page: result.page, gl: result.gl, fps: result.fps, errors: result.errors.length }));
    app.exit(result.ok ? 0 : 1);
  };

  const win = createWindow();
  const wc = win.webContents;
  const hard = setTimeout(() => finish(win, `smoke hard timeout after ${HARD_TIMEOUT_MS} ms`), HARD_TIMEOUT_MS);
  hard.unref?.();
  wc.on('console-message', (...args) => {
    // Electron ≥35 passes a single event object; older versions (event, level, message, line, source).
    const e = args[0];
    const level = e && e.level !== undefined ? e.level : args[1];
    const message = e && e.message !== undefined ? e.message : args[2];
    if (level === 'error' || level === 3) result.consoleErrors.push(String(message).slice(0, 500));
  });
  wc.on('render-process-gone', (_e, d) => finish(win, `renderer gone: ${d.reason} (${d.exitCode})`));

  const gameUrl = ORIGIN + '/index.html' + (QUERY_OVERRIDE || SMOKE_QUERY);
  result.page = 'index.html';
  result.url = gameUrl;
  try { await win.loadURL(gameUrl); } catch (e) { result.consoleErrors.push('load index.html: ' + e.message); }

  let defined = await waitFor(wc, 'typeof window.__game === "object" && window.__game !== null', DEFINE_TIMEOUT_MS);
  if (!defined) {
    result.page = 'placeholder.html';
    result.fallbackReason = `index.html did not define window.__game within ${DEFINE_TIMEOUT_MS / 1000} s`;
    result.url = ORIGIN + '/' + PLACEHOLDER + SMOKE_QUERY;
    result.consoleErrors = [];
    try { await win.loadURL(result.url); } catch (e) { result.errors.push('load placeholder: ' + e.message); }
    defined = await waitFor(wc, 'typeof window.__game === "object" && window.__game !== null', DEFINE_TIMEOUT_MS);
  }
  const ready = defined && await waitFor(wc, '!!(window.__game && window.__game.ready)', READY_TIMEOUT_MS);
  result.ready = ready;
  if (!ready) {
    const st = await evalSafe(wc, STATE_PROBE, null);
    if (st) { result.errors.push(...st.errors); result.state = st.state; }
    clearTimeout(hard);
    return finish(win, `__game.ready never became true on ${result.page}`);
  }
  await sleep(SETTLE_MS);
  const st = await evalSafe(wc, STATE_PROBE, null);
  if (st) {
    result.fps = st.fps; result.errors.push(...st.errors); result.state = st.state;
    if (st.placeholder) result.page = 'placeholder.html';
  } else result.errors.push('could not read window.__game');
  result.gl = await evalSafe(wc, GL_PROBE, null);
  if (!result.gl) result.errors.push('WebGL2 unavailable');
  clearTimeout(hard);
  return finish(win);
}

// ── lifecycle ───────────────────────────────────────────────────────
if (!SMOKE_DIR && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const w = BrowserWindow.getAllWindows()[0];
    if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
  });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    registerProtocol();
    // Deny all permission prompts except fullscreen / pointer lock / gamepad-ish ones the game uses.
    session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(['fullscreen', 'pointerLock', 'keyboardLock'].includes(perm)));
    if (SMOKE_DIR) { runSmoke().catch((e) => { console.error(e); app.exit(1); }); return; }
    const win = createWindow();
    win.loadURL(ORIGIN + '/index.html' + (QUERY_OVERRIDE || ''));
  });
  app.on('window-all-closed', () => app.quit());
}
