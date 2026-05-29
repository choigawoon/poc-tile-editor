// Map canvas renderer: camera transform, grid, layered tile compositing,
// and a hover/selection preview overlay.
import { state } from './state.js';
import { resolveGid, tileSrcRect } from './tileset.js';

let canvas, ctx;
let hover = null; // { col, row } in tile coords, or null
let rectPreview = null; // { x0, y0, x1, y1 } in tile coords while dragging rect tool

export function initRenderer(canvasEl) {
  canvas = canvasEl;
  ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
}

export function setHover(h) { hover = h; }
export function setRectPreview(r) { rectPreview = r; }

export function resizeCanvas(w, h) {
  canvas.width = w;
  canvas.height = h;
}

// ---- coordinate conversion ----
// screen px -> world px
export function screenToWorld(sx, sy) {
  const cam = state.ui.camera;
  return { x: (sx - cam.x) / cam.zoom, y: (sy - cam.y) / cam.zoom };
}

// screen px -> tile col/row (may be out of bounds)
export function screenToTile(sx, sy) {
  const { x, y } = screenToWorld(sx, sy);
  return {
    col: Math.floor(x / state.project.tileWidth),
    row: Math.floor(y / state.project.tileHeight),
  };
}

export function render() {
  if (!ctx) return;
  const p = state.project;
  const cam = state.ui.camera;
  const tw = p.tileWidth, th = p.tileHeight;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.setTransform(cam.zoom, 0, 0, cam.zoom, cam.x, cam.y);

  const worldW = p.mapWidth * tw;
  const worldH = p.mapHeight * th;

  // map background
  ctx.fillStyle = '#111216';
  ctx.fillRect(0, 0, worldW, worldH);

  // layers (bottom to top)
  for (const layer of p.layers) {
    if (!layer.visible) continue;
    ctx.globalAlpha = layer.opacity;
    drawLayer(layer, tw, th);
  }
  ctx.globalAlpha = 1;

  // grid
  if (state.ui.showGrid) drawGrid(worldW, worldH, tw, th);

  // border
  ctx.lineWidth = 1 / cam.zoom;
  ctx.strokeStyle = '#5b9cff';
  ctx.strokeRect(0, 0, worldW, worldH);

  drawOverlay(tw, th);
}

function drawLayer(layer, tw, th) {
  const p = state.project;
  for (let i = 0; i < layer.data.length; i++) {
    const gid = layer.data[i];
    if (!gid) continue;
    const r = resolveGid(gid);
    if (!r) continue;
    const img = state.images.get(r.tileset.id);
    if (!img) continue;
    const src = tileSrcRect(r.tileset, r.localIndex);
    const col = i % p.mapWidth;
    const row = Math.floor(i / p.mapWidth);
    ctx.drawImage(img, src.sx, src.sy, src.sw, src.sh, col * tw, row * th, tw, th);
  }
}

function drawGrid(worldW, worldH, tw, th) {
  const cam = state.ui.camera;
  ctx.lineWidth = 1 / cam.zoom;
  ctx.strokeStyle = 'rgba(255,255,255,.08)';
  ctx.beginPath();
  for (let x = 0; x <= worldW; x += tw) { ctx.moveTo(x, 0); ctx.lineTo(x, worldH); }
  for (let y = 0; y <= worldH; y += th) { ctx.moveTo(0, y); ctx.lineTo(worldW, y); }
  ctx.stroke();
}

function drawOverlay(tw, th) {
  const cam = state.ui.camera;
  const sel = state.ui.selection;

  // rectangle tool preview
  if (rectPreview) {
    const x0 = Math.min(rectPreview.x0, rectPreview.x1);
    const y0 = Math.min(rectPreview.y0, rectPreview.y1);
    const x1 = Math.max(rectPreview.x0, rectPreview.x1);
    const y1 = Math.max(rectPreview.y0, rectPreview.y1);
    ctx.fillStyle = 'rgba(91,156,255,.20)';
    ctx.fillRect(x0 * tw, y0 * th, (x1 - x0 + 1) * tw, (y1 - y0 + 1) * th);
  }

  // hover preview
  if (hover && inBounds(hover.col, hover.row)) {
    const w = sel ? sel.w : 1;
    const h = sel ? sel.h : 1;
    ctx.lineWidth = 1.5 / cam.zoom;
    ctx.strokeStyle = '#ffd166';
    ctx.strokeRect(hover.col * tw, hover.row * th, w * tw, h * th);

    // ghost of the selected stamp
    if (sel && state.ui.activeTool === 'brush') {
      const ts = state.project.tilesets.find((t) => t.id === sel.tilesetId);
      const img = ts && state.images.get(ts.id);
      if (img) {
        ctx.globalAlpha = 0.5;
        for (let dy = 0; dy < sel.h; dy++) {
          for (let dx = 0; dx < sel.w; dx++) {
            const li = (sel.row + dy) * ts.columns + (sel.col + dx);
            const src = tileSrcRect(ts, li);
            ctx.drawImage(img, src.sx, src.sy, src.sw, src.sh,
              (hover.col + dx) * tw, (hover.row + dy) * th, tw, th);
          }
        }
        ctx.globalAlpha = 1;
      }
    }
  }
}

function inBounds(col, row) {
  return col >= 0 && row >= 0 && col < state.project.mapWidth && row < state.project.mapHeight;
}
