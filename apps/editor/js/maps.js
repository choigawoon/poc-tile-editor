// Document tabs — switch between the workspace's MAPS and PATTERNS. A pattern is
// a small map-shaped doc edited with the same canvas/tools; it's placed onto a
// map with the stamp tool. Tilesets + tag registry are shared workspace-wide.
import { state, makeMap, makePattern, normalizeActive, emit, on } from './state.js';
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
  host.append(group('Maps', state.workspace.maps, 'map'));
  host.append(sep());
  host.append(group('Patterns', state.workspace.patterns, 'pattern'));
  if (state.workspace.patterns.length) host.append(stampPicker());
}

function sep() { const s = document.createElement('span'); s.className = 'mt-sep'; return s; }

function group(label, docs, kind) {
  const wrap = document.createElement('span');
  wrap.className = 'mt-group';
  const lbl = document.createElement('span');
  lbl.className = 'mt-label';
  lbl.textContent = label;
  wrap.appendChild(lbl);

  for (const d of docs) {
    const active = kind === state.ui.activeKind &&
      d.id === (kind === 'map' ? state.ui.activeMapId : state.ui.activePatternId);
    const tab = document.createElement('div');
    tab.className = 'map-tab' + (active ? ' active' : '') + (kind === 'pattern' ? ' pattern' : '');

    const name = document.createElement('span');
    name.className = 'mt-name';
    name.textContent = d.name;
    name.title = 'Click to edit · double-click to rename';
    name.onclick = () => switchDoc(kind, d.id);
    name.ondblclick = () => renameDoc(d, name);
    tab.appendChild(name);

    if (docs.length > 1 || kind === 'pattern') {
      const x = document.createElement('button');
      x.className = 'mt-close';
      x.textContent = '×';
      x.title = 'Close';
      x.onclick = (e) => { e.stopPropagation(); closeDoc(kind, d.id); };
      tab.appendChild(x);
    }
    wrap.appendChild(tab);
  }

  const add = document.createElement('button');
  add.className = 'mt-add';
  add.textContent = '＋';
  add.title = kind === 'map' ? 'New map' : 'New pattern';
  add.onclick = () => newDoc(kind);
  wrap.appendChild(add);
  return wrap;
}

// pattern chosen for the stamp tool
function stampPicker() {
  const wrap = document.createElement('span');
  wrap.className = 'mt-stamp';
  const lbl = document.createElement('span');
  lbl.className = 'mt-label';
  lbl.textContent = '▦ stamp:';
  const sel = document.createElement('select');
  for (const p of state.workspace.patterns) {
    const o = document.createElement('option');
    o.value = p.id; o.textContent = p.name;
    sel.appendChild(o);
  }
  if (state.ui.stampPatternId == null) state.ui.stampPatternId = state.workspace.patterns[0].id;
  sel.value = state.ui.stampPatternId;
  sel.onchange = () => { state.ui.stampPatternId = Number(sel.value); };
  wrap.append(lbl, sel);
  return wrap;
}

function refDims(kind) {
  const list = kind === 'map' ? state.workspace.maps : state.workspace.patterns;
  const ref = list[list.length - 1];
  if (kind === 'pattern') return { w: ref?.mapWidth ?? 6, h: ref?.mapHeight ?? 6 };
  return { w: ref?.mapWidth ?? 30, h: ref?.mapHeight ?? 20 };
}
function nextId(list) { return Math.max(-1, ...list.map((d) => d.id)) + 1; }

function switchDoc(kind, id) {
  if (kind === state.ui.activeKind &&
      id === (kind === 'map' ? state.ui.activeMapId : state.ui.activePatternId)) return;
  state.ui.activeKind = kind;
  if (kind === 'map') state.ui.activeMapId = id; else state.ui.activePatternId = id;
  normalizeActive();
  emit('maps:change');
  emit('project:replaced');
}

function newDoc(kind) {
  pushHistory();
  const w = state.workspace;
  const { w: cols, h: rows } = refDims(kind);
  if (kind === 'map') {
    const m = makeMap(`Map ${w.maps.length + 1}`, cols, rows, nextId(w.maps));
    w.maps.push(m);
    state.ui.activeKind = 'map'; state.ui.activeMapId = m.id; state.ui.activeLayerId = m.layers[0].id;
  } else {
    const p = makePattern(`Pattern ${w.patterns.length + 1}`, cols, rows, nextId(w.patterns));
    w.patterns.push(p);
    if (state.ui.stampPatternId == null) state.ui.stampPatternId = p.id;
    state.ui.activeKind = 'pattern'; state.ui.activePatternId = p.id; state.ui.activeLayerId = p.layers[0].id;
  }
  emit('maps:change');
  emit('project:replaced');
}

function closeDoc(kind, id) {
  const list = kind === 'map' ? state.workspace.maps : state.workspace.patterns;
  if (kind === 'map' && list.length <= 1) return; // keep at least one map
  if (!confirm(`Close this ${kind}? (undo to restore)`)) return;
  pushHistory();
  const i = list.findIndex((d) => d.id === id);
  list.splice(i, 1);
  if (state.ui.stampPatternId === id) state.ui.stampPatternId = state.workspace.patterns[0]?.id ?? null;
  if (kind === 'map' && state.ui.activeMapId === id) state.ui.activeMapId = list[Math.max(0, i - 1)].id;
  if (kind === 'pattern' && state.ui.activePatternId === id) {
    state.ui.activeKind = 'map'; // drop back to maps after closing the active pattern
  }
  normalizeActive();
  emit('maps:change');
  emit('project:replaced');
}

function renameDoc(d, el) {
  const input = document.createElement('input');
  input.value = d.name;
  el.textContent = '';
  el.appendChild(input);
  input.focus(); input.select();
  const commit = () => { pushHistory(); d.name = input.value.trim() || d.name; emit('maps:change'); };
  input.onblur = commit;
  input.onkeydown = (e) => { if (e.key === 'Enter') input.blur(); };
  input.onclick = (e) => e.stopPropagation();
}
