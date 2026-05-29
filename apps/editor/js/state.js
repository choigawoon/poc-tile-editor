// @ts-check
// Central application state + tiny event bus.
//
// The document is a WORKSPACE: shared tilesets + tag registry + a shared gid
// allocator, holding many maps (and later patterns). Tilesets are shared so the
// same tile ids resolve in every map — the basis for patterns and PCG.
//
// Code reads SHARED fields (tilesets, tags, tile size, gid allocator) from
// `state.workspace`, and per-document fields (size, layers, objects) from
// `activeDoc()`. `projectSnapshot()` merges both into the legacy flat shape only
// for the read-only export / ▶Play / render boundary.

/** @typedef {import('@poc/core/types').Workspace} Workspace */
/** @typedef {import('@poc/core/types').MapDoc} MapDoc */
/** @typedef {import('@poc/core/types').Pattern} Pattern */
/** @typedef {import('@poc/core/types').Layer} Layer */
/** @typedef {import('@poc/core/types').Tileset} Tileset */
/** @typedef {import('@poc/core/types').Selection} Selection */
/** @typedef {import('@poc/core/types').ProjectSnapshot} ProjectSnapshot */

/**
 * Transient editor UI state (not serialized into the workspace).
 * @typedef {Object} EditorUI
 * @property {string} activeTool
 * @property {'map'|'pattern'} activeKind  which document kind is being edited
 * @property {number} activeMapId
 * @property {number|null} activePatternId
 * @property {number|null} stampPatternId  pattern chosen for the stamp tool
 * @property {number} activeLayerId
 * @property {number|null} activeTilesetId
 * @property {Selection|null} selection
 * @property {boolean} showGrid
 * @property {{x:number,y:number,zoom:number}} camera
 * @property {number} paletteZoom
 * @property {number} nextLayerId
 */

/**
 * @typedef {Object} AppState
 * @property {Workspace} workspace
 * @property {Map<number, HTMLImageElement>} images  runtime image elements by tileset id
 * @property {EditorUI} ui
 */

/** @type {Map<string, Set<Function>>} */
const listeners = new Map();

/**
 * Subscribe to an event. Returns an unsubscribe function.
 * @param {string} event
 * @param {Function} fn
 * @returns {() => void}
 */
export function on(event, fn) {
  let set = listeners.get(event);
  if (!set) listeners.set(event, set = new Set());
  set.add(fn);
  return () => { set.delete(fn); };
}

/**
 * Emit an event to all subscribers.
 * @param {string} event
 * @param {*} [payload]
 */
export function emit(event, payload) {
  const set = listeners.get(event);
  if (set) for (const fn of set) fn(payload);
}

// ---- workspace document (everything here is serialized) ----
/**
 * @param {Partial<{name:string,mapWidth:number,mapHeight:number,tileWidth:number,tileHeight:number}>} [opts]
 * @returns {Workspace}
 */
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

/**
 * @param {string} name
 * @param {number} mapWidth
 * @param {number} mapHeight
 * @param {number} id
 * @returns {MapDoc}
 */
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

/**
 * @param {string} name
 * @param {number} cellCount
 * @param {number} id
 * @returns {Layer}
 */
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
/**
 * @param {any} doc  a parsed save file (current workspace or legacy v1 project)
 * @returns {Workspace}
 */
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

/** @type {AppState} */
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

/** @returns {MapDoc|null} */
export function activeMap() {
  const w = state.workspace;
  return w.maps.find((m) => m.id === state.ui.activeMapId) || w.maps[0] || null;
}

// A pattern is a small map-shaped document (+ door metadata, P4). Patterns and
// maps share the same shape, so the whole editor edits either one.
/**
 * @param {string} name
 * @param {number} mapWidth
 * @param {number} mapHeight
 * @param {number} id
 * @returns {Pattern}
 */
export function makePattern(name, mapWidth, mapHeight, id) {
  // doors: which edges carry a (centered) connector — standardized so adjacent
  // patterns connect when their shared edges both have a door (PCG).
  return { ...makeMap(name, mapWidth, mapHeight, id), doors: { n: false, e: false, s: false, w: false } };
}

// The document currently being edited — a map or a pattern.
/** @returns {MapDoc|Pattern|null} */
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

// ---- read-only export / runtime boundary ----
// A few consumers (exporters, ▶Play bundle, the renderer's per-frame loop) want
// the legacy *flattened* shape: shared workspace fields + the active document's
// fields merged into one object. Build it on demand. This is READ-ONLY — to
// mutate, write to `state.workspace` (shared) or `activeDoc()` (per-document).
/** @returns {ProjectSnapshot} */
export function projectSnapshot() {
  const w = state.workspace;
  const d = /** @type {Partial<MapDoc>} */ (activeDoc() || {});
  return {
    format: w.format, version: w.version,
    tilesets: w.tilesets, tagRegistry: w.tagRegistry,
    tileWidth: w.tileWidth, tileHeight: w.tileHeight, nextGid: w.nextGid,
    name: d.name, mapWidth: d.mapWidth, mapHeight: d.mapHeight,
    layers: d.layers, objects: d.objects, game: d.game,
  };
}

/** @returns {Layer|null} */
export function activeLayer() {
  const d = activeDoc();
  return d ? (d.layers.find((l) => l.id === state.ui.activeLayerId) || null) : null;
}

/** @returns {Tileset|null} */
export function activeTileset() {
  return state.workspace.tilesets.find((t) => t.id === state.ui.activeTilesetId) || null;
}

/**
 * @param {number} gid
 * @returns {Tileset|null}
 */
export function tilesetForGid(gid) {
  if (gid <= 0) return null;
  let found = null;
  for (const ts of state.workspace.tilesets) {
    if (gid >= ts.firstgid) found = ts;
  }
  return found;
}
