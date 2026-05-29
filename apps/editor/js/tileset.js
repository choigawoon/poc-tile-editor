// Tileset loading & geometry helpers.
import { state, emit } from './state.js';

export function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function computeGeometry(ts) {
  const { imageWidth, imageHeight, tileWidth, tileHeight, margin, spacing } = ts;
  const cols = Math.floor((imageWidth - margin * 2 + spacing) / (tileWidth + spacing));
  const rows = Math.floor((imageHeight - margin * 2 + spacing) / (tileHeight + spacing));
  ts.columns = Math.max(0, cols);
  ts.rows = Math.max(0, rows);
  ts.tileCount = ts.columns * ts.rows;
}

// Add a tileset from a data URL. Returns the created tileset descriptor.
export async function addTileset(name, dataUrl, opts = {}) {
  const img = await loadImage(dataUrl);
  const id = state.workspace.tilesets.length
    ? Math.max(...state.workspace.tilesets.map((t) => t.id)) + 1
    : 0;
  const ts = {
    id,
    name,
    image: dataUrl, // embedded so projects are self-contained
    imageWidth: img.naturalWidth,
    imageHeight: img.naturalHeight,
    tileWidth: opts.tileWidth ?? state.workspace.tileWidth,
    tileHeight: opts.tileHeight ?? state.workspace.tileHeight,
    margin: opts.margin ?? 0,
    spacing: opts.spacing ?? 0,
    firstgid: state.workspace.nextGid,
  };
  computeGeometry(ts);
  state.workspace.nextGid += ts.tileCount;
  state.workspace.tilesets.push(ts);
  state.images.set(id, img);
  if (state.ui.activeTilesetId === null) state.ui.activeTilesetId = id;
  emit('tilesets:change');
  return ts;
}

// Re-create runtime Image objects after a project load / undo.
export async function rehydrateImages() {
  state.images.clear();
  await Promise.all(
    state.workspace.tilesets.map(async (ts) => {
      if (!ts.image) return;
      const img = await loadImage(ts.image);
      state.images.set(ts.id, img);
    })
  );
  emit('images:ready');
}

// Local tile index (0-based) -> source rect in the tileset image.
export function tileSrcRect(ts, localIndex) {
  const col = localIndex % ts.columns;
  const row = Math.floor(localIndex / ts.columns);
  return {
    sx: ts.margin + col * (ts.tileWidth + ts.spacing),
    sy: ts.margin + row * (ts.tileHeight + ts.spacing),
    sw: ts.tileWidth,
    sh: ts.tileHeight,
  };
}

// Global id -> { tileset, localIndex } or null for empty.
export function resolveGid(gid) {
  if (gid <= 0) return null;
  let ts = null;
  for (const t of state.workspace.tilesets) if (gid >= t.firstgid) ts = t;
  if (!ts) return null;
  return { tileset: ts, localIndex: gid - ts.firstgid };
}
