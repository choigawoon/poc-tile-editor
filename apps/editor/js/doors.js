// Pattern door editor — toggles which edges (N/E/S/W) of the active PATTERN
// carry a connector. Standardized (centered) doors mean PCG connects two
// patterns whenever their shared edges both have a door. Shown only while a
// pattern is being edited.
import { state, activeDoc, emit, on } from './state.js';
import { pushHistory } from './history.js';

let block, host;

export function initDoors(blockEl, hostEl) {
  block = blockEl;
  host = hostEl;
  on('project:replaced', render);
  on('maps:change', render);
  render();
}

function render() {
  if (!block) return;
  const isPattern = state.ui.activeKind === 'pattern';
  if (!isPattern) {
    host.innerHTML = '<div class="tileset-meta">Edit a pattern (Patterns ＋ in the tab bar) to set its doors.</div>';
    return;
  }
  const d = activeDoc();
  if (!d) return;
  if (!d.doors) d.doors = { n: false, e: false, s: false, w: false };

  host.innerHTML = '';
  const hint = document.createElement('div');
  hint.className = 'tileset-meta';
  hint.textContent = 'Edges with a connector. Patterns join when shared edges both have a door.';
  host.appendChild(hint);

  for (const [dir, label] of [['n', 'North'], ['e', 'East'], ['s', 'South'], ['w', 'West']]) {
    const l = document.createElement('label');
    l.className = 'check';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!d.doors[dir];
    cb.onchange = () => { pushHistory(); d.doors[dir] = cb.checked; emit('maps:change'); };
    l.append(cb, document.createTextNode(' ' + label));
    host.appendChild(l);
  }
}
