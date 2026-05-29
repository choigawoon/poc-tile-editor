// Side-panel UI: tileset selector, layer list, map property fields.
import { state, activeTileset, activeDoc, makeLayer, emit, on } from './state.js';
import { pushHistory } from './history.js';

let els;

export function initPanels(elements) {
  els = elements;

  els.tilesetSelect.addEventListener('change', () => {
    state.ui.activeTilesetId = Number(els.tilesetSelect.value);
    state.ui.selection = null;
    emit('tilesets:change');
    emit('selection:change');
  });

  els.btnAddLayer.addEventListener('click', addLayer);
  els.btnResize.addEventListener('click', applyMapSize);
  els.chkGrid.addEventListener('change', () => {
    state.ui.showGrid = els.chkGrid.checked;
    emit('render');
  });

  on('tilesets:change', renderTilesets);
  on('project:replaced', () => { renderTilesets(); renderLayers(); syncMapFields(); });
  on('layers:change', renderLayers);
  on('map:change', renderLayers);
}

// ---- Tilesets ----
function renderTilesets() {
  const sel = els.tilesetSelect;
  sel.innerHTML = '';
  for (const ts of state.workspace.tilesets) {
    const o = document.createElement('option');
    o.value = ts.id;
    o.textContent = `${ts.name} (${ts.tileCount} tiles)`;
    sel.appendChild(o);
  }
  if (state.ui.activeTilesetId !== null) sel.value = state.ui.activeTilesetId;

  const ts = activeTileset();
  els.tilesetMeta.innerHTML = ts
    ? `${ts.imageWidth}×${ts.imageHeight}px · ${ts.tileWidth}×${ts.tileHeight} tiles<br>${ts.columns} cols · gid ${ts.firstgid}+`
    : 'No tileset. Click ＋ to add a PNG.';
}

// ---- Layers ----
function addLayer() {
  pushHistory();
  const id = state.ui.nextLayerId++;
  const doc = activeDoc();
  const cells = doc.mapWidth * doc.mapHeight;
  doc.layers.push(makeLayer(`Layer ${id + 1}`, cells, id));
  state.ui.activeLayerId = id;
  emit('layers:change');
  emit('render');
}

function removeLayer(id) {
  const doc = activeDoc();
  if (doc.layers.length <= 1) return;
  pushHistory();
  const i = doc.layers.findIndex((l) => l.id === id);
  doc.layers.splice(i, 1);
  if (state.ui.activeLayerId === id) {
    state.ui.activeLayerId = doc.layers[Math.max(0, i - 1)].id;
  }
  emit('layers:change');
  emit('render');
}

function moveLayer(id, dir) {
  const layers = activeDoc().layers;
  const i = layers.findIndex((l) => l.id === id);
  const j = i + dir;
  if (j < 0 || j >= layers.length) return;
  pushHistory();
  [layers[i], layers[j]] = [layers[j], layers[i]];
  emit('layers:change');
  emit('render');
}

function renderLayers() {
  const list = els.layerList;
  list.innerHTML = '';
  // top layer first in the UI (render order is bottom-up in the array)
  [...activeDoc().layers].reverse().forEach((layer) => {
    const li = document.createElement('li');
    li.className = 'layer-item' + (layer.id === state.ui.activeLayerId ? ' active' : '');

    const vis = document.createElement('span');
    vis.className = 'vis';
    vis.textContent = layer.visible ? '👁' : '🚫';
    vis.title = 'Toggle visibility';
    vis.onclick = () => { layer.visible = !layer.visible; emit('layers:change'); emit('render'); };

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = layer.name;
    name.title = 'Double-click to rename';
    name.onclick = () => { state.ui.activeLayerId = layer.id; emit('layers:change'); };
    name.ondblclick = () => renameLayer(layer, name);

    const up = mkBtn('▲', () => moveLayer(layer.id, 1));
    const down = mkBtn('▼', () => moveLayer(layer.id, -1));
    const del = mkBtn('✕', () => removeLayer(layer.id));

    li.append(vis, name, up, down, del);
    list.appendChild(li);
  });
}

function renameLayer(layer, nameEl) {
  const input = document.createElement('input');
  input.value = layer.name;
  nameEl.textContent = '';
  nameEl.appendChild(input);
  input.focus();
  input.select();
  const commit = () => { layer.name = input.value.trim() || layer.name; emit('layers:change'); };
  input.onblur = commit;
  input.onkeydown = (e) => { if (e.key === 'Enter') input.blur(); };
}

function mkBtn(label, fn) {
  const b = document.createElement('button');
  b.className = 'lbtn';
  b.textContent = label;
  b.onclick = (e) => { e.stopPropagation(); fn(); };
  return b;
}

// ---- Map size ----
function syncMapFields() {
  const doc = activeDoc(), w = state.workspace;
  els.mapTileW.value = w.tileWidth;
  els.mapTileH.value = w.tileHeight;
  els.mapCols.value = doc.mapWidth;
  els.mapRows.value = doc.mapHeight;
  els.chkGrid.checked = state.ui.showGrid;
}

function applyMapSize() {
  const tw = clamp(+els.mapTileW.value, 1, 1024);
  const th = clamp(+els.mapTileH.value, 1, 1024);
  const cols = clamp(+els.mapCols.value, 1, 1000);
  const rows = clamp(+els.mapRows.value, 1, 1000);
  pushHistory();
  resizeAllLayers(cols, rows);
  state.workspace.tileWidth = tw;
  state.workspace.tileHeight = th;
  const doc = activeDoc();
  doc.mapWidth = cols;
  doc.mapHeight = rows;
  emit('render');
  emit('layers:change');
}

// Resize layer data preserving existing cells (top-left anchored).
function resizeAllLayers(newW, newH) {
  const doc = activeDoc();
  const oldW = doc.mapWidth;
  const oldH = doc.mapHeight;
  for (const layer of doc.layers) {
    const next = new Array(newW * newH).fill(0);
    for (let r = 0; r < Math.min(oldH, newH); r++) {
      for (let c = 0; c < Math.min(oldW, newW); c++) {
        next[r * newW + c] = layer.data[r * oldW + c];
      }
    }
    layer.data = next;
  }
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v || lo)); }
