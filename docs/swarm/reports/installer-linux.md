# installer-linux report

## Built
- `desktop/scripts/installer-linux.sh` (one run builds both; reads version from desktop/package.json, needs dist/Kaesekrieg-linux-x64/ built first).
- `dist/kaesekrieg_0.1.0_amd64.deb` (~84 MB): /opt/kaesekrieg, /usr/bin/kaesekrieg -> kaesekrieg.sh symlink, .desktop, 256px icon in hicolor, no-op-safe postinst (no setuid sandbox).
- `dist/Kaesekrieg-linux-x64-install.sh` (~110 MB): shell stub + appended tar.gz. Installs to ~/.local/share/kaesekrieg, ~/.local/bin/kaesekrieg symlink, ~/.local/share/applications/kaesekrieg.desktop (absolute Exec/Icon). `--uninstall` removes all three.

## Verified (no sudo, nothing system-wide)
- `dpkg-deb -x` to temp dir; `xvfb-run -a .../kaesekrieg.sh --smoke=<dir>` -> rc 0, smoke.json ok:true, page index.html.
- Self-extractor with HOME=temp: installed, `~/.local/bin/kaesekrieg --smoke` under xvfb-run -> rc 0, ok:true; `--uninstall` removed install dir, symlink, desktop file (only Chromium caches from the smoke run remained).
- Smoke invocation (desktop/README.md): `<binary> --smoke=<dir>` writes smoke.json + smoke.png; needs xvfb-run -a headless.

## Mistakes
- First draft used a 512x512 icon dir for a 256px icon, and copied the icon into the package dir temporarily; fixed (icon appended to tar from a temp dir).
- Source package dir is mode 700, so cp -a would have made /opt/kaesekrieg unreadable to other users; script now chmods go+rX.

## Learnings
- Launcher uses readlink -f so symlinks to kaesekrieg.sh work.
- Depends line in the .deb is a guess (gtk3, nss3, asound); not tested on a clean system. dpkg-deb --root-owner-group avoids needing fakeroot.
