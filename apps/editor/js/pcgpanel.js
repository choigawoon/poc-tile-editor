// Dungeon (PCG) dock panel — inline controls instead of a chain of prompts.
// "Auto-build" generates the rooms for you; "From my patterns" assembles the
// patterns in the Patterns tabs. A blank seed is random; a number is repeatable.
import { generateDungeon, autoDungeon } from './pcg.js';

let host;

export function initPcgPanel(el) { host = el; render(); }

function num(label, def, min, max) {
  const wrap = document.createElement('label');
  wrap.className = 'genai-num';
  const span = document.createElement('span');
  span.textContent = label;
  const input = document.createElement('input');
  input.type = 'number'; input.value = def; input.min = min; input.max = max;
  wrap.append(span, input);
  return { wrap, val: () => Math.max(min, Math.min(max, Math.round(+input.value) || def)) };
}

function rngFrom(seedStr) {
  const n = parseInt(seedStr, 10);
  if (!Number.isFinite(n)) return Math.random;
  let s = (n >>> 0) || 1;
  return () => { s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

function render() {
  if (!host) return;
  host.innerHTML = '';

  const cols = num('Cols', 4, 1, 16);
  const rows = num('Rows', 3, 1, 16);
  const rw = num('Room W', 7, 3, 32);
  const rh = num('Room H', 5, 3, 32);
  const gridRow = document.createElement('div'); gridRow.className = 'genai-grid'; gridRow.append(cols.wrap, rows.wrap);
  const roomRow = document.createElement('div'); roomRow.className = 'genai-grid'; roomRow.append(rw.wrap, rh.wrap);

  const seedRow = document.createElement('div'); seedRow.className = 'field';
  const sl = document.createElement('label'); sl.textContent = 'Seed';
  const seed = document.createElement('input'); seed.type = 'text'; seed.placeholder = '(random)';
  seedRow.append(sl, seed);

  const auto = document.createElement('button'); auto.className = 'full primary'; auto.textContent = '✨ Auto-build dungeon';
  const fromPat = document.createElement('button'); fromPat.className = 'full'; fromPat.textContent = '⚄ From my patterns';
  const status = document.createElement('div'); status.className = 'tileset-meta';

  auto.onclick = () => {
    try {
      const r = autoDungeon(cols.val(), rows.val(), rw.val(), rh.val(), rngFrom(seed.value));
      status.textContent = `Auto: ${cols.val()}×${rows.val()} rooms · ${r.mapSize[0]}×${r.mapSize[1]}px · ${r.roomTypes} room types → patterns`;
    } catch (e) { status.textContent = 'Failed: ' + e.message; }
  };
  fromPat.onclick = () => {
    try {
      const r = generateDungeon(cols.val(), rows.val(), rngFrom(seed.value));
      status.textContent = `From patterns: ${cols.val()}×${rows.val()} · ${r.mapSize[0]}×${r.mapSize[1]}px` + (r.mismatches ? ` · ${r.mismatches} door mismatch` : '');
    } catch (e) { status.textContent = 'Failed: ' + e.message; }
  };

  const hint = document.createElement('div');
  hint.className = 'tileset-meta';
  hint.textContent = 'Auto-build makes rooms for you (Room W/H). From patterns uses the Patterns tabs (their size).';

  host.append(gridRow, roomRow, seedRow, auto, fromPat, status, hint);
}
