// Stage the game into desktop/.stage and package it with @electron/packager into ../dist.
// Usage: node build.mjs --platform linux|win32|darwin --arch x64|arm64
import { cpSync, rmSync, mkdirSync, existsSync, copyFileSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
// extract-zip (used by @electron/packager) hangs silently on Node >= 25: re-exec under an older Node if one is available.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { homedir } from 'node:os';
if (Number(process.versions.node.split('.')[0]) >= 25 && !process.env.KK_BUILD_REEXEC) {
  const base = join(homedir(), '.nvm', 'versions', 'node');
  let cand = [];
  try { cand = readdirSync(base).filter((v) => /^v(20|22|24)\./.test(v)).sort().reverse(); } catch { /* none */ }
  if (cand.length) {
    const r = spawnSync(join(base, cand[0], 'bin', 'node'), [fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, KK_BUILD_REEXEC: '1' } });
    process.exit(r.status ?? 1);
  }
  console.warn('[build] warning: Node >= 25 and no older nvm Node found; packaging may hang');
}
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const platform = opt('platform', process.platform);
const arch = opt('arch', process.arch);
const stage = join(here, '.stage');
const dist = join(root, 'dist');

rmSync(stage, { recursive: true, force: true });
mkdirSync(join(stage, 'game'), { recursive: true });
for (const f of ['main.cjs', 'preload.cjs', 'placeholder.html']) copyFileSync(join(here, f), join(stage, f));
if (existsSync(join(here, 'icon'))) cpSync(join(here, 'icon'), join(stage, 'icon'), { recursive: true });
for (const f of ['index.html', 'style.css']) if (existsSync(join(root, f))) copyFileSync(join(root, f), join(stage, 'game', f));
else console.warn(`[build] warning: ${f} missing`);
if (existsSync(join(root, 'src'))) cpSync(join(root, 'src'), join(stage, 'game', 'src'), { recursive: true });
else console.warn('[build] warning: src/ missing');
const pkg = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'));
writeFileSync(join(stage, 'package.json'), JSON.stringify({ name: pkg.name, productName: pkg.productName, version: pkg.version, main: 'main.cjs', description: pkg.description, author: pkg.author, license: pkg.license }, null, 2));

const require = createRequire(import.meta.url);
const packager = require('@electron/packager');
const ext = { win32: '.ico', darwin: '.icns', linux: '.png' }[platform];
const iconBase = join(here, 'icon', 'icon');
const opts = {
  dir: stage, out: dist, name: 'Kaesekrieg', platform, arch, overwrite: true, prune: false,
  electronVersion: pkg.devDependencies.electron, asar: false, quiet: true,
};
if (ext && existsSync(iconBase + ext)) opts.icon = iconBase + ext;
if (platform === 'darwin') opts.osxSign = { identity: '-', identityValidation: false };
const out = await packager(opts);
rmSync(stage, { recursive: true, force: true });
if (platform === 'linux') {
  // The packaged chrome-sandbox is not setuid root, so the bare binary refuses to start. Ship a launcher that
  // works from any directory and passes --no-sandbox (the game loads only its own bundled files).
  const { chmodSync } = await import('node:fs');
  for (const dir of out) {
    const sh = join(dir, 'kaesekrieg.sh');
    writeFileSync(sh, '#!/bin/sh\n# KAESEKRIEG launcher — run this, not the bare binary.\nhere=$(dirname "$(readlink -f "$0")")\nexec "$here/Kaesekrieg" --no-sandbox "$@"\n');
    chmodSync(sh, 0o755);
  }
}
console.log('[build] packaged:', out.join(', '));
