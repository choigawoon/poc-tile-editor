// Pure export dispatch — returns { filename, content } strings. No DOM here;
// browser download glue lives in the editor app (apps/editor).
import { exportGeneric } from './generic.js';
import { exportTiled } from './tiled.js';
import { exportGodot } from './godot.js';
import { exportUnity } from './unity.js';

export { exportGeneric, exportTiled, exportGodot, exportUnity };

export const EXPORTERS = {
  generic: exportGeneric,
  tiled: exportTiled,
  godot: exportGodot,
  unity: exportUnity,
};

// Produce the data file for a target. Returns { filename, content }.
export function exportProject(target, project) {
  const fn = EXPORTERS[target];
  if (!fn) throw new Error(`Unknown export target: ${target}`);
  return fn(project);
}
