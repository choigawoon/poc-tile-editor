// Tile metadata — declarative properties that ride alongside the gid math.
//
// Two distinct kinds, mirroring the rest of the format's philosophy:
//
//   • TYPE metadata lives on the TILESET, keyed by local tile index — exactly
//     how pixels are keyed. "Tile #3 is water → solid" holds for every cell
//     that places #3, and survives a reskin (night water is still water). Most
//     metadata is intrinsic to the tile *type* and belongs here.
//
//   • INSTANCE metadata lives on the MAP as a sparse `objects` list, keyed by
//     cell — only for things that can't be reduced to a type (this door's
//     target, that chest's loot, a spawn point). Most cells have none.
//
// As with everything in @poc/core this is DATA only. The game decides what a
// property *means* (e.g. that `solid` blocks movement).
import { resolveGid } from './gid.js';
import { hasTag } from './tags.js';

// Type-level metadata for a local tile index within one tileset. The tileset
// may carry a sparse `tiles` map keyed by index (number or string key — JSON
// object keys are strings). Returns {} when none is defined so callers can read
// properties without null checks.
export function tileMeta(ts, localIndex) {
  const tiles = ts && ts.tiles;
  if (!tiles) return {};
  return tiles[localIndex] ?? tiles[String(localIndex)] ?? {};
}

// Resolve a gid straight to its type metadata across a project's tilesets.
// Empty cells (gid <= 0) and unresolved gids yield {}.
export function gidMeta(tilesets, gid) {
  const r = resolveGid(tilesets, gid);
  return r ? tileMeta(r.tileset, r.localIndex) : {};
}

// Hierarchical gameplay tags carried by a tile type (its `tags` array, or []).
export function tileTags(ts, localIndex) {
  const t = tileMeta(ts, localIndex).tags;
  return Array.isArray(t) ? t : [];
}

// Does the tile at `gid` carry a tag satisfying `query` (exact or descendant)?
// The game's idiomatic read path: `gidHasTag(map.tilesets, gid, 'Hazard')`.
export function gidHasTag(tilesets, gid, query) {
  const r = resolveGid(tilesets, gid);
  return r ? hasTag(tileTags(r.tileset, r.localIndex), query) : false;
}

// Instance-level objects sit on the MAP, sparse and keyed by cell `[col,row]`.
// Returns all objects placed on a given cell (usually 0 or 1).
export function objectsAt(map, col, row) {
  const objs = map && map.objects;
  if (!Array.isArray(objs)) return [];
  return objs.filter((o) => Array.isArray(o.cell) && o.cell[0] === col && o.cell[1] === row);
}
