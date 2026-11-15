// Test-only stand-in for src/sim/game.js (app-shell harness). Implements just enough of §8.3 to drive the shell.
import { createWorld } from '/src/sim/world.js';
export function createGame({ atlas, levels, bus, rng, skill }) {
  const g = {
    bus, rng, atlas, skill, time: 0, tick: 0, levelIndex: 0, world: null,
    player: null, enemies: [], projectiles: [], pickups: [], decor: [], effects: [], lights: [], beams: [],
    stats: { kills: 0, killsTotal: 0, treasure: 0, treasureTotal: 0, secrets: 0, secretsTotal: 0, time: 0, par: 60 },
    status: 'playing', cheats: { god: false, noclip: false, noTarget: false },
    loadLevel(i, { keepPlayer } = {}) {
      g.levelIndex = i; const def = levels[i];
      g.world = createWorld(def, atlas, bus); g.status = 'playing'; g.time = 0;
      let sx = 1.5, sy = 1.5, sa = 0;
      def.things.forEach((row, y) => [...row].forEach((ch, x) => { if ('^>v<'.includes(ch)) { sx = x + .5; sy = y + .5; sa = { '^': -Math.PI / 2, '>': 0, v: Math.PI / 2, '<': Math.PI }[ch]; } }));
      const old = g.player;
      g.player = { x: sx, y: sy, angle: sa, radius: .27, health: 100, lives: keepPlayer && old ? old.lives : 9, score: 0, ammo: { hair: 16, yarn: 0, cell: 0 }, owned: [true, true, false, false, false], weapon: 1, keys: { gold: true, silver: false }, dead: false };
      bus.emit('music', { name: def.music });
    },
    update(dt, cmd) {
      g.tick++; g.time += dt; g.stats.time += dt;
      const p = g.player; if (g.status !== 'playing') return;
      p.angle += cmd.turn;
      const sp = (cmd.run ? 4 : 2.5) * dt, c = Math.cos(p.angle), s = Math.sin(p.angle);
      g.world.tryMove(p, (c * cmd.forward - s * cmd.strafe) * sp, (s * cmd.forward + c * cmd.strafe) * sp);
      if (cmd.use) { const r = g.world.use(p.x, p.y, p.angle, p.keys); if (r.kind === 'exit') g.status = 'complete'; }
      if (g.world.exitTriggered) g.status = 'complete';
      g.world.update(dt, g);
    },
    buildScene(scene) {
      const p = g.player;
      scene.time = g.time; scene.cam = { x: p.x, y: p.y, h: .46, angle: p.angle, fov: 1.5, roll: 0 };
      scene.world = g.world; scene.sprites = []; scene.lights = []; scene.beams = [];
      scene.ambient = g.world.def.ambient; scene.fog = g.world.def.fog; scene.sky = g.world.def.sky ?? null; scene.viewLight = [1, 1, 1];
      return scene;
    },
  };
  return g;
}
