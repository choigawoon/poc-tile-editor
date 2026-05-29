// Drag-to-dock panels. Grab a panel by its header and drag it:
//   • over the LEFT or RIGHT column  → an insertion line shows where it'll land;
//     drop to dock it there (between/above/below other panels, any column).
//   • anywhere else                  → drop to leave it FLOATING (draggable,
//     resizable) wherever you put it.
// Header buttons: ▾ collapse (fold body) · ⤢ float in place.
// Every panel reads/writes the shared state + event bus, so it works wherever it
// lives. Soul of the layout (column membership, order, float pos, collapse) is
// persisted per panel.
const KEY = 'poc-editor-dock:v2';

let zones, byId = {}, home = {}, layout, indicator, dragging = null, dropTarget = null, dragWasFloating = false;

export function initDock(root = document) {
  zones = { left: root.querySelector('.panel.left'), right: root.querySelector('.panel.right') };
  if (!zones.left || !zones.right) return;
  const panels = [...root.querySelectorAll('.dock-panel')];
  byId = {};
  for (const sec of panels) byId[sec.dataset.dock] = sec;

  indicator = document.createElement('div');
  indicator.className = 'dock-indicator';

  const def = defaultLayout();
  home = {};
  for (const z of ['left', 'right']) for (const id of def.docks[z]) home[id] = z;
  layout = mergeLayout(load(), def);

  for (const sec of panels) {
    const head = sec.querySelector('.block-head');
    if (!head) continue;
    const ctl = document.createElement('span');
    ctl.className = 'dock-ctl';
    sec._collapseBtn = btn('▾', 'Collapse', () => toggleCollapse(sec));
    sec._floatBtn = btn('⤢', 'Float / dock', () => toggleFloat(sec));
    ctl.append(sec._collapseBtn, sec._floatBtn);
    head.appendChild(ctl);
    head.addEventListener('pointerdown', (e) => onDragStart(e, sec));
  }
  applyLayout();
}

function btn(txt, title, fn) {
  const b = document.createElement('button');
  b.className = 'dock-btn'; b.textContent = txt; b.title = title;
  b.onclick = (e) => { e.stopPropagation(); fn(); };
  return b;
}

// ---- layout model: { docks:{left:[id],right:[id]}, float:{id:{x,y,w,h}}, collapsed:{id} } ----
function defaultLayout() {
  const dl = { docks: { left: [], right: [] }, float: {}, collapsed: {} };
  for (const z of ['left', 'right'])
    for (const s of zones[z].querySelectorAll(':scope > .dock-panel')) dl.docks[z].push(s.dataset.dock);
  return dl;
}
function mergeLayout(saved, def) {
  if (!saved || !saved.docks) return def;
  const all = new Set(Object.keys(byId));
  const seen = new Set();
  const out = { docks: { left: [], right: [] }, float: {}, collapsed: saved.collapsed || {} };
  for (const z of ['left', 'right'])
    for (const id of saved.docks[z] || []) if (all.has(id) && !seen.has(id)) { out.docks[z].push(id); seen.add(id); }
  for (const id of Object.keys(saved.float || {})) if (all.has(id) && !seen.has(id)) { out.float[id] = saved.float[id]; seen.add(id); }
  for (const z of ['left', 'right']) for (const id of def.docks[z]) if (!seen.has(id)) { out.docks[z].push(id); seen.add(id); }
  return out;
}
function removeFromLayout(id) {
  layout.docks.left = layout.docks.left.filter((x) => x !== id);
  layout.docks.right = layout.docks.right.filter((x) => x !== id);
  delete layout.float[id];
}

function applyLayout() {
  for (const z of ['left', 'right']) {
    for (const id of layout.docks[z]) {
      const sec = byId[id];
      if (!sec) continue;
      sec.classList.remove('dock-floating', 'dock-dragging');
      sec.removeAttribute('style');
      zones[z].appendChild(sec);
      sec.classList.toggle('dock-collapsed', !!layout.collapsed[id]);
      syncBtns(sec);
    }
  }
  for (const id of Object.keys(layout.float)) {
    const sec = byId[id];
    if (!sec) continue;
    const f = layout.float[id];
    sec.classList.remove('dock-collapsed');
    sec.classList.add('dock-floating');
    document.body.appendChild(sec);
    Object.assign(sec.style, { left: f.x + 'px', top: f.y + 'px', width: f.w + 'px', height: f.h + 'px' });
    syncBtns(sec);
  }
}

