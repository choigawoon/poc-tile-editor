// Central application state + tiny event bus.
//
// The document is a WORKSPACE: shared tilesets + tag registry + a shared gid
// allocator, holding many maps (and later patterns). Tilesets are shared so the
// same tile ids resolve in every map — the basis for patterns and PCG.
//
// `state.project` is a compatibility VIEW (a Proxy) that flattens the active map
// + the shared workspace into the single "project" shape the rest of the editor
// and the exporters already expect. Reads/writes route to the right place, so
// existing call sites keep working unchanged.

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

// ---- workspace document (everything here is serialized) ----
export function createWorkspace(opts = {}) {
  const tileWidth = opts.tileWidth ?? 32;
  const tileHeight = opts.tileHeight ?? 32;
  const map = makeMap(opts.name ?? 'Map 1', opts.mapWidth ?? 30, opts.mapHeight ?? 20, 0);
  return {
    format: 'poc-tile-editor',
    version: 2,
    name: opts.name ?? 'Untitled',
    tileWidth,
    tileHeight,
    nextGid: 1,
    tilesets: [],                  // shared across all maps & patterns
    tagRegistry: STARTER_TAGS.slice(),
    maps: [map],
    patterns: [],
  };
}

export function makeMap(name, mapWidth, mapHeight, id) {
  return {
    id,
    name,
    mapWidth,
    mapHeight,
    layers: [makeLayer('Layer 1', mapWidth * mapHeight, 0)],
    objects: [],                   // sparse instance objects (spawn, doors…)
  };
}

export function makeLayer(name, cellCount, id) {
  return {
    id,
    name,
    visible: true,
    opacity: 1,
    data: new Array(cellCount).fill(0), // 0 = empty, else global tile id (gid)
  };
}

// Normalize any loaded doc to a workspace (migrates old single-project saves).
export function toWorkspace(doc) {
  if (doc && Array.isArray(doc.maps)) {
    doc.patterns = doc.patterns || [];
    return doc;
  }
  // legacy single-project (version 1): wrap its map into a workspace
  const map = {
    id: 0,
    name: doc.name || 'Map 1',
    mapWidth: doc.mapWidth,
    mapHeight: doc.mapHeight,
    layers: doc.layers || [makeLayer('Layer 1', doc.mapWidth * doc.mapHeight, 0)],
    objects: doc.objects || [],
    game: doc.game,
  };
  return {
    format: 'poc-tile-editor',
    version: 2,
    name: doc.name || 'Untitled',
    tileWidth: doc.tileWidth ?? 32,
    tileHeight: doc.tileHeight ?? 32,
    nextGid: doc.nextGid ?? 1,
    tilesets: doc.tilesets || [],
    tagRegistry: doc.tagRegistry || STARTER_TAGS.slice(),
    maps: [map],
    patterns: doc.patterns || [],
  };
}

// Stored lowercase: the editor canonicalizes all tags/keys to lowercase.
const STARTER_TAGS = [
  'terrain.ground', 'terrain.water', 'terrain.wall',
  'surface.grass', 'surface.sand', 'surface.ice', 'surface.mud',
  'hazard.lava', 'hazard.spikes', 'hazard.drown',
  'movement.blocked', 'movement.slow',
  'trigger.door', 'trigger.switch', 'trigger.teleport',
];

export const state = {
  workspace: createWorkspace(),
  // runtime-only image elements keyed by tileset id (not serialized directly)
  images: new Map(),
  ui: {
    activeTool: 'brush',
    activeKind: 'map',        // 'map' | 'pattern' — which document is being edited
    activeMapId: 0,
    activePatternId: null,
    stampPatternId: null,     // pattern chosen for the stamp tool
    activeLayerId: 0,
    activeTilesetId: null,
    // selection from palette: rectangular block of local tile indices
    selection: null, // { tilesetId, col, row, w, h }
    showGrid: true,
    camera: { x: 0, y: 0, zoom: 1 },
    paletteZoom: 2, // integer px-scale for the palette (bigger = clearer beads)
    nextLayerId: 1,
  },
};

export function activeMap() {
  const w = state.workspace;
  return w.maps.find((m) => m.id === state.ui.activeMapId) || w.maps[0] || null;
}

// A pattern is a small map-shaped document (+ door metadata, P4). Patterns and
// maps share the same shape, so the whole editor edits either one.
export function makePattern(name, mapWidth, mapHeight, id) {
  return { ...makeMap(name, mapWidth, mapHeight, id), doors: { n: [], e: [], s: [], w: [] } };
}

// The document currently being edited — a map or a pattern.
export function activeDoc() {
  if (state.ui.activeKind === 'pattern') {
    return state.workspace.patterns.find((p) => p.id === state.ui.activePatternId) || null;
  }
  return activeMap();
}

// After replacing the workspace (load/undo) or switching docs, point the UI at
// a valid document + layer.
export function normalizeActive() {
  const w = state.workspace;
  if (state.ui.activeKind === 'pattern' && !w.patterns.find((p) => p.id === state.ui.activePatternId)) {
    state.ui.activeKind = 'map'; // pattern gone — fall back to maps
  }
  if (!w.maps.find((m) => m.id === state.ui.activeMapId)) {
    state.ui.activeMapId = w.maps[0] ? w.maps[0].id : 0;
  }
  const d = activeDoc();
  if (d && !d.layers.find((l) => l.id === state.ui.activeLayerId)) {
    state.ui.activeLayerId = d.layers[0] ? d.layers[0].id : 0;
  }
}

// ---- compatibility view: `state.project` = active map + shared workspace ----
// Shared fields live on the workspace; the rest (name, mapWidth, mapHeight,
// layers, objects, game) come from the active map.
const SHARED = new Set(['format', 'version', 'tilesets', 'tagRegistry', 'tileWidth', 'tileHeight', 'nextGid']);
const projectView = new Proxy({}, {
  get(_t, k) {
    if (SHARED.has(k)) return state.workspace[k];
    const d = activeDoc();
    return d ? d[k] : undefined;
  },
  set(_t, k, v) {
    if (SHARED.has(k)) { state.workspace[k] = v; return true; }
    const d = activeDoc();
    if (d) d[k] = v;
    return true;
  },
  has(_t, k) {
    if (SHARED.has(k)) return true;
    const d = activeDoc();
    return d ? k in d : false;
  },
});
Object.defineProperty(state, 'project', { get() { return projectView; }, configurable: true });

export function activeLayer() {
  const d = activeDoc();
  return d ? (d.layers.find((l) => l.id === state.ui.activeLayerId) || null) : null;
}

export function activeTileset() {
  return state.workspace.tilesets.find((t) => t.id === state.ui.activeTilesetId) || null;
}

export function tilesetForGid(gid) {
  if (gid <= 0) return null;
  let found = null;
  for (const ts of state.workspace.tilesets) {
    if (gid >= ts.firstgid) found = ts;
  }
  return found;
}
