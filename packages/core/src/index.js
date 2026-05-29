// @poc/core — shared tile-format SDK used by BOTH the editor (tool) and the
// game (runtime). Pure data/logic only: gid math, tile geometry, and the
// engine exporters. No DOM, no app state.
export * from './gid.js';
export * from './meta.js';
export * from './tags.js';
export {
  exportProject, EXPORTERS,
  exportGeneric, exportTiled, exportGodot, exportUnity,
} from './exporters/index.js';
