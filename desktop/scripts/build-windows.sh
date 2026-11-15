#!/usr/bin/env bash
# One-command Windows build + smoke from Linux (win-devvm). Usage: desktop/scripts/build-windows.sh
# Env: VM_DIR (default ~/src/infra/win-devvm), NODE_VER (default 22.12.0; packager hangs on Node >= 25).
# Only touches C:\Users\<user>\kaesekrieg-build in the guest. Never reconfigures the VM.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VMD="${VM_DIR:-$HOME/src/infra/win-devvm}"
NODE_VER="${NODE_VER:-22.12.0}"
SHOTS="$ROOT/out/shots/native-windows"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
vm() { (cd "$VMD" && ./vm.sh "$@"); }
check() { node "$ROOT/tools/track.mjs" --check "$1" "$2" "$3" >/dev/null 2>&1 || true; }
fail() { echo "[windows] FAIL: $2" >&2; check "$1" fail "$2"; exit 1; }
mkdir -p "$SHOTS" "$ROOT/dist"
check build-windows running "started"; check smoke-windows running "waiting for build"

echo "[windows] vm"
if ! vm status 2>&1 | grep -q '^running'; then vm start >/dev/null 2>&1 || true; fi
WAIT_TIMEOUT=600 vm wait >/dev/null 2>&1 || fail build-windows "VM not ready"

echo "[windows] sync"
tar -C "$ROOT" --exclude=node_modules --exclude=.stage --exclude=dist --exclude=.node \
  -czf "$TMP/src.tgz" desktop src index.html style.css 2>/dev/null || fail build-windows "tar failed"
vm ssh 'cmd /c "if not exist %USERPROFILE%\kaesekrieg-build mkdir %USERPROFILE%\kaesekrieg-build"' || fail build-windows "ssh failed"
vm ssh 'cmd /c "cd /d %USERPROFILE%\kaesekrieg-build && rmdir /s /q desktop src 2>nul & exit /b 0"' || true
vm push "$TMP/src.tgz" kaesekrieg-build/src.tgz >/dev/null || fail build-windows "push failed"
vm ssh 'cmd /c "cd /d %USERPROFILE%\kaesekrieg-build && tar -xzf src.tgz && del src.tgz"' || fail build-windows "extract failed"

echo "[windows] build (node $NODE_VER)"
vm ssh "cmd /c \"%USERPROFILE%\\kaesekrieg-build\\desktop\\scripts\\win\\build.cmd $NODE_VER\"" 2>&1 | tail -25 \
  ; [ "${PIPESTATUS[0]}" -eq 0 ] || fail build-windows "guest build failed"
check build-windows pass "win32-x64 packaged and zipped"
rm -f "$ROOT/dist/Kaesekrieg-win32-x64.zip"
vm pull kaesekrieg-build/dist/Kaesekrieg-win32-x64.zip "$ROOT/dist/" >/dev/null || fail build-windows "pull zip failed"

echo "[windows] smoke"
rm -f "$SHOTS/smoke.json" "$SHOTS/smoke.png"
pull_smoke() { rm -rf "$TMP/smoke"; vm pull kaesekrieg-build/smoke "$TMP/smoke" >/dev/null 2>&1 || true; [ -f "$TMP/smoke/smoke.json" ]; }
SMOKE='%USERPROFILE%\kaesekrieg-build\desktop\scripts\win\smoke.cmd'
vm ssh "cmd /c \"$SMOKE\"" >/dev/null 2>&1 || true   # 1) plain ssh session
if ! pull_smoke; then
  echo "[windows] ssh session has no desktop; retrying via interactive scheduled task"
  vm ssh "cmd /c \"schtasks /Create /F /TN KKSmoke /SC ONCE /ST 00:00 /IT /RL HIGHEST /TR $SMOKE >nul & schtasks /Run /TN KKSmoke\"" >/dev/null 2>&1 || true
  for _ in $(seq 40); do sleep 5; pull_smoke && break; done
  vm ssh 'cmd /c "schtasks /Delete /F /TN KKSmoke"' >/dev/null 2>&1 || true
fi
[ -f "$TMP/smoke/smoke.json" ] && cp "$TMP/smoke/"smoke.* "$SHOTS/"
if [ -f "$SHOTS/smoke.json" ] && node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1]));console.log(JSON.stringify({ok:j.ok,page:j.page,gl:j.gl,fps:j.fps,errors:(j.errors||[]).length}));process.exit(j.ok?0:1)' "$SHOTS/smoke.json"; then
  check smoke-windows pass "smoke ok on win32-x64"; echo "[windows] done"
else
  fail smoke-windows "smoke failed or no smoke.json (see $SHOTS)"
fi
