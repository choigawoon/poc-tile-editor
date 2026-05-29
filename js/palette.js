// Palette: shows the active tileset and lets the user pick a single tile
// or drag a rectangular block (stamp) of tiles.
import { state, activeTileset, emit, on } from './state.js';

const SCALE_MIN = 1;
let canvas, ctx;
let dragStart = null;

export function initPalette(canvasEl) {
  canvas = canvasEl;
  ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  canvas.addEventListener('mousedown', onDown);
  canvas.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);

  on('tilesets:change', renderPalette);
  on('images:ready', renderPalette);
  on('selection:change', renderPalette);
}

function scale() {
  const ts = activeTileset();
  if (!ts) return 1;
  // fit width to the palette container, never below 1x
  const wrap = canvas.parentElement;
  const avail = wrap.clientWidth - 12;
  return Math.max(SCALE_MIN, Math.floor(avail / ts.imageWidth) || SCALE_MIN);
}

function cellFromEvent(e) {
  const ts = activeTileset();
  if (!ts) return null;
  const s = scale();
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / s;
  const y = (e.clientY - rect.top) / s;
  const col = Math.floor((x - ts.margin) / (ts.tileWidth + ts.spacing));
  const row = Math.floor((y - ts.margin) / (ts.tileHeight + ts.spacing));
  if (col < 0 || row < 0 || col >= ts.columns || row >= ts.rows) return null;
  return { col, row };
}

function onDown(e) {
  const c = cellFromEvent(e);
  if (!c) return;
  dragStart = c;
  applySelection(c, c);
}
function onMove(e) {
  if (!dragStart) return;
  const c = cellFromEvent(e);
  if (!c) return;
  applySelection(dragStart, c);
}
function onUp() { dragStart = null; }

function applySelection(a, b) {
  const ts = activeTileset();
  if (!ts) return;
  const col = Math.min(a.col, b.col);
  const row = Math.min(a.row, b.row);
  const w = Math.abs(a.col - b.col) + 1;
  const h = Math.abs(a.row - b.row) + 1;
  state.ui.selection = { tilesetId: ts.id, col, row, w, h };
  emit('selection:change');
}

export function renderPalette() {
  if (!ctx) return;
  const ts = activeTileset();
  if (!ts) { canvas.width = 0; canvas.height = 0; return; }
  const img = state.images.get(ts.id);
  const s = scale();
  canvas.width = ts.imageWidth * s;
  canvas.height = ts.imageHeight * s;
  canvas.style.width = canvas.width + 'px';
  canvas.style.height = canvas.height + 'px';

  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (img) ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  // grid
  ctx.strokeStyle = 'rgba(255,255,255,.15)';
  ctx.lineWidth = 1;
  for (let c = 0; c <= ts.columns; c++) {
    const x = (ts.margin + c * (ts.tileWidth + ts.spacing)) * s + 0.5;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let r = 0; r <= ts.rows; r++) {
    const y = (ts.margin + r * (ts.tileHeight + ts.spacing)) * s + 0.5;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }

  // selection highlight
  const sel = state.ui.selection;
  if (sel && sel.tilesetId === ts.id) {
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 2;
    const x = (ts.margin + sel.col * (ts.tileWidth + ts.spacing)) * s;
    const y = (ts.margin + sel.row * (ts.tileHeight + ts.spacing)) * s;
    ctx.strokeRect(x, y, sel.w * ts.tileWidth * s, sel.h * ts.tileHeight * s);
  }
}
