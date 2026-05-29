// "AI tileset" panel — generate art from a prompt via the dev genai bridge
// (POST /api/genai/generate), preview it, then either add it whole as a tileset
// or slice it into tiles. Only works under `npm run dev` (the bridge middleware).
import { addTileset } from './tileset.js';
import { importImageAsTiles } from './import-image.js';
import { state, emit } from './state.js';

// Starter prompts — pick one, tweak a few words, generate. All push toward an
// edge-to-edge grid (no gutters) so slicing into tiles lines up.
const PRESETS = [
  { label: 'Overworld terrain', text: 'top-down 2D RPG overworld tileset, 4x4 grid of seamless terrain tiles: grass, dark grass, dirt path, sand, shallow water, deep water, stone, flowers — 16-bit pixel art, edge-to-edge, no gaps or margins, flat top-down view, no text' },
  { label: 'Dungeon', text: 'top-down fantasy dungeon tileset, 4x4 grid: stone floor, cracked floor, brick wall, mossy wall, wooden door, iron door, lava, water — pixel art, edge-to-edge tiles, no gaps, no text' },
  { label: 'Sci-fi facility', text: 'top-down sci-fi facility tileset, 4x4 grid: metal floor, grated floor, panel wall, vent, hazard stripes, glass, blast door, control panel — clean pixel art, edge-to-edge, no margins, no text' },
  { label: 'Forest / nature', text: 'top-down nature tileset, 4x4 grid: grass, tall grass, bush, tree top, dirt, mud, rock, pond — cozy 16-bit pixel art, seamless edge-to-edge tiles, no gaps, no text' },
  { label: 'Single seamless tile', text: 'one seamless tileable top-down grass texture, pixel art game tile, fills the whole image edge to edge, no border, no text' },
];

let host, lastDataUrl = null;

export function initGenai(el) { host = el; render(); }

function render() {
  if (!host) return;
  host.innerHTML = '';

  const ta = document.createElement('textarea');
  ta.className = 'genai-prompt';
  ta.rows = 3;
  ta.placeholder = 'e.g. top-down 4x4 grid of seamless terrain tiles: grass, water, stone, sand — pixel art, no gaps';

  // preset prompts — fill the box, then tweak
  const presetSel = document.createElement('select');
  presetSel.className = 'full genai-presets';
  const ph = document.createElement('option');
  ph.value = ''; ph.textContent = 'Insert a sample prompt…';
  presetSel.appendChild(ph);
  PRESETS.forEach((p, i) => {
    const o = document.createElement('option');
    o.value = String(i); o.textContent = p.label;
    presetSel.appendChild(o);
  });
  presetSel.onchange = () => {
    const p = PRESETS[+presetSel.value];
    if (p) { ta.value = p.text; ta.focus(); }
    presetSel.value = '';
  };

  const row = document.createElement('div');
  row.className = 'field';
  const lbl = document.createElement('label');
  lbl.textContent = 'Tile';
  const tsize = document.createElement('input');
  tsize.type = 'number'; tsize.min = 8; tsize.value = 64;
  tsize.title = 'Tile size (px) used when adding/slicing the result';
  row.append(lbl, tsize);

  const gen = document.createElement('button');
  gen.className = 'full'; gen.textContent = '✨ Generate';

  const status = document.createElement('div');
  status.className = 'tileset-meta';

  const prev = document.createElement('img');
  prev.className = 'genai-prev';
  prev.style.display = 'none';

  const actions = document.createElement('div');
  actions.className = 'genai-actions';
  actions.style.display = 'none';
  const useWhole = document.createElement('button');
  useWhole.className = 'full'; useWhole.textContent = 'Add as tileset';
  const useSlice = document.createElement('button');
  useSlice.className = 'full'; useSlice.textContent = 'Slice into tiles (dedupe)';
  actions.append(useWhole, useSlice);

  gen.onclick = async () => {
    const prompt = ta.value.trim();
    if (!prompt) { status.textContent = 'Enter a prompt first.'; return; }
    gen.disabled = true;
    status.textContent = 'Generating… (ComfyUI, may take a bit)';
    prev.style.display = 'none'; actions.style.display = 'none';
    try {
      const r = await fetch('/api/genai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, width: 512, height: 512, workflow: 'z-image-turbo' }),
      });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || ('HTTP ' + r.status));
      lastDataUrl = j.dataUrl;
      prev.src = j.dataUrl; prev.style.display = 'block';
      actions.style.display = 'flex';
      status.textContent = 'Done — add it whole or slice into tiles.';
    } catch (e) {
      status.textContent = 'Failed: ' + e.message + ' (bridge runs only in `npm run dev`)';
    } finally {
      gen.disabled = false;
    }
  };

  const tileSize = () => Math.max(8, Math.round(+tsize.value) || 64);
  useWhole.onclick = async () => {
    if (!lastDataUrl) return;
    const t = tileSize();
    const ts = await addTileset('ai-tileset', lastDataUrl, { tileWidth: t, tileHeight: t });
    // select it so it shows in the palette immediately
    state.ui.activeTilesetId = ts.id;
    state.ui.selection = { tilesetId: ts.id, col: 0, row: 0, w: 1, h: 1 };
    emit('tilesets:change');
    emit('selection:change');
    status.textContent = `Added & selected — it's now in the palette (${ts.columns}×${ts.rows} @ ${t}px).`;
  };
  useSlice.onclick = async () => {
    if (!lastDataUrl) return;
    const t = tileSize();
    try {
      status.textContent = await importImageAsTiles(lastDataUrl, 'ai-tiles', { tileWidth: t, tileHeight: t, dedupe: true });
    } catch (e) { status.textContent = 'Slice failed: ' + e.message; }
  };

  host.append(presetSel, ta, row, gen, status, prev, actions);
}
