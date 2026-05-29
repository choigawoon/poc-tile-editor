// Pure tile-format math shared by the editor and the game. No DOM, no global
// state — every function takes the data it needs as arguments.
//
// The format's central contract: a cell stores a GLOBAL tile id (gid).
//   0 = empty;  otherwise  gid = tileset.firstId + localIndex
// `localIndex` then maps to a (col,row) inside that tileset's grid.

// Resolve a gid against a project's tilesets. Accepts tilesets that use either
// `firstId` (exported Generic form) or `firstgid` (editor's native form).
export function resolveGid(tilesets, gid) {
  if (gid <= 0) return null;
  let ts = null;
  for (const t of tilesets) {
    const first = firstId(t);
    if (gid >= first) ts = t;
  }
  if (!ts) return null;
  return { tileset: ts, localIndex: gid - firstId(ts) };
}

export function firstId(ts) {
  return ts.firstId ?? ts.firstgid ?? 1;
}

// Local tile index (0-based) -> source rect in the tileset image.
export function tileSrcRect(ts, localIndex) {
  const col = localIndex % ts.columns;
  const row = Math.floor(localIndex / ts.columns);
  return {
    sx: (ts.margin ?? 0) + col * (ts.tileWidth + (ts.spacing ?? 0)),
    sy: (ts.margin ?? 0) + row * (ts.tileHeight + (ts.spacing ?? 0)),
    sw: ts.tileWidth,
    sh: ts.tileHeight,
  };
}

// Atlas (col,row) for a local index — Godot/Unity style coordinates.
export function atlasCoord(ts, localIndex) {
  return [localIndex % ts.columns, Math.floor(localIndex / ts.columns)];
}

export function slug(s) {
  return (s || 'tilemap').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'tilemap';
}

export function imageName(name) {
  return /\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(name) ? name : `${slug(name)}.png`;
}
