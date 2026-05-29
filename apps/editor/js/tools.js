// Painting operations on the active layer.
import { state, activeLayer, activeDoc, makeLayer, emit } from './state.js';

// Stamp the chosen pattern (ui.stampPatternId) onto the active document with its
// top-left at (col,row). Layers are matched by name (missing ones are created);
// empty pattern cells are skipped so it overlays. Shared tilesets mean the
// pattern's gids resolve here unchanged. Call pushHistory() before this.
export function stampAt(col, row) {
  const pat = state.workspace.patterns.find((p) => p.id === state.ui.stampPatternId);
  const doc = activeDoc();
  if (!pat || !doc) return false;
  const W = doc.mapWidth, H = doc.mapHeight;
  let changed = false;
  for (const pl of pat.layers) {
    let dl = doc.layers.find((l) => l.name === pl.name);
    if (!dl) { dl = makeLayer(pl.name, W * H, state.ui.nextLayerId++); doc.layers.push(dl); changed = true; }
    for (let r = 0; r < pat.mapHeight; r++) {
      for (let c = 0; c < pat.mapWidth; c++) {
        const gid = pl.data[r * pat.mapWidth + c];
        if (!gid) continue;
        const x = col + c, y = row + r;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const i = y * W + x;
        if (dl.data[i] !== gid) { dl.data[i] = gid; changed = true; }
      }
    }
  }
  if (changed) { emit('map:change'); emit('layers:change'); }
  return changed;
}

function idx(col, row) {
  return row * state.project.mapWidth + col;
}
function inBounds(col, row) {
  return col >= 0 && row >= 0 && col < state.project.mapWidth && row < state.project.mapHeight;
}

// gid for a cell (dx,dy) inside the current selection stamp
function selGid(sel, dx, dy) {
  const ts = state.project.tilesets.find((t) => t.id === sel.tilesetId);
  if (!ts) return 0;
  const local = (sel.row + dy) * ts.columns + (sel.col + dx);
  return ts.firstgid + local;
}

// Paint the selected stamp with its top-left anchored at (col,row).
export function paintAt(col, row) {
  const layer = activeLayer();
  const sel = state.ui.selection;
  if (!layer || !sel) return false;
  let changed = false;
  for (let dy = 0; dy < sel.h; dy++) {
    for (let dx = 0; dx < sel.w; dx++) {
      const c = col + dx, r = row + dy;
      if (!inBounds(c, r)) continue;
      const gid = selGid(sel, dx, dy);
      const i = idx(c, r);
      if (layer.data[i] !== gid) { layer.data[i] = gid; changed = true; }
    }
  }
  if (changed) emit('map:change');
  return changed;
}

export function eraseAt(col, row) {
  const layer = activeLayer();
  if (!layer || !inBounds(col, row)) return false;
  const i = idx(col, row);
  if (layer.data[i] === 0) return false;
  layer.data[i] = 0;
  emit('map:change');
  return true;
}

// Flood fill the contiguous region of the same gid with the selected single tile.
export function fillAt(col, row) {
  const layer = activeLayer();
  const sel = state.ui.selection;
  if (!layer || !sel || !inBounds(col, row)) return false;
  const target = layer.data[idx(col, row)];
  const replacement = selGid(sel, 0, 0);
  if (target === replacement) return false;

  const { mapWidth, mapHeight } = state.project;
  const stack = [[col, row]];
  let changed = false;
  while (stack.length) {
    const [c, r] = stack.pop();
    if (c < 0 || r < 0 || c >= mapWidth || r >= mapHeight) continue;
    const i = idx(c, r);
    if (layer.data[i] !== target) continue;
    layer.data[i] = replacement;
    changed = true;
    stack.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
  }
  if (changed) emit('map:change');
  return changed;
}

// Fill a rectangle, tiling the selected stamp across it.
export function rectFill(x0, y0, x1, y1) {
  const layer = activeLayer();
  const sel = state.ui.selection;
  if (!layer || !sel) return false;
  const ax = Math.min(x0, x1), ay = Math.min(y0, y1);
  const bx = Math.max(x0, x1), by = Math.max(y0, y1);
  let changed = false;
  for (let r = ay; r <= by; r++) {
    for (let c = ax; c <= bx; c++) {
      if (!inBounds(c, r)) continue;
      const gid = selGid(sel, (c - ax) % sel.w, (r - ay) % sel.h);
      const i = idx(c, r);
      if (layer.data[i] !== gid) { layer.data[i] = gid; changed = true; }
    }
  }
  if (changed) emit('map:change');
  return changed;
}

// Eyedropper: set the palette selection from a painted tile.
export function pickAt(col, row) {
  const layer = activeLayer();
  if (!layer || !inBounds(col, row)) return false;
  const gid = layer.data[idx(col, row)];
  if (!gid) return false;
  let ts = null;
  for (const t of state.project.tilesets) if (gid >= t.firstgid) ts = t;
  if (!ts) return false;
  const local = gid - ts.firstgid;
  state.ui.activeTilesetId = ts.id;
  state.ui.selection = {
    tilesetId: ts.id,
    col: local % ts.columns,
    row: Math.floor(local / ts.columns),
    w: 1, h: 1,
  };
  emit('selection:change');
  emit('tilesets:change');
  return false; // no map mutation
}
