// Tiled map JSON (.tmj) — the de-facto interchange format.
// Importable by Godot (built-in / plugins) and Unity (SuperTiled2Unity).
import { slug, imageName } from './generic.js';

export function exportTiled(project) {
  const map = {
    compressionlevel: -1,
    type: 'map',
    version: '1.10',
    tiledversion: '1.10.2',
    orientation: 'orthogonal',
    renderorder: 'right-down',
    infinite: false,
    width: project.mapWidth,
    height: project.mapHeight,
    tilewidth: project.tileWidth,
    tileheight: project.tileHeight,
    nextlayerid: project.layers.length + 1,
    nextobjectid: 1,
    tilesets: project.tilesets.map((ts) => ({
      firstgid: ts.firstgid,
      name: ts.name,
      image: imageName(ts.name),
      imagewidth: ts.imageWidth,
      imageheight: ts.imageHeight,
      tilewidth: ts.tileWidth,
      tileheight: ts.tileHeight,
      margin: ts.margin,
      spacing: ts.spacing,
      columns: ts.columns,
      tilecount: ts.tileCount,
    })),
    layers: project.layers.map((l, i) => ({
      id: i + 1,
      name: l.name,
      type: 'tilelayer',
      x: 0,
      y: 0,
      width: project.mapWidth,
      height: project.mapHeight,
      visible: l.visible,
      opacity: l.opacity,
      data: l.data.slice(), // Tiled gids match ours (0 = empty)
    })),
  };
  return { filename: `${slug(project.name)}.tmj`, content: JSON.stringify(map, null, 2) };
}
