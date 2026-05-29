// Procedural dungeon assembly from patterns (Phase 4).
//
// Patterns are room-sized chunks tagged with edge doors (N/E/S/W). We carve a
// connected maze over a cols×rows ROOM grid (recursive backtracker), which tells
// each room which edges must open to a neighbor. For each room we pick the
// pattern whose door set best matches, then stamp them all into one new map.
// Door positions are standardized (centered per edge), so "has a door on this
// edge" is the only thing that needs to match.
import { state, makeMap, makeLayer, emit } from './state.js';
import { pushHistory } from './history.js';

const OPP = { n: 's', s: 'n', e: 'w', w: 'e' };
const DIRS = [['n', 0, -1], ['e', 1, 0], ['s', 0, 1], ['w', -1, 0]];
const door = (p, d) => !!(p.doors && p.doors[d]);

// How well a pattern's doors fit the required open edges (higher = better).
function score(p, req) {
  let s = 0;
  for (const d of ['n', 'e', 's', 'w']) {
    if (req[d] && door(p, d)) s += 2;        // needed and present
    else if (req[d] && !door(p, d)) s -= 3;  // needed but missing (would be a dead wall)
    else if (!req[d] && door(p, d)) s -= 0.5; // extra door opening into a wall
  }
  return s;
}
function pick(patterns, req) {
  return patterns.slice().sort((a, b) => score(b, req) - score(a, req))[0];
}

// Blit a pattern's layers into `map` at (ox,oy); layers matched by name.
function blit(map, pat, ox, oy) {
  const W = map.mapWidth;
  for (const pl of pat.layers) {
    let dl = map.layers.find((l) => l.name === pl.name);
    if (!dl) { dl = makeLayer(pl.name, W * map.mapHeight, state.ui.nextLayerId++); map.layers.push(dl); }
    for (let r = 0; r < pat.mapHeight; r++) {
      for (let c = 0; c < pat.mapWidth; c++) {
        const gid = pl.data[r * pat.mapWidth + c];
        if (!gid) continue;
        const x = ox + c, y = oy + r;
        if (x < 0 || y < 0 || x >= W || y >= map.mapHeight) continue;
        dl.data[y * W + x] = gid;
      }
    }
  }
}

// Generate a cols×rows dungeon into a NEW map. rng() → [0,1). Returns stats.
export function generateDungeon(cols, rows, rng = Math.random) {
  const patterns = state.workspace.patterns.filter((p) => p.layers?.length);
  if (!patterns.length) throw new Error('Make at least one pattern (with doors) first.');
  const RW = patterns[0].mapWidth, RH = patterns[0].mapHeight; // room size = first pattern
  const idx = (c, r) => r * cols + c;

  // 1) recursive-backtracker maze over the room grid → open edges per cell
  const open = Array.from({ length: rows * cols }, () => ({ n: false, e: false, s: false, w: false }));
  const seen = new Array(rows * cols).fill(false);
  const start = [Math.floor(rng() * cols), Math.floor(rng() * rows)];
  seen[idx(start[0], start[1])] = true;
  const stack = [start];
  while (stack.length) {
    const [c, r] = stack[stack.length - 1];
    const nbrs = DIRS
      .map(([d, dx, dy]) => [d, c + dx, r + dy])
      .filter(([, nc, nr]) => nc >= 0 && nr >= 0 && nc < cols && nr < rows && !seen[idx(nc, nr)]);
    if (!nbrs.length) { stack.pop(); continue; }
    const [d, nc, nr] = nbrs[Math.floor(rng() * nbrs.length)];
    open[idx(c, r)][d] = true;
    open[idx(nc, nr)][OPP[d]] = true;
    seen[idx(nc, nr)] = true;
    stack.push([nc, nr]);
  }

  // 2) assemble into a new map
  pushHistory();
  const W = cols * RW, H = rows * RH;
  const map = makeMap(`Dungeon ${state.workspace.maps.length + 1}`, W, H, nextMapId());
  map.layers = []; // blit creates layers by name
  let mismatches = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const req = open[idx(c, r)];
      const pat = pick(patterns, req);
      if (score(pat, req) < 0) mismatches++;
      blit(map, pat, c * RW, r * RH);
    }
  }
  if (!map.layers.length) map.layers.push(makeLayer('Layer 1', W * H, state.ui.nextLayerId++));

  state.workspace.maps.push(map);
  state.ui.activeKind = 'map';
  state.ui.activeMapId = map.id;
  state.ui.activeLayerId = map.layers[0].id;
  emit('maps:change');
  emit('project:replaced');
  return { rooms: cols * rows, roomSize: [RW, RH], mapSize: [W, H], mismatches };
}

function nextMapId() {
  return Math.max(-1, ...state.workspace.maps.map((m) => m.id)) + 1;
}
