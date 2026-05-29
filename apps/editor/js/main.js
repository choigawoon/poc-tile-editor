// Entry point: wires DOM, canvas input, tools, shortcuts and actions together.
import { state, on, emit, activeDoc, projectSnapshot } from './state.js';
import { initRenderer, render, resizeCanvas, screenToTile, setHover, setRectPreview } from './renderer.js';
import { initPalette, renderPalette, setPaletteZoom } from './palette.js';
import { initPanels } from './panels.js';
import { initTileMeta } from './tilemeta.js';
import { initPanelResize } from './panel-resize.js';
import { initMapTabs } from './maps.js';
import { initDoors } from './doors.js';
import { initPcgPanel } from './pcgpanel.js';
import { initGenai } from './genai.js';
import { initDock } from './dock.js';
import { initMenuBar } from './menubar.js';
import { addTileset, fileToDataUrl } from './tileset.js';
import { importImageAsTiles } from './import-image.js';
import { pushHistory, undo, redo, canUndo, canRedo } from './history.js';
import { paintAt, eraseAt, fillAt, rectFill, pickAt, stampAt } from './tools.js';
import { newProject, saveProject, loadProjectFromText } from './project.js';
import { runExport } from './exporters/index.js';
import { restore, scheduleSave, clearSaved } from './persist.js';
import { buildDefaultProject } from './default-project.js';
import { initPlay } from './play.js';

const $ = (id) => document.getElementById(id);

const els = {
  stage: $('stage'),
  stageCanvas: $('stage-canvas'),
  mapTabs: $('map-tabs'),
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
  btnImportTiles: $('btn-import-tiles'), fileImport: $('file-import'),
  btnUndo: $('btn-undo'), btnRedo: $('btn-redo'),
  btnNew: $('btn-new'), btnSave: $('btn-save'), btnLoad: $('btn-load'),
  exportTarget: $('export-target'), btnExport: $('btn-export'),
  fileImage: $('file-image'), fileProject: $('file-project'),
  btnPlay: $('btn-play'),
  tileMeta: $('tile-meta'),
  doorBlock: $('door-block'),
  doorPanel: $('door-panel'),
  genaiPanel: $('genai-panel'),
  pcgPanel: $('pcg-panel'),
};

// ▶Play overlay elements + wiring
initPlay({
  btnPlay: $('btn-play'),
  overlay: $('play-overlay'),
  frame: $('play-frame'),
  status: $('play-status'),
  btnPlayClose: $('btn-play-close'),
  btnPlayReload: $('btn-play-reload'),
});

// ---- init ----
initRenderer(els.mapCanvas);
initPalette(els.paletteCanvas);
initPanels(els);
initTileMeta(els.tileMeta);
initPanelResize(document.querySelector('.layout'), renderPalette);
initMapTabs(els.mapTabs);
initDoors(els.doorBlock, els.doorPanel);
initGenai(els.genaiPanel);
initPcgPanel(els.pcgPanel);
initDock(document);
initMenuBar($('menubar'));

document.getElementById('palette-zoom-in').onclick = () => setPaletteZoom(1);
document.getElementById('palette-zoom-out').onclick = () => setPaletteZoom(-1);

// ---- render scheduling ----
// Defined before the first-paint calls at the bottom of this section, because
// requestRender reads `dirty` (a `let`, in the temporal dead zone until here).
let dirty = false;
function requestRender() {
  if (dirty) return;
  dirty = true;
  requestAnimationFrame(() => { dirty = false; render(); });
}
['render', 'map:change', 'layers:change', 'project:replaced', 'images:ready', 'selection:change']
  .forEach((e) => on(e, requestRender));
on('history:change', updateUndoRedo);

// autosave to localStorage on any document change (debounced inside scheduleSave)
['map:change', 'layers:change', 'tilesets:change', 'project:replaced']
  .forEach((e) => on(e, scheduleSave));

// ---- stage sizing ----
function fitStage() {
  const r = els.stageCanvas.getBoundingClientRect();
  resizeCanvas(r.width, r.height);
  requestRender();
}
new ResizeObserver(fitStage).observe(els.stageCanvas);

// center the map on first paint
on('project:replaced', centerCamera);

