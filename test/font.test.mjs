import test from 'node:test';
import assert from 'node:assert/strict';
import { glyphRows, glyphChars, measureText, drawText } from '../src/ui/font.js';

const need = [];
for (let c = 32; c <= 126; c++) need.push(String.fromCharCode(c));
need.push(...'ÄÖÜäöüß');

test('every required glyph is 7 rows of 5 chars', () => {
  for (const ch of need) {
    assert.ok(glyphChars().includes(ch), 'missing ' + ch);
    const r = glyphRows(ch);
    assert.equal(r.length, 7, ch);
    for (const row of r) assert.match(row, /^[#.]{5}$/, ch);
  }
});

test('visible glyphs have ink and are unique', () => {
  const seen = new Map();
  for (const ch of need) {
    if (ch === ' ') { assert.ok(!glyphRows(ch).join('').includes('#')); continue; }
    const s = glyphRows(ch).join('/');
    assert.ok(s.includes('#'), 'blank ' + ch);
    assert.ok(!seen.has(s), `${ch} duplicates ${seen.get(s)}`);
    seen.set(s, ch);
  }
});

test('unknown chars fall back to ?', () => {
  assert.deepEqual(glyphRows('€'), glyphRows('?'));
});

test('measureText', () => {
  assert.equal(measureText('', 1), 0);
  assert.equal(measureText('A', 1), 5);
  assert.equal(measureText('AB', 2), 22);
  assert.equal(measureText('AB\nABC', 1), 17);
});

test('drawText fillRect fallback respects scale/align/shadow', () => {
  const rects = [];
  const ctx = { set fillStyle(v) { this.fs = v; }, fillRect(x, y, w, h) { rects.push([this.fs, x, y, w, h]); } };
  drawText(ctx, 'I', 10, 20, { scale: 2, color: '#f00', shadow: '#000' });
  assert.ok(rects.length > 0);
  assert.ok(rects.every((r) => r[3] % 2 === 0 && r[4] === 2));
  assert.ok(rects.some((r) => r[0] === '#000') && rects.some((r) => r[0] === '#f00'));
  rects.length = 0;
  drawText(ctx, 'A', 100, 0, { shadow: null, align: 'right' });
  assert.ok(rects.every((r) => r[1] >= 95 && r[1] < 100));
  drawText(ctx, 'x\ny', 0, 0, { shadow: null });
});
