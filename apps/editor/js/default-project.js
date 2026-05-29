// First-run starter scene: loads the two bundled sample tilesets and paints a
// pleasant little map so the editor isn't empty on a fresh open. Used only when
// there's no autosaved project to restore.
import { state, projectSnapshot } from './state.js';
import { addTileset } from './tileset.js';

// Sample tilesets shipped in the editor's public/ dir (served at /samples).
const SAMPLES = [
  { name: 'tileset.png', url: '/samples/tileset.png' },
  { name: 'tileset.night.png', url: '/samples/tileset.night.png' },
];

// Local tile indices into the 8x8 sample sheet.
const GRASS = 1, PATH = 2, WATER = 4, FLOWER = 5, ROCK = 6, TREE = 7;

async function fetchDataUrl(url) {
  const blob = await (await fetch(url)).blob();
  return new Promise((res) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.readAsDataURL(blob);
  });
}

export async function buildDefaultProject() {
  // The fresh project (from createProject) already has one empty layer.
  // Load both sample tilesets; the first becomes active.
  for (const s of SAMPLES) {
    const url = await fetchDataUrl(s.url);
    await addTileset(s.name, url);
  }

  const P = projectSnapshot();
  const ts = P.tilesets[0];
  if (!ts) return; // fetch failed — leave the project empty

  const W = P.mapWidth, H = P.mapHeight;
  const layer = P.layers[0];
  const gid = (local) => ts.firstgid + local;
  const put = (x, y, local) => {
    if (x >= 0 && y >= 0 && x < W && y < H) layer.data[y * W + x] = gid(local);
  };

  // grass everywhere
  layer.data.fill(gid(GRASS));
  // a winding path
  const midY = Math.floor(H / 2);
  for (let x = 1; x < W - 1; x++) put(x, midY, PATH);
  for (let y = 2; y <= midY; y++) put(Math.floor(W / 3), y, PATH);
  // a small pond
  for (let y = midY + 3; y < Math.min(H - 1, midY + 7); y++)
    for (let x = W - 9; x < W - 3; x++) put(x, y, WATER);
  // scattered scenery
  const trees = [[3, 3], [6, 5], [W - 5, 4], [4, H - 4], [W - 7, H - 3]];
  const rocks = [[8, 8], [W - 10, 7], [12, H - 5]];
  const flowers = [[3, 7], [10, 4], [W - 6, midY - 2], [7, H - 6]];
  trees.forEach(([x, y]) => put(x, y, TREE));
  rocks.forEach(([x, y]) => put(x, y, ROCK));
  flowers.forEach(([x, y]) => put(x, y, FLOWER));

  // start with a single grass tile selected in the palette
  state.ui.activeTilesetId = ts.id;
  state.ui.selection = { tilesetId: ts.id, col: GRASS % ts.columns, row: 0, w: 1, h: 1 };
}
