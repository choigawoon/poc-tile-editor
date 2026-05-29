// Central application state + tiny event bus.
// The "project" is the serializable document; "ui" is editor-only state.

const listeners = new Map();

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event).delete(fn);
}

export function emit(event, payload) {
  const set = listeners.get(event);
  if (set) for (const fn of set) fn(payload);
}

// ---- Project document (everything here is exported/serialized) ----
export function createProject(opts = {}) {
  const tileWidth = opts.tileWidth ?? 32;
  const tileHeight = opts.tileHeight ?? 32;
  const mapWidth = opts.mapWidth ?? 30;
  const mapHeight = opts.mapHeight ?? 20;
  return {
    format: 'poc-tile-editor',
    version: 1,
    name: opts.name ?? 'Untitled',
    tileWidth,
    tileHeight,
    mapWidth,
    mapHeight,
    nextGid: 1,
    tilesets: [],
    layers: [makeLayer('Layer 1', mapWidth * mapHeight, 0)],
    // Project-wide gameplay-tag dictionary (Unreal GameplayTags.ini analogue):
    // powers autocomplete and keeps a shared taxonomy. Grows as users type.
    tagRegistry: STARTER_TAGS.slice(),
  };
}

// A small starter taxonomy so tag autocomplete isn't empty and teaches the
// dot-hierarchy format. Users extend it freely just by typing new tags.
const STARTER_TAGS = [
  'Terrain.Ground', 'Terrain.Water', 'Terrain.Wall',
  'Surface.Grass', 'Surface.Sand', 'Surface.Ice', 'Surface.Mud',
  'Hazard.Lava', 'Hazard.Spikes', 'Hazard.Drown',
  'Movement.Blocked', 'Movement.Slow',
  'Trigger.Door', 'Trigger.Switch', 'Trigger.Teleport',
];

export function makeLayer(name, cellCount, id) {
  return {
    id,
    name,
    visible: true,
    opacity: 1,
    data: new Array(cellCount).fill(0), // 0 = empty, else global tile id (gid)
  };
}

export const state = {
  project: createProject(),
  // runtime-only image elements keyed by tileset id (not serialized directly)
  images: new Map(),
  ui: {
    activeTool: 'brush',
    activeLayerId: 0,
    activeTilesetId: null,
    // selection from palette: rectangular block of local tile indices
    selection: null, // { tilesetId, col, row, w, h }
    showGrid: true,
    camera: { x: 0, y: 0, zoom: 1 },
    nextLayerId: 1,
  },
};

export function activeLayer() {
  return state.project.layers.find((l) => l.id === state.ui.activeLayerId) || null;
}

export function activeTileset() {
  return state.project.tilesets.find((t) => t.id === state.ui.activeTilesetId) || null;
}

export function tilesetForGid(gid) {
  if (gid <= 0) return null;
  let found = null;
  for (const ts of state.project.tilesets) {
    if (gid >= ts.firstgid) found = ts;
  }
  return found;
}
