// In-app documentation viewer. The repo's markdown docs are bundled at build
// time (?raw) and rendered into a modal via `marked`. Opened from the Help menu.
import { marked } from 'marked';
import specMd from '../../../REVERSE-SPEC.md?raw';
import notesMd from '../../../RELEASE-NOTES.md?raw';
import modularMd from '../../../MODULARIZATION.md?raw';

const DOCS = {
  spec: { title: '역기획서 · Reverse Spec', md: specMd },
  notes: { title: '릴리스 노트 · Release Notes', md: notesMd },
  modular: { title: '모듈화 분석 · Modularization', md: modularMd },
};

let overlay, titleEl, body;

function ensure() {
  if (overlay) return;
  overlay = document.createElement('div');
  overlay.className = 'doc-overlay';
  overlay.hidden = true;

  const win = document.createElement('div');
  win.className = 'doc-window';
  const bar = document.createElement('div');
  bar.className = 'doc-bar';
  titleEl = document.createElement('b');
  titleEl.className = 'doc-title';
  const close = document.createElement('button');
  close.textContent = '✕ Close';
  close.onclick = hide;
  bar.append(titleEl, close);

  body = document.createElement('div');
  body.className = 'doc-body markdown';
  win.append(bar, body);
  overlay.append(win);

  overlay.addEventListener('click', (e) => { if (e.target === overlay) hide(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !overlay.hidden) hide(); });
  document.body.appendChild(overlay);
}

function hide() { if (overlay) overlay.hidden = true; }

export function openDoc(key) {
  const d = DOCS[key];
  if (!d) return;
  ensure();
  titleEl.textContent = d.title;
  body.innerHTML = marked.parse(d.md);
  body.scrollTop = 0;
  overlay.hidden = false;
}
