#!/usr/bin/env bash
# Build dist/Kaesekrieg-Setup-win32-x64.exe (NSIS, per-user, no admin) inside win-devvm, then test it
# (silent install -> --smoke of installed exe -> silent uninstall -> verify removal). Usage: desktop/scripts/installer-windows.sh [--no-test]
# Needs the guest dist from build-windows.sh (it is run automatically if the guest has no packaged build).
# Downloads portable NSIS 3.10 into the guest build folder on first run only.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VMD="${VM_DIR:-$HOME/src/infra/win-devvm}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
vm() { (cd "$VMD" && ./vm.sh "$@"); }
fail() { echo "[installer] FAIL: $1" >&2; exit 1; }
VER="$(node -p 'require(process.argv[1]).version' "$ROOT/desktop/package.json" 2>/dev/null || echo 1.0.0)"
mkdir -p "$ROOT/dist"

vm status 2>&1 | grep -q '^running' || vm start >/dev/null 2>&1 || true
WAIT_TIMEOUT=600 vm wait >/dev/null 2>&1 || fail "VM not ready"

if ! vm ssh 'cmd /c "if exist %USERPROFILE%\kaesekrieg-build\dist\Kaesekrieg-win32-x64\Kaesekrieg.exe (exit /b 0) else (exit /b 1)"' >/dev/null 2>&1; then
  echo "[installer] no guest build; running build-windows.sh"; "$ROOT/desktop/scripts/build-windows.sh" || fail "build-windows"
fi

echo "[installer] push scripts"
vm ssh 'cmd /c "if not exist %USERPROFILE%\kaesekrieg-build\desktop\scripts\win mkdir %USERPROFILE%\kaesekrieg-build\desktop\scripts\win"' || fail ssh
for f in installer.nsi installer.cmd install-test.cmd; do
  vm push "$ROOT/desktop/scripts/win/$f" "kaesekrieg-build/desktop/scripts/win/$f" >/dev/null || fail "push $f"
done

echo "[installer] makensis (v$VER)"
vm ssh "cmd /c \"%USERPROFILE%\\kaesekrieg-build\\desktop\\scripts\\win\\installer.cmd $VER\"" 2>&1 | tail -15 \
  ; [ "${PIPESTATUS[0]}" -eq 0 ] || fail "guest installer build"
rm -f "$ROOT/dist/Kaesekrieg-Setup-win32-x64.exe"
vm pull kaesekrieg-build/dist/Kaesekrieg-Setup-win32-x64.exe "$ROOT/dist/" >/dev/null || fail "pull installer"

if [ "${1:-}" != "--no-test" ]; then
  echo "[installer] test: silent install/smoke/uninstall"
  vm ssh 'cmd /c "%USERPROFILE%\kaesekrieg-build\desktop\scripts\win\install-test.cmd"' >/dev/null 2>&1 || true
  vm pull kaesekrieg-build/install-test.log "$TMP/log" >/dev/null || fail "pull test log"
  cat "$TMP/log"
  for k in INSTALL_EXE=ok SHORTCUT=ok UNINSTALL_ENTRY=ok SMOKE_JSON=present UNINSTALL_DIR=removed UNINSTALL_SHORTCUT=removed UNINSTALL_REG=removed; do
    grep -q "^$k" "$TMP/log" || fail "expected $k"
  done
  vm pull kaesekrieg-build/smoke-inst/smoke.json "$TMP/smoke.json" >/dev/null || fail "pull smoke.json"
  node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1]));console.log("smoke ok="+j.ok+" fps="+j.fps+" errors="+(j.errors||[]).length);process.exit(j.ok?0:1)' "$TMP/smoke.json" || fail "installed smoke failed"
fi
ls -l "$ROOT/dist/Kaesekrieg-Setup-win32-x64.exe"; echo "[installer] done"
