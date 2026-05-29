// Entry point: wires DOM, canvas input, tools, shortcuts and actions together.
import { state, on, emit } from './state.js';
import { initRenderer, render, resizeCanvas, screenToTile, setHover, setRectPreview } from './renderer.js';
import { initPalette, renderPalette } from './palette.js';
import { initPanels } from './panels.js';
import { addTileset, fileToDataUrl } from './tileset.js';
import { pushHistory, undo, redo, canUndo, canRedo } from './history.js';
import { paintAt, eraseAt, fillAt, rectFill, pickAt } from './tools.js';
import { newProject, saveProject, loadProjectFromText } from './project.js';
import { runExport } from './exporters/index.js';

const $ = (id) => document.getElementById(id);

const els = {
  stage: $('stage'),
  mapCanvas: $('map-canvas'),
  hud: $('stage-hud'),
  paletteCanvas: $('palette-canvas'),
  toolbar: $('toolbar'),
  tilesetSelect: $('tileset-select'),
  tilesetMeta: $('tileset-meta'),
  layerList: $('layer-list'),
  mapTileW: $('map-tilew'), mapTileH: $('map-tileh'),
  mapCols: $('map-cols'), mapRows: $('map-rows'),
  btnResize: $('btn-resize'), chkGrid: $('chk-grid'),
  btnAddTileset: $('btn-add-tileset'), btnAddLayer: $('btn-add-layer'),
  btnUndo: $('btn-undo'), btnRedo: $('btn-redo'),
  btnNew: $('btn-new'), btnSave: $('btn-save'), btnLoad: $('btn-load'),
  exportTarget: $('export-target'), btnExport: $('btn-export'),
  fileImage: $('file-image'), fileProject: $('file-project'),
};

// ---- init ----
initRenderer(els.mapCanvas);
initPalette(els.paletteCanvas);
initPanels(els);

fitStage();
emit('project:replaced');

// ---- render scheduling ----
let dirty = false;
function requestRender() {
  if (dirty) return;
  dirty = true;
  requestAnimationFrame(() => { dirty = false; render(); });
}
['render', 'map:change', 'layers:change', 'project:replaced', 'images:ready', 'selection:change']
  .forEach((e) => on(e, requestRender));
on('history:change', updateUndoRedo);

// ---- stage sizing ----
function fitStage() {
  const r = els.stage.getBoundingClientRect();
  resizeCanvas(r.width, r.height);
  requestRender();
}
new ResizeObserver(fitStage).observe(els.stage);

// center the map on first paint
on('project:replaced', centerCamera);
function centerCamera() {
  const r = els.stage.getBoundingClientRect();
  const mw = state.project.mapWidth * state.project.tileWidth;
  const mh = state.project.mapHeight * state.project.tileHeight;
  const cam = state.ui.camera;
  cam.zoom = Math.min(1, Math.max(0.1, Math.min(r.width / (mw + 80), r.height / (mh + 80))));
  cam.x = (r.width - mw * cam.zoom) / 2;
  cam.y = (r.height - mh * cam.zoom) / 2;
  requestRender();
}

// ---- toolbar ----
els.toolbar.querySelectorAll('.tool').forEach((btn) => {
  btn.addEventListener('click', () => setTool(btn.dataset.tool));
});
function setTool(tool) {
  state.ui.activeTool = tool;
  els.toolbar.querySelectorAll('.tool').forEach((b) =>
    b.classList.toggle('active', b.dataset.tool === tool));
}
setTool('brush');

// ---- canvas input ----
let painting = false;
let strokeStarted = false;
let panning = false;
let panStart = null;
let rectStart = null;
let spaceDown = false;

els.mapCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

els.mapCanvas.addEventListener('mousedown', (e) => {
  const local = mousePos(e);
  // pan: middle button or space-drag
  if (e.button === 1 || (e.button === 0 && spaceDown)) {
    panning = true;
    panStart = { x: e.clientX, y: e.clientY, cx: state.ui.camera.x, cy: state.ui.camera.y };
    return;
  }
  if (e.button !== 0) return;

  const { col, row } = screenToTile(local.x, local.y);
  const tool = state.ui.activeTool;

  if (tool === 'picker') { pickAt(col, row); return; }
  if (tool === 'rect') { rectStart = { col, row }; setRectPreview({ x0: col, y0: row, x1: col, y1: row }); requestRender(); return; }

  painting = true;
  strokeStarted = false;
  applyTool(col, row);
});

