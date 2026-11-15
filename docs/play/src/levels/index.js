// Level index: `levels` in defs.LEVELS order. Any level file that is absent or fails to import is replaced
// by a tiny built-in fallback level and its id is listed in `missing` (the game always boots).
import { LEVELS } from '../core/defs.js';

/** Tiny but complete level: start, a guard, ammo, treasure, a locked door with its key, exit switch. */
export function makeFallbackLevel(id, name) {
  return {
    id, name: `${name} (placeholder)`, intro: 'This level is still being built.', par: 60, music: 'level_a',
    wall: 'wall.fort_stone', floor: 'flat.floor_stone', ceil: 'flat.ceil_stone',
    zones: {}, ambient: [0.08, 0.08, 0.1], fog: { color: [0.02, 0.02, 0.03], density: 0.03 },
    sky: { moonDir: [0.45, 0.8, 0.35], moonColor: [0.55, 0.65, 1.0] },
    map: [
      '##########',
      '#........#',
      '#........#',
      '#........#',
      '####+#####',
      '#........#',
      '#........#',
      '####1#####',
      '#.......X#',
      '##########',
    ],
    things: [
      '..........',
      '..>...!...',
      '.....m....',
      '..a....G..',
      '..........',
      '...u...$..',
      '..........',
      '..........',
      '..........',
      '..........',
    ],
  };
}

export const missing = [];
export const levels = [];
for (const [id, name] of LEVELS) {
  let def = null;
  try {
    const mod = await import(`./${id}.js`);
    def = mod.default;
    if (!def || !Array.isArray(def.map) || !Array.isArray(def.things)) throw new Error('no valid default export');
  } catch (e) {
    def = null;
  }
  if (!def) { missing.push(id); def = makeFallbackLevel(id, name); }
  levels.push(def);
}
