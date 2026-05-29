// Bundle loading for the game runtime. A "bundle" is the contract between the
// tool and the game: a map (placement data) + tileset images (pixels).
//
// Two sources are supported so the same engine serves both the shipped demo
// and the editor's live ▶Play:
//   1. URL    — fetch map.json, then load each tileset image relative to it
//   2. inline — { map, images: { "<filename>": <dataURL>, ... } } handed in
//               directly (the editor passes the in-memory project this way)
import { firstId } from '@poc/core';

export function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('image load failed: ' + src));
    img.src = src;
  });
}

// Returns { map, images: Map<tilesetObj, HTMLImageElement> }.
export async function loadBundleFromUrl(url) {
  const map = await (await fetch(url)).json();
  const base = url.replace(/[^/]*$/, '');
  const images = new Map(
    await Promise.all(map.tilesets.map(async (ts) => [ts, await loadImage(base + ts.image)]))
  );
  return { map, images };
}

// inline.images is keyed by the tileset's exported image filename.
export async function loadInlineBundle(inline) {
  const { map } = inline;
  const images = new Map(
    await Promise.all(map.tilesets.map(async (ts) => {
      const dataUrl = inline.images?.[ts.image];
      if (!dataUrl) throw new Error('inline bundle missing image: ' + ts.image);
      return [ts, await loadImage(dataUrl)];
    }))
  );
  return { map, images };
}

// gid → { ts, local }. Mirrors @poc/core.resolveGid but for the exported map
// shape (tilesets carry `firstId`). Kept here so the game owns its read path.
export function resolveCell(gid, tilesets) {
  if (gid <= 0) return null;
  let ts = null;
  for (const t of tilesets) if (gid >= firstId(t)) ts = t;
  if (!ts) return null;
  return { ts, local: gid - firstId(ts) };
}