// ---- startup: restore the autosaved project, else build the default scene ----
fitStage();
(async () => {
  const restored = await restore();
  if (!restored) {
    try { await buildDefaultProject(); } catch (e) { console.warn('default project failed:', e.message); }
  }
  emit('project:replaced');
  emit('tilesets:change');
  emit('selection:change');
  renderPalette();
  centerCamera();
  requestRender();
})();

function centerCamera() {
  const r = els.stageCanvas.getBoundingClientRect();
  const doc = activeDoc(), w = state.workspace;
  const mw = doc.mapWidth * w.tileWidth;
  const mh = doc.mapHeight * w.tileHeight;
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
  setRectPreview(null); // clear any stamp/rect ghost when switching tools
  els.toolbar.querySelectorAll('.tool').forEach((b) =>
    b.classList.toggle('active', b.dataset.tool === tool));
}

// Stamp the chosen pattern at (col,row) onto the active map (one undo step).
function stampHere(col, row) {
  if (state.ui.activeKind !== 'map') { flash('Switch to a map tab to stamp'); return; }
  if (state.ui.stampPatternId == null) { flash('Make a pattern first (Patterns ＋)'); return; }
  pushHistory();
  if (stampAt(col, row)) requestRender();
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
  if (tool === 'stamp') { stampHere(col, row); return; }
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
  if (state.ui.activeTool === 'stamp') {
    const pat = state.workspace.patterns.find((p) => p.id === state.ui.stampPatternId);
    if (pat) setRectPreview({ x0: col, y0: row, x1: col + pat.mapWidth - 1, y1: row + pat.mapHeight - 1 });
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

// Figma-style, trackpad-friendly: pinch (browsers send it as ctrl+wheel) or
// ⌘/Ctrl+scroll → zoom toward the cursor; plain scroll / two-finger drag → pan.
// (Plain wheel and trackpad two-finger scroll are indistinguishable, so both
// pan; hold ⌘/Ctrl to zoom with a mouse wheel. Space-drag still pans too.)
els.mapCanvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const cam = state.ui.camera;
  if (e.ctrlKey || e.metaKey) {
    const local = mousePos(e);
    const factor = Math.exp(-e.deltaY * 0.01); // smooth, continuous
    const newZoom = Math.max(0.1, Math.min(8, cam.zoom * factor));
    cam.x = local.x - (local.x - cam.x) * (newZoom / cam.zoom);
    cam.y = local.y - (local.y - cam.y) * (newZoom / cam.zoom);
    cam.zoom = newZoom;
  } else {
    cam.x -= e.deltaX;
    cam.y -= e.deltaY;
  }
  requestRender();
}, { passive: false });

// ---- keyboard ----
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.code === 'Space') { spaceDown = true; els.mapCanvas.style.cursor = 'grab'; return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  const map = { b: 'brush', e: 'eraser', g: 'fill', r: 'rect', i: 'picker', m: 'stamp' };
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
  clearSaved();
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

els.btnImportTiles.onclick = () => els.fileImport.click();
els.fileImport.onchange = async () => {
  const file = els.fileImport.files[0];
  if (!file) return;
  try {
    const tw = clampInt(prompt('Tile width (px):', state.workspace.tileWidth), 1, 1024);
    if (!tw) return;
    const th = clampInt(prompt('Tile height (px):', tw), 1, 1024);
    if (!th) return;
    const dedupe = confirm('Merge duplicate tiles? (smaller tileset, reuses identical cells)');
    const url = await fileToDataUrl(file);
    const msg = await importImageAsTiles(url, file.name, { tileWidth: tw, tileHeight: th, dedupe });
    centerCamera();
    renderPalette();
    flash(msg);
  } catch (err) { alert('Import failed: ' + err.message); }
  els.fileImport.value = '';
};
function clampInt(v, lo, hi) { const n = Math.round(+v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : 0; }

els.btnExport.onclick = () => {
  if (!state.workspace.tilesets.length) { alert('Add a tileset and paint something first.'); return; }
  try {
    const name = runExport(els.exportTarget.value, projectSnapshot());
    flash(`Exported ${name} (+ tileset images)`);
  } catch (err) { alert('Export failed: ' + err.message); }
};

function flash(msg) {
  els.hud.textContent = msg;
  setTimeout(() => { els.hud.textContent = '0, 0'; }, 2500);
}

// expose a tiny hook for debugging / scripting in the console
window.__tileEditor = { state, emit, addTileset, paintAt, fillAt, rectFill, render };
