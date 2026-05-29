// Draggable resizers for the left/right side panels. The widths live in CSS
// custom properties on .layout (so the grid reflows), and are persisted to
// localStorage. `onResize` is called live during a drag so width-dependent
// content (the palette canvas) can re-fit.
const KEY = 'poc-editor-panels';
const MIN = 160, MAX = 600;

export function initPanelResize(layout, onResize) {
  const saved = load();
  if (saved.left) layout.style.setProperty('--left-w', saved.left + 'px');
  if (saved.right) layout.style.setProperty('--right-w', saved.right + 'px');

  for (const handle of layout.querySelectorAll('.resizer')) {
    handle.addEventListener('mousedown', (e) => startDrag(e, handle, layout, onResize));
  }
}

function startDrag(e, handle, layout, onResize) {
  e.preventDefault();
  const side = handle.dataset.resize; // 'left' | 'right'
  const prop = side === 'left' ? '--left-w' : '--right-w';
  handle.classList.add('active');
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';

  const onMove = (ev) => {
    const rect = layout.getBoundingClientRect();
    let w = side === 'left' ? ev.clientX - rect.left : rect.right - ev.clientX;
    w = Math.max(MIN, Math.min(MAX, Math.round(w)));
    layout.style.setProperty(prop, w + 'px');
    if (onResize) onResize();
  };
  const onUp = () => {
    handle.classList.remove('active');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    save(layout);
    if (onResize) onResize();
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

function save(layout) {
  const get = (v) => parseInt(layout.style.getPropertyValue(v), 10) || null;
  try { localStorage.setItem(KEY, JSON.stringify({ left: get('--left-w'), right: get('--right-w') })); } catch {}
}
function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
