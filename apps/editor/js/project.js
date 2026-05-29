// Native project save/load. Projects embed tileset images (base64) so a single
// .json file is fully self-contained.
import { state, createWorkspace, toWorkspace, normalizeActive, activeMap, emit } from './state.js';
import { rehydrateImages } from './tileset.js';
import { clearHistory } from './history.js';
import { downloadText } from './exporters/index.js';
import { slug } from './exporters/generic.js';

export function newProject(opts) {
  state.workspace = createWorkspace(opts);
  state.images.clear();
  state.ui.activeMapId = state.workspace.maps[0].id;
  state.ui.activeLayerId = activeMap().layers[0].id;
  state.ui.activeTilesetId = null;
  state.ui.selection = null;
  state.ui.nextLayerId = 1;
  clearHistory();
  emit('project:replaced');
  emit('tilesets:change');
}

// Save the whole workspace (all maps + shared tilesets) as one self-contained file.
export function saveProject() {
  const json = JSON.stringify(state.workspace, null, 2);
  downloadText(`${slug(state.workspace.name || 'workspace')}.tileproj.json`, json);
}

export async function loadProjectFromText(text) {
  const doc = JSON.parse(text);
  if (doc.format !== 'poc-tile-editor') {
    throw new Error('Not a POC Tile Editor project file.');
  }
  state.workspace = toWorkspace(doc);
  normalizeActive();
  const map = activeMap();
  state.ui.activeTilesetId = state.workspace.tilesets[0]?.id ?? null;
  state.ui.selection = null;
  state.ui.nextLayerId = (Math.max(0, ...map.layers.map((l) => l.id)) + 1) || 1;
  clearHistory();
  await rehydrateImages();
  emit('project:replaced');
  emit('tilesets:change');
}
