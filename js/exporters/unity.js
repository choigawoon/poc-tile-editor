// Unity export. Emits a JSON consumed by engine-templates/unity/TileMapImporter.cs,
// which slices the tileset texture into sprites and populates a Grid + Tilemap.
// Cells reference a tileset index + the sprite index within that tileset.
import { slug, imageName } from './generic.js';
import { resolveGid } from '../tileset.js';

export function exportUnity(project) {
  const tsIndex = new Map();
  project.tilesets.forEach((ts, i) => tsIndex.set(ts.id, i));

  const data = {
    format: 'unity-tilemap',
    unity_version: '2021+',
    cellSize: [project.tileWidth, project.tileHeight],
    mapSize: [project.mapWidth, project.mapHeight],
    tilesets: project.tilesets.map((ts) => ({
      index: tsIndex.get(ts.id),
      name: ts.name,
      texture: imageName(ts.name),
      textureWidth: ts.imageWidth,
      textureHeight: ts.imageHeight,
      tileWidth: ts.tileWidth,
      tileHeight: ts.tileHeight,
      columns: ts.columns,
      tileCount: ts.tileCount,
      margin: ts.margin,
      spacing: ts.spacing,
    })),
    // Unity's Y axis points up; cells store engine-ready coords with y flipped.
    layers: project.layers.map((l, depth) => ({
      name: l.name,
      visible: l.visible,
      opacity: l.opacity,
      sortingOrder: depth,
      cells: layerCells(l, project, tsIndex),
    })),
  };
  return { filename: `${slug(project.name)}.unity.json`, content: JSON.stringify(data, null, 2) };
}

function layerCells(layer, project, tsIndex) {
  const cells = [];
  const h = project.mapHeight;
  for (let i = 0; i < layer.data.length; i++) {
    const gid = layer.data[i];
    if (!gid) continue;
    const r = resolveGid(gid);
    if (!r) continue;
    const col = i % project.mapWidth;
    const row = Math.floor(i / project.mapWidth);
    cells.push({
      x: col,
      y: h - 1 - row, // flip to Unity's bottom-up grid
      tileset: tsIndex.get(r.tileset.id),
      sprite: r.localIndex,
    });
  }
  return cells;
}
