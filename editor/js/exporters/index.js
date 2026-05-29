// Editor-side export glue: pure exporters come from @poc/core; this module adds
// the browser download behavior (Blobs, <a download>) the game runtime doesn't need.
import { exportProject, imageName } from '../../../packages/core/src/index.js';

export function runExport(target, project) {
  const { filename, content } = exportProject(target, project);
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
