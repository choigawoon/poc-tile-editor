// Browser autosave: keeps the current project in localStorage so a reload (or
// reopening the editor) restores exactly where you left off. The project doc
// embeds tileset images as base64, so a single JSON blob is self-contained.
import { state, toWorkspace, normalizeActive, activeMap } from './state.js';
import { rehydrateImages } from './tileset.js';

const KEY = 'poc-tile-editor:autosave:v1';
let timer = null;

// Debounced save — many rapid edits collapse into one write.
export function scheduleSave() {
  clearTimeout(timer);
  timer = setTimeout(saveNow, 600);
}

export function saveNow() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state.workspace));
  } catch (e) {
    // localStorage quota (large tilesets) — fail quietly, don't break editing.
    console.warn('[autosave] skipped:', e.message);
  }
}

export function hasSaved() {
  return !!localStorage.getItem(KEY);
}

export function clearSaved() {
  localStorage.removeItem(KEY);
}

// Restore the autosaved project into state. Returns true on success.
export async function restore() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return false;
  try {
    const doc = JSON.parse(raw);
    if (doc.format !== 'poc-tile-editor') return false;
    const ws = toWorkspace(doc);
    if (!ws.maps?.length) return false;
    state.workspace = ws;
    normalizeActive();
    const map = activeMap();
    state.ui.activeTilesetId = ws.tilesets[0]?.id ?? null;
    state.ui.selection = null;
    state.ui.nextLayerId = (Math.max(0, ...map.layers.map((l) => l.id)) + 1) || 1;
    await rehydrateImages();
    return true;
  } catch (e) {
    console.warn('[autosave] restore failed:', e.message);
    return false;
  }
}
