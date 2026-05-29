// "Import image as tiles" — turn a whole picture into a tileset + a placement
// that reconstructs it. Two modes share one code path:
//
//   • no dedupe : the image itself becomes the tileset; cells map 1:1 in
//                 row-major order (every cell unique — low reuse).
//   • dedupe    : identical cells are hashed and collapsed to one tile, packed
//                 into a compact atlas; the placement points repeats at the
//                 same index (recovers reuse where the art repeats).
//
// Either way the output is just a normal tileset + gid grid — same format, same
// bundle, same game runtime. Nothing downstream needs to know how it was made.
import { state, activeDoc, makeLayer, emit } from './state.js';
import { pushHistory } from './history.js';
import { loadImage, addTileset } from './tileset.js';
import { slug } from '@poc/core';

// FNV-1a over a cell's RGBA bytes — a short, fast key for duplicate detection.
function hashCell(data) {
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) { h ^= data[i]; h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

// Grow the map (all layers, top-left anchored) so a cols×rows region fits.
function ensureMapAtLeast(cols, rows) {
  const p = activeDoc();
  const newW = Math.max(p.mapWidth, cols), newH = Math.max(p.mapHeight, rows);
  if (newW === p.mapWidth && newH === p.mapHeight) return;
  for (const layer of p.layers) {
    const next = new Array(newW * newH).fill(0);
    for (let r = 0; r < p.mapHeight; r++)
      for (let c = 0; c < p.mapWidth; c++) next[r * newW + c] = layer.data[r * p.mapWidth + c];
    layer.data = next;
  }
  p.mapWidth = newW; p.mapHeight = newH;
}

// dataUrl + name → adds a tileset and a layer reconstructing the image.
// Returns a short status message (caller flashes it). Throws on bad input.
export async function importImageAsTiles(dataUrl, name, { tileWidth, tileHeight, dedupe }) {
  const img = await loadImage(dataUrl);
  const tw = tileWidth, th = tileHeight;
  const cols = Math.floor(img.naturalWidth / tw);
  const rows = Math.floor(img.naturalHeight / th);
  if (cols < 1 || rows < 1) throw new Error(`image smaller than one ${tw}×${th} tile`);

  const base = slug(name.replace(/\.[^.]+$/, '')) || 'image';

  // draw the source once so we can sample cells
  const src = document.createElement('canvas');
  src.width = img.naturalWidth; src.height = img.naturalHeight;
  const sctx = src.getContext('2d', { willReadFrequently: true });
  sctx.imageSmoothingEnabled = false;
  sctx.drawImage(img, 0, 0);

  // placement[r][c] = local tile index into the new tileset
  const placement = Array.from({ length: rows }, () => new Array(cols).fill(0));
  let tilesetUrl, tilesetCols, tileCount;

  if (!dedupe) {
    // the image is the tileset; indices are row-major
    tilesetUrl = dataUrl;
    tilesetCols = cols;
    tileCount = cols * rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) placement[r][c] = r * cols + c;
  } else {
    // collapse identical cells, pack uniques into a compact atlas
    const seen = new Map();           // hash -> unique index
    const uniques = [];               // { sx, sy }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const sx = c * tw, sy = r * th;
        const h = hashCell(sctx.getImageData(sx, sy, tw, th).data);
        let idx = seen.get(h);
        if (idx === undefined) { idx = uniques.length; seen.set(h, idx); uniques.push({ sx, sy }); }
        placement[r][c] = idx;
      }
    }
    tileCount = uniques.length;
    tilesetCols = Math.min(16, tileCount);
    const arows = Math.ceil(tileCount / tilesetCols);
    const atlas = document.createElement('canvas');
    atlas.width = tilesetCols * tw; atlas.height = arows * th;
    const actx = atlas.getContext('2d');
    actx.imageSmoothingEnabled = false;
    uniques.forEach((u, i) => {
      const ac = i % tilesetCols, ar = Math.floor(i / tilesetCols);
      actx.drawImage(src, u.sx, u.sy, tw, th, ac * tw, ar * th, tw, th);
    });
    tilesetUrl = atlas.toDataURL('image/png');
  }

  pushHistory();
  const ts = await addTileset(`${base} (tiles)`, tilesetUrl, { tileWidth: tw, tileHeight: th });
  state.ui.activeTilesetId = ts.id;

  ensureMapAtLeast(cols, rows);
  const id = state.ui.nextLayerId++;
  const doc = activeDoc();
  const layer = makeLayer(base, doc.mapWidth * doc.mapHeight, id);
  const W = doc.mapWidth;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) layer.data[r * W + c] = ts.firstgid + placement[r][c];
  doc.layers.push(layer);
  state.ui.activeLayerId = id;

  emit('tilesets:change');
  emit('project:replaced'); // refresh panels, map-size fields, recenter

  const total = cols * rows;
  const reuse = dedupe ? ` → ${tileCount} unique (${Math.round((1 - tileCount / total) * 100)}% reused)` : '';
  return `Imported ${cols}×${rows} = ${total} cells${reuse}`;
}
