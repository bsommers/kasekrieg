# installer-macos
**Built:** `desktop/scripts/installer-macos.sh` (MAC_HOST required). On the Mac: reuses built .app (else runs build-macos.sh), stages Kaesekrieg.app + Applications symlink + README.txt (Gatekeeper: right-click Open / `xattr -dr com.apple.quarantine`), `hdiutil create` UDZO HFS+ vol "Kaesekrieg", pulls to `dist/Kaesekrieg-darwin-arm64.dmg` (122.9 MB).
**Verified (bigmac, macOS 27.0.1):** hdiutil verify VALID; attached read-only; contents Applications/Kaesekrieg.app/README.txt; codesign --deep ok inside dmg; `--smoke` from mounted app ok=true fps 30.2 errors 0; detached; pulled.
**Mistakes:** none in the run. build-macos.sh hook not added.
**Learnings:** hdiutil create/attach/detach print deprecation warnings on macOS 27 (still work; diskutil image is the successor). Staging via `ditto` preserves the signature. Mount with -nobrowse to avoid Finder noise.
