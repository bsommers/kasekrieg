#!/usr/bin/env bash
# Build a drag-to-Applications .dmg on the Mac from the already-built .app, verify it, pull to dist/.
# Usage: MAC_HOST=user@macbuild.local desktop/scripts/installer-macos.sh
# Reuses ~/build/kaesekrieg/dist/Kaesekrieg-darwin-arm64/Kaesekrieg.app if present, else runs build-macos.sh.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HOST="${MAC_HOST:?set MAC_HOST, e.g. MAC_HOST=user@macbuild.local}"
SSH=(ssh -o BatchMode=yes -o ConnectTimeout=15 "$HOST")
RD="$("${SSH[@]}" 'echo $HOME/build/kaesekrieg')" || { echo "[dmg] ssh failed" >&2; exit 1; }
APP="$RD/dist/Kaesekrieg-darwin-arm64/Kaesekrieg.app"
mkdir -p "$ROOT/dist"

if ! "${SSH[@]}" "test -x '$APP/Contents/MacOS/Kaesekrieg'"; then
  echo "[dmg] no built app on Mac; running build-macos.sh"
  "$ROOT/desktop/scripts/build-macos.sh"
fi

echo "[dmg] build + verify on Mac"
"${SSH[@]}" "RD='$RD' zsh -s" <<'REMOTE'
set -e
cd "$RD"
APP="$RD/dist/Kaesekrieg-darwin-arm64/Kaesekrieg.app"
DMG="$RD/dist/Kaesekrieg-darwin-arm64.dmg"
STG="$RD/dist/.dmg-stage"
VOL=Kaesekrieg
hdiutil detach "/Volumes/$VOL" -force >/dev/null 2>&1 || true
rm -rf "$STG" "$DMG"; mkdir -p "$STG"
ditto "$APP" "$STG/Kaesekrieg.app"
ln -s /Applications "$STG/Applications"
cat > "$STG/README.txt" <<'TXT'
KAESEKRIEG - Claws of Marmalade (macOS, Apple Silicon)

Install: drag Kaesekrieg.app onto the Applications folder.

This build is ad-hoc signed, not notarized. On first launch macOS Gatekeeper
may refuse to open it. Either:
  1. Right-click (or Control-click) Kaesekrieg.app in Applications, choose Open,
     then click Open in the dialog; or
  2. In Terminal:  xattr -dr com.apple.quarantine /Applications/Kaesekrieg.app
TXT
hdiutil create -volname "$VOL" -srcfolder "$STG" -fs HFS+ -format UDZO -ov "$DMG" >/dev/null
rm -rf "$STG"
ls -l "$DMG"
hdiutil verify "$DMG" | tail -1
MNT="$(mktemp -d /tmp/kkdmg.XXXXXX)"
hdiutil attach "$DMG" -mountpoint "$MNT" -nobrowse -readonly >/dev/null
trap 'hdiutil detach "$MNT" -force >/dev/null 2>&1 || true' EXIT
ls "$MNT"
test -L "$MNT/Applications" && test -f "$MNT/README.txt" && test -d "$MNT/Kaesekrieg.app"
codesign --verify --deep "$MNT/Kaesekrieg.app" && echo "codesign ok (in dmg)"
rm -rf "$RD/smoke-dmg"; mkdir -p "$RD/smoke-dmg"
"$MNT/Kaesekrieg.app/Contents/MacOS/Kaesekrieg" --smoke="$RD/smoke-dmg" 2>&1 | tail -5 || true
test -f "$RD/smoke-dmg/smoke.json"
node=$(ls "$RD/.node/bin/node" 2>/dev/null || echo node)
"$node" -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1]));console.log(JSON.stringify({ok:j.ok,page:j.page,fps:j.fps,errors:(j.errors||[]).length}));process.exit(j.ok?0:1)' "$RD/smoke-dmg/smoke.json"
hdiutil detach "$MNT" >/dev/null && trap - EXIT && echo "detached"
REMOTE

echo "[dmg] pull"
rsync -a -e "ssh -o BatchMode=yes" "$HOST:$RD/dist/Kaesekrieg-darwin-arm64.dmg" "$ROOT/dist/"
ls -l "$ROOT/dist/Kaesekrieg-darwin-arm64.dmg"
echo "[dmg] done"
