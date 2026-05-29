// Export dispatch + browser download helpers.
import { exportGeneric } from './generic.js';
import { exportTiled } from './tiled.js';
import { exportGodot } from './godot.js';
import { exportUnity } from './unity.js';
import { imageName } from './generic.js';

const EXPORTERS = {
  generic: exportGeneric,
  tiled: exportTiled,
  godot: exportGodot,
  unity: exportUnity,
};

export function runExport(target, project) {
  const fn = EXPORTERS[target];
  if (!fn) throw new Error(`Unknown export target: ${target}`);
  const { filename, content } = fn(project);
  downloadText(filename, content);
  // Also export the tileset PNGs so the data file is usable out of the box.
  for (const ts of project.tilesets) {
    if (ts.image) downloadDataUrl(imageName(ts.name), ts.image);
  }
  return filename;
}

export function downloadText(filename, text, mime = 'application/json') {
  const blob = new Blob([text], { type: mime });
  triggerDownload(filename, URL.createObjectURL(blob));
}

export function downloadDataUrl(filename, dataUrl) {
  triggerDownload(filename, dataUrl);
}

function triggerDownload(filename, url) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (url.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(url), 4000);
}
