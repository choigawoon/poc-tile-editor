// Generates a LABELED test tileset (8 cols × 2 rows, 32px) with visually
// distinct, semantically-named tiles incl. a DOOR — handy for testing tags,
// collision and (later) PCG door-connection. Writes a SEPARATE file so the
// default scene's tileset.png is untouched; load it via the editor's import/＋.
//   node tools/make-test-tileset.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const TILE = 32, COLS = 8, ROWS = 2;
const W = TILE * COLS, H = TILE * ROWS;

// index → { name, base color, glyph }. Order is the local tile index (0-based).
const TILES = [
  { n: 'grass',     c: [86, 150, 72],  g: 'speck' },
  { n: 'flower',    c: [86, 150, 72],  g: 'flower' },
  { n: 'path',      c: [150, 120, 80], g: 'speck' },
  { n: 'stone',     c: [120, 120, 130], g: 'tile' },
  { n: 'water',     c: [70, 120, 190], g: 'wave' },
  { n: 'deepwater', c: [40, 80, 150],  g: 'wave' },
  { n: 'sand',      c: [210, 195, 130], g: 'speck' },
  { n: 'ice',       c: [185, 212, 232], g: 'tile' },
  { n: 'wall',      c: [95, 95, 105],  g: 'brick' },
  { n: 'wallbrick', c: [125, 82, 70],  g: 'brick' },
  { n: 'tree',      c: [86, 150, 72],  g: 'tree' },
  { n: 'rock',      c: [110, 110, 120], g: 'rock' },
  { n: 'lava',      c: [205, 75, 40],  g: 'wave' },
  { n: 'spikes',    c: [80, 80, 92],   g: 'spikes' },
  { n: 'bridge',    c: [150, 112, 72], g: 'plank' },
  { n: 'door',      c: [112, 84, 62],  g: 'door' },
];

const px = Buffer.alloc(W * H * 4);
const set = (x, y, r, g, b, a = 255) => { const i = (y * W + x) * 4; px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a; };
const mix = (c, t, k) => c.map((v, i) => Math.round(v + (t[i] - v) * k));
const dark = (c, k) => c.map((v) => Math.round(v * k));
const W2 = [255, 255, 255], BK = [20, 20, 24];

// returns the rgb for local pixel (x,y) of a tile of kind g over base color c
function pixel(g, x, y, c) {
  const cx = x - 15.5, cy = y - 15.5, d = Math.hypot(cx, cy);
  let col = c;
  // subtle base texture
  if (((x >> 2) + (y >> 2)) % 2 === 0) col = mix(col, W2, 0.06);
  switch (g) {
    case 'speck': if ((x * 7 + y * 13) % 17 === 0) col = mix(col, BK, 0.25); break;
    case 'flower': if (d < 5) col = (x + y) % 2 ? [230, 90, 110] : [240, 210, 90]; break;
    case 'tile': if (x === 16 || y === 16) col = dark(c, 0.7); break;
    case 'wave': if ((y + ((x >> 2) % 2) * 2) % 6 < 2) col = mix(col, W2, 0.22); break;
    case 'brick': { const row = (y / 8) | 0; const off = row % 2 ? 8 : 0; if (y % 8 === 0 || (x + off) % 16 === 0) col = dark(c, 0.6); break; }
    case 'tree': if (d < 11) col = mix([40, 110, 50], BK, (d / 11) * 0.3); if (Math.abs(cx) < 2 && cy > 6) col = [110, 80, 50]; break;
    case 'rock': if (d < 10) col = mix([130, 130, 140], BK, 0.15); if (d < 10 && cx + cy < -4) col = mix([160, 160, 170], W2, 0.1); break;
    case 'spikes': { const k = x % 8; const peak = 4; if (y > 28 - (Math.abs(k - 4) < peak ? (peak - Math.abs(k - 4)) * 4 : 0)) col = [200, 200, 210]; break; }
    case 'plank': if (x % 10 === 0) col = dark(c, 0.7); break;
    case 'door': if (x > 6 && x < 26 && y > 6) { col = d < 30 ? mix([60, 40, 28], BK, 0.1) : col; if (x > 8 && x < 24 && y > 8) col = [70, 48, 32]; if (Math.abs(x - 21) < 2 && Math.abs(y - 18) < 2) col = [220, 200, 90]; } break;
  }
  return col;
}

for (let ty = 0; ty < ROWS; ty++) {
  for (let tx = 0; tx < COLS; tx++) {
    const t = TILES[ty * COLS + tx];
    if (!t) continue;
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        let col = pixel(t.g, x, y, t.c);
        if (x === 0 || y === 0 || x === TILE - 1 || y === TILE - 1) col = dark(col, 0.55); // grid edge
        set(tx * TILE + x, ty * TILE + y, col[0], col[1], col[2], 255);
      }
    }
  }
}

// --- minimal PNG encoder (RGBA) ---
function encodePng(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0, 0);
  return Buffer.concat([len, body, crc]);
}
const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return c ^ 0xffffffff; }

const dest = new URL('../apps/editor/public/samples/test-tileset.png', import.meta.url);
mkdirSync(new URL('../apps/editor/public/samples/', import.meta.url), { recursive: true });
writeFileSync(dest, encodePng(W, H, px));
console.log(`Wrote test-tileset.png (${W}x${H}, ${COLS}x${ROWS}=${TILES.length} tiles @ ${TILE}px)`);
console.log('tiles:', TILES.map((t, i) => `${i}:${t.n}`).join(' '));
