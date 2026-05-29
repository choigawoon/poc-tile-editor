// Makes an ALTERNATE-TONE tileset with the EXACT same grid (256x256, 8x8 @32px)
// as samples/tileset.png. Same layout → same tile indices → drop-in reskin.
//
//   node tools/make-tileset-variant.mjs night   > a cool/dark palette
//   node tools/make-tileset-variant.mjs autumn  > a warm palette
//
// Writes samples/tileset.<variant>.png. To reskin the demo game, copy it over
// bundles/demo/tileset.png and reload — no data or code changes.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const variant = process.argv[2] || 'night';
const TILE = 32, COLS = 8, ROWS = 8, W = TILE * COLS, H = TILE * ROWS;

// Base palette must keep the SAME tile MEANING per index as the original
// generator (so index 1 = grass-ish, 2 = path, 4 = water, etc.). We only shift
// HUE/BRIGHTNESS to change the mood, not the arrangement.
const basePalette = [
  [60, 110, 60], [90, 150, 70], [120, 90, 50], [110, 110, 120],
  [70, 120, 180], [200, 180, 90], [180, 90, 90], [150, 120, 200],
];

const grade = {
  // multiplicative tint + brightness offset
  night:  { mul: [0.45, 0.55, 0.95], add: -10 },   // cool, dark — dusk
  autumn: { mul: [1.15, 0.85, 0.55], add: 8 },      // warm, orange
  toxic:  { mul: [0.7, 1.2, 0.6], add: 0 },         // sickly green
}[variant] || { mul: [1, 1, 1], add: 0 };

const palette = basePalette.map(([r, g, b]) => [
  clamp(r * grade.mul[0] + grade.add),
  clamp(g * grade.mul[1] + grade.add),
  clamp(b * grade.mul[2] + grade.add),
]);

const px = Buffer.alloc(W * H * 4);
const set = (x, y, r, g, b, a = 255) => { const i = (y * W + x) * 4; px[i]=r; px[i+1]=g; px[i+2]=b; px[i+3]=a; };

for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
  const base = palette[(ty + tx) % palette.length];
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const gx = tx * TILE + x, gy = ty * TILE + y;
    const edge = x === 0 || y === 0 || x === TILE - 1 || y === TILE - 1;
    const dim = ((x >> 2) + (y >> 2)) % 2 ? 0 : 18;
    let [r, g, b] = base;
    r = Math.min(255, r + dim); g = Math.min(255, g + dim); b = Math.min(255, b + dim);
    if (edge) { r *= 0.55; g *= 0.55; b *= 0.55; }
    set(gx, gy, r | 0, g | 0, b | 0, 255);
  }
}

function clamp(v) { return Math.max(0, Math.min(255, v)) | 0; }

// --- minimal PNG encoder (RGBA) ---
const crcTable = (() => { const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Run last, after every const/function above is initialized (avoids TDZ).
const out = new URL(`../samples/tileset.${variant}.png`, import.meta.url);
writeFileSync(out, encodePng(W, H, px));
console.log(`Wrote samples/tileset.${variant}.png (${W}x${H}, same 8x8 grid)`);
