import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAtlas, makePlaceholder } from '../src/art/registry.js';
import { artManifest, ART_MODULES, TILE } from '../src/core/defs.js';
import { PixBuf } from '../src/art/pixbuf.js';

const manifest = artManifest();
const atlas = await buildAtlas();

test('report which art modules are missing (informational)', () => {
  const bad = atlas.report.filter((r) => r.status !== 'ok');
  for (const r of bad) console.log(`  [art] ${r.module}: ${r.status}${r.error ? ' - ' + r.error : ''} (${r.ok}/${r.total})`);
  assert.equal(atlas.report.length, ART_MODULES.length);
});

test('atlas shape', () => {
  const { tiles, sprites } = atlas;
  const nt = manifest.filter((a) => a.kind === 'tile').reduce((s, a) => s + a.frames, 0) + 1;
  const ns = manifest.filter((a) => a.kind === 'sprite').reduce((s, a) => s + a.frames, 0) + 1;
  assert.equal(tiles.count, nt);
  assert.equal(sprites.count, ns);
  for (const t of [tiles, sprites]) {
    assert.ok(t.rgba instanceof Uint8Array && t.mat instanceof Uint8Array);
    assert.equal(t.rgba.length, t.count * TILE * TILE * 4);
    assert.equal(t.mat.length, t.rgba.length);
  }
  assert.equal(tiles.anim.length, tiles.count);
  assert.equal(sprites.frames.size, manifest.filter((a) => a.kind === 'sprite').length);
  assert.equal(atlas.images.size, manifest.filter((a) => a.kind === 'image').length);
  assert.ok(Array.isArray(atlas.missing));
});

test('layer order = manifest order, anim counts match frames', () => {
  let tl = 1, sl = 1;
  for (const a of manifest) {
    if (a.kind === 'tile') {
      assert.equal(atlas.tiles.index.get(a.name), tl, a.name);
      assert.equal(atlas.tile(a.name), tl);
      assert.equal(atlas.tiles.anim[tl], a.frames, a.name);
      tl += a.frames;
    } else if (a.kind === 'sprite') {
      assert.equal(atlas.sprites.index.get(a.name), sl, a.name);
      assert.equal(atlas.sprites.frames.get(a.name), a.frames, a.name);
      assert.equal(atlas.sprite(a.name, 0), sl);
      if (a.frames > 1) assert.equal(atlas.sprite(a.name, a.frames - 1), sl + a.frames - 1);
      assert.equal(atlas.sprite(a.name, 999), sl + a.frames - 1, 'frame clamps');
      sl += a.frames;
    } else {
      const fr = atlas.images.get(a.name);
      assert.equal(fr.length, a.frames, a.name);
      assert.ok(fr.every((f) => f.w === a.w && f.h === a.h), a.name);
    }
  }
  assert.equal(tl, atlas.tiles.count);
  assert.equal(sl, atlas.sprites.count);
});

test('unknown names are throw-free and return layer 0', () => {
  assert.equal(atlas.tile('nope.nothing'), 0);
  assert.equal(atlas.sprite('nope.nothing'), 0);
  assert.equal(atlas.sprite('nope.nothing', 3), 0);
  assert.equal(atlas.tile(undefined), 0);
});

test('missing names are placeholders; tile layers are opaque', () => {
  for (const name of atlas.missing) assert.ok(manifest.some((a) => a.name === name), name);
  const all = manifest.filter((a) => a.kind === 'tile');
  for (const a of all) {
    const l = atlas.tile(a.name), base = l * TILE * TILE * 4;
    for (let i = 3; i < TILE * TILE * 4; i += 4) if (atlas.tiles.rgba[base + i] !== 255) assert.fail(`${a.name} not opaque`);
  }
});

test('placeholder behaviour with a fully broken module set', async () => {
  const at = await buildAtlas(null, { importer: async (m) => { throw new Error('boom ' + m); } });
  assert.equal(at.missing.length, manifest.length);
  assert.deepEqual(at.missing, manifest.map((a) => a.name));
  assert.ok(at.report.every((r) => r.status === 'unavailable' && /boom/.test(r.error)));
  assert.equal(at.tiles.count, atlas.tiles.count, 'same layout regardless of art');
  assert.equal(at.sprites.count, atlas.sprites.count);
  const a = manifest.find((x) => x.kind === 'tile');
  assert.notEqual(at.tile(a.name), 0);
  // hashed colours differ per name
  const px = (n) => at.tiles.rgba.slice(at.tile(n) * 16384, at.tile(n) * 16384 + 4).join();
  assert.notEqual(px(manifest[0].name), px(manifest[3].name));
});

test('invalid output is replaced per-name; valid names survive', async () => {
  const good = new PixBuf(64, 64); good.rect?.(0, 0, 64, 64, '#123456');
  for (let i = 0; i < good.rgba.length; i += 4) { good.rgba[i] = 0x12; good.rgba[i + 1] = 0x34; good.rgba[i + 2] = 0x56; good.rgba[i + 3] = 255; }
  const [t1, t2, t3] = manifest.filter((a) => a.kind === 'tile' && a.module === manifest[0].module && a.frames === 1);
  const mod = manifest[0].module;
  const out = { [t1.name]: good, [t2.name]: new PixBuf(32, 32), [t3.name]: [good, good] /* wrong frame count */ };
  const at = await buildAtlas(null, { modules: [mod], importer: async () => ({ build: () => out }) });
  assert.ok(!at.missing.includes(t1.name));
  assert.ok(at.missing.includes(t2.name), 'wrong size');
  assert.ok(at.missing.includes(t3.name), 'wrong frames');
  const l = at.tile(t1.name) * 16384;
  assert.deepEqual([...at.tiles.rgba.slice(l, l + 4)], [0x12, 0x34, 0x56, 255]);
});

test('module without build() or returning junk is reported, not fatal', async () => {
  for (const ns of [{}, { build: () => null }, { build: () => 5 }, null]) {
    const at = await buildAtlas(null, { importer: async () => ns });
    assert.equal(at.missing.length, manifest.length);
  }
});

test('onProgress is called and a throwing callback is harmless', async () => {
  const seen = [];
  await buildAtlas((f, l) => seen.push([f, l]));
  assert.ok(seen.length >= ART_MODULES.length);
  assert.equal(seen.at(-1)[0], 1);
  await buildAtlas(() => { throw new Error('ui'); });
});

test('makePlaceholder: sprite keeps transparent margin, deterministic', () => {
  const a = makePlaceholder('x.y', 'sprite'), b = makePlaceholder('x.y', 'sprite');
  assert.deepEqual([...a.rgba], [...b.rgba]);
  assert.equal(a.rgba[3], 0);
  assert.equal(makePlaceholder('x.y', 'tile').rgba[3], 255);
});
