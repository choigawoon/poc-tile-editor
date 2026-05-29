// "AI tileset" panel — generate art via the dev genai bridge, then use it.
//
// Grid is the source of truth: you pick Cols × Rows × Tile(px); the image is
// generated at exactly (cols·tile) × (rows·tile), so slicing it back at the same
// tile size lands perfectly on the grid. Generate → click the preview (or "Use
// as tileset") and it goes straight into the palette, selected.
import { addTileset } from './tileset.js';
import { importImageAsTiles } from './import-image.js';
import { state, emit } from './state.js';

const PRESETS = [
  { label: 'Overworld terrain', text: 'top-down 2D RPG overworld tileset, 4x4 grid of seamless terrain tiles: grass, dark grass, dirt path, sand, shallow water, deep water, stone, flowers — 16-bit pixel art, edge-to-edge, no gaps or margins, flat top-down view, no text' },
  { label: 'Dungeon', text: 'top-down fantasy dungeon tileset, 4x4 grid: stone floor, cracked floor, brick wall, mossy wall, wooden door, iron door, lava, water — pixel art, edge-to-edge tiles, no gaps, no text' },
  { label: 'Sci-fi facility', text: 'top-down sci-fi facility tileset, 4x4 grid: metal floor, grated floor, panel wall, vent, hazard stripes, glass, blast door, control panel — clean pixel art, edge-to-edge, no margins, no text' },
  { label: 'Forest / nature', text: 'top-down nature tileset, 4x4 grid: grass, tall grass, bush, tree top, dirt, mud, rock, pond — cozy 16-bit pixel art, seamless edge-to-edge tiles, no gaps, no text' },
  { label: 'Single seamless tile', text: 'one seamless tileable top-down grass texture, pixel art game tile, fills the whole image edge to edge, no border, no text' },
];

let host, lastDataUrl = null;

export function initGenai(el) { host = el; render(); }

function numField(label, def, min, max) {
  const wrap = document.createElement('label');
  wrap.className = 'genai-num';
  const span = document.createElement('span');
  span.textContent = label;
  const input = document.createElement('input');
  input.type = 'number'; input.value = def; input.min = min; input.max = max;
  wrap.append(span, input);
  return { wrap, input, val: () => Math.max(min, Math.min(max, Math.round(+input.value) || def)) };
}

function render() {
  if (!host) return;
  host.innerHTML = '';

  const presetSel = document.createElement('select');
  presetSel.className = 'full genai-presets';
  presetSel.appendChild(new Option('Insert a sample prompt…', ''));
  PRESETS.forEach((p, i) => presetSel.appendChild(new Option(p.label, String(i))));

  const ta = document.createElement('textarea');
  ta.className = 'genai-prompt';
  ta.rows = 3;
  ta.placeholder = 'e.g. 4x4 grid of seamless terrain tiles: grass, water, stone, sand — pixel art, no gaps';
  presetSel.onchange = () => { const p = PRESETS[+presetSel.value]; if (p) { ta.value = p.text; ta.focus(); } presetSel.value = ''; };

  // grid drives resolution: image = cols*tile × rows*tile
  const gridRow = document.createElement('div');
  gridRow.className = 'genai-grid';
  const cols = numField('Cols', 4, 1, 16);
  const rows = numField('Rows', 4, 1, 16);
  const tile = numField('Tile px', 128, 8, 256);
  gridRow.append(cols.wrap, rows.wrap, tile.wrap);

  const readout = document.createElement('div');
  readout.className = 'tileset-meta';

  const gen = document.createElement('button');
  gen.className = 'full'; gen.textContent = '✨ Generate';
  const status = document.createElement('div');
  status.className = 'tileset-meta';

  const pvWrap = document.createElement('div');
  pvWrap.className = 'genai-pvwrap'; pvWrap.style.display = 'none';
  pvWrap.title = 'Click to use as tileset';
  const prev = document.createElement('img');
  prev.className = 'genai-prev';
  const overlay = document.createElement('div');
  overlay.className = 'genai-grid-overlay';
  pvWrap.append(prev, overlay);

  const actions = document.createElement('div');
  actions.className = 'genai-actions'; actions.style.display = 'none';
  const useBtn = document.createElement('button');
  useBtn.className = 'full primary'; useBtn.textContent = '✅ Use as tileset';
  const wholeBtn = document.createElement('button');
  wholeBtn.className = 'full'; wholeBtn.textContent = 'Add whole (one texture)';
  actions.append(useBtn, wholeBtn);

  const dims = () => ({ w: cols.val() * tile.val(), h: rows.val() * tile.val() });
  function refresh() {
    const { w, h } = dims();
    readout.textContent = `Image ${w}×${h} · ${cols.val() * rows.val()} tiles @ ${tile.val()}px`;
    overlay.style.backgroundSize = `${100 / cols.val()}% ${100 / rows.val()}%`;
  }
  [cols, rows, tile].forEach((f) => { f.input.oninput = refresh; });

  gen.onclick = async () => {
    const prompt = ta.value.trim();
    if (!prompt) { status.textContent = 'Enter a prompt first.'; return; }
    const { w, h } = dims();
    gen.disabled = true;
    status.textContent = `Generating ${w}×${h}… (ComfyUI)`;
    pvWrap.style.display = 'none'; actions.style.display = 'none';
    try {
      const r = await fetch('/api/genai/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, width: w, height: h, workflow: 'z-image-turbo' }),
      });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || ('HTTP ' + r.status));
      lastDataUrl = j.dataUrl;
      prev.src = j.dataUrl;
      pvWrap.style.display = 'block'; actions.style.display = 'flex';
      refresh();
      status.textContent = 'Click the image (or “Use as tileset”) to add it to the palette.';
    } catch (e) {
      status.textContent = 'Failed: ' + e.message + ' — bridge runs only in `npm run dev`.';
    } finally {
      gen.disabled = false;
    }
  };

  async function useSliced() {
    if (!lastDataUrl) return;
    const t = tile.val();
    try { status.textContent = await importImageAsTiles(lastDataUrl, 'ai-tiles', { tileWidth: t, tileHeight: t, dedupe: false }); }
    catch (e) { status.textContent = 'Use failed: ' + e.message; }
  }
  pvWrap.onclick = useSliced;
  useBtn.onclick = useSliced;
  wholeBtn.onclick = async () => {
    if (!lastDataUrl) return;
    const t = tile.val();
    const ts = await addTileset('ai-texture', lastDataUrl, { tileWidth: t, tileHeight: t });
    state.ui.activeTilesetId = ts.id;
    state.ui.selection = { tilesetId: ts.id, col: 0, row: 0, w: 1, h: 1 };
    emit('tilesets:change'); emit('selection:change');
    status.textContent = 'Added whole as one tileset.';
  };

  refresh();
  host.append(presetSel, ta, gridRow, readout, gen, status, pvWrap, actions);
}
