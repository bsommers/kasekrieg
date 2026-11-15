// Generates icon/icon.png (256x256 cheese wedge) with zero dependencies.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const N = 256, px = Buffer.alloc(N * N * 4);
const holes = [[150, 140, 18], [110, 175, 12], [185, 185, 10], [95, 130, 8]];
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  let c = [24, 16, 8, 255];                       // dark background
  const bg = (x - 128) ** 2 + (y - 128) ** 2 < 124 ** 2;
  if (bg) c = [58, 38, 14, 255];
  // wedge: triangle (30,200) (226,200) (226,70); top face lighter
  const inTri = x >= 30 && x <= 226 && y <= 200 && y >= 70 + (226 - x) * (130 / 196) * -1 + 130 * (0) && y >= 200 - (x - 30) * (130 / 196) - 0;
  const edge = 200 - (x - 30) * (130 / 196);
  if (x >= 30 && x <= 226 && y <= 200 && y >= edge) {
    c = y < edge + 34 ? [255, 214, 74, 255] : [244, 176, 32, 255];
    for (const [hx, hy, r] of holes) if ((x - hx) ** 2 + (y - hy) ** 2 < r * r) c = [196, 124, 12, 255];
  }
  px.set(c, (y * N + x) * 4);
}
const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const raw = Buffer.alloc((N * 4 + 1) * N);
for (let y = 0; y < N; y++) { raw[y * (N * 4 + 1)] = 0; px.copy(raw, y * (N * 4 + 1) + 1, y * N * 4, (y + 1) * N * 4); }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
writeFileSync(join(dirname(fileURLToPath(import.meta.url)), 'icon.png'), png);
console.log('wrote icon.png', png.length);
