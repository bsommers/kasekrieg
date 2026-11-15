# KÄSEKRIEG desktop shell

Electron wrapper; the game is served from `app://game/` (privileged scheme). No game dependencies.

- Dev: `cd desktop && npm install && npx electron .`
- Build: `node build.mjs --platform linux|win32|darwin --arch x64|arm64` -> `../dist/Kaesekrieg-<platform>-<arch>/`
  (re-execs under nvm Node 20/22/24 when run on Node >= 25, because extract-zip hangs there).
- Smoke: `<binary> --smoke=<dir>` writes `smoke.json` + `smoke.png`, exit 0/1. Falls back to `placeholder.html`
  if `index.html` defines no `window.__game` within 15 s (`page` in smoke.json says which was used).
  On Linux the unpackaged build needs `--no-sandbox` (chrome-sandbox is not setuid root); use `xvfb-run -a` headless.
- Icon: `node icon/make-icon.mjs` regenerates `icon/icon.png` (dependency-free).
- F11 toggles fullscreen.