window.addEventListener('mousemove', (e) => {
  const local = mousePos(e);
  const { col, row } = screenToTile(local.x, local.y);
  els.hud.textContent = `${col}, ${row}`;
  setHover({ col, row });

  if (panning && panStart) {
    state.ui.camera.x = panStart.cx + (e.clientX - panStart.x);
    state.ui.camera.y = panStart.cy + (e.clientY - panStart.y);
    requestRender();
    return;
  }
  if (rectStart) {
    setRectPreview({ x0: rectStart.col, y0: rectStart.row, x1: col, y1: row });
    requestRender();
    return;
  }
  if (painting) applyTool(col, row);
  else requestRender();
});

window.addEventListener('mouseup', (e) => {
  if (rectStart) {
    const local = mousePos(e);
    const { col, row } = screenToTile(local.x, local.y);
    pushHistory();
    rectFill(rectStart.col, rectStart.row, col, row);
    rectStart = null;
    setRectPreview(null);
    requestRender();
  }
  painting = false;
  strokeStarted = false;
  panning = false;
  panStart = null;
});

// apply brush/eraser/fill, pushing one history entry per stroke
function applyTool(col, row) {
  const tool = state.ui.activeTool;
  if (!strokeStarted) { pushHistory(); strokeStarted = true; }
  if (tool === 'brush') paintAt(col, row);
  else if (tool === 'eraser') eraseAt(col, row);
  else if (tool === 'fill') { fillAt(col, row); painting = false; }
}

function mousePos(e) {
  const r = els.mapCanvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

// zoom toward cursor
els.mapCanvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const cam = state.ui.camera;
  const local = mousePos(e);
  const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
  const newZoom = Math.max(0.1, Math.min(8, cam.zoom * factor));
  // keep the point under the cursor stationary
  cam.x = local.x - (local.x - cam.x) * (newZoom / cam.zoom);
  cam.y = local.y - (local.y - cam.y) * (newZoom / cam.zoom);
  cam.zoom = newZoom;
  requestRender();
}, { passive: false });

// ---- keyboard ----
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.code === 'Space') { spaceDown = true; els.mapCanvas.style.cursor = 'grab'; return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  const map = { b: 'brush', e: 'eraser', g: 'fill', r: 'rect', i: 'picker' };
  if (map[e.key.toLowerCase()]) setTool(map[e.key.toLowerCase()]);
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') { spaceDown = false; els.mapCanvas.style.cursor = 'default'; }
});

// ---- actions ----
els.btnUndo.onclick = undo;
els.btnRedo.onclick = redo;
function updateUndoRedo() {
  els.btnUndo.disabled = !canUndo();
  els.btnRedo.disabled = !canRedo();
}
updateUndoRedo();

els.btnNew.onclick = () => {
  if (!confirm('Start a new project? Unsaved changes will be lost.')) return;
  newProject();
};
els.btnSave.onclick = saveProject;
els.btnLoad.onclick = () => els.fileProject.click();
els.fileProject.onchange = async () => {
  const file = els.fileProject.files[0];
  if (!file) return;
  try {
    await loadProjectFromText(await file.text());
    centerCamera();
  } catch (err) { alert('Load failed: ' + err.message); }
  els.fileProject.value = '';
};

els.btnAddTileset.onclick = () => els.fileImage.click();
els.fileImage.onchange = async () => {
  const file = els.fileImage.files[0];
  if (!file) return;
  try {
    const url = await fileToDataUrl(file);
    await addTileset(file.name, url);
    renderPalette();
  } catch (err) { alert('Could not load image: ' + err.message); }
  els.fileImage.value = '';
};

els.btnExport.onclick = () => {
  if (!state.project.tilesets.length) { alert('Add a tileset and paint something first.'); return; }
  try {
    const name = runExport(els.exportTarget.value, state.project);
    flash(`Exported ${name} (+ tileset images)`);
  } catch (err) { alert('Export failed: ' + err.message); }
};

function flash(msg) {
  els.hud.textContent = msg;
  setTimeout(() => { els.hud.textContent = '0, 0'; }, 2500);
}

// expose a tiny hook for debugging in the console
window.__tileEditor = { state };
