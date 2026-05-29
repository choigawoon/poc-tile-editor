// Generates a simple 8x8 tile (256x256, 32px tiles) RGBA PNG with no deps,
// so the editor can be tested immediately. Run: node tools/make-sample-tileset.js
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const TILE = 32, COLS = 8, ROWS = 8;
const W = TILE * COLS, H = TILE * ROWS;

// A small palette of distinct tile colors.
const palette = [
  [60, 110, 60], [90, 150, 70], [120, 90, 50], [110, 110, 120],
  [70, 120, 180], [200, 180, 90], [180, 90, 90], [150, 120, 200],
];

// RGBA pixel buffer.
const px = Buffer.alloc(W * H * 4);
function set(x, y, r, g, b, a = 255) {
  const i = (y * W + x) * 4;
  px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
}

for (let ty = 0; ty < ROWS; ty++) {
  for (let tx = 0; tx < COLS; tx++) {
    const base = palette[(ty + tx) % palette.length];
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const gx = tx * TILE + x, gy = ty * TILE + y;
        const edge = x === 0 || y === 0 || x === TILE - 1 || y === TILE - 1;
        // subtle checker texture inside each tile
        const dim = ((x >> 2) + (y >> 2)) % 2 ? 0 : 18;
        let [r, g, b] = base;
        r = Math.min(255, r + dim); g = Math.min(255, g + dim); b = Math.min(255, b + dim);
        if (edge) { r *= 0.55; g *= 0.55; b *= 0.55; }
        set(gx, gy, r | 0, g | 0, b | 0, 255);
      }
    }
  }
}

function out() {
  mkdirSync(new URL('../samples/', import.meta.url), { recursive: true });
  return new URL('../samples/tileset.png', import.meta.url);
}

// --- minimal PNG encoder (RGBA, filter 0) ---
function encodePng(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  // 10,11,12 = compression, filter, interlace = 0

  // add filter byte (0) per scanline
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = deflateSync(raw);

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0, 0);
  return Buffer.concat([len, body, crc]);
}

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

// Run last, after every helper/const above is initialized.
writeFileSync(out(), encodePng(W, H, px));
console.log(`Wrote ${out()} (${W}x${H}, ${COLS}x${ROWS} tiles @ ${TILE}px)`);
