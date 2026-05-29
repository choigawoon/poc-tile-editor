// Shared data contract for the tile pipeline. The editor authors these shapes,
// @poc/core reads them, and exporters serialize them. Consumed from JS via JSDoc:
//   /** @typedef {import('@poc/core/types').Workspace} Workspace */
// Keep this file in sync with the runtime factories in apps/editor/js/state.js.

/** Type-level metadata for one tile, keyed by its local index on a tileset. */
export interface TileMeta {
  /** Blocks movement (the game's default collision source). */
  solid?: boolean;
  /** Hierarchical gameplay tags, dot-pathed + lowercase (e.g. "terrain.water"). */
  tags?: string[];
  /** Free-form, consumer-defined properties (lowercase keys). */
  [key: string]: unknown;
}

/** An image sheet sliced into a grid of tiles. Shared across all maps/patterns. */
export interface Tileset {
  id: number;
  name: string;
  /** Embedded data URL so projects are self-contained. */
  image: string;
  imageWidth: number;
  imageHeight: number;
  tileWidth: number;
  tileHeight: number;
  margin: number;
  spacing: number;
  /** Global id of this set's first tile; gid = firstgid + localIndex. */
  firstgid: number;
  columns: number;
  rows: number;
  tileCount: number;
  /** Per-tile metadata, keyed by stringified local index. */
  tiles?: Record<string, TileMeta>;
}

/** A paintable grid of global tile ids (0 = empty). */
export interface Layer {
  id: number;
  name: string;
  visible: boolean;
  opacity: number;
  /** Row-major gids, length = mapWidth * mapHeight. */
  data: number[];
}

/** A sparse instance object placed on a map (spawn point, door, trigger…). */
export interface MapObject {
  type?: string;
  /** Cell index (row * mapWidth + col), when cell-anchored. */
  cell?: number;
  [key: string]: unknown;
}

/** Gameplay hints the runtime reads (spawn, speed, skins…). */
export interface GameHints {
  spawn?: { x: number; y: number };
  playerSpeed?: number;
  skins?: Array<{ id: string; image: string; label: string }>;
  [key: string]: unknown;
}

/** A single editable map. */
export interface MapDoc {
  id: number;
  name: string;
  mapWidth: number;
  mapHeight: number;
  layers: Layer[];
  objects: MapObject[];
  game?: GameHints;
}

/** Which edges of a pattern carry a (centered) connector, for PCG assembly. */
export interface PatternDoors {
  n: boolean;
  e: boolean;
  s: boolean;
  w: boolean;
}

/** A pattern: a small map-shaped document plus edge doors. */
export interface Pattern extends MapDoc {
  doors: PatternDoors;
}

/** The whole serialized document: shared resources + many maps/patterns. */
export interface Workspace {
  format: string;
  version: number;
  name: string;
  tileWidth: number;
  tileHeight: number;
  /** Next global id to hand out when a tileset is added. */
  nextGid: number;
  tilesets: Tileset[];
  /** Known tag paths (lowercase), for autocomplete + the tag tree. */
  tagRegistry: string[];
  maps: MapDoc[];
  patterns: Pattern[];
}

/** Palette selection: a rectangular block of local tile indices. */
export interface Selection {
  tilesetId: number;
  col: number;
  row: number;
  w: number;
  h: number;
}

/**
 * The legacy flattened "project" shape: shared workspace fields merged with the
 * active document's fields. Read-only — produced by projectSnapshot() for
 * exporters, the ▶Play bundle, and the renderer's per-frame loop.
 */
export interface ProjectSnapshot {
  format: string;
  version: number;
  tilesets: Tileset[];
  tagRegistry: string[];
  tileWidth: number;
  tileHeight: number;
  nextGid: number;
  name?: string;
  mapWidth?: number;
  mapHeight?: number;
  layers?: Layer[];
  objects?: MapObject[];
  game?: GameHints;
}
