// Tile QUERY helpers for runtime consumers (the game). Built on gid math +
// tile metadata + gameplay tags. The editor writes tags/props; the game reads
// them back through these — one shared definition, so the two never drift.
//
// Exported maps store layer data as 2D rows: layer.data[row][col].
import { resolveGid } from './gid.js';
import { tileMeta, tileTags } from './meta.js';
import { hasTag, hasAny, hasAll } from './tags.js';

function inBounds(map, col, row) {
  return !!map && col >= 0 && row >= 0 && col < map.width && row < map.height;
}

// gid at a cell. With `layerName`, reads that layer; otherwise returns the
// topmost non-empty gid across all layers (0 = empty).
export function cellGid(map, col, row, layerName) {
  if (!inBounds(map, col, row)) return 0;
  if (layerName != null) {
    const l = map.layers.find((x) => x.name === layerName);
    return l ? (l.data[row][col] || 0) : 0;
  }
  let gid = 0;
  for (const l of map.layers) { const g = l.data[row][col]; if (g) gid = g; }
  return gid;
}

// Union of gameplay tags of every tile stacked on a cell (across all layers).
export function cellTags(map, col, row) {
  if (!inBounds(map, col, row)) return [];
  const out = new Set();
  for (const l of map.layers) {
    const gid = l.data[row][col];
    if (!gid) continue;
    const r = resolveGid(map.tilesets, gid);
    if (r) for (const t of tileTags(r.tileset, r.localIndex)) out.add(t);
  }
  return [...out];
}

// Tag queries against a cell (hierarchy-aware: exact match or any descendant).
export function cellHasTag(map, col, row, query) {
  return hasTag(cellTags(map, col, row), query);
}
export function cellHasAny(map, col, row, queries) {
  return hasAny(cellTags(map, col, row), queries);
}
export function cellHasAll(map, col, row, queries) {
  return hasAll(cellTags(map, col, row), queries);
}

// Scalar properties of a tile type (its metadata minus reserved solid/tags).
export function tileProps(ts, localIndex) {
  const m = tileMeta(ts, localIndex);
  const out = {};
  for (const k of Object.keys(m)) if (k !== 'solid' && k !== 'tags') out[k] = m[k];
  return out;
}
export function gidProps(tilesets, gid) {
  const r = resolveGid(tilesets, gid);
  return r ? tileProps(r.tileset, r.localIndex) : {};
}

// Every cell whose stacked tiles match `query`. Returns [{col,row,tags}].
// e.g. findCells(map, 'hazard') → all hazardous cells, regardless of subtype.
export function findCells(map, query) {
  const hits = [];
  if (!map) return hits;
  for (let row = 0; row < map.height; row++)
    for (let col = 0; col < map.width; col++) {
      const tags = cellTags(map, col, row);
      if (hasTag(tags, query)) hits.push({ col, row, tags });
    }
  return hits;
}
