#!/usr/bin/env bash
# One-command macOS build + smoke from Linux. Usage: desktop/scripts/build-macos.sh
# Env: MAC_HOST (REQUIRED, e.g. user@macbuild.local — your Mac's ssh target), NODE_VER (default 22.12.0 — packager hangs on Node >= 25).
# Only touches ~/build/kaesekrieg on the Mac.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HOST="${MAC_HOST:?set MAC_HOST, e.g. MAC_HOST=user@macbuild.local}"
NODE_VER="${NODE_VER:-22.12.0}"
RDIR='$HOME/build/kaesekrieg'   # expanded on the Mac
SHOTS="$ROOT/out/shots/native-macos"
SSH=(ssh -o BatchMode=yes -o ConnectTimeout=15 "$HOST")
check() { node "$ROOT/tools/track.mjs" --check "$1" "$2" "$3" >/dev/null 2>&1 || true; }
fail() { echo "[macos] FAIL: $2" >&2; check "$1" fail "$2"; exit 1; }
mkdir -p "$SHOTS" "$ROOT/dist"
check build-macos running "started"; check smoke-macos running "waiting for build"

echo "[macos] sync"
"${SSH[@]}" "mkdir -p $RDIR" || fail build-macos "ssh to $HOST failed"
RD="$("${SSH[@]}" 'echo $HOME/build/kaesekrieg')"
rsync -az --delete --exclude node_modules --exclude .stage --exclude dist --exclude .node --exclude out \
  -e "ssh -o BatchMode=yes" --include='/desktop/***' --include='/src/***' --include='/index.html' --include='/style.css' \
  --exclude='/*' "$ROOT/" "$HOST:$RD/" || fail build-macos "rsync failed"
rsync -a --exclude .stage -e "ssh -o BatchMode=yes" "$ROOT/desktop/scripts/mac/" "$HOST:$RD/desktop/scripts/mac/" 2>/dev/null || true

echo "[macos] build (node $NODE_VER)"
if ! "${SSH[@]}" "RD='$RD' NODE_VER='$NODE_VER' zsh -s" <<'REMOTE'
set -e
cd "$RD"
if [ ! -x .node/bin/node ]; then
  mkdir -p .node
  curl -fsSL "https://nodejs.org/dist/v$NODE_VER/node-v$NODE_VER-darwin-arm64.tar.gz" | tar xz -C .node --strip-components=1
fi
export PATH="$RD/.node/bin:/opt/homebrew/bin:/usr/bin:/bin"
node -v
cd desktop
npm ci --no-audit --no-fund 2>&1 | tail -3
rm -rf ../dist
node build.mjs --platform darwin --arch arm64 2>&1 | tail -15
APP=../dist/Kaesekrieg-darwin-arm64/Kaesekrieg.app
codesign --force --deep -s - "$APP"
codesign --verify --deep "$APP" && echo "codesign ok"
rm -f ../dist/Kaesekrieg-darwin-arm64.zip
ditto -c -k --keepParent "$APP" ../dist/Kaesekrieg-darwin-arm64.zip
ls -l ../dist/Kaesekrieg-darwin-arm64.zip
REMOTE
then fail build-macos "remote build failed"; fi
check build-macos pass "darwin-arm64 .app built, ad-hoc signed, zipped"

echo "[macos] pull zip"
rsync -a -e "ssh -o BatchMode=yes" "$HOST:$RD/dist/Kaesekrieg-darwin-arm64.zip" "$ROOT/dist/" || fail build-macos "pull zip failed"

echo "[macos] smoke"
"${SSH[@]}" "rm -rf $RD/smoke; mkdir -p $RD/smoke"
"${SSH[@]}" "cd $RD && '$RD/dist/Kaesekrieg-darwin-arm64/Kaesekrieg.app/Contents/MacOS/Kaesekrieg' --smoke=$RD/smoke 2>&1 | tail -5" || true
rm -f "$SHOTS/smoke.json" "$SHOTS/smoke.png"
rsync -a -e "ssh -o BatchMode=yes" "$HOST:$RD/smoke/" "$SHOTS/" 2>/dev/null || true
if [ -f "$SHOTS/smoke.json" ] && node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1]));console.log(JSON.stringify({ok:j.ok,page:j.page,gl:j.gl,fps:j.fps,errors:(j.errors||[]).length}));process.exit(j.ok?0:1)' "$SHOTS/smoke.json"; then
  check smoke-macos pass "smoke ok on darwin-arm64"; echo "[macos] done"
else
  fail smoke-macos "smoke failed or produced no smoke.json (see $SHOTS)"
fi
