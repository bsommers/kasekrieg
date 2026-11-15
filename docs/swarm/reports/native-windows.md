# native-windows report

## What I built
`desktop/scripts/build-windows.sh` (one command, re-runnable, ~70 s) plus guest helpers `desktop/scripts/win/build.cmd` and `smoke.cmd`. Flow: ensure win-devvm running (`vm.sh status/start/wait`), tar the sources, push to `C:\Users\dev\kaesekrieg-build`, download private Node 22.12 zip into `.node` there, `npm ci`, `node build.mjs --platform win32 --arch x64`, zip with bsdtar, run `Kaesekrieg.exe --smoke=...`, pull zip to `dist/Kaesekrieg-win32-x64.zip` and smoke.json/png to `out/shots/native-windows/`. Records checks build-windows / smoke-windows. Falls back to an interactive (`schtasks /IT`) run if plain ssh yields no smoke.json (not needed so far).

## Verification evidence
Full run 70 s: zip 138 MB, smoke ok=true page=index.html fps 33.6 errors 0, gl=ANGLE/Direct3D11 on Microsoft Basic Render Driver (software). Checks pass.

## Deviations from the contract
None. build.mjs and main.cjs untouched.

## Mistakes I made and how I fixed them
None notable.

## Learnings for a future agent
- Guest default shell is PowerShell with Restricted execution policy (.ps1/npm.ps1 blocked), so everything runs via `cmd /c` and .cmd files.
- Guest has Node 26 (packager hangs), so a private Node 22 is fetched into the build folder; curl.exe and bsdtar are built in.
- Smoke works over plain ssh (window creation succeeded without /IT task).
- Zip is unsigned; SmartScreen may warn.

## Requests for other modules
None.
