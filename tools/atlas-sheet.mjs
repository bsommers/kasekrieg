#!/usr/bin/env node
// Dump assembled atlases: node tools/atlas-sheet.mjs [--cols N] [--scale N]
// Writes out/previews/atlas-tiles.png / atlas-sprites.png and prints a per-module completeness table.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { encodePNG } from './sheet.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? Number(args[i + 1]) : d; };
const cols = opt('cols', 16), scale = opt('scale', 1);
const { buildAtlas } = await import(pathToFileURL(join(root, 'src/art/registry.js')));

const t0 = performance.now();
const atlas = await buildAtlas();
const ms = performance.now() - t0;

function dump(layers, name) {
  const T = 64, rows = Math.ceil(layers.count / cols), gap = 0;
  const W = cols * T * scale, H = rows * T * scale;
  const out = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) { const x = i % W, y = (i / W) | 0, ck = ((x >> 3) + (y >> 3)) & 1 ? 70 : 52; out.set([ck, ck, ck + 14, 255], i * 4); }
  for (let l = 0; l < layers.count; l++) {
    const ox = (l % cols) * T * scale, oy = ((l / cols) | 0) * T * scale, base = l * T * T * 4;
    for (let y = 0; y < T * scale; y++) for (let x = 0; x < T * scale; x++) {
      const si = base + (((y / scale) | 0) * T + ((x / scale) | 0)) * 4, di = ((oy + y) * W + ox + x) * 4;
      const a = layers.rgba[si + 3] / 255;
      for (let c = 0; c < 3; c++) out[di + c] = layers.rgba[si + c] * a + out[di + c] * (1 - a);
    }
  }
  mkdirSync(join(root, 'out/previews'), { recursive: true });
  const f = join(root, 'out/previews', name);
  writeFileSync(f, encodePNG(W, H, out));
  console.log(`wrote ${f}  (${layers.count} layers, ${cols} cols, ${W}x${H})`);
}
dump(atlas.tiles, 'atlas-tiles.png');
dump(atlas.sprites, 'atlas-sprites.png');

console.log(`\nbuildAtlas: ${ms.toFixed(0)} ms   tiles=${atlas.tiles.count} sprites=${atlas.sprites.count} images=${atlas.images.size} missing=${atlas.missing.length}\n`);
const pad = (s, n) => String(s).padEnd(n);
console.log(pad('module', 20) + pad('status', 13) + pad('ok/total', 10) + pad('build ms', 9) + 'notes');
for (const r of atlas.report) {
  const note = r.error ? r.error : r.bad.length ? r.bad.slice(0, 3).join('; ') + (r.bad.length > 3 ? ` (+${r.bad.length - 3} more)` : '') : '';
  console.log(pad(r.module, 20) + pad(r.status, 13) + pad(`${r.ok}/${r.total}`, 10) + pad(r.ms.toFixed(1), 9) + note);
}
