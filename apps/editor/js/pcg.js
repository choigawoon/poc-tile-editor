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

// ───── Auto mode: build the rooms procedurally too, then assemble — no manual
// pattern authoring needed. Each maze cell becomes a floor-filled room with a
// wall border and gaps where doors are required, so the dungeon is connected by
// construction. The distinct room types are also added to the pattern library.

const COMBO = (d) => ((d.n ? 'n' : '') + (d.e ? 'e' : '') + (d.s ? 's' : '') + (d.w ? 'w' : '')) || '·';

function tsForGid(gid) {
  let found = null;
  for (const ts of state.workspace.tilesets) if (gid >= ts.firstgid) found = ts;
  return found;
}
function setSolid(gid) {
  const ts = tsForGid(gid);
  if (!ts) return;
  ts.tiles = ts.tiles || {};
  const k = String(gid - ts.firstgid);
  ts.tiles[k] = { ...(ts.tiles[k] || {}), solid: true };
}

// floor + wall gids: prefer tagged/solid tiles; else fall back to the active
// tileset (and mark the chosen wall solid so it collides in ▶Play).
function resolveTiles() {
  const tss = state.workspace.tilesets;
  if (!tss.length) throw new Error('Add a tileset first (＋ in Tilesets).');
  const hasTag = (m, pre) => Array.isArray(m.tags) && m.tags.some((t) => { const l = t.toLowerCase(); return l === pre || l.startsWith(pre + '.'); });
  const find = (pred) => {
    for (const ts of tss) if (ts.tiles) for (const k of Object.keys(ts.tiles)) if (pred(ts.tiles[k])) return ts.firstgid + Number(k);
    return 0;
  };
  let wall = find((m) => m.solid || hasTag(m, 'terrain.wall') || hasTag(m, 'movement.blocked'));
  let floor = find((m) => hasTag(m, 'terrain.ground') || hasTag(m, 'surface'));

  const active = tss.find((t) => t.id === state.ui.activeTilesetId) || tss[0];
  const sel = state.ui.selection;
  if (!floor && sel) {
    const ts = tss.find((t) => t.id === sel.tilesetId);
    if (ts) floor = ts.firstgid + sel.row * ts.columns + sel.col;
  }
  if (!floor) floor = active.firstgid;                       // local index 0
  if (!wall) { wall = active.firstgid + (active.tileCount > 1 ? 1 : 0); setSolid(wall); }
  return { floor, wall };
}

function buildRoom(w, h, doors, { floor, wall }) {
  const ground = new Array(w * h).fill(floor);
  const walls = new Array(w * h).fill(0);
  for (let x = 0; x < w; x++) { walls[x] = wall; walls[(h - 1) * w + x] = wall; }
  for (let y = 0; y < h; y++) { walls[y * w] = wall; walls[y * w + w - 1] = wall; }
  const cx = Math.floor(w / 2), cy = Math.floor(h / 2);
  if (doors.n) walls[cx] = 0;
  if (doors.s) walls[(h - 1) * w + cx] = 0;
  if (doors.w) walls[cy * w] = 0;
  if (doors.e) walls[cy * w + w - 1] = 0;
  return { Ground: ground, Walls: walls };
}

export function autoDungeon(cols, rows, rw, rh, rng = Math.random) {
  const tiles = resolveTiles();
  const idx = (c, r) => r * cols + c;
  const open = Array.from({ length: rows * cols }, () => ({ n: false, e: false, s: false, w: false }));
  const seen = new Array(rows * cols).fill(false);
  const start = [Math.floor(rng() * cols), Math.floor(rng() * rows)];
  seen[idx(start[0], start[1])] = true;
  const stack = [start];
  while (stack.length) {
    const [c, r] = stack[stack.length - 1];
    const nb = DIRS.map(([d, dx, dy]) => [d, c + dx, r + dy]).filter(([, nc, nr]) => nc >= 0 && nr >= 0 && nc < cols && nr < rows && !seen[idx(nc, nr)]);
    if (!nb.length) { stack.pop(); continue; }
    const [d, nc, nr] = nb[Math.floor(rng() * nb.length)];
    open[idx(c, r)][d] = true; open[idx(nc, nr)][OPP[d]] = true;
    seen[idx(nc, nr)] = true; stack.push([nc, nr]);
  }

  pushHistory();
  const W = cols * rw, H = rows * rh;
  const map = makeMap(`Dungeon ${state.workspace.maps.length + 1}`, W, H, nextMapId());
  map.layers = [makeLayer('Ground', W * H, 0), makeLayer('Walls', W * H, 1)];
  state.ui.nextLayerId = Math.max(state.ui.nextLayerId, 2);

  const combos = new Map();
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const doors = open[idx(c, r)];
    const room = buildRoom(rw, rh, doors, tiles);
    const ox = c * rw, oy = r * rh;
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
      const mi = (oy + y) * W + (ox + x), ri = y * rw + x;
      map.layers[0].data[mi] = room.Ground[ri];
      if (room.Walls[ri]) map.layers[1].data[mi] = room.Walls[ri];
    }
    const key = COMBO(doors);
    if (!combos.has(key)) combos.set(key, { ...doors });
  }

  // populate the pattern library with the distinct room types
  let pid = Math.max(-1, ...state.workspace.patterns.map((p) => p.id)) + 1;
  for (const [key, doors] of combos) {
    const room = buildRoom(rw, rh, doors, tiles);
    state.workspace.patterns.push({
      id: pid, name: `Room ${key}`, mapWidth: rw, mapHeight: rh, doors: { ...doors },
      layers: [
        { id: 0, name: 'Ground', visible: true, opacity: 1, data: room.Ground.slice() },
        { id: 1, name: 'Walls', visible: true, opacity: 1, data: room.Walls.slice() },
      ],
      objects: [],
    });
    if (state.ui.stampPatternId == null) state.ui.stampPatternId = pid;
    pid++;
  }

  state.workspace.maps.push(map);
  state.ui.activeKind = 'map';
  state.ui.activeMapId = map.id;
  state.ui.activeLayerId = map.layers[0].id;
  emit('maps:change');
  emit('project:replaced');
  emit('tilesets:change');
  return { rooms: cols * rows, mapSize: [W, H], roomTypes: combos.size, tiles };
}
