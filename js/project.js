// Native project save/load. Projects embed tileset images (base64) so a single
// .json file is fully self-contained.
import { state, createProject, emit } from './state.js';
import { rehydrateImages } from './tileset.js';
import { clearHistory } from './history.js';
import { downloadText } from './exporters/index.js';
import { slug } from './exporters/generic.js';

export function newProject(opts) {
  state.project = createProject(opts);
  state.images.clear();
  state.ui.activeLayerId = state.project.layers[0].id;
  state.ui.activeTilesetId = null;
  state.ui.selection = null;
  state.ui.nextLayerId = 1;
  clearHistory();
  emit('project:replaced');
  emit('tilesets:change');
}

export function saveProject() {
  const json = JSON.stringify(state.project, null, 2);
  downloadText(`${slug(state.project.name)}.tileproj.json`, json);
}

export async function loadProjectFromText(text) {
  const doc = JSON.parse(text);
  if (doc.format !== 'poc-tile-editor') {
    throw new Error('Not a POC Tile Editor project file.');
  }
  state.project = doc;
  // restore ui anchors
  state.ui.activeLayerId = doc.layers[0]?.id ?? 0;
  state.ui.activeTilesetId = doc.tilesets[0]?.id ?? null;
  state.ui.selection = null;
  state.ui.nextLayerId = (Math.max(0, ...doc.layers.map((l) => l.id)) + 1) || 1;
  clearHistory();
  await rehydrateImages();
  emit('project:replaced');
  emit('tilesets:change');
}
