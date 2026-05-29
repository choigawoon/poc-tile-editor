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

// Canonical stored form for identifiers (tag paths, property keys): normalized
// + lowercase. Matching is already case-insensitive; storing lowercase keeps
// the data unambiguous. Values are left as the user typed them.
const canon = (s) => normalizeTag(s).toLowerCase();

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

  // hierarchical gameplay tags: assigned chips + a tree of the taxonomy
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
  for (const a of expandTag(canon(tag))) if (!reg.includes(a)) { reg.push(a); added = true; }
  if (added) reg.sort((x, y) => x.localeCompare(y));
}

function addTag(raw) {
  const tag = canon(raw);
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

const collapsed = new Set(); // tree node full-paths currently collapsed

function tagWidget(ts, indices) {
  const wrap = document.createElement('div');
  wrap.className = 'tag-widget';

  const lbl = document.createElement('div');
  lbl.className = 'tag-label';
  lbl.textContent = 'Tags';
  wrap.appendChild(lbl);

  const hint = document.createElement('div');
  hint.className = 'tag-hint';
  hint.textContent = '☑ tag stored on tile · • parent auto-matched via a child';
  wrap.appendChild(hint);

  // assigned-tags summary chips (quick remove). A tile holds many tags.
  const tags = shared(ts, indices, 'tags');
  const chips = document.createElement('div');
  chips.className = 'tag-chips';
  if (tags === undefined) {
    chips.appendChild(mutedSpan('tiles differ — ◪ marks partial in tree'));
  } else if (Array.isArray(tags) && tags.length) {
    for (const t of tags) chips.appendChild(chip(t));
  } else {
    chips.appendChild(mutedSpan('no tags'));
  }
  wrap.appendChild(chips);

  // hierarchy tree: project registry ∪ every tag assigned in the selection.
  // Check a node to assign that tag to all selected tiles; per-node actions
  // add a child, rename (cascades), or delete the tag from the taxonomy.
  const paths = new Set(registry());
  for (const idx of indices) for (const t of (metaOf(ts, idx)?.tags || [])) paths.add(t);
  const tree = document.createElement('div');
  tree.className = 'tag-tree';
  const roots = buildTree([...paths]);
  if (roots.length) for (const node of roots) tree.appendChild(treeNode(node, ts, indices, 0));
  else tree.appendChild(mutedSpan('no tags yet — add one below'));
  wrap.appendChild(tree);

  // quick-add: assigns a (possibly deep) tag to the selection + registers it
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

function mutedSpan(text) {
  const s = document.createElement('span');
  s.className = 'tag-mixed';
  s.textContent = text;
  return s;
}

// One tree row + its (recursively rendered) children when expanded.
function treeNode(node, ts, indices, depth) {
  const box = document.createElement('div');
  const row = document.createElement('div');
  row.className = 'tag-node';
  row.style.paddingLeft = (4 + depth * 12) + 'px';

  const hasChildren = node.children.length > 0;
  const exp = document.createElement('button');
  exp.className = 'tag-exp' + (hasChildren ? '' : ' leaf');
  exp.textContent = hasChildren ? (collapsed.has(node.full) ? '▸' : '▾') : '·';
  if (hasChildren) exp.onclick = () => {
    collapsed.has(node.full) ? collapsed.delete(node.full) : collapsed.add(node.full);
    emit('selection:change');
  };

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  const st = assignState(ts, indices, node.full);
  cb.checked = st === 'on';
  cb.indeterminate = st === 'mixed';
  cb.title = 'Assign the exact tag "' + node.full + '" to the selected tile(s)';
  cb.onchange = () => assignTag(node.full, cb.checked);

  const seg = document.createElement('span');
  seg.className = 'tag-seg';
  seg.textContent = node.seg;
  seg.title = node.full;

  // "implied": not explicitly set here, but a descendant tag is — so this tag
  // is auto-matched by the hierarchy (Unreal-style parent matching).
  const implied = st === 'off' && impliedActive(ts, indices, node.full);
  if (implied) {
    row.classList.add('tag-implied');
    seg.title = node.full + ' — auto-matched via a child tag';
    const dot = document.createElement('span');
    dot.className = 'tag-implied-mark';
    dot.textContent = '•';
    dot.title = 'active via a child tag (not stored here)';
    seg.appendChild(dot);
  }

  const actions = document.createElement('span');
  actions.className = 'tag-actions';
  actions.append(
    mkAction('＋', 'add child tag', () => {
      const child = prompt(`New child under "${node.full}":`, '');
      const norm = child && canon(child);
      if (norm) mutateProject(() => registerTag(node.full + '.' + norm));
    }),
    mkAction('✎', 'rename (cascades to children + tiles)', () => {
      const next = prompt('Rename tag (full path):', node.full);
      if (next != null) renameTag(node.full, next);
    }),
    mkAction('×', 'delete from taxonomy + all tiles', () => {
      if (confirm(`Delete "${node.full}" and its children from the taxonomy and every tile using it?`)) deleteTag(node.full);
    }, true),
  );

  row.append(exp, cb, seg, actions);
  box.appendChild(row);
  if (hasChildren && !collapsed.has(node.full)) {
    for (const child of node.children) box.appendChild(treeNode(child, ts, indices, depth + 1));
  }
  return box;
}

function mkAction(label, title, fn, danger = false) {
  const b = document.createElement('button');
  b.className = 'tag-act' + (danger ? ' danger' : '');
  b.textContent = label; b.title = title;
  b.onclick = (e) => { e.stopPropagation(); fn(); };
  return b;
}

// Build a nested tree (array of root nodes) from flat full-path tags. Ancestor
// nodes are materialized even if only a deep leaf was supplied.
function buildTree(paths) {
  const byFull = new Map();
  const roots = [];
  const ensure = (full) => {
    if (byFull.has(full)) return byFull.get(full);
    const segs = full.split('.');
    const node = { seg: segs[segs.length - 1], full, children: [] };
    byFull.set(full, node);
    if (segs.length === 1) roots.push(node);
    else ensure(segs.slice(0, -1).join('.')).children.push(node);
    return node;
  };
  for (const p of paths) for (const a of expandTag(p)) ensure(a);
  const sortRec = (arr) => { arr.sort((a, b) => a.seg.localeCompare(b.seg)); arr.forEach((n) => sortRec(n.children)); };
  sortRec(roots);
  return roots;
}

// True if no selected tile has this exact tag, but at least one has a
// descendant of it — so the tag is auto-matched by the hierarchy.
function impliedActive(ts, indices, path) {
  const pre = path.toLowerCase() + '.';
  return indices.some((idx) => (metaOf(ts, idx)?.tags || []).some((t) => t.toLowerCase().startsWith(pre)));
}

// Assignment state of one full-path tag across the selection.
function assignState(ts, indices, path) {
  const p = path.toLowerCase();
  let any = false, all = true;
  for (const idx of indices) {
    const has = (metaOf(ts, idx)?.tags || []).some((t) => t.toLowerCase() === p);
    any = any || has; all = all && has;
  }
  return all ? 'on' : any ? 'mixed' : 'off';
}

// Assign (on) or unassign (off) one exact tag across the whole selection.
function assignTag(path, on) {
  const tag = canon(path);
  if (!tag) return;
  const low = tag.toLowerCase();
  writeAll((m) => {
    const list = Array.isArray(m.tags) ? m.tags.slice() : [];
    const has = list.some((t) => t.toLowerCase() === low);
    if (on && !has) list.push(tag);
    const next = on ? list : list.filter((t) => t.toLowerCase() !== low);
    if (next.length) m.tags = next; else delete m.tags;
  });
  if (on) registerTag(tag);
}

// ---- project-wide taxonomy edits (rename / delete cascade everywhere) ----

function mutateProject(fn) {
  pushHistory();
  fn();
  emit('tilesets:change');
  emit('selection:change');
}

// Run cb on every tile's tags array across all tilesets; cb returns the new
// array (empty/undefined removes the `tags` key). Prunes emptied tiles.
function eachTileTags(cb) {
  for (const ts of state.project.tilesets) {
    if (!ts.tiles) continue;
    for (const k of Object.keys(ts.tiles)) {
      const m = ts.tiles[k];
      if (!Array.isArray(m.tags)) continue;
      const next = cb(m.tags);
      if (Array.isArray(next) && next.length) m.tags = next; else delete m.tags;
      if (Object.keys(m).length === 0) delete ts.tiles[k];
    }
    if (Object.keys(ts.tiles).length === 0) delete ts.tiles;
  }
}

function isSelfOrDesc(tag, path) {
  const t = normalizeTag(tag).toLowerCase(), p = path.toLowerCase();
  return t === p || t.startsWith(p + '.');
}
function rewritePrefix(tag, oldP, newP) {
  const t = normalizeTag(tag);
  if (t.toLowerCase() === oldP.toLowerCase()) return newP;
  if (t.toLowerCase().startsWith(oldP.toLowerCase() + '.')) return newP + t.slice(oldP.length);
  return t;
}
function dedupe(list) {
  const out = [];
  for (const t of list) if (!out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
  return out;
}

// Rename a tag (and its whole subtree) across the registry AND every tile.
function renameTag(oldPathRaw, newPathRaw) {
  const oldP = canon(oldPathRaw), newP = canon(newPathRaw);
  if (!oldP || !newP || oldP === newP) return;
  mutateProject(() => {
    const set = new Set();
    for (const t of registry()) for (const a of expandTag(rewritePrefix(t, oldP, newP))) set.add(a);
    state.project.tagRegistry = [...set].sort((a, b) => a.localeCompare(b));
    eachTileTags((tags) => dedupe(tags.map((t) => rewritePrefix(t, oldP, newP))));
  });
}

// Delete a tag and its subtree from the registry and every tile.
function deleteTag(pathRaw) {
  const p = normalizeTag(pathRaw);
  if (!p) return;
  mutateProject(() => {
    state.project.tagRegistry = registry().filter((t) => !isSelfOrDesc(t, p));
    eachTileTags((tags) => tags.filter((t) => !isSelfOrDesc(t, p)));
  });
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
    const nk = k.value.trim().toLowerCase();
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
