# core-input report

## What I built
- `src/core/input.js`: `createInput(canvas, opts?)` -> `{ poll, menu, requestLock, locked, sensitivity, dispose, clear }`. Opts `window/document/navigator/now/tickDt/sensitivity` are injectable (Node tests). WASD move/strafe, arrows move+turn, Shift run, Ctrl/LMB fire, Space/E use, 1-5 (and numpad) weapons, wheel/Q next, M meow, Tab/Esc/P/Enter menu edges, standard-mapping gamepad.
- `src/core/settings.js`: `loadSettings/saveSettings(s, storage?)`, `loadProgress/saveProgress(p, storage?)`, `defaultSettings`, `defaultProgress`, sanitizers. Progress shape: `{ unlocked:1..99, skill:0..3, best:{ [levelId]:{score,kills,treasure,secrets,time} } }`.
- `test/settings.test.mjs`: 24 tests.

## Verification evidence
`node --test test/settings.test.mjs` -> 24 pass, 0 fail. Covers edges once per press, repeat ignored, mouse accumulation/sensitivity/lock gating, lock-loss/blur/hidden clearing, stale-edge expiry, gamepad, throwing/missing/corrupt localStorage (incl. throwing global getter).

## Deviations from the contract
- `createInput(canvas, opts)` has an optional second arg. `input.clear()` added.
- Edges unconsumed for 250 ms expire (so a Space "accept" in a menu does not also `use` on the first game tick).
- Losing pointer lock (browsers swallow Esc) latches `menu().pause`.
- First LMB click when unlocked only requests pointer lock (does not fire).
- Settings values are clamped (sensitivity 0.1-5, fov 0.8-2.4, volumes 0-1); unknown keys dropped. `save*` return a boolean.

## Mistakes I made and how I fixed them
- First version cleared the other consumer's latch inside poll()/menu(); that would lose `pause`/`map` since main must call both each frame while playing. Replaced with TTL expiry.
- Left a junk placeholder test and `&& false` gamepad stubs; removed.

## Learnings for a future agent
- In Node, `EventTarget` + `Object.assign(new Event(..), props)` is enough to fake window/document.
- `localStorage` access itself can throw (SecurityError), not just getItem.

## Requests for other modules
- main.js: while playing call BOTH `input.poll()` (cmd) and `input.menu()` (pause/map edges) every frame; in menus call `menu()` only. Call `input.requestLock()` on game start (needs user gesture). Apply `input.sensitivity = settings.sensitivity`.
- Menus can use `menu().left/right` (auto-repeats) for sliders.
