# desktop-shell report

## What I built
desktop/main.cjs (app:// protocol, smoke mode, F11, placeholder fallback), preload.cjs, package.json, placeholder.html (written by an earlier, cut-off agent), plus build.mjs (stage + @electron/packager), icon/make-icon.mjs -> icon/icon.png, README.md. Linux x64 package in dist/Kaesekrieg-linux-x64.

## Verification evidence
- `node desktop/build.mjs --platform linux --arch x64` succeeds.
- `xvfb-run -a dist/Kaesekrieg-linux-x64/Kaesekrieg --no-sandbox --smoke=<dir>`: ok=true, page=index.html (real game booted, state playing), gl=SwiftShader, fps 28.6, 0 errors. Screenshot: out/shots/desktop-shell/smoke.png (+smoke.json).
- Fallback: with a game dir whose index.html lacks __game, smoke used placeholder.html (fps 60, ok) -> out/shots/desktop-shell/smoke-placeholder.png.
- Tracker checks recorded: build-linux, smoke-linux, desktop-shell.

## Deviations from the contract
None. Windows and macOS builds not attempted here (build hosts per ARCHITECTURE section 14).

## Mistakes I made and how I fixed them
- Tried adding no-sandbox via app.commandLine in main.cjs: too late, Chromium checks the SUID helper before app code. Reverted; pass `--no-sandbox` on the command line.

## Learnings for a future agent
- @electron/packager silently hangs ("unsettled top-level await") on Node 26 (extract-zip). Works on Node 24; build.mjs re-execs under nvm Node 20/22/24 automatically.
- Unpackaged Linux Electron needs --no-sandbox (or chrome-sandbox chown root + 4755).

## Requests for other modules
None.