function syncBtns(sec) {
  const floating = sec.classList.contains('dock-floating');
  sec._collapseBtn.textContent = sec.classList.contains('dock-collapsed') ? '▸' : '▾';
  sec._collapseBtn.style.display = floating ? 'none' : '';
  sec._floatBtn.textContent = floating ? '⤡' : '⤢';
  sec._floatBtn.title = floating ? 'Dock back' : 'Float in place';
}

function toggleCollapse(sec) {
  if (sec.classList.contains('dock-floating')) return;
  const id = sec.dataset.dock;
  layout.collapsed[id] = !layout.collapsed[id];
  applyLayout(); save();
}

function toggleFloat(sec) {
  const id = sec.dataset.dock;
  if (sec.classList.contains('dock-floating')) {
    removeFromLayout(id);
    layout.docks[home[id] || 'left'].push(id); // dock back to its original column
  } else {
    const r = sec.getBoundingClientRect();
    removeFromLayout(id);
    layout.float[id] = { x: Math.max(8, r.left), y: Math.max(56, r.top), w: Math.max(240, Math.round(r.width)), h: 320 };
  }
  applyLayout(); save();
}

// ---- drag ----
function onDragStart(e, sec) {
  if (e.button !== 0 || e.target.closest('button') || e.target.closest('input, textarea, select')) return;
  e.preventDefault();
  dragging = sec;
  dropTarget = null;
  dragWasFloating = !!layout.float[sec.dataset.dock];
  const r = sec.getBoundingClientRect();
  const offX = e.clientX - r.left, offY = e.clientY - r.top;
  sec.classList.remove('dock-floating');
  sec.classList.add('dock-dragging');
  document.body.appendChild(sec);
  Object.assign(sec.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: Math.min(r.height, 360) + 'px' });
  zones.left.classList.add('dock-drop-zone');
  zones.right.classList.add('dock-drop-zone');

  const move = (ev) => {
    sec.style.left = (ev.clientX - offX) + 'px';
    sec.style.top = (ev.clientY - offY) + 'px';
    updateDrop(ev.clientX, ev.clientY);
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    finishDrop(sec);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

function zoneAt(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  if (el.closest('.panel.left')) return 'left';
  if (el.closest('.panel.right')) return 'right';
  return null;
}

function updateDrop(x, y) {
  const z = zoneAt(x, y);
  zones.left.classList.toggle('dock-drop-active', z === 'left');
  zones.right.classList.toggle('dock-drop-active', z === 'right');
  if (!z) { indicator.remove(); dropTarget = null; return; }
  const zoneEl = zones[z];
  const sibs = [...zoneEl.querySelectorAll(':scope > .dock-panel')];
  let idx = sibs.length;
  for (let i = 0; i < sibs.length; i++) {
    const r = sibs[i].getBoundingClientRect();
    if (y < r.top + r.height / 2) { idx = i; break; }
  }
  if (idx < sibs.length) zoneEl.insertBefore(indicator, sibs[idx]); else zoneEl.appendChild(indicator);
  dropTarget = { zone: z, index: idx };
}

function finishDrop(sec) {
  for (const z of ['left', 'right']) zones[z].classList.remove('dock-drop-zone', 'dock-drop-active');
  indicator.remove();
  const id = sec.dataset.dock;
  if (dropTarget) {
    // dropped on a column → dock there
    removeFromLayout(id);
    layout.docks[dropTarget.zone].splice(dropTarget.index, 0, id);
  } else if (dragWasFloating) {
    // moving an already-floating panel → keep it floating at the new spot
    layout.float[id] = {
      x: Math.max(0, parseFloat(sec.style.left) || 0),
      y: Math.max(48, parseFloat(sec.style.top) || 0),
      w: Math.max(240, sec.offsetWidth),
      h: Math.max(140, sec.offsetHeight),
    };
  }
  // else: a docked panel dropped in the void → layout untouched, so it snaps
  // back to its original spot. (Floating is done with the ⤢ button.)
  sec.classList.remove('dock-dragging');
  dragging = null; dropTarget = null;
  applyLayout(); save();
}

let t;
function save() {
  clearTimeout(t);
  t = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(layout)); } catch { /* quota */ } }, 200);
}
function load() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } }
