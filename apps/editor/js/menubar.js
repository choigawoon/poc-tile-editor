// Classic menu bar (File / Edit / View / Tools). Items reuse the existing action
// buttons (now hidden in #legacy-actions) by proxying their click, so all the
// wiring in main.js stays untouched. The View menu lists dockable panels and
// reset, replacing the standalone "Panels" button.
import { getPanels, setPanelHidden, resetLayout, onDockChange } from './dock.js';

const $ = (id) => document.getElementById(id);
const proxy = (id) => () => $(id)?.click();
const exportAs = (fmt) => () => { const s = $('export-target'); if (s) s.value = fmt; $('btn-export')?.click(); };

const MENUS = [
  {
    label: 'File', items: () => [
      { label: 'New', action: proxy('btn-new') },
      { label: 'Save', action: proxy('btn-save') },
      { label: 'Load…', action: proxy('btn-load') },
      { sep: true },
      { label: 'Export — Generic JSON', action: exportAs('generic') },
      { label: 'Export — Tiled (.tmj)', action: exportAs('tiled') },
      { label: 'Export — Godot 4', action: exportAs('godot') },
      { label: 'Export — Unity', action: exportAs('unity') },
    ],
  },
  {
    label: 'Edit', items: () => [
      { label: 'Undo', action: proxy('btn-undo') },
      { label: 'Redo', action: proxy('btn-redo') },
    ],
  },
  {
    label: 'View', items: () => [
      ...getPanels().map((p) => ({ label: p.title, checked: !p.hidden, action: () => setPanelHidden(p.id, !p.hidden) })),
      { sep: true },
      { label: '↺ Reset layout', action: resetLayout },
    ],
  },
  {
    label: 'Tools', items: () => [
      { label: 'Import image as tiles…', action: proxy('btn-import-tiles') },
      { label: '⚄ Generate dungeon…', action: proxy('btn-generate') },
    ],
  },
];

export function initMenuBar(bar) {
  if (!bar) return;
  bar.innerHTML = '';
  const dropdown = document.createElement('div');
  dropdown.className = 'dropdown-menu';
  dropdown.hidden = true;
  document.body.appendChild(dropdown);
  let openMenu = null, openBtn = null;

  const close = () => {
    dropdown.hidden = true; openMenu = null; openBtn = null;
    bar.querySelectorAll('.menu-btn').forEach((b) => b.classList.remove('active'));
  };

  const openFor = (menu, btnEl) => {
    dropdown.innerHTML = '';
    for (const it of menu.items()) {
      if (it.sep) { const s = document.createElement('div'); s.className = 'dropdown-sep'; dropdown.appendChild(s); continue; }
      const item = document.createElement('button');
      item.className = 'dropdown-item';
      if (it.checked !== undefined) {
        const cb = document.createElement('input');
        cb.type = 'checkbox'; cb.checked = it.checked; cb.tabIndex = -1; cb.style.pointerEvents = 'none';
        item.appendChild(cb);
      }
      item.appendChild(document.createTextNode(' ' + it.label));
      item.onclick = (e) => {
        e.stopPropagation();
        it.action();
        if (it.checked !== undefined) openFor(menu, btnEl); // keep open, refresh checks
        else close();
      };
      dropdown.appendChild(item);
    }
    const r = btnEl.getBoundingClientRect();
    dropdown.style.left = r.left + 'px';
    dropdown.style.top = (r.bottom + 2) + 'px';
    dropdown.hidden = false;
    bar.querySelectorAll('.menu-btn').forEach((b) => b.classList.toggle('active', b === btnEl));
    openMenu = menu; openBtn = btnEl;
  };

  for (const menu of MENUS) {
    const b = document.createElement('button');
    b.className = 'menu-btn';
    b.textContent = menu.label;
    b.onclick = (e) => { e.stopPropagation(); openMenu === menu ? close() : openFor(menu, b); };
    b.onmouseenter = () => { if (openMenu && openMenu !== menu) openFor(menu, b); }; // hover-switch while open
    bar.appendChild(b);
  }

  document.addEventListener('click', (e) => { if (!dropdown.contains(e.target) && !bar.contains(e.target)) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  onDockChange(() => { if (openMenu && openMenu.label === 'View' && openBtn) openFor(openMenu, openBtn); });
}
