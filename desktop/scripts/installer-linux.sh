#!/bin/bash
# Builds dist/kaesekrieg_<ver>_amd64.deb and dist/Kaesekrieg-linux-x64-install.sh
# from dist/Kaesekrieg-linux-x64/ (run `node desktop/build.mjs --platform linux --arch x64` first).
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
PKG="$ROOT/dist/Kaesekrieg-linux-x64"
[ -x "$PKG/kaesekrieg.sh" ] || { echo "missing $PKG/kaesekrieg.sh; build first" >&2; exit 1; }
VER=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$ROOT/desktop/package.json" | head -1)
ICON="$ROOT/desktop/icon/icon.png"
WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT
DESC="First-person cheese-war shooter"

# ---------- .deb ----------
D="$WORK/deb"
mkdir -p "$D/DEBIAN" "$D/opt" "$D/usr/bin" "$D/usr/share/applications" "$D/usr/share/icons/hicolor/256x256/apps"
cp -a "$PKG" "$D/opt/kaesekrieg"
ln -s /opt/kaesekrieg/kaesekrieg.sh "$D/usr/bin/kaesekrieg"
cp "$ICON" "$D/usr/share/icons/hicolor/256x256/apps/kaesekrieg.png"
cat > "$D/usr/share/applications/kaesekrieg.desktop" <<EOT
[Desktop Entry]
Type=Application
Name=KÄSEKRIEG
Comment=$DESC
Exec=/usr/bin/kaesekrieg
Icon=kaesekrieg
Terminal=false
Categories=Game;ActionGame;
EOT
SIZE=$(du -sk "$D/opt" | cut -f1)
cat > "$D/DEBIAN/control" <<EOT
Package: kaesekrieg
Version: $VER
Architecture: amd64
Maintainer: KAESEKRIEG <noreply@localhost>
Installed-Size: $SIZE
Section: games
Priority: optional
Depends: libgtk-3-0 | libgtk-3-0t64, libnss3, libasound2 | libasound2t64
Description: KAESEKRIEG: Claws of Marmalade
 $DESC (Electron). Launcher runs with --no-sandbox.
EOT
cat > "$D/DEBIAN/postinst" <<'EOT'
#!/bin/sh
set -e
# chrome-sandbox setuid not needed: launcher passes --no-sandbox.
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database -q /usr/share/applications || true
command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -q -t /usr/share/icons/hicolor || true
exit 0
EOT
chmod 755 "$D/DEBIAN/postinst"
chmod -R u+rwX,go+rX,go-w "$D/opt" "$D/usr"
find "$D" -type d -exec chmod 755 {} +
dpkg-deb --root-owner-group --build "$D" "$ROOT/dist/kaesekrieg_${VER}_amd64.deb" >/dev/null
echo "built dist/kaesekrieg_${VER}_amd64.deb"

# ---------- self-extracting per-user installer ----------
OUT="$ROOT/dist/Kaesekrieg-linux-x64-install.sh"
mkdir "$WORK/ic"; cp "$ICON" "$WORK/ic/kaesekrieg.png"
tar -C "$PKG" -cf "$WORK/payload.tar" .
tar -C "$WORK/ic" -rf "$WORK/payload.tar" kaesekrieg.png
gzip -n "$WORK/payload.tar"; mv "$WORK/payload.tar.gz" "$WORK/payload.tgz"
cat > "$OUT" <<'EOT'
#!/bin/sh
# KAESEKRIEG per-user installer. Usage: sh installer.sh [--uninstall]
set -e
DEST="$HOME/.local/share/kaesekrieg"
BIN="$HOME/.local/bin/kaesekrieg"
APP="$HOME/.local/share/applications/kaesekrieg.desktop"
if [ "$1" = "--uninstall" ]; then
  rm -rf "$DEST"; rm -f "$BIN" "$APP"
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database -q "$HOME/.local/share/applications" || true
  echo "KAESEKRIEG uninstalled."; exit 0
fi
[ -z "$1" ] || { echo "usage: $0 [--uninstall]" >&2; exit 2; }
rm -rf "$DEST"; mkdir -p "$DEST" "$HOME/.local/bin" "$HOME/.local/share/applications"
LINE=$(awk '/^__PAYLOAD_BELOW__$/ {print NR + 1; exit 0}' "$0")
tail -n +"$LINE" "$0" | tar -xzf - -C "$DEST"
ln -sf "$DEST/kaesekrieg.sh" "$BIN"
cat > "$APP" <<EOD
[Desktop Entry]
Type=Application
Name=KÄSEKRIEG
Comment=First-person cheese-war shooter
Exec=$DEST/kaesekrieg.sh
Icon=$DEST/kaesekrieg.png
Terminal=false
Categories=Game;ActionGame;
EOD
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database -q "$HOME/.local/share/applications" || true
echo "Installed to $DEST. Run: kaesekrieg (ensure ~/.local/bin is in PATH)"
exit 0
__PAYLOAD_BELOW__
EOT
cat "$WORK/payload.tgz" >> "$OUT"
chmod 755 "$OUT"
echo "built dist/Kaesekrieg-linux-x64-install.sh"
