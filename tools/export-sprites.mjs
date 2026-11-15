#!/usr/bin/env node
// Export transparent, nearest-neighbour upscaled sprites for the Pages site: node tools/export-sprites.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { encodePNG } from './sheet.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'docs/site/img'); mkdirSync(out, { recursive: true });
const jobs = [
  ['enemies_infantry', 'mouse.idle', 'mouse', 4], ['enemies_infantry', 'trooper.idle', 'trooper', 4], ['enemies_infantry', 'officer.idle', 'officer', 4],
  ['enemies_beasts', 'sewer.idle', 'sewer', 4], ['enemies_beasts', 'panzer.idle', 'panzer', 4], ['boss', 'boss.idle', 'boss', 5],
  ['weapons', 'wpn.claws.idle', 'w-claws', 3], ['weapons', 'wpn.pistol.idle', 'w-pistol', 3], ['weapons', 'wpn.gatling.idle', 'w-gatling', 3],
  ['weapons', 'wpn.yarn.idle', 'w-yarn', 3], ['weapons', 'wpn.laser.idle', 'w-laser', 3],
];
const cache = {};
for (const [mod, name, file, s] of jobs) {
  cache[mod] ??= (await import(pathToFileURL(join(root, 'src/art', mod + '.js')))).build();
  const v = cache[mod][name]; const f = Array.isArray(v) ? v[0] : v;
  const W = f.w * s, H = f.h * s, o = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const si = (((y / s) | 0) * f.w + ((x / s) | 0)) * 4, di = (y * W + x) * 4;
    for (let k = 0; k < 4; k++) o[di + k] = f.rgba[si + k];
  }
  writeFileSync(join(out, file + '.png'), encodePNG(W, H, o));
}
console.log('ok');
