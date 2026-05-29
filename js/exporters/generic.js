// Engine-agnostic, human-readable tilemap format.
// 0 = empty cell. Tile ids are global (gid): tileset.firstId + localIndex.
export function exportGeneric(project) {
  const data = {
    format: 'generic-tilemap',
    version: 1,
    name: project.name,
    tileWidth: project.tileWidth,
    tileHeight: project.tileHeight,
    width: project.mapWidth,
    height: project.mapHeight,
    tilesets: project.tilesets.map((ts) => ({
      name: ts.name,
      image: imageName(ts.name),
      imageWidth: ts.imageWidth,
      imageHeight: ts.imageHeight,
      tileWidth: ts.tileWidth,
      tileHeight: ts.tileHeight,
      margin: ts.margin,
      spacing: ts.spacing,
      columns: ts.columns,
      tileCount: ts.tileCount,
      firstId: ts.firstgid,
    })),
    layers: project.layers.map((l) => ({
      name: l.name,
      visible: l.visible,
      opacity: l.opacity,
      // 2D array (rows of columns) for readability
      data: to2D(l.data, project.mapWidth),
    })),
  };
  return { filename: `${slug(project.name)}.json`, content: JSON.stringify(data, null, 2) };
}

function to2D(flat, w) {
  const rows = [];
  for (let i = 0; i < flat.length; i += w) rows.push(flat.slice(i, i + w));
  return rows;
}
export function slug(s) {
  return (s || 'tilemap').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'tilemap';
}
export function imageName(name) {
  return /\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(name) ? name : `${slug(name)}.png`;
}
