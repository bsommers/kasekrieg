#!/usr/bin/env node
// Zero-dep: copy the playable game (index.html, style.css, src/ minus demos/tests) into docs/play/ for GitHub Pages.
// node tools/build-site.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dest = path.join(root, 'docs/play');
const skip = (name) => /(^|[-.])demo\.(html|js)$/.test(name) || /\.test\.m?js$/.test(name) || name.startsWith('.');
function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  let n = 0;
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (skip(e.name)) continue;
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) n += copyDir(a, b);
    else { fs.copyFileSync(a, b); n++; }
  }
  return n;
}
fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });
let n = 0;
for (const f of ['index.html', 'style.css']) { fs.copyFileSync(path.join(root, f), path.join(dest, f)); n++; }
n += copyDir(path.join(root, 'src'), path.join(dest, 'src'));
console.log(`docs/play: ${n} files`);
