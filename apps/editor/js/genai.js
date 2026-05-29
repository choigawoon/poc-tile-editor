// "AI tileset" panel — generate art from a prompt via the dev genai bridge
// (POST /api/genai/generate), preview it, then either add it whole as a tileset
// or slice it into tiles. Only works under `npm run dev` (the bridge middleware).
import { addTileset } from './tileset.js';
import { importImageAsTiles } from './import-image.js';

let host, lastDataUrl = null;

export function initGenai(el) { host = el; render(); }

function render() {
  if (!host) return;
  host.innerHTML = '';

  const ta = document.createElement('textarea');
  ta.className = 'genai-prompt';
  ta.rows = 3;
  ta.placeholder = 'e.g. top-down 4x4 grid of seamless terrain tiles: grass, water, stone, sand — pixel art, no gaps';

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
    await addTileset('ai-tileset', lastDataUrl, { tileWidth: t, tileHeight: t });
    status.textContent = `Added as tileset (${t}px tiles).`;
  };
  useSlice.onclick = async () => {
    if (!lastDataUrl) return;
    const t = tileSize();
    try {
      status.textContent = await importImageAsTiles(lastDataUrl, 'ai-tiles', { tileWidth: t, tileHeight: t, dedupe: true });
    } catch (e) { status.textContent = 'Slice failed: ' + e.message; }
  };

  host.append(ta, row, gen, status, prev, actions);
}
