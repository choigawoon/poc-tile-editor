// Map tabs — switch between the workspace's maps, create / rename / close them.
// Tilesets and the tag registry are shared across maps (workspace-level), so
// switching a tab only changes which map's layers you're painting.
import { state, makeMap, normalizeActive, emit, on } from './state.js';
import { pushHistory } from './history.js';

let host;

export function initMapTabs(el) {
  host = el;
  on('project:replaced', render);
  on('maps:change', render);
  render();
}

function render() {
  if (!host) return;
  host.innerHTML = '';
  for (const m of state.workspace.maps) {
    const tab = document.createElement('div');
    tab.className = 'map-tab' + (m.id === state.ui.activeMapId ? ' active' : '');

    const name = document.createElement('span');
    name.className = 'mt-name';
    name.textContent = m.name;
    name.title = 'Click to switch · double-click to rename';
    name.onclick = () => switchMap(m.id);
    name.ondblclick = () => renameMap(m, name);
    tab.appendChild(name);

    if (state.workspace.maps.length > 1) {
      const x = document.createElement('button');
      x.className = 'mt-close';
      x.textContent = '×';
      x.title = 'Close map';
      x.onclick = (e) => { e.stopPropagation(); closeMap(m.id); };
      tab.appendChild(x);
    }
    host.appendChild(tab);
  }
  const add = document.createElement('button');
  add.className = 'mt-add';
  add.textContent = '＋';
  add.title = 'New map';
  add.onclick = newMap;
  host.appendChild(add);
}

function nextMapId() {
  return Math.max(-1, ...state.workspace.maps.map((m) => m.id)) + 1;
}

function switchMap(id) {
  if (state.ui.activeMapId === id) return;
  state.ui.activeMapId = id;
  normalizeActive();              // point activeLayerId at a layer in the new map
  emit('maps:change');
  emit('project:replaced');       // recenter camera + refresh panels/render
}

function newMap() {
  pushHistory();
  const w = state.workspace;
  const ref = w.maps.find((m) => m.id === state.ui.activeMapId) || w.maps[0];
  const m = makeMap(`Map ${w.maps.length + 1}`, ref?.mapWidth ?? 30, ref?.mapHeight ?? 20, nextMapId());
  w.maps.push(m);
  state.ui.activeMapId = m.id;
  state.ui.activeLayerId = m.layers[0].id;
  emit('maps:change');
  emit('project:replaced');
}

function closeMap(id) {
  if (state.workspace.maps.length <= 1) return;
  if (!confirm('Close this map? (undo to restore)')) return;
  pushHistory();
  const i = state.workspace.maps.findIndex((m) => m.id === id);
  state.workspace.maps.splice(i, 1);
  if (state.ui.activeMapId === id) {
    state.ui.activeMapId = state.workspace.maps[Math.max(0, i - 1)].id;
  }
  normalizeActive();
  emit('maps:change');
  emit('project:replaced');
}

function renameMap(m, el) {
  const input = document.createElement('input');
  input.value = m.name;
  el.textContent = '';
  el.appendChild(input);
  input.focus();
  input.select();
  const commit = () => {
    pushHistory();
    m.name = input.value.trim() || m.name;
    emit('maps:change');
  };
  input.onblur = commit;
  input.onkeydown = (e) => { if (e.key === 'Enter') input.blur(); };
  input.onclick = (e) => e.stopPropagation();
}
