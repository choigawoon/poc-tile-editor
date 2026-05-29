// Builds a self-contained game BUNDLE from a hand-authored project, using the
// REAL Generic exporter (the same code path the editor's Export button uses).
//
// This is the seam between tool and game: it writes ONLY data + resources
// (map.json + tileset.png) into bundles/demo/. The game runtime depends on
// nothing else — not on the editor, not on how the map was authored.
//
//   node tools/make-demo-bundle.mjs
import { writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { exportGeneric } from '../packages/core/src/exporters/generic.js';

const root = new URL('../', import.meta.url);
const W = 40, H = 25, TILE = 32;

// The bundle ships MULTIPLE same-grid tilesets (tones). map.json points at the
// default; the game may swap to any of these without touching data or code.
const DEFAULT_SKIN = 'tileset.day.png';

// --- tile vocabulary (local indices into the 8x8 sample tileset) ---
const GRASS = 1, PATH = 2, WATER = 4, FLOWER = 5, ROCK = 6, TREE = 7;
const gid = (local) => 1 + local; // single tileset, firstgid = 1

const flat = (fill = 0) => new Array(W * H).fill(fill);
const at = (a, x, y, v) => { if (x >= 0 && y >= 0 && x < W && y < H) a[y * W + x] = v; };

// ---- Layer: Ground (grass everywhere) ----
const ground = flat(gid(GRASS));

// ---- Layer: Water (a pond + a river) — purely visual ----
const water = flat(0);
for (let y = 14; y < 21; y++) for (let x = 26; x < 34; x++) at(water, x, y, gid(WATER)); // pond
for (let y = 0; y < H; y++) { at(water, 18, y, gid(WATER)); at(water, 19, y, gid(WATER)); } // river

// ---- Layer: Props (path + scenery) — purely visual ----
const props = flat(0);
for (let x = 1; x < W - 1; x++) at(props, x, 12, gid(PATH));        // main road
for (let y = 1; y < 12; y++) { at(props, 9, y, gid(PATH)); }        // side road up
const trees = [[3, 4], [5, 6], [13, 3], [14, 8], [24, 5], [35, 6], [6, 18], [12, 20], [33, 22], [4, 22]];
const rocks = [[7, 9], [22, 9], [30, 4], [16, 16], [28, 22], [37, 14]];
const flowers = [[3, 8], [11, 5], [15, 10], [25, 18], [34, 9], [8, 15]];
trees.forEach(([x, y]) => at(props, x, y, gid(TREE)));
rocks.forEach(([x, y]) => at(props, x, y, gid(ROCK)));
flowers.forEach(([x, y]) => at(props, x, y, gid(FLOWER)));

// ---- Layer: Collision (INVISIBLE logic layer) ----
// The game treats any non-empty cell here as solid. Note this is a SEPARATE
// concern from visuals: the tool author decides what blocks; the marker tile is
// irrelevant (the game only checks "non-empty"). We bridge water + the river
// gap + props + the outer wall here. We carve a bridge across the river so the
// road stays walkable.
const collision = flat(0);
const MARK = gid(ROCK);
// outer wall
for (let x = 0; x < W; x++) { at(collision, x, 0, MARK); at(collision, x, H - 1, MARK); }
for (let y = 0; y < H; y++) { at(collision, 0, y, MARK); at(collision, W - 1, y, MARK); }
// water is solid
for (let i = 0; i < water.length; i++) if (water[i]) collision[i] = MARK;
// props are solid
for (let i = 0; i < props.length; i++) if (props[i] === gid(TREE) || props[i] === gid(ROCK)) collision[i] = MARK;
// carve a bridge where the road crosses the river (row 12, cols 18-19)
at(collision, 18, 12, 0); at(collision, 19, 12, 0);
// keep the spawn area (2..6, 2..6) clear
for (let y = 2; y <= 6; y++) for (let x = 2; x <= 6; x++) if (!(trees.some(([tx, ty]) => tx === x && ty === y))) at(collision, x, y, 0);

const project = {
  format: 'poc-tile-editor', version: 1, name: 'Demo Level',
  tileWidth: TILE, tileHeight: TILE, mapWidth: W, mapHeight: H, nextGid: 65,
  tilesets: [{
    id: 0, name: DEFAULT_SKIN, image: 'data:,',
    imageWidth: 256, imageHeight: 256, tileWidth: TILE, tileHeight: TILE,
    margin: 0, spacing: 0, columns: 8, rows: 8, tileCount: 64, firstgid: 1,
  }],
  layers: [
    { id: 0, name: 'Ground', visible: true, opacity: 1, data: ground },
    { id: 1, name: 'Water', visible: true, opacity: 1, data: water },
    { id: 2, name: 'Props', visible: true, opacity: 1, data: props },
    { id: 3, name: 'Collision', visible: false, opacity: 1, data: collision },
  ],
};

// Spawn point + simple metadata the game can read (tool-authored intent).
// `skins` lists the alternate same-grid tilesets the game may switch between.
const bundleExtras = {
  spawn: { x: 3, y: 3 },
  playerSpeed: 150,
  skins: [
    { id: 'day', image: 'tileset.day.png', label: 'Day' },
    { id: 'night', image: 'tileset.night.png', label: 'Night' },
  ],
};

const { content } = exportGeneric(project);
const map = JSON.parse(content);
map.game = bundleExtras; // attach gameplay hints alongside placement data

const outDir = new URL('bundles/demo/', root);
mkdirSync(outDir, { recursive: true });
writeFileSync(new URL('map.json', outDir), JSON.stringify(map, null, 2));

// Ship BOTH tones into the bundle (no overwriting). The day skin is the bright
// sample; the night skin is the cool-graded variant. Both share the 8x8 grid.
copyFileSync(fileURLToPath(new URL('samples/tileset.png', root)),
  fileURLToPath(new URL('tileset.day.png', outDir)));
const nightSrc = new URL('samples/tileset.night.png', root);
if (existsSync(fileURLToPath(nightSrc))) {
  copyFileSync(fileURLToPath(nightSrc), fileURLToPath(new URL('tileset.night.png', outDir)));
} else {
  console.warn('  ! samples/tileset.night.png missing — run: node tools/make-tileset-variant.mjs night');
}

// Mirror the bundle into the game app's public dir so the Pixi game (Vite dev
// server + `vite build`) can serve it — Vite only sees files under its app root.
const gamePub = new URL('apps/game/public/bundles/demo/', root);
mkdirSync(gamePub, { recursive: true });
for (const f of ['map.json', 'tileset.day.png', 'tileset.night.png']) {
  const srcF = new URL(f, outDir);
  if (existsSync(fileURLToPath(srcF))) copyFileSync(fileURLToPath(srcF), fileURLToPath(new URL(f, gamePub)));
}

const solid = collision.filter(Boolean).length;
console.log(`Bundle written → bundles/demo/  (map.json + tileset.day.png + tileset.night.png)`);
console.log(`  mirrored → apps/game/public/bundles/demo/`);
console.log(`  map ${W}x${H}, layers ${project.layers.length}, solid cells ${solid}, spawn (3,3)`);
console.log(`  skins: day (default), night`);
