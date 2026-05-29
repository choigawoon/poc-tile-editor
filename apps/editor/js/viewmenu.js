// "Panels ▾" dropdown — show/hide each dockable panel and reset the layout.
// This is how a closed (✕) or lost panel comes back.
import { getPanels, setPanelHidden, resetLayout, onDockChange } from './dock.js';

export function initViewMenu(btn) {
  if (!btn) return;
  const menu = document.createElement('div');
  menu.className = 'dropdown-menu';
  menu.hidden = true;
  document.body.appendChild(menu);

  const close = () => { menu.hidden = true; };
  const open = () => { build(); const r = btn.getBoundingClientRect(); menu.style.left = r.left + 'px'; menu.style.top = (r.bottom + 4) + 'px'; menu.hidden = false; };

  btn.addEventListener('click', (e) => { e.stopPropagation(); menu.hidden ? open() : close(); });
  document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target) && e.target !== btn) close(); });
  onDockChange(() => { if (!menu.hidden) build(); });

  function build() {
    menu.innerHTML = '';
    for (const p of getPanels()) {
      const item = document.createElement('label');
      item.className = 'dropdown-item';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !p.hidden;
      cb.onchange = () => setPanelHidden(p.id, !cb.checked);
      item.append(cb, document.createTextNode(' ' + p.title));
      menu.appendChild(item);
    }
    const sep = document.createElement('div');
    sep.className = 'dropdown-sep';
    menu.appendChild(sep);
    const reset = document.createElement('button');
    reset.className = 'dropdown-item dropdown-action';
    reset.textContent = '↺ Reset layout';
    reset.onclick = () => { resetLayout(); close(); };
    menu.appendChild(reset);
  }
}
