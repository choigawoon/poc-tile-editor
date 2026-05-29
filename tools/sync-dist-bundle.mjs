// Copy the canonical demo bundle into the game's built dist/ so the standalone
// production game can fetch /bundles/demo/map.json + its tileset PNGs verbatim.
// Run after `vite build` (see the build:game script).
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const src = new URL('bundles/demo/', root);
const dest = new URL('apps/game/dist/bundles/demo/', root);

if (!existsSync(fileURLToPath(new URL('apps/game/dist/', root)))) {
  console.error('sync-dist-bundle: apps/game/dist not found — run the game build first');
  process.exit(1);
}

mkdirSync(dest, { recursive: true });
const files = ['map.json', 'tileset.day.png', 'tileset.night.png'];
let n = 0;
for (const f of files) {
  const s = new URL(f, src);
  if (existsSync(fileURLToPath(s))) { copyFileSync(fileURLToPath(s), fileURLToPath(new URL(f, dest))); n++; }
}
console.log(`sync-dist-bundle: copied ${n} files → apps/game/dist/bundles/demo/`);
