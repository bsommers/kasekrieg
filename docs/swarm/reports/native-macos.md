# native-macos report

## What I built
`desktop/scripts/build-macos.sh` — one command from Linux (re-runnable): rsync game+desktop sources to `user@macbuild.local:~/build/kaesekrieg`, fetch Node 22.12 (darwin-arm64) into `~/build/kaesekrieg/.node`, `npm ci`, `node build.mjs --platform darwin --arch arm64`, `codesign --force --deep -s -`, `ditto` zip, run app binary with `--smoke`, pull zip to `dist/Kaesekrieg-darwin-arm64.zip` and smoke.json/png to `out/shots/native-macos/`. Records checks build-macos and smoke-macos. Env: MAC_HOST, NODE_VER.

## Verification evidence
Full run 66 s: codesign verify ok, zip 111 MB, smoke ok=true page=index.html fps 21.9, 0 errors, gl=ANGLE/SwiftShader (software GL over ssh). Checks recorded pass.

## Deviations from the contract
None; desktop/build.mjs and main.cjs untouched.

## Mistakes I made and how I fixed them
None notable.

## Learnings for a future agent
- bigmac has Node 26 only, where @electron/packager hangs; script downloads Node 22 into the build dir (nothing outside ~/build/kaesekrieg touched). build.mjs's nvm re-exec does not apply on the Mac.
- Smoke runs over plain ssh fine (window server reachable).
- Zip is ad-hoc signed only: Gatekeeper needs right-click Open / `xattr -dr com.apple.quarantine`.

## Requests for other modules
None.
