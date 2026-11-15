# sim-enemies report

## What I built
- `src/sim/enemies.js`: `spawnEnemy`, `updateEnemies`, `damageEnemy` (returns `true` if the hit killed), `pickEnemyOnRay`, `enemiesInRadius`, `makeNoise(game,x,y,range[,source])`. Extra exports: `hitChance(dist, playerSpeed)`, `hurtPlayer`, `enemiesReady` (promise for the lazy player/items imports), tuning constants.
  - Senses: LOS + ±70° facing cone (any direction once alerted, or within 1.5 cells); hearing via `world.soundMask` (closed doors block it). Checks are staggered every 0.1 s.
  - Alert → alert sfx + a shout (`makeNoise` with range 6) that wakes friends → reaction pause (`def.reaction × skill.reaction`) → chase.
  - Chase: walks down `world.distField` with its own neighbour picker. Cells that other enemies occupy or are heading for cost extra, so packs spread out. Every 3rd enemy (not sewer or boss) heads for a flank cell 2–3 cells to the side of/behind the player. Opens unlocked doors and waits for them. Unsticks with a sidestep when blocked. Ranged enemies stop at a preferred distance (mouse 5, trooper 4, officer 3, panzer 6, boss 4.5) and sidestep. Enemies never walk into the player.
  - Patrol: walks straight and turns at walls (left/right at random, else back). Opens doors on its route.
  - Attack: a wind-up that you can see coming (aim frame + glow rising to 0.35). It is skipped if LOS is lost at the end of the wind-up. Bursts follow `shots`/`gap`, then 0.3 s recovery, then cooldown × skill.reaction. Hitscan hit chance = `clamp(0.95−0.05·d)·(1−0.45·speed/5.6)`. The player's speed is estimated from position deltas. A miss puts a spark on the wall behind the player, sometimes with a ricochet sound. A shot within 1.5 cells does +25% damage. Gunfire alerts friends within 7 cells. Melee (sewer) lunges forward during the wind-up.
  - Pain flinch uses `painChance`. A laser hit (`{stun}`) puts the enemy in the `stun` state with one looping `fx.stun` that follows its head; a continuous laser keeps it mesmerised. The boss gets 0.3× stun followed by 2 s of immunity, so the laser cannot stunlock him.
  - Death: die animation over 0.6 s, then `dead` (the corpse stays). Death emits the die sfx and `kill {type}`, increments `stats.kills`, adds `def.score` to `player.score` and drops loot via `items.dropItem` (with a built-in fallback).
  - Boss: phase 2 below 50% hp. The transition is a 0.9 s stagger with flash, msg, explosion and 2 summoned sewer rats. After that he summons 1 more every 9 s while fewer than 3 are alive, moves 1.25× faster, uses 0.75× cooldowns, and alternates gatling bursts with 3-cheeseball volleys (14° spread, 1.3× speed). His death emits `bossDied` and removes the summoned rats with no score.
  - Sprite: `spr.frame` comes from `atlas.sprite('${type}.${anim}', f)` (walk frames follow distance walked; attack aim/FIRE/recover). `flipX` follows the on-screen walk direction and wobbles while stunned. `glow` is used for the muzzle flash, hit flash and boss phase 2.
- `src/sim/projectiles.js`: `spawnProjectile`, `updateProjectiles`, `explode`. Movement is sub-stepped (≤0.1 cell). Yarn arcs under gravity and bounces off floor/ceiling; wall bounces use `def.bounces`. Direct hit plus splash with LOS falloff. The player's own yarn hurts the player at 50%. Enemy projectiles pass through rats. Each projectile carries a light plus boom fx, sfx and a flash; player explosions make noise.
- `src/sim/effects.js`: `spawnFx` (h = **centre** height; options `size, life, vx, vy, vh, light, follow, followH, until, glow, flipX`; a life longer than one 12 fps pass loops the animation; the effect cap is 192), `updateEffects` (also ages beams), `addBeam` (cap `LIMITS.BEAMS`). Shared helpers: `rngOf`, `skillOf`, `emit`, `spriteLayer`.
- `test/enemies.test.mjs`: 22 tests using the real `world.js` and a minimal fake game.

## Verification evidence
- `node --test test/enemies.test.mjs` → 22 pass, 0 fail. The tests cover: facing cone, the noTarget cheat, the wind-up (no damage before windup across 4 types × 6 seeds) and reaction delay, hit chance falling with distance and speed (and statistically with the real AI: near hits > 1.8× far hits), chasing through a door (trooper reaches the doorway and sees you; sewer rat reaches you and bites), noise blocked by closed doors, shout chaining, patrol turning and door opening, kill bookkeeping and drops, stun fx following and ending, boss phase 2/summons/volleys/stun immunity/death, ray picking blocked by walls, cheeseball hits, no friendly fire, yarn bounce/splash/LOS/fuse, fx/beam lifetimes and caps, atlas frame selection, and determinism.
- Soak (scratch script `soak.mjs` in the scratchpad) with the real `game.js` + `e1m1` and fallback `e1m6`, god mode, a scripted wandering/firing player, 120 s per run at skill 2 and 3: 0 non-finite values, 0 enemies inside solid cells, about 0.01 ms per tick on average and 1.4 ms at worst. Real kills, pain, alerts and enemy pistol shots happened.
- I did not check this in the browser or with screenshots, and the swarm had no renderer to run against.

## Deviations from the contract
- `damageEnemy` returns a kill boolean (the contract gives no return value). It also accepts `noPain` and `splash`.
- `makeNoise` takes an optional 5th `source` argument (excluded from alerting).
- `spawnEnemy` accepts `angle`, `alerted` and `summoned`. Without `angle` it picks the longest open run itself.
- enemies.js counts kills and score (`stats.kills`, `player.score`). game.js agrees with this (its comment says so).
- Damage to the player goes, in order of preference, through `game._hooks.damagePlayer`, then lazily imported `player.damagePlayer`, then a minimal fallback. Skill scaling is left to `damagePlayer`.
- Boss summons increment `stats.killsTotal` so the kill ratio never goes over 100%; quietly removed minions decrement it.
- Effect/projectile `light` is `{x,y,h,r,g,b,radius}`, and game.js's `lightOf` accepts it.

## Mistakes I made and how I fixed them
- My first door-chase test expected a ranged trooper to walk fully into the player's room. It correctly stops at its preferred distance in the doorway, so the test was wrong. I changed the test to check the trooper reaches the doorway and has sight, and added a melee sewer rat that has to reach and bite the player.
- I considered a top-level-await import of player.js. I avoided it because it could deadlock in an import cycle, and used non-blocking lazy imports plus the `_hooks` override instead.

## Learnings for a future agent
- `world.blocksMove(...,true)` treats unlocked doors as passable, so the AI must call `openDoor` and wait until `open ≥ 0.8` before `tryMove` lets it through.
- Choosing your own next neighbour over `distField`, with crowd penalties, is cheap and spreads groups out better than `world.nextStep`.
- A continuous laser calls `damageEnemy` every tick. Key stun and fx off state transitions, not off each hit, or effects and sounds spam.

## Requests for other modules
- game.js/renderer: corpses (`state:'dead'`) stay in `game.enemies` with a `spr`. Keep drawing them, and treat them as non-blocking.
- ui-hud: `msg {kind:'warn'}` announces boss phase 2. `flash` events come from explosions and the boss.
- audio: uses the existing SFX names only (alerts, pain, die, fire, ricochet, yarn_bounce, explosion, cheese_splat, boss_alert).
