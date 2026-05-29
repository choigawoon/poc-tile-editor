// Godot 4 export. Emits a JSON consumed by engine-templates/godot/TileMapImporter.gd,
// which builds TileMapLayer nodes with a generated TileSet at runtime.
// Cells reference an atlas source id + atlas coordinates (Godot's native model).
import { slug, imageName } from './generic.js';
import { resolveGid } from '../tileset.js';

export function exportGodot(project) {
  const tsIndex = new Map(); // tileset id -> source_id (0-based)
  project.tilesets.forEach((ts, i) => tsIndex.set(ts.id, i));

  const data = {
    format: 'godot-tilemap',
    godot_version: 4,
    tile_size: [project.tileWidth, project.tileHeight],
    map_size: [project.mapWidth, project.mapHeight],
    tilesets: project.tilesets.map((ts) => ({
      source_id: tsIndex.get(ts.id),
      name: ts.name,
      image: imageName(ts.name),
      texture_region_size: [ts.tileWidth, ts.tileHeight],
      columns: ts.columns,
      tile_count: ts.tileCount,
      margins: ts.margin,
      separation: ts.spacing,
    })),
    layers: project.layers.map((l) => ({
      name: l.name,
      visible: l.visible,
      modulate_alpha: l.opacity,
      cells: layerCells(l, project, tsIndex),
    })),
  };
  return { filename: `${slug(project.name)}.godot.json`, content: JSON.stringify(data, null, 2) };
}

function layerCells(layer, project, tsIndex) {
  const cells = [];
  for (let i = 0; i < layer.data.length; i++) {
    const gid = layer.data[i];
    if (!gid) continue;
    const r = resolveGid(gid);
    if (!r) continue;
    const ax = r.localIndex % r.tileset.columns;
    const ay = Math.floor(r.localIndex / r.tileset.columns);
    cells.push({
      x: i % project.mapWidth,
      y: Math.floor(i / project.mapWidth),
      source: tsIndex.get(r.tileset.id),
      atlas: [ax, ay],
    });
  }
  return cells;
}
