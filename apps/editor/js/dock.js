// Lightweight dockable panels. Each `.dock-panel` gets two header controls:
//   ▾ collapse  — fold the body away (just the header stays)
//   ⤢ pop out   — detach into a FLOATING, draggable, resizable window you can
//                 place anywhere; ⤡ docks it back to its original spot.
// Panels all read/write the shared `state` + event bus, so they keep working
// wherever they live — only their position is UI. Layout persists per panel.
const KEY = 'poc-editor-dock:v1';

export function initDock(root = document) {
  const saved = load();
  for (const sec of root.querySelectorAll('.dock-panel')) {
    if (sec.dataset.dockReady) continue;
    const head = sec.querySelector('.block-head');
    if (!head) continue;
    sec.dataset.dockReady = '1';
    const id = sec.dataset.dock;
    sec._home = { parent: sec.parentNode, next: sec.nextSibling };

    const ctl = document.createElement('span');
    ctl.className = 'dock-ctl';
    const collapse = mkBtn('▾', 'Collapse', () => toggleCollapse(sec));
    const pop = mkBtn('⤢', 'Pop out / dock', () => toggleFloat(sec));
    ctl.append(collapse, pop);
    head.appendChild(ctl);
    sec._btns = { collapse, pop };

    head.addEventListener('mousedown', (e) => {
      if (!sec.classList.contains('dock-floating') || e.target.closest('button')) return;
      startDrag(e, sec);
    });

    const st = saved[id];
    if (st?.float) floatOn(sec, st.float);
    else if (st?.collapsed) toggleCollapse(sec, true);
  }
}

function mkBtn(txt, title, fn) {
  const b = document.createElement('button');
  b.className = 'dock-btn'; b.textContent = txt; b.title = title;
  b.onclick = (e) => { e.stopPropagation(); fn(); };
  return b;
}

function toggleCollapse(sec, force) {
  if (sec.classList.contains('dock-floating')) return; // floating panels don't collapse
  const on = force ?? !sec.classList.contains('dock-collapsed');
  sec.classList.toggle('dock-collapsed', on);
  sec._btns.collapse.textContent = on ? '▸' : '▾';
  save();
}

function toggleFloat(sec) {
  if (sec.classList.contains('dock-floating')) dockBack(sec);
  else floatOn(sec, null);
}

function floatOn(sec, pos) {
  const r = sec.getBoundingClientRect();
  sec.classList.remove('dock-collapsed');
  sec.classList.add('dock-floating');
  sec._btns.collapse.textContent = '▾';
  document.body.appendChild(sec);
  sec.style.left = (pos?.x ?? Math.max(8, r.left)) + 'px';
  sec.style.top = (pos?.y ?? Math.max(56, r.top)) + 'px';
  sec.style.width = (pos?.w ?? Math.max(220, Math.round(r.width))) + 'px';
  sec.style.height = (pos?.h ?? 300) + 'px';
  sec._btns.pop.textContent = '⤡';
  sec._btns.pop.title = 'Dock back';
  save();
}

function dockBack(sec) {
  sec.classList.remove('dock-floating');
  sec.removeAttribute('style');
  sec._home.parent.insertBefore(sec, sec._home.next);
  sec._btns.pop.textContent = '⤢';
  sec._btns.pop.title = 'Pop out / dock';
  save();
}

function startDrag(e, sec) {
  e.preventDefault();
  const sx = e.clientX, sy = e.clientY;
  const ox = parseFloat(sec.style.left) || 0, oy = parseFloat(sec.style.top) || 0;
  const move = (ev) => {
    sec.style.left = Math.max(0, ox + ev.clientX - sx) + 'px';
    sec.style.top = Math.max(48, oy + ev.clientY - sy) + 'px';
  };
  const up = () => { removeEventListener('mousemove', move); removeEventListener('mouseup', up); save(); };
  addEventListener('mousemove', move);
  addEventListener('mouseup', up);
}

let t;
function save() {
  clearTimeout(t);
  t = setTimeout(() => {
    const out = {};
    for (const sec of document.querySelectorAll('.dock-panel')) {
      const floating = sec.classList.contains('dock-floating');
      out[sec.dataset.dock] = {
        collapsed: !floating && sec.classList.contains('dock-collapsed'),
        float: floating ? { x: parseFloat(sec.style.left) || 0, y: parseFloat(sec.style.top) || 0, w: sec.offsetWidth, h: sec.offsetHeight } : null,
      };
    }
    try { localStorage.setItem(KEY, JSON.stringify(out)); } catch { /* ignore quota */ }
  }, 200);
}
function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } }
