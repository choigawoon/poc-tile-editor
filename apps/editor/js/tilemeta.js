// "Selected tile" property editor — authors TYPE-level metadata on the active
// tileset, keyed by local tile index (stored on `ts.tiles`). Edits apply to
// EVERY tile in the current palette selection, so you can mark a whole block
// (e.g. all water tiles) solid in one go.
//
// This is the editor-side counterpart to @poc/core's `tileMeta`: the data it
// writes is exactly what the game reads back. Keys are stringified so they
// survive the JSON round-trip (save/undo) consistently.
import { state, activeTileset, emit, on } from './state.js';
import { pushHistory } from './history.js';
import { normalizeTag, expandTag } from '@poc/core';

// Properties that get a dedicated control; everything else lands in the
// free-form key/value list below.
const RESERVED = new Set(['solid', 'tags']);

let host;

export function initTileMeta(hostEl) {
  host = hostEl;
  on('selection:change', render);
  on('tilesets:change', render);
  on('project:replaced', render);
  render();
}

// Local indices covered by the current palette selection (active tileset only).
function selected() {
  const ts = activeTileset();
  const sel = state.ui.selection;
  if (!ts || !sel || sel.tilesetId !== ts.id) return { ts: null, indices: [] };
  const indices = [];
  for (let r = 0; r < sel.h; r++)
    for (let c = 0; c < sel.w; c++)
      indices.push((sel.row + r) * ts.columns + (sel.col + c));
  return { ts, indices };
}

function metaOf(ts, idx) {
  return (ts.tiles && ts.tiles[String(idx)]) || null;
}

// Shared value of a property across the whole selection, or undefined if the
// tiles disagree (so the control can render an "indeterminate / mixed" state).
function shared(ts, indices, key) {
  let v;
  for (let i = 0; i < indices.length; i++) {
    const m = metaOf(ts, indices[i]);
    const cur = m ? m[key] : undefined;
    if (i === 0) v = cur;
    else if (JSON.stringify(cur) !== JSON.stringify(v)) return undefined;
  }
  return v;
}

// Apply `mutate` to each selected tile's metadata object, pruning empties so
// the bundle stays sparse. One history entry per edit; undo/persist follow
// because tilesets live inside the project document.
function writeAll(mutate) {
  const { ts, indices } = selected();
  if (!ts || !indices.length) return;
  pushHistory();
  ts.tiles = ts.tiles || {};
  for (const idx of indices) {
    const k = String(idx);
    const m = { ...(ts.tiles[k] || {}) };
    mutate(m);
    if (Object.keys(m).length === 0) delete ts.tiles[k];
    else ts.tiles[k] = m;
  }
  if (Object.keys(ts.tiles).length === 0) delete ts.tiles;
  emit('tilesets:change');
  emit('selection:change');
}

// Parse a free-form value field: JSON when it looks like one (true, 42,
// ["a","b"]), otherwise the raw trimmed string.
function parseValue(raw) {
  const s = raw.trim();
  if (s === '') return '';
  try { return JSON.parse(s); } catch { return s; }
}
function showValue(v) {
  return typeof v === 'string' ? v : JSON.stringify(v);
}

export function render() {
  if (!host) return;
  host.innerHTML = '';
  const { ts, indices } = selected();

  if (!ts || !indices.length) {
    host.innerHTML = '<div class="tileset-meta">Pick a tile in the palette to set its type (solid, tags, …).</div>';
    return;
  }

  // header: which tiles
  const info = document.createElement('div');
  info.className = 'tileset-meta';
  info.textContent = indices.length === 1
    ? `${ts.name} · tile #${indices[0]}`
    : `${ts.name} · ${indices.length} tiles (#${indices[0]}…#${indices[indices.length - 1]})`;
  host.appendChild(info);

  // solid checkbox (the headline property — the game treats solid cells as walls)
  const solid = shared(ts, indices, 'solid');
  const solidLabel = document.createElement('label');
  solidLabel.className = 'check';
  const solidBox = document.createElement('input');
  solidBox.type = 'checkbox';
  solidBox.checked = solid === true;
  solidBox.indeterminate = solid === undefined && hasAny(ts, indices, 'solid');
  solidBox.onchange = () => writeAll((m) => { if (solidBox.checked) m.solid = true; else delete m.solid; });
  solidLabel.append(solidBox, document.createTextNode(' Solid (blocks movement)'));
  host.appendChild(solidLabel);

  // hierarchical gameplay tags (chips + autocomplete from the project registry)
  host.appendChild(tagWidget(ts, indices));

  // free-form custom properties (union of keys across the selection)
  const customKeys = new Set();
  for (const idx of indices) {
    const m = metaOf(ts, idx);
    if (m) for (const k of Object.keys(m)) if (!RESERVED.has(k)) customKeys.add(k);
  }
  for (const key of customKeys) {
    const val = shared(ts, indices, key);
    host.appendChild(propRow(key, val === undefined ? '' : showValue(val)));
  }

  // add-property + clear-all controls
  const controls = document.createElement('div');
  controls.className = 'field';
  const addBtn = document.createElement('button');
  addBtn.className = 'full';
  addBtn.textContent = '＋ property';
  addBtn.onclick = () => host.appendChild(propRow('', '', true));
  controls.appendChild(addBtn);
  host.appendChild(controls);

  if (hasAnyMeta(ts, indices)) {
    const clear = document.createElement('button');
    clear.className = 'full';
    clear.textContent = 'Clear metadata';
    clear.onclick = () => writeAll((m) => { for (const k of Object.keys(m)) delete m[k]; });
    host.appendChild(clear);
  }
}

// ---- gameplay tags ----------------------------------------------------------

let keepTagFocus = false; // re-focus the tag input after a render triggered by add

function registry() {
  return state.project.tagRegistry || (state.project.tagRegistry = []);
}
// Register a tag and all its ancestors so "Terrain.Water.Deep" also offers
// "Terrain" and "Terrain.Water" in autocomplete. Kept sorted, deduped.
function registerTag(tag) {
  const reg = registry();
  let added = false;
  for (const a of expandTag(tag)) if (!reg.includes(a)) { reg.push(a); added = true; }
  if (added) reg.sort((x, y) => x.localeCompare(y));
}

function addTag(raw) {
  const tag = normalizeTag(raw);
  if (!tag) return;
  writeAll((m) => {
    const list = Array.isArray(m.tags) ? m.tags.slice() : [];
    if (!list.some((t) => t.toLowerCase() === tag.toLowerCase())) list.push(tag);
    m.tags = list;
  });
  registerTag(tag);
  keepTagFocus = true;
  emit('selection:change'); // re-render (writeAll already emitted, but registry changed)
}

function removeTag(tag) {
  writeAll((m) => {
    if (!Array.isArray(m.tags)) return;
    m.tags = m.tags.filter((t) => t.toLowerCase() !== tag.toLowerCase());
    if (!m.tags.length) delete m.tags;
  });
}

function tagWidget(ts, indices) {
  const wrap = document.createElement('div');
  wrap.className = 'tag-widget';

  const lbl = document.createElement('div');
  lbl.className = 'tag-label';
  lbl.textContent = 'Tags';
  wrap.appendChild(lbl);

  const tags = shared(ts, indices, 'tags');
  const chips = document.createElement('div');
  chips.className = 'tag-chips';
  if (tags === undefined) {
    const note = document.createElement('span');
    note.className = 'tag-mixed';
    note.textContent = 'tiles differ';
    chips.appendChild(note);
  } else if (Array.isArray(tags)) {
    for (const t of tags) chips.appendChild(chip(t));
  }
  wrap.appendChild(chips);

  // input with native datalist autocomplete from the registry
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'tag-input';
  input.placeholder = 'add tag e.g. Terrain.Water';
  const listId = 'tag-reg-list';
  input.setAttribute('list', listId);
  const datalist = document.createElement('datalist');
  datalist.id = listId;
  for (const t of registry()) {
    const o = document.createElement('option');
    o.value = t;
    datalist.appendChild(o);
  }
  const commit = () => { const v = input.value; input.value = ''; addTag(v); };
  input.onkeydown = (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); }
  };
  wrap.append(input, datalist);

  if (keepTagFocus) { keepTagFocus = false; setTimeout(() => input.focus(), 0); }
  return wrap;
}

function chip(tag) {
  const c = document.createElement('span');
  c.className = 'tag-chip';
  c.title = tag;
  const label = document.createElement('span');
  label.textContent = tag;
  const x = document.createElement('button');
  x.textContent = '×';
  x.onclick = () => removeTag(tag);
  c.append(label, x);
  return c;
}

// One editable key:value row. `fresh` rows (just added) keep focus on the key.
function propRow(key, value, fresh = false) {
  const row = document.createElement('div');
  row.className = 'field meta-row';
  const k = document.createElement('input');
  k.type = 'text'; k.placeholder = 'key'; k.value = key; k.className = 'meta-key';
  const v = document.createElement('input');
  v.type = 'text'; v.placeholder = 'value'; v.value = value; v.className = 'meta-val';
  const del = document.createElement('button');
  del.className = 'lbtn'; del.textContent = '✕';

  let prevKey = key;
  const commit = () => {
    const nk = k.value.trim();
    if (!nk) return;
    writeAll((m) => {
      if (prevKey && prevKey !== nk) delete m[prevKey];
      m[nk] = parseValue(v.value);
    });
    prevKey = nk;
  };
  k.onblur = commit; v.onblur = commit;
  k.onkeydown = v.onkeydown = (e) => { if (e.key === 'Enter') e.target.blur(); };
  del.onclick = () => { if (prevKey) writeAll((m) => delete m[prevKey]); else row.remove(); };

  row.append(k, v, del);
  if (fresh) setTimeout(() => k.focus(), 0);
  return row;
}

function hasAny(ts, indices, key) {
  return indices.some((idx) => { const m = metaOf(ts, idx); return m && key in m; });
}
function hasAnyMeta(ts, indices) {
  return indices.some((idx) => metaOf(ts, idx));
}
