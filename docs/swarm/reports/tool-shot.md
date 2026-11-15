# tool-shot report

## What I built
- `tools/serve.mjs`: zero-dep static server. Exports `startStatic({root, port, host})` (port 0 = ephemeral), MIME table, traversal guard, no-store cache. CLI: `node tools/serve.mjs [4781]` (binds 0.0.0.0).
- `tools/shot.mjs`: launches headless Chrome (`--remote-debugging-port=0`, temp profile under the scratchpad), reads `DevToolsActivePort`, finds the page target via `/json/list`, speaks CDP over Node's built-in `WebSocket`. Repo-relative paths are served by an ephemeral `startStatic`; anything with a scheme (http, file, data) is used as is.
- Options: `--url --out --size --wait-for --wait --eval --keys "w:800,ArrowLeft:300" --click x,y --frames N --interval ms --timeout ms --strict`, plus `--gpu vulkan|gl|swiftshader|none` (default vulkan) and `--chrome path`.
- Output: one JSON object (ok, url, files, console, errors, eval, waitFor, ms, fatal). `--strict` exits 1 on any page error; a fatal failure or timeout also exits 1.
- Chrome is spawned detached and the whole process group is SIGKILLed in `finally` and on SIGINT/SIGTERM; the profile dir is removed.

## Verification evidence
- WebGL2 page (`out/previews/tool-shot/gl.html`): rendered gradient screenshot confirmed visually (`out/shots/tool-shot/gl-001.png`, `-002.png`); `--wait-for window.n>3` and `--eval` worked.
- Unmasked renderer reported by Chrome: `ANGLE (AMD, Vulkan 1.4 ... Radeon RX 7900 XTX (RADV))`, so the real GPU is used.
- `http://127.0.0.1:4780/?poll` screenshot OK (`out/shots/tool-shot/tracker.png`), no errors.
- Keys and click verified with an event-logging page (keydown/keyup w, ArrowLeft, space; click at 30,40).
- `--strict` on a 404 URL exits 1; `--wait-for false --timeout 3000` exits 1 with `fatal: timeout`; afterwards no leftover Chrome process and no `shot-profile-*` dir.
- `test/tool-shot.test.mjs`: 2 pass (MIME/traversal/404, data-page eval+screenshot).

## Deviations from the contract
- Added `--gpu`, `--chrome` options and numbered output naming (`name-001.png`) when `--frames > 1`.
- `favicon.ico` 404s are logged as `log.ignored` console entries, not errors, so `--strict` is usable on pages without a favicon.
- The profile dir is placed in the scratchpad path hardcoded in `shot.mjs` (falls back to `os.tmpdir()` if mkdir fails is not implemented; it creates the scratchpad dir).

## Mistakes I made and how I fixed them
- First run counted the `/favicon.ico` 404 as a page error, which would have failed every `--strict` run. Filtered it.
- Piping the tool into `head` masked its exit code in my first check; re-ran with output redirected to a file.

## Learnings for a future agent
- `Page.captureScreenshot` captures a WebGL canvas fine in `--headless=new` without `preserveDrawingBuffer`.
- Kill with `process.kill(-pid)` (detached process group); Chrome spawns many children.
- Keys: `keyDown` needs `text` for printable keys, otherwise `rawKeyDown`.

## Requests for other modules
- None. `index.html` does not exist yet, so the game itself was not shot.
